/**
 * Standalone smoke test for workflow-generator.
 *
 *   node --experimental-strip-types src/main/workflow-generator.smoke.ts
 *
 * Verifies the generator emits source that:
 *   - parses as valid JS (via dynamic import of a temp file)
 *   - exports `process` and the expected task factories
 *   - matches the patterns observed in library/workflows/** (banners,
 *     defineTask shape, breakpoint/retry/parallel structure)
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { generateWorkflow, type WorkflowSpec } from "./workflow-generator.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok -", msg);
}

const sampleSpec: WorkflowSpec = {
  processId: "demo/sample",
  description: "A sample bugfix-style workflow used by the generator smoke test",
  inputs: [
    { name: "bugDescription", jsDocType: "string", defaultLiteral: "''" },
    { name: "component", jsDocType: "string", defaultLiteral: "''" },
  ],
  outputs: [
    { name: "prUrl", jsDocType: "string", expression: "prResult.prUrl" },
    { name: "summary", jsDocType: "string", expression: "prResult.summary" },
  ],
  phases: [
    {
      kind: "sequential",
      title: "Gather details",
      logMessage: "Phase 1: gathering",
      resultVar: "details",
      taskRef: "gatherDetailsTask",
      args: { bugDescription: "bugDescription", component: "component" },
    },
    {
      kind: "parallel",
      title: "Run tests and lint",
      logMessage: "Phase 2: parallel checks",
      resultVars: ["testResult", "lintResult"],
      branches: [
        { taskRef: "runTestsTask", args: { component: "details.component" } },
        { taskRef: "runLintTask", args: { component: "details.component" } },
      ],
    },
    {
      kind: "retry",
      title: "Review before submit",
      maxAttempts: 3,
      resultVar: "applyResult",
      taskRef: "applyFixTask",
      args: { details: "details" },
      question: "Review the change.\nApprove to continue, or request changes.",
      bpTitle: "Review",
      options: ["Approve", "Request changes"],
      expert: "owner",
      tags: ["approval-gate"],
    },
    {
      kind: "conditional",
      title: "Maybe star repo",
      condition: "details.shouldStar === true",
      resultVar: "starResult",
      taskRef: "starRepoTask",
      args: {},
    },
    {
      kind: "breakpoint",
      title: "Confirm submit",
      question: "Submit the PR?",
      options: ["Approve", "Request changes"],
      expert: "owner",
      tags: ["approval-gate", "submit"],
    },
    {
      kind: "sequential",
      title: "Submit PR",
      resultVar: "prResult",
      taskRef: "submitPrTask",
      args: { details: "details" },
    },
  ],
  tasks: [
    {
      kind: "agent",
      factoryName: "gatherDetailsTask",
      taskKey: "gather-details",
      title: "Gather details",
      agentName: "general-purpose",
      role: "Bug triage analyst",
      taskDescription: "Extract structured details from the bug description",
      contextKeys: ["bugDescription", "component"],
      instructions: [
        "Read the bug description",
        "Infer the affected component",
      ],
      outputFormat: "JSON with summary, component, shouldStar (boolean)",
      outputSchema: {
        type: "object",
        required: ["summary", "component"],
        properties: {
          summary: { type: "string" },
          component: { type: "string" },
          shouldStar: { type: "boolean" },
        },
      },
      labels: ["agent", "gather"],
    },
    {
      kind: "shell",
      factoryName: "runTestsTask",
      taskKey: "run-tests",
      title: "Run tests",
      command: "npm test",
      labels: ["shell", "tests"],
    },
    {
      kind: "shell",
      factoryName: "runLintTask",
      taskKey: "run-lint",
      title: "Run lint",
      command: "npm run lint",
    },
    {
      kind: "agent",
      factoryName: "applyFixTask",
      taskKey: "apply-fix",
      title: "Apply fix",
      agentName: "general-purpose",
      role: "Software engineer applying a bugfix",
      taskDescription: "Apply the fix described in details",
      contextKeys: ["details"],
      instructions: ["Apply the fix", "Commit changes"],
      outputFormat: "JSON with success, filesChanged",
      outputSchema: {
        type: "object",
        required: ["success"],
        properties: {
          success: { type: "boolean" },
          filesChanged: { type: "array", items: { type: "string" } },
        },
      },
      labels: ["agent", "apply"],
    },
    {
      kind: "agent",
      factoryName: "starRepoTask",
      taskKey: "star-repo",
      title: "Star the repo",
      agentName: "general-purpose",
      role: "GitHub operations agent",
      taskDescription: "Star the repository",
      contextKeys: [],
      instructions: ["gh api -X PUT user/starred/owner/repo"],
      outputFormat: "JSON with success",
      outputSchema: {
        type: "object",
        required: ["success"],
        properties: { success: { type: "boolean" } },
      },
      labels: ["agent", "star"],
    },
    {
      kind: "agent",
      factoryName: "submitPrTask",
      taskKey: "submit-pr",
      title: "Submit PR",
      agentName: "general-purpose",
      role: "GitHub operations agent creating a pull request",
      taskDescription: "Open a PR upstream",
      contextKeys: ["details"],
      instructions: ["Use gh pr create"],
      outputFormat: "JSON with success, prUrl, summary",
      outputSchema: {
        type: "object",
        required: ["success"],
        properties: {
          success: { type: "boolean" },
          prUrl: { type: "string" },
          summary: { type: "string" },
        },
      },
      labels: ["agent", "pr"],
    },
  ],
};

async function main(): Promise<void> {
  const source = generateWorkflow(sampleSpec);

  // Pattern checks against observed library/workflows conventions.
  assert(source.startsWith("/**\n * @process demo/sample"), "header begins with @process");
  assert(source.includes("@inputs { bugDescription?: string, component?: string }"), "inputs JSDoc rendered");
  assert(source.includes("@outputs { prUrl: string, summary: string }"), "outputs JSDoc rendered");
  assert(source.includes("import { defineTask } from '@a5c-ai/babysitter-sdk'"), "SDK import present");
  assert(source.includes("export async function process(inputs, ctx)"), "process signature present");
  assert(source.match(/PHASE 1: GATHER DETAILS/), "phase 1 banner");
  assert(source.match(/PHASE 2: RUN TESTS AND LINT/), "phase 2 banner");
  assert(source.includes("await ctx.parallel.all"), "parallel block emitted");
  assert(source.includes("for (let attempt = 0; attempt < 3; attempt++)"), "retry loop emitted");
  assert(source.includes("if (details.shouldStar === true)"), "conditional emitted");
  assert(source.includes("approval.approved"), "retry approval check emitted");
  assert(source.includes("processId: 'demo/sample'"), "metadata processId emitted");
  assert(source.includes("timestamp: ctx.now()"), "metadata timestamp emitted");
  assert(source.includes("export const gatherDetailsTask = defineTask('gather-details'"), "agent factory emitted");
  assert(source.includes("export const runTestsTask = defineTask('run-tests'"), "shell factory emitted");
  assert(source.match(/inputJsonPath: `tasks\/\$\{taskCtx\.effectId\}\/input\.json`/), "io paths emitted");

  // Round-trip: write to a temp file and import — proves it parses as valid JS.
  // We stub the SDK import via an import map shim file so this works without
  // node_modules resolution from the temp dir.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wfgen-"));
  const sdkShim = path.join(tmpDir, "sdk-shim.js");
  await fs.writeFile(
    sdkShim,
    "export function defineTask(name, factory) { return Object.assign(factory, { __taskKey: name }); }\n",
    "utf8",
  );
  const wfFile = path.join(tmpDir, "workflow.js");
  // Rewrite the SDK import to point at the shim — keeps the test hermetic.
  const sourceForImport = source.replace(
    "from '@a5c-ai/babysitter-sdk'",
    `from ${JSON.stringify(pathToFileURL(sdkShim).href)}`,
  );
  await fs.writeFile(wfFile, sourceForImport, "utf8");

  const mod = await import(pathToFileURL(wfFile).href);
  assert(typeof mod.process === "function", "generated module exports process()");
  assert(typeof mod.gatherDetailsTask === "function", "exports gatherDetailsTask factory");
  assert(typeof mod.runTestsTask === "function", "exports runTestsTask factory");
  assert(typeof mod.applyFixTask === "function", "exports applyFixTask factory");

  // Cleanup.
  await fs.rm(tmpDir, { recursive: true, force: true });

  // Negative path: validateSpec catches dangling task refs.
  let threw = false;
  try {
    generateWorkflow({
      ...sampleSpec,
      phases: [
        {
          kind: "sequential",
          title: "Bad",
          resultVar: "x",
          taskRef: "doesNotExistTask",
          args: {},
        },
      ],
    });
  } catch (e) {
    threw = true;
    assert(String(e).includes("doesNotExistTask"), "validation error names the bad ref");
  }
  assert(threw, "generator throws on unknown task ref");

  console.log("\n--- generated workflow.js ---\n");
  console.log(source);
  console.log("\n--- end ---");
  console.log("\nworkflow-generator smoke OK");
}

await main();
