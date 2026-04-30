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
  assert(taskFile("DA-015F", "p") === "DA-015F-p", "legacy planner suffix");
  assert(taskFile("DA-015F", "p", 1) === "DA-015F-p-c1", "planner cycle suffix");
  assert(taskFile("DA-015F", "rmp", 2) === "DA-015F-rmp-c2", "subagent cycle suffix");
  console.log(`[smoke] taskFile helper OK`);

  // ── RUN_CONFIG.json sidecar ──────────────────────────────────────────
  await store.writeRunConfig("DA-001F", {
    kind: "library-workflow-run",
    runSettings: { model: "openai:gpt-5.3", inputs: { topic: "x++ cost rollups" } },
  });
  const runConfig = await store.readRunConfig("DA-001F");
  assert(runConfig !== null, "readRunConfig returns persisted sidecar");
  assert((runConfig.runSettings as Record<string, unknown>).model === "openai:gpt-5.3", "runConfig model persisted");
  console.log("[smoke] RUN_CONFIG.json read/write OK");

  // ── artifacts JSON write helper ──────────────────────────────────────
  const artifactPath = await store.writeArtifactJson("DA-001F", "sample.metrics.json", {
    step: "planner",
    costUSD: 0.04,
  });
  assert(existsSync(artifactPath), "writeArtifactJson creates artifact file");
  const artifactRaw = await fs.readFile(artifactPath, "utf8");
  assert(artifactRaw.includes("\"costUSD\": 0.04"), "artifact payload persisted");
  const artifacts = await store.listArtifacts("DA-001F");
  assert(artifacts.length >= 1, "listArtifacts returns persisted artifact files");
  const artifactJson = await store.readArtifactJson("DA-001F", "sample.metrics.json");
  assert(artifactJson?.step === "planner", "readArtifactJson returns parsed payload");
  console.log("[smoke] artifact JSON write helper OK");

  // ── project-level metrics rollup (artifacts/*.metrics.json) ─────────
  await store.writeArtifactJson("DA-002F", "DA-002F-run-c1-2026-01-01T00-00-00-000Z.metrics.json", {
    tokensIn: 100,
    tokensOut: 50,
    costUSD: 0.01,
    wallTimeSeconds: 30,
  });
  const dogRoll = await store.aggregateProjectRunMetrics("dogapp");
  assert(dogRoll.metricsArtifactCount === 2, `expected 2 metric artifacts for dogapp, got ${dogRoll.metricsArtifactCount}`);
  assert(dogRoll.tokensIn === 100 && dogRoll.tokensOut === 50, "tokens summed from artifacts");
  assert(Math.abs(dogRoll.costUSD - 0.05) < 0.0001, `costUSD summed (0.04+0.01), got ${dogRoll.costUSD}`);
  assert(dogRoll.wallTimeSeconds === 30, `wallTimeSeconds summed, got ${dogRoll.wallTimeSeconds}`);
  assert(dogRoll.tasksWithArtifacts === 2, `two tasks had metrics artifacts, got ${dogRoll.tasksWithArtifacts}`);
  const emptyRoll = await store.aggregateProjectRunMetrics("no-such-project");
  assert(emptyRoll.metricsArtifactCount === 0, "unknown project yields empty rollup");
  console.log("[smoke] aggregateProjectRunMetrics OK");

  // ── Phase 2: PROMPT.md + STATUS.md convention ──────────────────────
  // Every task is scaffolded with both files. PROMPT.md has an initial
  // brief; STATUS.md is seeded with a "task created" entry.
  const initialPrompt = await store.readPromptFile("DA-001F");
  assert(
    initialPrompt !== null && initialPrompt.includes("DA-001F"),
    `PROMPT.md seeded on scaffold (got ${initialPrompt?.slice(0, 40)}…)`,
  );
  const initialStatus = await store.readStatusFile("DA-001F");
  assert(
    initialStatus !== null && initialStatus.includes("task created"),
    `STATUS.md seeded with "task created"`,
  );
  console.log(`[smoke] PROMPT.md + STATUS.md seeded at scaffold`);

  // writePromptFile overwrites (represents the "Start re-renders" flow)
  await store.writePromptFile("DA-001F", "# replaced mission\n\nnew brief");
  const rewritten = await store.readPromptFile("DA-001F");
  assert(
    rewritten === "# replaced mission\n\nnew brief",
    `writePromptFile overwrites content`,
  );
  console.log(`[smoke] writePromptFile overwrite OK`);

  // appendStatus adds a stamped line + fires task-saved
  let gotEmission = false;
  const unsub = () => store.off("task-saved", listener);
  const listener = () => { gotEmission = true; };
  store.on("task-saved", listener);
  await store.appendStatus("DA-001F", "Planner picked up task");
  unsub();
  assert(gotEmission, `appendStatus emits task-saved for live refresh`);
  const afterAppend = await store.readStatusFile("DA-001F");
  assert(
    afterAppend !== null && afterAppend.includes("Planner picked up task"),
    `appendStatus line landed in STATUS.md`,
  );
  console.log(`[smoke] appendStatus + task-saved emission OK`);

  // ensureWorkspace creates + returns the per-task scratch dir
  const ws = await store.ensureWorkspace("DA-001F");
  assert(existsSync(ws), `ensureWorkspace mkdir'd ${ws}`);
  assert(
    ws.endsWith(path.join("DA-001F", "workspace")),
    `ensureWorkspace returns the expected path`,
  );
  console.log(`[smoke] ensureWorkspace creates workspace dir`);

  // folderFor returns the task folder path
  const folder = store.folderFor("DA-001F");
  assert(existsSync(folder), `folderFor points at an existing task folder`);
  console.log(`[smoke] folderFor OK`);

  // readTaskFile resolves latest cycle when present and otherwise falls back
  // to the legacy non-cycled artifact naming.
  const plannerStem = taskFile("DA-001F", "p");
  const plannerOutput = await store.readTaskFile("DA-001F", plannerStem);
  assert(plannerOutput === null, `readTaskFile returns null for not-yet-produced artifact`);
  await fs.writeFile(path.join(folder, `${taskFile("DA-001F", "p", 1)}.md`), "cycle 1", "utf8");
  await fs.writeFile(path.join(folder, `${taskFile("DA-001F", "p", 2)}.md`), "cycle 2", "utf8");
  const latestPlanner = await store.readTaskFile("DA-001F", plannerStem);
  assert(latestPlanner === "cycle 2", `readTaskFile resolves latest cycle by default`);
  const cycle1Planner = await store.readTaskFile("DA-001F", plannerStem, { cycle: 1 });
  assert(cycle1Planner === "cycle 1", `readTaskFile resolves explicit cycle`);
  const plannerCycles = await store.listTaskFileCycles("DA-001F", plannerStem);
  assert(plannerCycles.join(",") === "1,2", `listTaskFileCycles returns discovered cycles`);
  await fs.writeFile(path.join(folder, `${taskFile("DA-001F", "d")}.md`), "legacy dev", "utf8");
  const legacyDev = await store.readTaskFile("DA-001F", taskFile("DA-001F", "d"));
  assert(legacyDev === "legacy dev", `legacy non-cycled artifact still resolves`);
  console.log(`[smoke] readTaskFile cycle resolution OK`);

  // ── crash recovery: reconcileInterruptedRuns ───────────────────────
  // Simulate a prior crash by manually rewriting a task's manifest with
  // runState="running" and a campaign-style item left in "running". Then
  // re-init a fresh store on the same root and assert it cleaned up.
  const stuckId = "DA-001F";
  const stuckFolder = store.folderFor(stuckId);
  const stuckRaw = await fs.readFile(path.join(stuckFolder, "manifest.json"), "utf8");
  const stuckTask = JSON.parse(stuckRaw);
  stuckTask.runState = "running";
  stuckTask.items = [
    { id: "1", description: "in-flight item", status: "running", notes: "" },
    { id: "2", description: "queued item",    status: "pending", notes: "" },
  ];
  await fs.writeFile(
    path.join(stuckFolder, "manifest.json"),
    JSON.stringify(stuckTask, null, 2),
    "utf8",
  );
  // Re-init: reconcile should fire and report 1 fix.
  const recovered = new TaskStore(tmp);
  const fixed = await recovered.reconcileInterruptedRuns();
  assert(fixed === 1, `reconcileInterruptedRuns reported ${fixed}, expected 1`);
  // Re-read the manifest — runState back to idle, item 1 marked failed.
  const recoveredTask = await recovered.getTask(stuckId);
  assert(recoveredTask !== null, "task still exists after reconcile");
  assert(recoveredTask!.runState === "idle", `runState reset to idle (got ${recoveredTask!.runState})`);
  assert(recoveredTask!.items[0].status === "failed", `running item flipped to failed`);
  assert(
    recoveredTask!.items[0].notes.includes("interrupted"),
    `failed item carries interrupted note`,
  );
  assert(recoveredTask!.items[1].status === "pending", `pending item left untouched`);
  // events.jsonl should contain interrupted + run-ended entries.
  const recoveredEvents = await recovered.readEvents(stuckId);
  const types = recoveredEvents.map((e) => e.type);
  assert(
    types.includes("interrupted") && types.includes("run-ended"),
    `events.jsonl has interrupted + run-ended (got ${types.join(", ")})`,
  );
  // Idempotent: a second reconcile is a no-op.
  const fixedAgain = await recovered.reconcileInterruptedRuns();
  assert(fixedAgain === 0, `second reconcile no-ops (got ${fixedAgain})`);
  console.log(`[smoke] reconcileInterruptedRuns recovers + idempotent`);

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
