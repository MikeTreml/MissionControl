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
import { readIndexFiles } from "./library-walker.ts";
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
  // Minimal library skeleton — just the category folder. The rebuild
  // step writes the four per-kind index files from scratch.
  await fs.mkdir(path.join(tmpRoot, "methodologies", "atdd-tdd"), { recursive: true });

  const creator = new WorkflowCreator(tmpRoot);

  // Happy path.
  const result = await creator.create({
    spec: minimalSpec,
    category: "methodologies/atdd-tdd",
    slug: "smoke-created",
  });
  assert(result.diskPath.endsWith(path.join("methodologies", "atdd-tdd", "workflows", "smoke-created.js")), "result.diskPath ends with target");
  assert(result.relPath === "methodologies/atdd-tdd/workflows/smoke-created.js", "result.relPath is forward-slash POSIX style");
  const written = await fs.readFile(result.diskPath, "utf8");
  assert(written.includes("@process demo/created"), "written file contains the spec processId");
  assert(written.includes("export const doThingTask = defineTask('do-thing'"), "written file exports the task factory");

  // Index rebuilt — read the per-kind files and look for the workflow.
  const index = await readIndexFiles(tmpRoot);
  const found = index.items.find(
    (i) => i.kind === "workflow" && (i.logicalPath ?? "").includes("methodologies/atdd-tdd/workflows/smoke-created"),
  );
  assert(!!found, "rebuilt index includes the new workflow");

  // Collision: creating the same slug again fails.
  let collisionThrew = false;
  try {
    await creator.create({ spec: minimalSpec, category: "methodologies/atdd-tdd", slug: "smoke-created" });
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
  const preExisting = await fs.readdir(path.join(tmpRoot, "methodologies", "atdd-tdd", "workflows"));
  let badSpecThrew = false;
  try {
    await creator.create({
      spec: { ...minimalSpec, processId: "" } as WorkflowSpec,
      category: "methodologies/atdd-tdd",
      slug: "should-not-be-created",
    });
  } catch (e) {
    badSpecThrew = true;
    assert(String(e).includes("processId"), "bad spec error mentions processId");
  }
  assert(badSpecThrew, "invalid spec throws");
  const postExisting = await fs.readdir(path.join(tmpRoot, "methodologies", "atdd-tdd", "workflows"));
  assert(
    JSON.stringify(preExisting) === JSON.stringify(postExisting),
    "no directory created when spec validation fails",
  );

  await fs.rm(tmpRoot, { recursive: true, force: true });
  console.log("\nworkflow-creator smoke OK");
}

await main();
