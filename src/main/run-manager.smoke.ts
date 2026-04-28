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

  // pause/resume should forward to pi when present
  const piCalls: string[] = [];
  const mgrWithPi = new RunManager(tasks, {
    start: async () => {},
    steer: async (taskId: string, text: string) => { piCalls.push(`steer:${taskId}:${text}`); },
    followUp: async (taskId: string, text: string) => { piCalls.push(`followUp:${taskId}:${text}`); },
    stop: async () => {},
  } as any);
  const piTask = await tasks.createTask({
    title: "Runner with pi",
    projectId: "runner",
    projectPrefix: "RN",
  });
  await mgrWithPi.start({ taskId: piTask.id, agentSlug: "developer" });
  await mgrWithPi.pause({ taskId: piTask.id });
  await mgrWithPi.resume({ taskId: piTask.id });
  assert(piCalls.length === 2, "pause/resume call through to pi session manager");
  assert(piCalls[0]!.includes("[paused by user"), "pause forwards steer message");
  assert(piCalls[1]!.includes("[resumed — continue from where you left off]"), "resume forwards followUp message");

  // ── Campaign iteration ──────────────────────────────────────────────
  // pi is null → start/completeRun follow the state-machine paths only,
  // which is exactly what we want to test (campaign iteration logic).
  const campaign = await tasks.createTask({
    title: "Campaign smoke",
    projectId: "runner",
    projectPrefix: "RN",
    kind: "campaign",
    items: [
      { id: "item-001", description: "first",  status: "pending", notes: "" },
      { id: "item-002", description: "second", status: "pending", notes: "" },
      { id: "item-003", description: "third",  status: "pending", notes: "" },
    ],
  });
  assert(campaign.kind === "campaign", "campaign created");

  // Start: first item should flip to running, others stay pending.
  await mgr.start({ taskId: campaign.id });
  let cur = (await tasks.getTask(campaign.id))!;
  assert(cur.runState === "running", "campaign task in running state");
  assert(cur.items[0]!.status === "running", "item-001 running after start");
  assert(cur.items[1]!.status === "pending", "item-002 pending after start");
  assert(cur.items[2]!.status === "pending", "item-003 pending after start");

  // Complete item 1 → item 2 should flip to running, task stays running.
  await mgr.completeRun(campaign.id, "completed");
  cur = (await tasks.getTask(campaign.id))!;
  assert(cur.items[0]!.status === "done", "item-001 done after first completeRun");
  assert(cur.items[1]!.status === "running", "item-002 advanced to running");
  assert(cur.runState === "running", "task still running mid-campaign");

  // Fail item 2 → item 3 should flip to running.
  await mgr.completeRun(campaign.id, "failed");
  cur = (await tasks.getTask(campaign.id))!;
  assert(cur.items[1]!.status === "failed", "item-002 marked failed on failed reason");
  assert(cur.items[2]!.status === "running", "item-003 advanced to running");
  assert(cur.runState === "running", "task continues after a failed item");

  // Complete item 3 → task fully idle, run-ended event with summary.
  await mgr.completeRun(campaign.id, "completed");
  cur = (await tasks.getTask(campaign.id))!;
  assert(cur.items[2]!.status === "done", "item-003 done");
  assert(cur.runState === "idle", "task idle after every item resolved");
  console.log(`[smoke] campaign 3-item iteration OK (1 failed, 2 done)`);

  // ── Stop mid-campaign marks the running item as failed ──────────────
  const campaign2 = await tasks.createTask({
    title: "Stop mid-campaign smoke",
    projectId: "runner",
    projectPrefix: "RN",
    kind: "campaign",
    items: [
      { id: "item-001", description: "alpha", status: "pending", notes: "" },
      { id: "item-002", description: "beta",  status: "pending", notes: "" },
    ],
  });
  await mgr.start({ taskId: campaign2.id });
  let mid = (await tasks.getTask(campaign2.id))!;
  assert(mid.items[0]!.status === "running", "first item running after start");

  await mgr.stop({ taskId: campaign2.id });
  mid = (await tasks.getTask(campaign2.id))!;
  assert(mid.runState === "idle", "task idle after stop");
  assert(mid.items[0]!.status === "failed", "running item marked failed on stop");
  assert(mid.items[1]!.status === "pending", "untouched item stays pending");
  console.log(`[smoke] stop mid-campaign marks running item failed`);

  // Empty-items campaign: start should be a graceful no-op.
  const empty = await tasks.createTask({
    title: "Empty campaign",
    projectId: "runner",
    projectPrefix: "RN",
    kind: "campaign",
    items: [],
  });
  await mgr.start({ taskId: empty.id });
  const after = (await tasks.getTask(empty.id))!;
  // No items means nothing to flip running; we don't error, just leave idle.
  assert(after.runState === "idle", "empty campaign stays idle");
  console.log(`[smoke] empty-items campaign no-ops gracefully`);

  console.log("GREEN");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
