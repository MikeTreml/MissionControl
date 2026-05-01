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

  // Retry breakpoint shape — match bugfix/workflow.js conventions.
  assert(source.includes("previousFeedback: applyResultLastFeedback || undefined"), "retry emits previousFeedback");
  assert(source.includes("attempt: attempt > 0 ? attempt + 1 : undefined"), "retry emits conditional attempt");

  // Round-trip: write to a temp file and import — proves it parses as valid JS.
  // Using .mjs guarantees ESM treatment regardless of any inherited package.json.
  // The SDK import is rewritten to point at a local shim so resolution works
  // without node_modules in the tmpdir.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wfgen-"));
  const sdkShim = path.join(tmpDir, "sdk-shim.mjs");
  await fs.writeFile(
    sdkShim,
    "export function defineTask(name, factory) { return Object.assign(factory, { __taskKey: name }); }\n",
    "utf8",
  );
  const wfFile = path.join(tmpDir, "workflow.mjs");
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

  // Custom successExpression: should be propagated verbatim.
  const sourceWithSuccessExpr = generateWorkflow({ ...sampleSpec, successExpression: "prResult.success" });
  assert(sourceWithSuccessExpr.includes("success: prResult.success,"), "successExpression propagated to return");
  assert(!sourceWithSuccessExpr.includes("success: true,"), "default 'true' not emitted when successExpression set");

  // jsString robustness: a question containing CR + U+2028 + U+2029 must produce
  // a parseable file. Round-trip through the same import mechanism.
  const trickyQuestion = "line1\r\nline2 line3 line4";
  const trickySource = generateWorkflow({
    ...sampleSpec,
    phases: [
      {
        kind: "breakpoint",
        title: "Tricky",
        question: trickyQuestion,
      },
    ],
  });
  const trickyDir = await fs.mkdtemp(path.join(os.tmpdir(), "wfgen-tricky-"));
  const trickyShim = path.join(trickyDir, "sdk-shim.mjs");
  await fs.writeFile(
    trickyShim,
    "export function defineTask(name, factory) { return Object.assign(factory, { __taskKey: name }); }\n",
    "utf8",
  );
  const trickyFile = path.join(trickyDir, "workflow.mjs");
  await fs.writeFile(
    trickyFile,
    trickySource.replace(
      "from '@a5c-ai/babysitter-sdk'",
      `from ${JSON.stringify(pathToFileURL(trickyShim).href)}`,
    ),
    "utf8",
  );
  const trickyMod = await import(pathToFileURL(trickyFile).href);
  assert(typeof trickyMod.process === "function", "tricky-string source still parses + imports");
  await fs.rm(trickyDir, { recursive: true, force: true });

  // ── Negative-path validation cases ──────────────────────────────────────────

  function expectThrow(label: string, fn: () => unknown, needle: string): void {
    let threw = false;
    let message = "";
    try {
      fn();
    } catch (e) {
      threw = true;
      message = String(e);
    }
    assert(threw, `${label}: should throw`);
    assert(message.includes(needle), `${label}: error mentions "${needle}" (got: ${message})`);
  }

  // Dangling task ref.
  expectThrow(
    "unknown task ref",
    () =>
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
      }),
    "doesNotExistTask",
  );

  // Duplicate factoryName.
  expectThrow(
    "duplicate factoryName",
    () =>
      generateWorkflow({
        ...sampleSpec,
        tasks: [...sampleSpec.tasks, { ...sampleSpec.tasks[0]! }],
      }),
    "Duplicate task factoryName",
  );

  // Parallel mismatch.
  expectThrow(
    "parallel mismatch",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "parallel",
            title: "Mismatched",
            resultVars: ["a"],
            branches: [
              { taskRef: "runTestsTask", args: {} },
              { taskRef: "runLintTask", args: {} },
            ],
          },
        ],
      }),
    "exactly one resultVar per branch",
  );

  // Retry maxAttempts < 1.
  expectThrow(
    "retry zero attempts",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "retry",
            title: "Zero",
            maxAttempts: 0,
            resultVar: "x",
            taskRef: "applyFixTask",
            args: { details: "details" },
            question: "?",
            bpTitle: "?",
          },
        ],
      }),
    "positive integer",
  );

  // Invalid identifier in phase args.
  expectThrow(
    "non-identifier arg key",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "sequential",
            title: "BadKey",
            resultVar: "x",
            taskRef: "applyFixTask",
            args: { "bug-description": "bugDescription" },
          },
        ],
      }),
    "not a valid JS identifier",
  );

  // Invalid identifier in output schema.
  expectThrow(
    "non-identifier schema key",
    () =>
      generateWorkflow({
        ...sampleSpec,
        tasks: [
          {
            kind: "agent",
            factoryName: "badSchemaTask",
            taskKey: "bad-schema",
            title: "Bad",
            agentName: "general-purpose",
            role: "x",
            taskDescription: "y",
            contextKeys: [],
            instructions: ["a"],
            outputFormat: "JSON",
            outputSchema: {
              type: "object",
              properties: { "not-an-id": { type: "string" } },
            },
            labels: [],
          },
          ...sampleSpec.tasks,
        ],
      }),
    "not a valid JS identifier",
  );

  // ── New-construct positive coverage ────────────────────────────────────────

  // extraImports + shared task ref + mutable + retry runTaskOn:'retry-only'
  // + initialValue + conditional-block + confirm-loop, all in one spec.
  const extendedSpec: WorkflowSpec = {
    processId: "demo/extended",
    description: "Spec exercising the post-validation extensions",
    inputs: [{ name: "input1", jsDocType: "string", defaultLiteral: "''" }],
    outputs: [{ name: "result", jsDocType: "string", expression: "submitResult.summary" }],
    successExpression: "submitResult.success",
    extraImports: [
      {
        source: "../../../methodologies/shared/workflows/root-cause-diagnosis.js",
        named: ["sharedDiagnosisTask"],
      },
    ],
    phases: [
      // Mutable result var — gets reassigned later inside the conditional-block.
      {
        kind: "sequential",
        title: "Gather",
        mutable: true,
        resultVar: "details",
        taskRef: "sharedDiagnosisTask",
        args: { input1: "input1" },
      },
      // Conditional wrapping a retry that only runs the task on retry.
      {
        kind: "conditional-block",
        title: "Maybe refine",
        condition: "details.duplicate === true",
        body: {
          kind: "retry",
          title: "Refine via feedback",
          maxAttempts: 3,
          runTaskOn: "retry-only",
          initialValue: "details",
          resultVar: "details",
          taskRef: "sharedDiagnosisTask",
          args: { input1: "input1" },
          question: "Refine?",
          bpTitle: "Refine",
          options: ["Approve", "Request changes"],
        },
      },
      // Pure confirmation loop with no task body.
      {
        kind: "confirm-loop",
        title: "Confirm submit",
        maxAttempts: 3,
        feedbackVar: "submitFeedback",
        question: "Submit?",
        bpTitle: "Submit",
        options: ["Approve", "Request changes"],
      },
      {
        kind: "sequential",
        title: "Submit",
        resultVar: "submitResult",
        taskRef: "submitTask",
        args: { details: "details" },
      },
    ],
    tasks: [
      {
        kind: "agent",
        factoryName: "submitTask",
        taskKey: "submit",
        title: "Submit",
        agentName: "general-purpose",
        role: "Submitter",
        taskDescription: "Submit",
        contextKeys: ["details"],
        instructions: ["Submit"],
        outputFormat: "JSON with success, summary",
        outputSchema: {
          type: "object",
          required: ["success"],
          properties: { success: { type: "boolean" }, summary: { type: "string" } },
        },
        labels: ["agent", "submit"],
      },
    ],
  };

  const extendedSource = generateWorkflow(extendedSpec);
  assert(
    extendedSource.includes(
      "import { sharedDiagnosisTask } from '../../../methodologies/shared/workflows/root-cause-diagnosis.js'",
    ),
    "extraImports renders the shared import",
  );
  assert(extendedSource.includes("let details = await ctx.task(sharedDiagnosisTask"), "mutable sequential emits let");
  assert(extendedSource.includes("if (details.duplicate === true) {"), "conditional-block emits if");
  assert(extendedSource.includes("let details = details;"), "retry-only initialValue propagated");
  assert(
    extendedSource.match(/if \(detailsLastFeedback\) \{\s+details = await ctx\.task/),
    "retry-only renders task call inside if(feedback) guard",
  );
  assert(extendedSource.includes("let submitFeedback = null;"), "confirm-loop emits feedback var");
  assert(
    extendedSource.match(/let submitFeedback = null;\s+for \(let attempt/),
    "confirm-loop loop directly follows feedback var (no task in between)",
  );
  // confirm-loop must NOT have an `await ctx.task` in its body.
  const confirmLoopBlock = extendedSource.slice(
    extendedSource.indexOf("let submitFeedback"),
    extendedSource.indexOf("submitFeedback = approval.response"),
  );
  assert(!confirmLoopBlock.includes("ctx.task("), "confirm-loop has no task body");

  // confirm-loop also round-trips through the SDK shim import path.
  const ext2Dir = await fs.mkdtemp(path.join(os.tmpdir(), "wfgen-ext-"));
  const ext2Shim = path.join(ext2Dir, "sdk-shim.mjs");
  await fs.writeFile(
    ext2Shim,
    "export function defineTask(name, factory) { return Object.assign(factory, { __taskKey: name }); }\n",
    "utf8",
  );
  const ext2File = path.join(ext2Dir, "workflow.mjs");
  // Also stub the extraImport source so import resolution works.
  const sharedShim = path.join(ext2Dir, "shared-shim.mjs");
  await fs.writeFile(sharedShim, "export function sharedDiagnosisTask() {}\n", "utf8");
  const rewritten = extendedSource
    .replace(
      "from '@a5c-ai/babysitter-sdk'",
      `from ${JSON.stringify(pathToFileURL(ext2Shim).href)}`,
    )
    .replace(
      "from '../../../methodologies/shared/workflows/root-cause-diagnosis.js'",
      `from ${JSON.stringify(pathToFileURL(sharedShim).href)}`,
    );
  await fs.writeFile(ext2File, rewritten, "utf8");
  const extMod = await import(pathToFileURL(ext2File).href);
  assert(typeof extMod.process === "function", "extended spec round-trips and imports");
  await fs.rm(ext2Dir, { recursive: true, force: true });

  // Negative: retry-only without initialValue.
  expectThrow(
    "retry-only requires initialValue",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "retry",
            title: "RetryOnlyNoInit",
            maxAttempts: 3,
            runTaskOn: "retry-only",
            resultVar: "x",
            taskRef: "applyFixTask",
            args: { details: "details" },
            question: "?",
            bpTitle: "?",
          },
        ],
      }),
    "must set initialValue",
  );

  // Negative: extraImports name collides with a task factoryName.
  expectThrow(
    "extraImports collision",
    () =>
      generateWorkflow({
        ...sampleSpec,
        extraImports: [{ source: "./somewhere.js", named: ["gatherDetailsTask"] }],
      }),
    "collides with a task factoryName",
  );

  // Negative: extraImports name not a valid identifier.
  expectThrow(
    "extraImports bad identifier",
    () =>
      generateWorkflow({
        ...sampleSpec,
        extraImports: [{ source: "./somewhere.js", named: ["bad-name"] }],
      }),
    "not a valid JS identifier",
  );

  // Negative: confirm-loop bad feedbackVar.
  expectThrow(
    "confirm-loop bad feedbackVar",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "confirm-loop",
            title: "Bad",
            maxAttempts: 3,
            feedbackVar: "bad-name",
            question: "?",
            bpTitle: "?",
          },
        ],
      }),
    "feedbackVar",
  );

  // Negative: conditional-block validates the body recursively.
  expectThrow(
    "conditional-block body validates",
    () =>
      generateWorkflow({
        ...sampleSpec,
        phases: [
          {
            kind: "conditional-block",
            title: "Bad nested",
            condition: "true",
            body: {
              kind: "sequential",
              title: "Bad inner",
              resultVar: "x",
              taskRef: "doesNotExistTask",
              args: {},
            },
          },
        ],
      }),
    "doesNotExistTask",
  );

  console.log("\n--- generated workflow.js ---\n");
  console.log(source);
  console.log("\n--- end ---");
  console.log("\nworkflow-generator smoke OK");
}

await main();
