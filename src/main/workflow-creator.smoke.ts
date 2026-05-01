/**
 * Standalone smoke test for WorkflowCreator.
 *
 *   node --experimental-strip-types src/main/workflow-creator.smoke.ts
 *
 * Uses a tmp library root so the real library/ tree isn't touched.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { WorkflowCreator } from "./workflow-creator.ts";
import type { WorkflowSpec } from "./workflow-generator.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok -", msg);
}

const minimalSpec: WorkflowSpec = {
  processId: "demo/created",
  description: "Created via WorkflowCreator smoke test",
  inputs: [{ name: "input1", jsDocType: "string", defaultLiteral: "''" }],
  outputs: [{ name: "result", jsDocType: "string", expression: "doneTask.result" }],
  successExpression: "true",
  phases: [
    {
      kind: "sequential",
      title: "Do thing",
      resultVar: "doneTask",
      taskRef: "doThingTask",
      args: { input1: "input1" },
    },
  ],
  tasks: [
    {
      kind: "agent",
      factoryName: "doThingTask",
      taskKey: "do-thing",
      title: "Do thing",
      agentName: "general-purpose",
      role: "Worker",
      taskDescription: "Do the thing",
      contextKeys: ["input1"],
      instructions: ["Do it"],
      outputFormat: "JSON with result",
      outputSchema: {
        type: "object",
        required: ["result"],
        properties: { result: { type: "string" } },
      },
      labels: ["agent"],
    },
  ],
};

async function main(): Promise<void> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wfcreator-"));
  // Minimal library skeleton — needs an existing _index.json + workflows/ for
  // the rebuild step to land somewhere sensible.
  await fs.mkdir(path.join(tmpRoot, "workflows"), { recursive: true });
  await fs.writeFile(
    path.join(tmpRoot, "_index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary: { agents: 0, skills: 0, workflows: 0, examples: 0 }, items: [] }, null, 2),
  );

  const creator = new WorkflowCreator(tmpRoot);

  // Happy path.
  const result = await creator.create({
    spec: minimalSpec,
    category: "cradle",
    slug: "smoke-created",
  });
  assert(result.diskPath.endsWith(path.join("cradle", "smoke-created", "workflow.js")), "result.diskPath ends with target");
  assert(result.relPath === "workflows/cradle/smoke-created/workflow.js", "result.relPath is forward-slash POSIX style");
  const written = await fs.readFile(result.diskPath, "utf8");
  assert(written.includes("@process demo/created"), "written file contains the spec processId");
  assert(written.includes("export const doThingTask = defineTask('do-thing'"), "written file exports the task factory");

  // Index rebuilt.
  const indexRaw = await fs.readFile(path.join(tmpRoot, "_index.json"), "utf8");
  const index = JSON.parse(indexRaw) as { items: Array<{ kind: string; logicalPath?: string }> };
  const found = index.items.find(
    (i) => i.kind === "workflow" && (i.logicalPath ?? "").includes("cradle/smoke-created"),
  );
  assert(!!found, "rebuilt index includes the new workflow");

  // Collision: creating the same slug again fails.
  let collisionThrew = false;
  try {
    await creator.create({ spec: minimalSpec, category: "cradle", slug: "smoke-created" });
  } catch (e) {
    collisionThrew = true;
    assert(String(e).includes("already exists"), "collision error mentions 'already exists'");
  }
  assert(collisionThrew, "creating duplicate slug throws");

  // Invalid category.
  let badCatThrew = false;
  try {
    await creator.create({ spec: minimalSpec, category: "not-a-real-category", slug: "x" });
  } catch (e) {
    badCatThrew = true;
    assert(String(e).includes("Invalid category"), "bad category error message");
  }
  assert(badCatThrew, "invalid category throws");

  // Invalid slug.
  let badSlugThrew = false;
  try {
    await creator.create({ spec: minimalSpec, category: "cradle", slug: "Bad Slug!" });
  } catch (e) {
    badSlugThrew = true;
    assert(String(e).includes("Invalid slug"), "bad slug error message");
  }
  assert(badSlugThrew, "invalid slug throws");

  // Bad spec is caught BEFORE writing — make sure no partial file is left.
  const preExisting = await fs.readdir(path.join(tmpRoot, "workflows", "cradle"));
  let badSpecThrew = false;
  try {
    await creator.create({
      spec: { ...minimalSpec, processId: "" } as WorkflowSpec,
      category: "cradle",
      slug: "should-not-be-created",
    });
  } catch (e) {
    badSpecThrew = true;
    assert(String(e).includes("processId"), "bad spec error mentions processId");
  }
  assert(badSpecThrew, "invalid spec throws");
  const postExisting = await fs.readdir(path.join(tmpRoot, "workflows", "cradle"));
  assert(
    JSON.stringify(preExisting) === JSON.stringify(postExisting),
    "no directory created when spec validation fails",
  );

  await fs.rm(tmpRoot, { recursive: true, force: true });
  console.log("\nworkflow-creator smoke OK");
}

await main();
