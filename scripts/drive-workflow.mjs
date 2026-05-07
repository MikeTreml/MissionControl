#!/usr/bin/env node
/**
 * scripts/drive-workflow.mjs
 *
 * Generic driver for babysitter workflows. Replaces the manual
 *   run:create -> run:iterate -> task:post -> repeat
 * loop with one command. Dispatches each pending agent task to `claude`
 * headless and each pending shell task to the local shell. On
 * --non-interactive, breakpoints are auto-approved.
 *
 * Usage:
 *   node scripts/drive-workflow.mjs <workflow.js> [inputs.json] [--non-interactive] [--max-iter <n>]
 *
 * Example (the AGENT.md resolution test):
 *   node scripts/drive-workflow.mjs \
 *     .a5c/processes/agent-resolution-test.js \
 *     .a5c/processes/agent-resolution-test.inputs.json \
 *     --non-interactive
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// ── Argv parsing ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.length < 1 || argv.includes("--help") || argv.includes("-h")) {
  console.log("Usage: node scripts/drive-workflow.mjs <workflow.js> [inputs.json] [--non-interactive] [--max-iter <n>] [--repeat <n>]");
  process.exit(argv.length < 1 ? 2 : 0);
}

const positional = argv.filter((a) => !a.startsWith("--"));
const workflowPath = path.resolve(positional[0]);
const inputsPath = positional[1] ? path.resolve(positional[1]) : null;
const nonInteractive = argv.includes("--non-interactive");
const maxIterIdx = argv.indexOf("--max-iter");
const MAX_ITER = maxIterIdx >= 0 ? Number(argv[maxIterIdx + 1] || 50) : 50;
const repeatIdx = argv.indexOf("--repeat");
const REPEAT = repeatIdx >= 0 ? Number(argv[repeatIdx + 1] || 1) : 1;

if (!existsSync(workflowPath)) {
  console.error(`Workflow not found: ${workflowPath}`);
  process.exit(1);
}

// ── Resolve the SDK CLI directly so we don't depend on PATH/.cmd shims ─

const sdkPkgPath = require.resolve("@a5c-ai/babysitter-sdk/package.json");
const sdkCli = path.join(path.dirname(sdkPkgPath), "dist/cli/main.js");

function bs(args) {
  const r = spawnSync(process.execPath, [sdkCli, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`\nbabysitter ${args[0]} failed (exit ${r.status}):`);
    console.error(r.stderr.trim() || r.stdout.trim());
    process.exit(1);
  }
  return r.stdout;
}

function bsJson(args) {
  const out = bs(args);
  try { return JSON.parse(out); }
  catch { console.error(`Non-JSON from babysitter ${args[0]}:\n${out.slice(0, 500)}`); process.exit(1); }
}

// ── Dispatchers ──────────────────────────────────────────────────────

function buildAgentPrompt(taskDef) {
  const agent = taskDef.agent || {};
  const p = agent.prompt || {};
  const parts = [];
  if (p.role) parts.push(`Role: ${p.role}`);
  if (p.task) parts.push(`Task: ${p.task}`);
  if (p.context !== undefined) parts.push(`Context:\n${JSON.stringify(p.context, null, 2)}`);
  if (Array.isArray(p.instructions) && p.instructions.length) {
    parts.push(`Instructions:\n${p.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (p.outputFormat) parts.push(`Output format: ${p.outputFormat}`);
  parts.push("Return ONLY the JSON object that satisfies the schema. No prose, no fences.");
  return parts.join("\n\n");
}

function dispatchAgent(action) {
  const prompt = buildAgentPrompt(action.taskDef);
  const args = ["-p", "--output-format", "json"];
  const model = action.taskDef.execution?.model;
  if (model) args.push("--model", model);
  const r = spawnSync("claude", args, {
    input: prompt,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`claude exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
  }
  // Claude headless emits a JSON envelope; the agent's text sits in `.result`.
  let envelope;
  try { envelope = JSON.parse(r.stdout); }
  catch { return { raw: r.stdout }; }
  if (typeof envelope.result === "string") {
    try { return JSON.parse(envelope.result); }
    catch { return { raw: envelope.result }; }
  }
  return envelope;
}

function dispatchShell(action) {
  const cmd = action.taskDef.shell?.command;
  if (!cmd) throw new Error(`shell task ${action.effectId} has no command`);
  const cwd = action.taskDef.shell?.cwd || process.cwd();
  const r = spawnSync(cmd, [], { encoding: "utf8", shell: true, cwd, maxBuffer: 20 * 1024 * 1024 });
  return { exitCode: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// ── Drive (one or more times via --repeat) ──────────────────────────

function driveOnce(runIndex) {
  const tag = REPEAT > 1 ? `[run ${runIndex + 1}/${REPEAT}] ` : "";
  const createArgs = [
    "run:create",
    "--process-id", `local/${path.basename(workflowPath, ".js")}`,
    "--entry", `${workflowPath}#process`,
  ];
  if (inputsPath) createArgs.push("--inputs", inputsPath);
  createArgs.push("--prompt", `drive-workflow.mjs run for ${path.basename(workflowPath)}`);
  if (nonInteractive) createArgs.push("--non-interactive");
  createArgs.push("--json");

  console.log(`${tag}▶  Creating run...`);
  const created = bsJson(createArgs);
  const runDir = created.runDir;
  console.log(`${tag}   runId:  ${created.runId}`);

  let iteration = 0;
  let stopReason = "unknown";
  const taskResults = [];

  while (iteration < MAX_ITER) {
    iteration += 1;
    const r = bsJson(["run:iterate", runDir, "--json", "--iteration", String(iteration)]);
    console.log(`${tag}▶  iter ${iteration}: status=${r.status} reason=${r.reason || "-"}`);

    if (r.status === "completed") { stopReason = "completed"; break; }
    if (r.status === "failed")    { stopReason = "failed";    break; }

    const pending = r.nextActions || [];
    if (pending.length === 0) {
      if (r.status === "waiting") { stopReason = `waiting: ${r.reason}`; break; }
      continue;
    }

    for (const action of pending) {
      const label = action.taskDef?.title || action.label || action.taskDef?.kind || "(?)";
      process.stdout.write(`${tag}   → ${action.kind}: ${label} ... `);
      let value;
      try {
        if (action.kind === "agent")          value = dispatchAgent(action);
        else if (action.kind === "shell")     value = dispatchShell(action);
        else if (action.kind === "breakpoint" && nonInteractive)
                                              value = { approved: true, response: "auto-approved by driver" };
        else throw new Error(`unhandled effect kind: ${action.kind}`);
      } catch (e) {
        console.log("FAILED");
        bs(["task:post", runDir, action.effectId,
            "--status", "error",
            "--error-inline", JSON.stringify({ message: String(e?.message || e) }),
            "--json"]);
        stopReason = `dispatch_error: ${e?.message || e}`;
        break;
      }
      bs(["task:post", runDir, action.effectId,
          "--status", "ok",
          "--value-inline", JSON.stringify(value),
          "--json"]);
      // Use the SDK taskId from the effect's invocationKey (last segment),
      // not the action.label, so aggregate keys are stable across runs.
      const ikSegments = String(action.invocationKey || "").split(":");
      const stableTaskId = ikSegments[ikSegments.length - 1] || label;
      taskResults.push({ effectId: action.effectId, taskId: stableTaskId, label, kind: action.kind, value });
      console.log("ok");
    }
    if (stopReason.startsWith("dispatch_error")) break;
  }

  if (iteration >= MAX_ITER && stopReason === "unknown") stopReason = `max_iterations (${MAX_ITER})`;
  console.log(`${tag}■  ${stopReason}\n`);
  return { runIndex, runId: created.runId, runDir, stopReason, taskResults };
}

const allRuns = [];
for (let i = 0; i < REPEAT; i += 1) {
  allRuns.push(driveOnce(i));
}

// ── Output ───────────────────────────────────────────────────────────

console.log("=".repeat(60));
console.log(`  Per-run results  (${REPEAT} run${REPEAT === 1 ? "" : "s"})`);
console.log("=".repeat(60));
for (const r of allRuns) {
  console.log(`\n--- run ${r.runIndex + 1}/${REPEAT}  (${r.runId})  ${r.stopReason} ---`);
  for (const t of r.taskResults) {
    console.log(`  [${t.taskId}] ${JSON.stringify(t.value)}`);
  }
}

if (REPEAT > 1) {
  console.log("\n" + "=".repeat(60));
  console.log(`  Aggregate across ${REPEAT} runs`);
  console.log("=".repeat(60));
  // Group results by stable taskId across runs.
  const byTask = new Map();
  for (const r of allRuns) {
    for (const t of r.taskResults) {
      if (!byTask.has(t.taskId)) byTask.set(t.taskId, []);
      byTask.get(t.taskId).push(t.value);
    }
  }
  for (const [taskId, values] of byTask) {
    console.log(`\n[${taskId}] (${values.length} values)`);
    // Distinct-by-JSON, sorted by frequency.
    const counts = new Map();
    for (const v of values) {
      const key = JSON.stringify(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key, n] of sorted) {
      console.log(`  ${n}× ${key}`);
    }
  }
}
