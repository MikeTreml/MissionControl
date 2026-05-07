#!/usr/bin/env node
/**
 * Smoke test for scripts/drive-task.ts.
 *
 * Drives a synthetic workflow that uses ONLY shell tasks (no agent
 * dispatch), so this smoke runs offline and doesn't require `claude` auth.
 * Exercises the run:create → run:iterate → task:post → completed loop end
 * to end against a fresh temp runs dir.
 *
 * Verifies:
 *   1. drive-task exits 0 on the synthetic workflow.
 *   2. stdout `--json` summary shape: { runId, runDir, status: "completed",
 *      iterations >= 1, output: { ... } }.
 *   3. The shell task ran: output captured exitCode=0 and the expected
 *      stdout substring.
 *   4. state/output.json exists in the run dir and matches the JSON summary.
 *
 * Run via:  npm run smoke:drive-task
 */
import { spawnSync } from "node:child_process";
import { promises as fs, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, ".."));
const DRIVE_PATH = path.join(REPO_ROOT, "scripts", "drive-task.ts");

let failures = 0;

function ok(name: string): void {
  process.stdout.write(`  ✓ ${name}\n`);
}

function fail(name: string, detail: string): void {
  process.stderr.write(`  ✗ ${name}\n    ${detail}\n`);
  failures++;
}

const SHELL_ONLY_WORKFLOW = `/**
 * Synthetic shell-only workflow for drive-task smoke. No agent tasks
 * (so the smoke runs without claude auth). Issues a single 'echo' via
 * a kind: 'shell' effect, then returns the captured exitCode + stdout.
 */
import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs = {}, ctx) {
  const message = inputs.message || 'smoke-marker-default';
  ctx.log('info', 'shell-only smoke workflow starting');
  const result = await ctx.task(echoTask, { message });
  ctx.log('info', \`echo result: exit=\${result.exitCode}\`);
  return {
    ok: result.exitCode === 0,
    message,
    shellResult: result,
  };
}

export const echoTask = defineTask('echo-message', (args, taskCtx) => ({
  kind: 'shell',
  title: \`echo \${args.message}\`,
  shell: {
    command: \`echo \${args.message}\`,
  },
  io: {
    inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`,
    outputJsonPath: \`tasks/\${taskCtx.effectId}/output.json\`,
  },
  labels: ['shell', 'smoke'],
}));
`;

