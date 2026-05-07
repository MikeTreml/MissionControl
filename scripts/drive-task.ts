#!/usr/bin/env node
/**
 * drive-task — drive a babysitter curated workflow end-to-end from the
 * command line, without launching MC's UI.
 *
 * This is the CLI sibling of `RunManager.driveCuratedRun` in
 * `src/main/run-manager.ts:530-648`. It replicates that loop:
 *
 *   1. babysitter run:create  → { runId, runDir }
 *   2. loop: babysitter run:iterate <runDir>
 *      - on completed/failed: break
 *      - on waiting: print reason, exit (out of scope for this driver)
 *      - per pending action:
 *          kind=agent → spawn `claude -p <prompt> --output-format json`
 *          kind=shell → spawn command (shell:true), capture stdout/stderr
 *          other      → task:post --status error, fail
 *      - task:post --status ok with the captured value
 *   3. read state/output.json and print
 *
 * The prompt-construction logic (Role / Task / Context / Instructions /
 * Output format text) is duplicated verbatim from
 * run-manager.ts:711-726 to match MC's behavior bit-for-bit. If a third
 * caller ever appears, promote `buildAgentPromptText` to a shared module.
 *
 * Usage:
 *   node --experimental-strip-types scripts/drive-task.ts \
 *     --workflow <path>        # required (.js with #process export)
 *     [--inputs <path>]        # optional JSON file
 *     [--runs-dir <path>]      # default: ./.a5c/runs
 *     [--process-id <id>]      # default: local/<workflow-basename>
 *     [--run-id <id>]          # default: babysitter generates a ULID
 *     [--model <model>]        # passed to claude --model when set
 *     [--max-iterations <n>]   # default: 100
 *     [--json]                 # machine-readable summary on completion
 *
 * Exit codes:
 *   0  run completed (status=completed)
 *   1  run failed, errored, or hit an unhandled effect kind
 *   2  argv / usage error
 */
import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// =============================================================================
// SDK CLI resolution — same approach as src/main/run-manager.ts:38-50.
// Falls back to "babysitter" on PATH if the local SDK isn't installed.
// =============================================================================

function resolveBabysitterCliPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@a5c-ai/babysitter-sdk/package.json");
    return path.join(path.dirname(pkgPath), "dist/cli/main.js");
  } catch {
    return null;
  }
}

// =============================================================================
// Types — mirror src/main/run-manager.ts:52-89.
// =============================================================================

interface PendingAction {
  effectId: string;
  invocationKey?: string;
  kind: string;
  label?: string;
  taskDef: {
    kind?: string;
    title?: string;
    agent?: {
      name?: string;
      prompt?: {
        role?: string;
        task?: string;
        context?: unknown;
        instructions?: string[];
        outputFormat?: string;
      };
      outputSchema?: unknown;
    };
    shell?: {
      command?: string;
      cwd?: string;
    };
    execution?: { model?: string; harness?: string };
  };
}

interface IterateResult {
  iteration: number;
  status: "executed" | "waiting" | "completed" | "failed" | "none";
  action?: string;
  reason?: string;
  nextActions?: PendingAction[];
  error?: string;
}

// =============================================================================
// Argv parser — same shape as scripts/mc-cli.ts.
// =============================================================================

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function fail(msg: string, code: number): never {
  process.stderr.write(`drive-task: ${msg}\n`);
  process.exit(code);
}

function log(line: string): void {
  process.stderr.write(`[drive-task] ${line}\n`);
}

// =============================================================================
// Babysitter CLI invocation. The CLI is run as a Node script via
// process.execPath; in this script that's node.exe (no Electron). No
// ELECTRON_RUN_AS_NODE env override needed — that gymnastic is only for
// MC's main process where execPath is electron.exe.
// =============================================================================

async function runSdkCli(cliPath: string, args: string[]): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => { stdout += c.toString(); });
    child.stderr?.on("data", (c) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(
          `SDK CLI exited ${code}: ${stderr.trim() || stdout.trim() || "(no output)"}`,
        ));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(
          `SDK CLI returned non-JSON: ${(e as Error).message}\n${stdout.slice(0, 200)}`,
        ));
      }
    });
  });
}

