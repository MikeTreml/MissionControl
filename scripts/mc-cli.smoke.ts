#!/usr/bin/env node
/**
 * Smoke test for scripts/mc-cli.ts.
 *
 * Runs the CLI end-to-end against a freshly-created temp data root
 * (so it never touches the user's real `<userData>`). Verifies:
 *
 *   1. paths              — prints the temp root we passed in.
 *   2. project create     — creates a project, project.json on disk
 *                            matches schema.
 *   3. project list       — sees the new project (empty before).
 *   4. duplicate prefix   — second create with same prefix fails clearly.
 *   5. task create        — creates a task; manifest.json on disk
 *                            matches the supplied title/project.
 *   6. task create + workflow
 *                          — RUN_CONFIG.json gets libraryWorkflow.diskPath
 *                            and runSettings.inputs when --inputs given.
 *   7. invalid inputs     — rejects non-object inputs JSON.
 *   8. task list          — sees both new tasks.
 *
 * Exit 0 on success, 1 on any failure with a clear message.
 *
 * Run via:  npm run smoke:mc-cli
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { promises as fs, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, ".."));
const CLI_PATH = path.join(REPO_ROOT, "scripts", "mc-cli.ts");

let failures = 0;

function ok(name: string): void {
  process.stdout.write(`  ✓ ${name}\n`);
}

function fail(name: string, detail: string): void {
  process.stderr.write(`  ✗ ${name}\n    ${detail}\n`);
  failures++;
}

function runCli(env: NodeJS.ProcessEnv, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", CLI_PATH, ...args],
    { env, encoding: "utf8" },
  );
}

function expectExit(
  name: string,
  result: SpawnSyncReturns<string>,
  expectedCode: number,
): boolean {
  if (result.status !== expectedCode) {
    fail(
      name,
      `expected exit ${expectedCode}, got ${result.status}\n    error: ${result.error ? String(result.error) : "(none)"}\n    stdout: ${result.stdout}\n    stderr: ${result.stderr}`,
    );
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "mc-cli-smoke-"));
  const env: NodeJS.ProcessEnv = { ...process.env, MC_USER_DATA: tmpRoot };

  process.stdout.write(`mc-cli smoke (tmpRoot=${tmpRoot})\n`);

  // ── 1. paths ──────────────────────────────────────────────────────────
  {
    const r = runCli(env, "paths", "--json");
    if (expectExit("paths --json exits 0", r, 0)) {
      try {
        const payload = JSON.parse(r.stdout);
        if (payload.userData !== tmpRoot) {
          fail("paths reports MC_USER_DATA", `got userData=${payload.userData}`);
        } else if (payload.overriddenByEnv !== true) {
          fail("paths reports overriddenByEnv=true", `got ${payload.overriddenByEnv}`);
        } else {
          ok("paths --json reflects MC_USER_DATA");
        }
      } catch (e) {
        fail("paths --json parses", `${(e as Error).message}\n    stdout: ${r.stdout}`);
      }
    }
  }

  // ── 2. project create ─────────────────────────────────────────────────
  {
    const r = runCli(
      env,
      "project",
      "create",
      "smoke-proj",
      "--name",
      "Smoke Project",
      "--prefix",
      "SP",
      "--icon",
      "🧪",
      "--json",
    );
    if (expectExit("project create exits 0", r, 0)) {
      const projectFile = path.join(tmpRoot, "projects", "smoke-proj", "project.json");
      if (!existsSync(projectFile)) {
        fail("project.json on disk", `expected at ${projectFile}`);
      } else {
        const stored = JSON.parse(await fs.readFile(projectFile, "utf8"));
        if (stored.id !== "smoke-proj" || stored.prefix !== "SP" || stored.name !== "Smoke Project") {
          fail("project fields persisted", `got ${JSON.stringify(stored)}`);
        } else {
          ok("project create writes correct project.json");
        }
      }
    }
  }

  // ── 3. project list (json) ────────────────────────────────────────────
  {
    const r = runCli(env, "project", "list", "--json");
    if (expectExit("project list exits 0", r, 0)) {
      const arr = JSON.parse(r.stdout);
      if (!Array.isArray(arr) || arr.length !== 1 || arr[0].id !== "smoke-proj") {
        fail(
          "project list returns the new project",
          `got ${JSON.stringify(arr)}`,
        );
      } else {
        ok("project list returns the new project");
      }
    }
  }

  // ── 4. duplicate prefix is rejected ───────────────────────────────────
  {
    const r = runCli(
      env,
      "project",
      "create",
      "smoke-other",
      "--name",
      "Other",
      "--prefix",
      "SP", // same prefix, different slug
    );
    if (expectExit("duplicate prefix exits 1", r, 1)) {
      if (!/prefix .* already used/i.test(r.stderr)) {
        fail(
          "duplicate prefix error message",
          `expected /prefix.*already used/, got: ${r.stderr.trim()}`,
        );
      } else {
        ok("duplicate prefix is rejected with clear error");
      }
    }
  }

  // ── 5. task create (no workflow) ──────────────────────────────────────
  {
    const r = runCli(
      env,
      "task",
      "create",
      "--project",
      "smoke-proj",
      "--title",
      "Bare task",
      "--description",
      "no workflow attached",
      "--json",
    );
    if (expectExit("task create exits 0", r, 0)) {
      const payload = JSON.parse(r.stdout);
      const taskId = payload?.task?.id;
      if (typeof taskId !== "string" || !/^SP-\d{3,}F$/.test(taskId)) {
        fail("task id is SP-NNNF", `got ${taskId}`);
      } else {
        const manifestFile = path.join(tmpRoot, "tasks", taskId, "manifest.json");
        if (!existsSync(manifestFile)) {
          fail("manifest.json on disk", `expected at ${manifestFile}`);
        } else {
          const m = JSON.parse(await fs.readFile(manifestFile, "utf8"));
          if (m.title !== "Bare task" || m.project !== "smoke-proj") {
            fail("task fields persisted", `got ${JSON.stringify(m)}`);
          } else {
            ok("task create writes correct manifest.json");
          }
          const runConfigFile = path.join(tmpRoot, "tasks", taskId, "RUN_CONFIG.json");
          if (existsSync(runConfigFile)) {
            fail(
              "no RUN_CONFIG.json when --workflow not given",
              `but found one at ${runConfigFile}`,
            );
          } else {
            ok("no RUN_CONFIG.json when --workflow not given");
          }
        }
      }
    }
  }

  // ── 6. task create with workflow + inputs ────────────────────────────
  {
    // Create a fake workflow + inputs to point at.
    const workflowFile = path.join(tmpRoot, "fake-workflow.js");
    const inputsFile = path.join(tmpRoot, "fake-inputs.json");
    await fs.writeFile(
      workflowFile,
      "// fake workflow for smoke test\nexport async function process() { return {}; }\n",
      "utf8",
    );
    await fs.writeFile(inputsFile, JSON.stringify({ probe: "smoke" }), "utf8");

    const r = runCli(
      env,
      "task",
      "create",
      "--project",
      "smoke-proj",
      "--title",
      "Curated workflow task",
      "--workflow",
      workflowFile,
      "--inputs",
      inputsFile,
      "--mode",
      "yolo",
      "--json",
    );
    if (expectExit("task create (workflow) exits 0", r, 0)) {
      const payload = JSON.parse(r.stdout);
      const taskId = payload?.task?.id;
      if (typeof taskId !== "string") {
        fail("task id returned", `got ${JSON.stringify(payload)}`);
      } else {
        const runConfigFile = path.join(tmpRoot, "tasks", taskId, "RUN_CONFIG.json");
        if (!existsSync(runConfigFile)) {
          fail("RUN_CONFIG.json on disk", `expected at ${runConfigFile}`);
        } else {
          const cfg = JSON.parse(await fs.readFile(runConfigFile, "utf8"));
          if (cfg?.libraryWorkflow?.diskPath !== workflowFile) {
            fail(
              "RUN_CONFIG.libraryWorkflow.diskPath",
              `expected ${workflowFile}, got ${JSON.stringify(cfg?.libraryWorkflow)}`,
            );
          } else if (cfg?.kind !== "library-workflow-run") {
            fail("RUN_CONFIG.kind", `expected library-workflow-run, got ${cfg?.kind}`);
          } else if (typeof cfg?.libraryWorkflow?.logicalPath !== "string") {
            fail(
              "RUN_CONFIG.libraryWorkflow.logicalPath",
              `got ${JSON.stringify(cfg?.libraryWorkflow)}`,
            );
          } else if (cfg?.runSettings?.inputs?.probe !== "smoke") {
            fail(
              "RUN_CONFIG.runSettings.inputs.probe=smoke",
              `got ${JSON.stringify(cfg?.runSettings)}`,
            );
          } else {
            ok("task create (workflow) writes RUN_CONFIG with diskPath + inputs");
          }
        }
        // Also verify mode landed on the manifest.
        const manifestFile = path.join(tmpRoot, "tasks", taskId, "manifest.json");
        const m = JSON.parse(await fs.readFile(manifestFile, "utf8"));
        if (m.babysitterMode !== "yolo") {
          fail("babysitterMode persisted", `expected yolo, got ${m.babysitterMode}`);
        } else {
          ok("--mode yolo persists to manifest");
        }
      }
    }
  }

  // ── 7. invalid inputs are rejected before task creation ──────────────
  {
    const workflowFile = path.join(tmpRoot, "fake-workflow.js");
    const inputsFile = path.join(tmpRoot, "bad-inputs.json");
    await fs.writeFile(inputsFile, JSON.stringify(["not", "an", "object"]), "utf8");

    const r = runCli(
      env,
      "task",
      "create",
      "--project",
      "smoke-proj",
      "--title",
      "Bad inputs task",
      "--workflow",
      workflowFile,
      "--inputs",
      inputsFile,
      "--json",
    );
    if (expectExit("task create rejects non-object inputs", r, 1)) {
      if (!r.stderr.includes("--inputs must be a JSON object")) {
        fail("non-object inputs error message", `stderr: ${r.stderr}`);
      } else {
        ok("task create rejects non-object inputs clearly");
      }
    }
  }

  // ── 8. task list filtered by project ─────────────────────────────────
  {
    const r = runCli(env, "task", "list", "--project", "smoke-proj", "--json");
    if (expectExit("task list exits 0", r, 0)) {
      const arr = JSON.parse(r.stdout);
      if (!Array.isArray(arr) || arr.length !== 2) {
        fail("task list returns 2 tasks", `got ${arr?.length} (${JSON.stringify(arr)})`);
      } else {
        ok("task list --project sees both tasks");
      }
    }
  }

  // ── cleanup ─────────────────────────────────────────────────────────
  rmSync(tmpRoot, { recursive: true, force: true });

  if (failures > 0) {
    process.stderr.write(`\nmc-cli smoke FAILED (${failures} check${failures === 1 ? "" : "s"})\n`);
    process.exit(1);
  }
  process.stdout.write(`\nmc-cli smoke PASSED\n`);
}

main().catch((err) => {
  process.stderr.write(`mc-cli smoke threw: ${err?.message ?? String(err)}\n`);
  if (err?.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
