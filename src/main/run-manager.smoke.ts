/**
 * Smoke for RunManager — exercises the state machine against a real TaskStore
 * in a temp dir. No pi involvement; when pi lands this smoke grows alongside.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TaskStore } from "./store.ts";
import { RunManager } from "./run-manager.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "mc-run-smoke-"));
  console.log("[smoke] tmp=" + tmp);

  const tasks = new TaskStore(tmp);
  await tasks.init();
  const task = await tasks.createTask({
    title: "Runner test",
    projectId: "runner",
    projectPrefix: "RN",
  });
  assert(task.runState === "idle", "new task starts idle");

  const mgr = new RunManager(tasks);

  // start: idle → running
  const started = await mgr.start({ taskId: task.id, agentSlug: "developer" });
  assert(started.runState === "running", "start flips runState to running");
  assert(started.currentAgentSlug === "developer", "start honors agentSlug");

  // start again should fail
  let threw = false;
  try { await mgr.start({ taskId: task.id }); } catch { threw = true; }
  assert(threw, "start throws when already running");

  // pause: running → paused
  const paused = await mgr.pause({ taskId: task.id });
  assert(paused.runState === "paused", "pause flips runState to paused");

  // pause again should fail
  threw = false;
  try { await mgr.pause({ taskId: task.id }); } catch { threw = true; }
  assert(threw, "pause throws when already paused");

  // resume: paused → running
  const resumed = await mgr.resume({ taskId: task.id });
  assert(resumed.runState === "running", "resume flips runState to running");

  // stop (while running): running → idle
  const stopped = await mgr.stop({ taskId: task.id, reason: "user" });
  assert(stopped.runState === "idle", "stop flips runState to idle");

  // stop again should fail
  threw = false;
  try { await mgr.stop({ taskId: task.id }); } catch { threw = true; }
  assert(threw, "stop throws when already idle");

  // stop from paused state also works
  await mgr.start({ taskId: task.id });
  await mgr.pause({ taskId: task.id });
  const stoppedFromPaused = await mgr.stop({ taskId: task.id });
  assert(
    stoppedFromPaused.runState === "idle",
    "stop from paused flips runState to idle",
  );

  // events journal recorded every transition
  const events = await tasks.readEvents(task.id);
  const types = events.map((e) => e.type);
  const expected = [
    "created",
    "run-started",
    "run-paused",
    "run-resumed",
    "run-ended",
    "run-started",
    "run-paused",
    "run-ended",
  ];
  const matches =
    types.length === expected.length &&
    expected.every((t, i) => types[i] === t);
  assert(matches, `events.jsonl records transitions (got ${types.join(",")})`);

  // missing task id
  threw = false;
  try { await mgr.start({ taskId: "NOPE-999F" }); } catch { threw = true; }
  assert(threw, "start throws on unknown task id");

  console.log("GREEN");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