// =============================================================================
// Prompt construction — DUPLICATED from run-manager.ts:711-726.
// Keep these two in sync until/unless promoted to a shared module.
// =============================================================================

function buildAgentPromptText(
  promptObj: NonNullable<NonNullable<PendingAction["taskDef"]["agent"]>["prompt"]>,
): string {
  return [
    `Role: ${promptObj.role ?? "Assistant"}.`,
    `Task: ${promptObj.task ?? "Execute the requested work."}`,
    promptObj.context !== undefined
      ? `Context:\n${JSON.stringify(promptObj.context, null, 2)}`
      : "",
    Array.isArray(promptObj.instructions) && promptObj.instructions.length > 0
      ? `Instructions:\n${(promptObj.instructions as string[])
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}`
      : "",
    `Output format: ${promptObj.outputFormat ?? "JSON"}.`,
    "Return ONLY the JSON object that satisfies the schema. No prose, no fences.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// =============================================================================
// Effect dispatchers — agent (claude -p) and shell.
// Mirror dispatchCuratedAgentTask + dispatchCuratedShellTask in run-manager.ts.
// =============================================================================

async function dispatchAgentTask(
  action: PendingAction,
  cwd: string,
  runLevelModel: string | undefined,
): Promise<unknown> {
  const agent = action.taskDef.agent;
  if (!agent) {
    throw new Error(`Agent task ${action.effectId} has no agent definition`);
  }
  const promptText = buildAgentPromptText(agent.prompt ?? {});
  const model = action.taskDef.execution?.model ?? runLevelModel;
  const args = ["-p", promptText, "--output-format", "json"];
  if (model) args.push("--model", model);

  return await new Promise<unknown>((resolve, reject) => {
    // Mirror run-manager.ts:732 exactly. shell:true is intentionally NOT
    // set; if it turns out the user's `claude` resolves to a .cmd that
    // needs a shell, we'll fix it here AND in run-manager.ts together.
    const child = spawn("claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => { stdout += c.toString(); });
    child.stderr?.on("data", (c) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(
          `claude exited ${code} for effect ${action.effectId}: ${stderr.trim() || stdout.slice(0, 200)}`,
        ));
        return;
      }
      // Claude headless emits { result: "<agent stdout>" }. The agent
      // stdout is supposed to be the JSON object we asked for.
      try {
        const envelope = JSON.parse(stdout) as { result?: string };
        if (typeof envelope.result === "string") {
          try { resolve(JSON.parse(envelope.result)); return; }
          catch { resolve({ raw: envelope.result }); return; }
        }
        resolve(envelope);
      } catch {
        resolve({ raw: stdout });
      }
    });
  });
}

