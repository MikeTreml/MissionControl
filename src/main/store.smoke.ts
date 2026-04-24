/**
 * Standalone smoke test for TaskStore — no Electron, no React.
 *
 * Run from mc-v2-electron/:
 *   node --experimental-strip-types src/main/store.smoke.ts
 *
 * Creates a fresh tmp folder, exercises create/list/get/save, verifies the
 * per-role scaffold, prints GREEN/RED, deletes the tmp folder.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { taskFile } from "../shared/models.ts";
import { TaskStore } from "./store.ts";

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-store-smoke-"));
  console.log(`[smoke] tmp=${tmp}`);

  const store = new TaskStore(tmp);
  await store.init();

  // ── create (per-project counter, workflow letter suffix) ────────────
  const a = await store.createTask({
    title: "First task",
    projectId: "dogapp",
    projectPrefix: "DA",
  });
  assert(a.id === "DA-001F", `expected DA-001F, got ${a.id}`);
  assert(a.workflow === "F", `expected default workflow F, got ${a.workflow}`);
  assert(a.lane === "plan", `new task should start in plan lane`);
  assert(a.currentAgentSlug === "planner", `new task should have planner as current agent`);
  console.log(`[smoke] created ${a.id} (${a.title})`);

  const b = await store.createTask({
    title: "Second task",
    projectId: "dogapp",
    projectPrefix: "DA",
  });
  assert(b.id === "DA-002F", `expected DA-002F, got ${b.id}`);

  // Different project prefix → independent counter.
  const c = await store.createTask({
    title: "Other project first task",
    projectId: "d365-costing",
    projectPrefix: "DX",
    workflow: "B",
  });
  assert(c.id === "DX-001B", `expected DX-001B (per-prefix counter + workflow letter), got ${c.id}`);
  assert(c.workflow === "B", `expected workflow B, got ${c.workflow}`);

  // Workflow letter does NOT split counter — next DA task after a B would be 003.
  const d = await store.createTask({
    title: "DA task after a DX bug",
    projectId: "dogapp",
    projectPrefix: "DA",
    workflow: "R",
  });
  assert(d.id === "DA-003R", `expected DA-003R (counter continues across workflow letters), got ${d.id}`);
  console.log(`[smoke] per-prefix counter + workflow letter OK`);

  // ── folder scaffold ─────────────────────────────────────────────────
  for (const role of ["planner", "developer", "reviewer", "surgeon"]) {
    const note = path.join(tmp, a.id, role, "notes.md");
    assert(existsSync(note), `missing ${role}/notes.md`);
  }
  assert(existsSync(path.join(tmp, a.id, "shared")), "shared/ should exist");
  assert(existsSync(path.join(tmp, a.id, "manifest.json")), "manifest.json missing");
  console.log(`[smoke] folder scaffold OK`);

  // ── list ────────────────────────────────────────────────────────────
  const listed = await store.listTasks();
  assert(listed.length === 4, `expected 4 tasks, got ${listed.length}`);
  // d was created last → newest-first order puts it at index 0.
  assert(listed[0]!.id === "DA-003R", `expected DA-003R first, got ${listed[0]!.id}`);
  console.log(`[smoke] list returned ${listed.length} tasks (newest first)`);

  // ── getTask ─────────────────────────────────────────────────────────
  const got = await store.getTask("DA-001F");
  assert(got !== null && got.id === "DA-001F", "getTask should find DA-001F");
  const missing = await store.getTask("DA-999F");
  assert(missing === null, "getTask should return null for missing id");
  console.log(`[smoke] getTask OK`);

  // ── save bumps updatedAt ────────────────────────────────────────────
  const before = got!.updatedAt;
  await new Promise((r) => setTimeout(r, 10)); // ensure timestamp changes
  await store.saveTask({ ...got!, lane: "develop", currentStep: "coding" });
  const after = await store.getTask("DA-001F");
  assert(after!.lane === "develop", "lane should be updated");
  assert(after!.currentStep === "coding", "currentStep should be updated");
  assert(after!.updatedAt > before, "updatedAt should advance");
  console.log(`[smoke] saveTask updates + bumps updatedAt`);

  // ── event journal (events.jsonl) ────────────────────────────────────
  const events = await store.readEvents("DA-001F");
  // DA-001F: 1 created event + 1 lane-changed event (from the saveTask above)
  assert(events.length === 2, `expected 2 events, got ${events.length}`);
  assert(events[0]!.type === "created", `first event should be "created", got ${events[0]!.type}`);
  assert(events[1]!.type === "lane-changed", `second event should be "lane-changed", got ${events[1]!.type}`);
  assert((events[1] as Record<string, unknown>).from === "plan", `lane-changed from should be "plan"`);
  assert((events[1] as Record<string, unknown>).to === "develop", `lane-changed to should be "develop"`);
  console.log(`[smoke] events.jsonl journal: ${events.map((e) => e.type).join(" → ")}`);

  // Arbitrary caller can append events (pi runtime will use this later)
  await store.appendEvent("DA-001F", { type: "run-started", role: "developer", model: "codex" });
  const grown = await store.readEvents("DA-001F");
  assert(grown.length === 3, `expected 3 events after append, got ${grown.length}`);
  assert(grown[2]!.type === "run-started", `third event should be "run-started"`);
  console.log(`[smoke] appendEvent works for arbitrary event types`);

  // ── taskFile helper (naming convention) ─────────────────────────────
  assert(taskFile("DA-015F") === "DA-015F", "base file should equal task id");
  assert(taskFile("DA-015F", "p") === "DA-015F-p", "planner suffix");
  assert(taskFile("DA-015F", "rmp") === "DA-015F-rmp", "subagent (2+ chars) suffix");
  console.log(`[smoke] taskFile helper OK`);

  // ── cleanup ─────────────────────────────────────────────────────────
  await fs.rm(tmp, { recursive: true, force: true });
  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("RED:", err);
  process.exit(1);
});
