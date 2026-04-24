#!/usr/bin/env node
/**
 * End-to-end CLI runner — drives a real task through TaskStore → RunManager
 * → PiSessionManager → pi, with live event logging. No Electron, no UI.
 *
 * Usage:
 *   npm run run-task -- "Task title" "Task description"
 *   npm run run-task -- "Say hello" "Just reply with the single word hello"
 *   npm run run-task -- "Write hello.py" "Create a file at ./hello.py that prints 'hi'. Then stop."
 *
 * Prerequisites:
 *   - Logged in to pi via `pi` CLI (so ~/.pi/agent/auth.json exists)
 *     OR have OPENAI_API_KEY / ANTHROPIC_API_KEY in env
 *
 * Behavior:
 *   - Creates a temp workspace under os.tmpdir() so pi can't scribble on
 *     the real repo (pi's tools default to cwd; we chdir to the tmp dir
 *     before starting the session).
 *   - Streams every event from the task's events.jsonl to stdout as it
 *     arrives.
 *   - Exits 0 on agent_end ("completed"), 1 on failed, 2 on timeout.
 *   - Prints the full events.jsonl at the end for post-mortem.
 */
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chdir, cwd } from "node:process";
import { join } from "node:path";

import { TaskStore } from "../src/main/store.ts";
import { PiSessionManager } from "../src/main/pi-session-manager.ts";
import { RunManager } from "../src/main/run-manager.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

async function main(): Promise<void> {
  const [title, description = ""] = process.argv.slice(2);
  if (!title) {
    console.error(
      `Usage: node --experimental-strip-types scripts/run-task.ts "<title>" "<description>"`,
    );
    process.exit(2);
  }

  const dataRoot = mkdtempSync(join(tmpdir(), "mc-run-task-data-"));
  const workspace = mkdtempSync(join(tmpdir(), "mc-run-task-ws-"));
  const originalCwd = cwd();
  chdir(workspace);

  console.log(`[run-task] dataRoot=${dataRoot}`);
  console.log(`[run-task] workspace=${workspace}`);
  console.log(`[run-task] title="${title}"`);
  console.log(`[run-task] description="${description}"`);
  console.log("");

  const tasks = new TaskStore(dataRoot);
  await tasks.init();

  const pi = new PiSessionManager(tasks);
  const runs = new RunManager(tasks, pi);

  // Completion signal — resolves when pi fires agent_end (or errors).
  let resolveDone: (result: { reason: string; error?: unknown }) => void = () => {};
  const done = new Promise<{ reason: string; error?: unknown }>((resolve) => {
    resolveDone = resolve;
  });

  pi.setOnSessionEnd(async (taskId, result) => {
    await runs.completeRun(taskId, result.reason);
    resolveDone({ reason: result.reason, error: result.error });
  });

  // Live event tap — print as they land.
  tasks.on("event-appended", ({ event }) => {
    const stamp = event.timestamp.slice(11, 19); // HH:MM:SS
    const payload = summarize(event);
    console.log(`[${stamp}] ${event.type}${payload ? ` · ${payload}` : ""}`);
  });

  const task = await tasks.createTask({
    title,
    description,
    projectId: "dev-test",
    projectPrefix: "DEV",
  });
  console.log(`[run-task] created ${task.id}`);

  await runs.start({ taskId: task.id });
  console.log(`[run-task] started, waiting for agent_end…`);
  console.log("");

  // Race with a timeout so a hung session doesn't wedge CI.
  const timeout = new Promise<{ reason: string; error?: unknown }>((resolve) =>
    setTimeout(() => resolve({ reason: "timeout" }), DEFAULT_TIMEOUT_MS),
  );
  const result = await Promise.race([done, timeout]);

  if (result.reason === "timeout") {
    console.log("\n[run-task] timeout — force stopping");
    await runs.stop({ taskId: task.id, reason: "user" });
  }

  // Dump final journal so we can eyeball the exact shapes written.
  const eventsPath = join(dataRoot, task.id, "events.jsonl");
  console.log(`\n[run-task] final events.jsonl (${eventsPath}):`);
  console.log("─".repeat(72));
  try {
    const raw = await readFile(eventsPath, "utf8");
    process.stdout.write(raw);
  } catch (e) {
    console.log("(no events.jsonl — nothing was appended)");
  }
  console.log("─".repeat(72));
  console.log(`[run-task] reason=${result.reason}`);

  chdir(originalCwd);

  if (result.reason === "completed") process.exit(0);
  if (result.reason === "timeout") process.exit(2);
  process.exit(1);
}

/**
 * One-line summary of an event payload for the live log. Trim long text
 * fields so the stream stays readable.
 */
function summarize(event: { type: string } & Record<string, unknown>): string {
  const pick = (k: string): string | null => {
    const v = event[k];
    if (typeof v !== "string") return null;
    return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  };
  const parts: string[] = [];
  for (const k of ["from", "to", "reason", "agentSlug", "message", "text", "content"]) {
    const s = pick(k);
    if (s) parts.push(`${k}=${s}`);
  }
  return parts.join(", ");
}

main().catch((err) => {
  console.error("[run-task] threw:", err);
  process.exit(1);
});