async function dispatchShellTask(
  action: PendingAction,
  fallbackCwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const command = action.taskDef.shell?.command;
  if (!command || typeof command !== "string") {
    throw new Error(`Shell task ${action.effectId} has no shell.command`);
  }
  const cwd = typeof action.taskDef.shell?.cwd === "string"
    && action.taskDef.shell.cwd.trim().length > 0
    ? action.taskDef.shell.cwd
    : fallbackCwd;

  return await new Promise((resolve, reject) => {
    const opts: SpawnOptionsWithoutStdio = {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = spawn(command, opts);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// =============================================================================
// Main drive loop. Mirrors driveCuratedRun:541-631.
// =============================================================================

interface DriveOptions {
  cliPath: string;
  runDir: string;
  cwd: string;
  runLevelModel: string | undefined;
  maxIterations: number;
}

interface DriveOutcome {
  status: "completed" | "failed" | "waiting";
  iterations: number;
  reason?: string;
  error?: string;
}

async function driveLoop(opts: DriveOptions): Promise<DriveOutcome> {
  let iteration = 0;
  while (iteration < opts.maxIterations) {
    iteration += 1;
    log(`iterate ${iteration}/${opts.maxIterations}`);

    const result = (await runSdkCli(opts.cliPath, [
      "run:iterate", opts.runDir, "--json", "--iteration", String(iteration),
    ])) as IterateResult;

    if (result.status === "completed") {
      return { status: "completed", iterations: iteration };
    }
    if (result.status === "failed") {
      return { status: "failed", iterations: iteration, error: result.error };
    }

    // The SDK uses status="waiting" to mean "pending effects need external
    // resolution" — not "external pause." reason is one of agent-pending /
    // shell-pending / breakpoint-pending / sleep-pending. We process every
    // dispatchable effect (agent, shell) and re-iterate; only bail on
    // waiting when nothing in nextActions is dispatchable.
    const pending = result.nextActions ?? [];
    let processedAny = false;

    for (const action of pending) {
      log(`dispatch ${action.kind} effect ${action.effectId} (${action.label ?? action.taskDef.title ?? "no-label"})`);
      if (action.kind === "agent") {
        const value = await dispatchAgentTask(action, opts.cwd, opts.runLevelModel);
        await runSdkCli(opts.cliPath, [
          "task:post", opts.runDir, action.effectId,
          "--status", "ok",
          "--value-inline", JSON.stringify(value),
          "--json",
        ]);
        processedAny = true;
      } else if (action.kind === "shell") {
        const shellResult = await dispatchShellTask(action, opts.cwd);
        await runSdkCli(opts.cliPath, [
          "task:post", opts.runDir, action.effectId,
          "--status", "ok",
          "--value-inline", JSON.stringify(shellResult),
          "--json",
        ]);
        processedAny = true;
      } else {
        // breakpoint / sleep / custom — out of scope for this driver.
        // Post error so the SDK doesn't hang, then bail with a clear message.
        await runSdkCli(opts.cliPath, [
          "task:post", opts.runDir, action.effectId,
          "--status", "error",
          "--error-inline", JSON.stringify({
            message: `Effect kind '${action.kind}' not handled by drive-task CLI driver`,
          }),
          "--json",
        ]).catch(() => undefined);
        return {
          status: "failed",
          iterations: iteration,
          error: `Unhandled effect kind: ${action.kind}`,
        };
      }
    }

    if (!processedAny && result.status === "waiting") {
      // True soft pause — no dispatchable effects; reason is breakpoint /
      // sleep / similar. The CLI driver doesn't drive those; surface to caller.
      log(`waiting: ${result.reason ?? "unknown"} — out of scope for this driver`);
      return { status: "waiting", iterations: iteration, reason: result.reason };
    }
  }
  return {
    status: "failed",
    iterations: iteration,
    error: `Hit max iterations (${opts.maxIterations}) without completion`,
  };
}

// =============================================================================
// Entry point
// =============================================================================

const USAGE = `drive-task — drive a babysitter curated workflow end-to-end from the CLI.

Usage:
  node --experimental-strip-types scripts/drive-task.ts \\
    --workflow <path> [--inputs <path>] [--runs-dir <path>] \\
    [--process-id <id>] [--run-id <id>] [--model <model>] \\
    [--max-iterations <n>] [--json]

Required:
  --workflow <path>           .js file with a #process export

Optional:
  --inputs <path>             JSON file with the process inputs
  --runs-dir <path>           default: ./.a5c/runs (relative to cwd)
  --process-id <id>           default: local/<workflow-basename-without-ext>
  --run-id <id>               default: babysitter generates a ULID
  --model <model>             passed to claude --model on every agent dispatch
  --max-iterations <n>        default: 100
  --json                      print machine-readable summary on completion

Exit:
  0  run completed
  1  run failed / errored
  2  usage error
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help === true || args.flags.h === true) {
    process.stdout.write(USAGE);
    return;
  }

  const workflow = args.flags.workflow;
  if (typeof workflow !== "string" || workflow.length === 0) {
    fail("missing required flag: --workflow", 2);
  }
  const absWorkflow = path.resolve(workflow);
  if (!existsSync(absWorkflow)) {
    fail(`workflow file not found: ${absWorkflow}`, 1);
  }

  const inputsFlag = typeof args.flags.inputs === "string" ? args.flags.inputs : null;
  const absInputs = inputsFlag ? path.resolve(inputsFlag) : null;
  if (absInputs && !existsSync(absInputs)) {
    fail(`inputs file not found: ${absInputs}`, 1);
  }

  const runsDirFlag = typeof args.flags["runs-dir"] === "string"
    ? args.flags["runs-dir"]
    : path.join(process.cwd(), ".a5c", "runs");
  const runsDir = path.resolve(runsDirFlag);
  await fs.mkdir(runsDir, { recursive: true });

  const processId = typeof args.flags["process-id"] === "string"
    ? args.flags["process-id"]
    : `local/${path.basename(absWorkflow, path.extname(absWorkflow))}`;

  const runIdFlag = typeof args.flags["run-id"] === "string" ? args.flags["run-id"] : null;
  const model = typeof args.flags.model === "string" ? args.flags.model : undefined;
  const maxIterFlag = typeof args.flags["max-iterations"] === "string"
    ? Number.parseInt(args.flags["max-iterations"], 10)
    : 100;
  const maxIterations = Number.isFinite(maxIterFlag) && maxIterFlag > 0 ? maxIterFlag : 100;
  const asJson = args.flags.json === true;

  const cliPath = resolveBabysitterCliPath();
  if (!cliPath) {
    fail(
      "babysitter SDK not found. Install @a5c-ai/babysitter-sdk in this project, or run from a workspace where it's resolvable.",
      1,
    );
  }

  // Phase 1: stage the run.
  log(`run:create — process-id=${processId}, entry=${absWorkflow}#process`);
  const createArgs: string[] = [
    "run:create",
    "--process-id", processId,
    "--entry", `${absWorkflow}#process`,
    "--runs-dir", runsDir,
    "--json",
  ];
  if (absInputs) createArgs.push("--inputs", absInputs);
  if (runIdFlag) createArgs.push("--run-id", runIdFlag);

  let created: { runId: string; runDir: string };
  try {
    created = (await runSdkCli(cliPath!, createArgs)) as { runId: string; runDir: string };
  } catch (e) {
    fail(`run:create failed: ${(e as Error).message}`, 1);
  }
  log(`runId=${created!.runId}  runDir=${created!.runDir}`);

  // Phase 2: drive the loop. cwd for child spawns = wherever we were
  // launched from; agent dispatches and shell tasks resolve their own
  // cwd from the action's taskDef.shell.cwd or fall back to this.
  const cwd = process.cwd();
  const outcome = await driveLoop({
    cliPath: cliPath!,
    runDir: created!.runDir,
    cwd,
    runLevelModel: model,
    maxIterations,
  });

  // Phase 3: emit the run output (if any) and a summary.
  const outputPath = path.join(created!.runDir, "state", "output.json");
  let output: unknown = null;
  if (existsSync(outputPath)) {
    try {
      output = JSON.parse(await fs.readFile(outputPath, "utf8"));
    } catch (e) {
      log(`warn: state/output.json parse failed: ${(e as Error).message}`);
    }
  }

  const summary = {
    runId: created!.runId,
    runDir: created!.runDir,
    status: outcome.status,
    iterations: outcome.iterations,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.error ? { error: outcome.error } : {}),
    output,
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`status:     ${summary.status}\n`);
    process.stdout.write(`iterations: ${summary.iterations}\n`);
    if (summary.reason) process.stdout.write(`reason:     ${summary.reason}\n`);
    if (summary.error)  process.stdout.write(`error:      ${summary.error}\n`);
    process.stdout.write(`runDir:     ${summary.runDir}\n`);
    if (output) {
      process.stdout.write(`\n--- run output (${outputPath}) ---\n`);
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    }
  }

  if (outcome.status === "completed") process.exit(0);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`drive-task: ${err?.message ?? String(err)}\n`);
  if (err?.stack) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
