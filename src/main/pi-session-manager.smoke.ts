/**
 * Smoke for PiSessionManager — exercises the create/dispose lifecycle
 * using a real pi AgentSession (no prompting, no LLM call).
 *
 * This proves that pi session objects can be spawned from MC's main
 * process, their events can be captured into events.jsonl, and dispose is
 * clean. Prompting + model selection are future baby steps.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TaskStore } from "./store.ts";
import { PiSessionManager } from "./pi-session-manager.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "mc-pi-smoke-"));
  console.log("[smoke] tmp=" + tmp);

  const tasks = new TaskStore(tmp);
  await tasks.init();
  const task = await tasks.createTask({
    title: "Pi session test",
    projectId: "pitest",
    projectPrefix: "PT",
  });

  const pi = new PiSessionManager(tasks);
  assert(!pi.hasSession(task.id), "no session before start");

  await pi.start(task.id);
  assert(pi.hasSession(task.id), "hasSession true after start");
  assert(
    pi.activeTaskIds().includes(task.id),
    "activeTaskIds includes task after start",
  );

  // double-start should throw
  let threw = false;
  try { await pi.start(task.id); } catch { threw = true; }
  assert(threw, "second start on same task throws");

  await pi.stop(task.id);
  assert(!pi.hasSession(task.id), "hasSession false after stop");
  assert(pi.activeTaskIds().length === 0, "no active sessions after stop");

  // stop on unknown task is a no-op (not an error — cleanup should be tolerant)
  await pi.stop("NOPE-999F");
  assert(true, "stop on unknown taskId is a no-op");

  // restart path
  await pi.start(task.id);
  await pi.stop(task.id);
  assert(!pi.hasSession(task.id), "restart + stop lifecycle OK");

  console.log("GREEN");
}

main().catch((err) => {
  console.error("[smoke] threw:", err);
  process.exit(1);
});
