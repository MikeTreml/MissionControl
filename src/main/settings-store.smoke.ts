/**
 * Smoke for SettingsStore — round-trip get/save in a tmp dir.
 */
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SettingsStore } from "./settings-store.ts";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "mc-settings-smoke-"));
  console.log("[smoke] tmp=" + tmp);

  const store = new SettingsStore(tmp);
  await store.init();
  assert(existsSync(join(tmp, "settings.json")), "init seeds settings.json");

  const initial = await store.get();
  assert(initial.babysitterMode === "plan", `default babysitterMode is "plan" (got "${initial.babysitterMode}")`);

  const after = await store.save({ babysitterMode: "execute" });
  assert(after.babysitterMode === "execute", "save returns the merged shape");

  const reread = await store.get();
  assert(reread.babysitterMode === "execute", "saved value persists across reads");

  // Unknown / passthrough fields survive a round-trip.
  await store.save({ ...({ unrelated: "keep me" } as unknown as { babysitterMode?: never }) });
  const passthrough = await store.get();
  assert(
    (passthrough as Record<string, unknown>)["unrelated"] === "keep me",
    "passthrough fields are retained",
  );

  // Reverting flips back cleanly.
  await store.save({ babysitterMode: "plan" });
  const reverted = await store.get();
  assert(reverted.babysitterMode === "plan", "revert to plan works");

  // Workflow run templates round-trip.
  await store.saveWorkflowRunTemplate({
    id: "wf-template-1",
    name: "Default feature flow",
    workflowLogicalPath: "workflows/core/tdd-quality-convergence",
    workflowName: "TDD Quality Convergence",
    projectId: "dogapp",
    goal: "Implement feature with tests",
    model: "openai:gpt-5.3",
    inputs: { topic: "status panel", maxIterations: 3 },
  });
  const templates = await store.listWorkflowRunTemplates();
  assert(templates.length === 1, "template list returns saved template");
  assert(templates[0]!.name === "Default feature flow", "template fields persisted");
  await store.deleteWorkflowRunTemplate("wf-template-1");
  const afterDelete = await store.listWorkflowRunTemplates();
  assert(afterDelete.length === 0, "deleteWorkflowRunTemplate removes entry");

  console.log("GREEN");
}

main().catch((e) => { console.error(e); process.exit(1); });