async function main(): Promise<void> {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "drive-task-smoke-"));
  process.stdout.write(`drive-task smoke (tmpRoot=${tmpRoot})\n`);

  const workflowFile = path.join(tmpRoot, "shell-only-workflow.js");
  const inputsFile = path.join(tmpRoot, "inputs.json");
  const runsDir = path.join(tmpRoot, "runs");

  // The workflow must be importable from the SDK's perspective. The SDK
  // will load it via the absolute --entry path; node will resolve
  // @a5c-ai/babysitter-sdk through normal node_modules lookup starting
  // from the workflow's directory. Since tmpRoot is outside MC, we have
  // to seed it with a node_modules symlink pointing back at MC's, or
  // (simpler) put the workflow inside MC's repo so the SDK is reachable.
  //
  // Strategy: write the workflow file under <REPO_ROOT>/.smoke-tmp/...
  // instead of os.tmpdir(), so SDK resolution Just Works. The runs dir
  // can stay in os.tmpdir() (its location is independent).
  const inRepoTmp = path.join(REPO_ROOT, ".smoke-tmp", path.basename(tmpRoot));
  await fs.mkdir(inRepoTmp, { recursive: true });
  const workflowFileInRepo = path.join(inRepoTmp, "shell-only-workflow.js");
  const inputsFileInRepo = path.join(inRepoTmp, "inputs.json");

  await fs.writeFile(workflowFileInRepo, SHELL_ONLY_WORKFLOW, "utf8");
  await fs.writeFile(
    inputsFileInRepo,
    JSON.stringify({ message: "smoke-marker-XYZ-42" }),
    "utf8",
  );

  // Run drive-task --json against the synthetic workflow.
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      DRIVE_PATH,
      "--workflow", workflowFileInRepo,
      "--inputs", inputsFileInRepo,
      "--runs-dir", runsDir,
      "--process-id", "smoke/shell-only",
      "--max-iterations", "10",
      "--json",
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    fail(
      "drive-task exits 0",
      `got exit=${result.status}\n    stderr: ${result.stderr}\n    stdout: ${result.stdout}`,
    );
  } else {
    ok("drive-task exits 0");
  }

  let summary: {
    runId?: string;
    runDir?: string;
    status?: string;
    iterations?: number;
    output?: { ok?: boolean; message?: string; shellResult?: { exitCode?: number; stdout?: string } } | null;
  } = {};
  try {
    summary = JSON.parse(result.stdout);
    ok("stdout is valid JSON");
  } catch (e) {
    fail(
      "stdout is valid JSON",
      `${(e as Error).message}\n    stdout head: ${result.stdout.slice(0, 300)}`,
    );
  }

  if (summary.status !== "completed") {
    fail("summary.status === 'completed'", `got ${summary.status}`);
  } else {
    ok("summary.status === 'completed'");
  }

  if (typeof summary.iterations !== "number" || summary.iterations < 1) {
    fail("summary.iterations >= 1", `got ${summary.iterations}`);
  } else {
    ok(`summary.iterations >= 1 (got ${summary.iterations})`);
  }

  // Output payload checks
  const out = summary.output;
  if (!out || typeof out !== "object") {
    fail("summary.output is present", `got ${JSON.stringify(summary.output)}`);
  } else {
    if (out.ok !== true) fail("output.ok === true", `got ${out.ok}`);
    else ok("output.ok === true");
    if (out.message !== "smoke-marker-XYZ-42") {
      fail("output.message round-trip", `got ${out.message}`);
    } else ok("output.message round-trips through inputs.json");

    const sh = out.shellResult;
    if (!sh) {
      fail("output.shellResult present", `got ${JSON.stringify(sh)}`);
    } else {
      if (sh.exitCode !== 0) fail("shellResult.exitCode === 0", `got ${sh.exitCode}`);
      else ok("shellResult.exitCode === 0");

      // echo on Windows includes \r\n; on POSIX just \n. Trim and check.
      const trimmed = (sh.stdout ?? "").trim();
      if (!trimmed.includes("smoke-marker-XYZ-42")) {
        fail(
          "shellResult.stdout contains the message",
          `got: ${JSON.stringify(sh.stdout)}`,
        );
      } else {
        ok("shellResult.stdout contains the marker");
      }
    }
  }

  // File-on-disk check: state/output.json exists and equals summary.output.
  if (typeof summary.runDir === "string" && summary.runDir.length > 0) {
    const outputFile = path.join(summary.runDir, "state", "output.json");
    if (!existsSync(outputFile)) {
      fail("state/output.json exists on disk", `expected at ${outputFile}`);
    } else {
      const onDisk = JSON.parse(await fs.readFile(outputFile, "utf8"));
      if (JSON.stringify(onDisk) === JSON.stringify(summary.output)) {
        ok("state/output.json on disk matches stdout summary");
      } else {
        fail(
          "state/output.json matches stdout summary",
          `disk: ${JSON.stringify(onDisk).slice(0, 200)}\n    stdout: ${JSON.stringify(summary.output).slice(0, 200)}`,
        );
      }
    }
  }

  // cleanup
  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(inRepoTmp, { recursive: true, force: true });
  // also remove the parent .smoke-tmp dir if empty
  try {
    const parent = path.dirname(inRepoTmp);
    const remaining = await fs.readdir(parent);
    if (remaining.length === 0) await fs.rmdir(parent);
  } catch {
    // ignore
  }

  if (failures > 0) {
    process.stderr.write(`\ndrive-task smoke FAILED (${failures} check${failures === 1 ? "" : "s"})\n`);
    process.exit(1);
  }
  process.stdout.write(`\ndrive-task smoke PASSED\n`);
}

main().catch((err) => {
  process.stderr.write(`drive-task smoke threw: ${err?.message ?? String(err)}\n`);
  if (err?.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
