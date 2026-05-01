/**
 * Validate the workflow-generator spec against real workflows.
 *
 *   node --experimental-strip-types scripts/wfgen-validate.ts
 *
 * Hand-codes a `WorkflowSpec` for an existing workflow under `library/workflows/**`,
 * generates the output, and reports a structural comparison vs the original.
 * The point is NOT a textual match (formatting + comment styles differ); the
 * point is to find what the spec can't express yet.
 *
 * Today: validates against `cradle/bug-report/workflow.js`.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateWorkflow, type WorkflowSpec } from "../src/main/workflow-generator.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

// ─────────────────────────────────────────────────────────────────────────────
// Spec for cradle/bug-report — written using ONLY current generator features.
// Gaps surfaced during this exercise are listed in the report at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

const bugReportSpec: WorkflowSpec = {
  processId: "cradle/bug-report",
  description:
    "Report a bug in babysitter (SDK, processes, plugins) by gathering details, " +
    "searching existing issues, and opening a GitHub issue",
  inputs: [
    { name: "bugDescription", jsDocType: "string", defaultLiteral: "''" },
    { name: "component", jsDocType: "string", defaultLiteral: "''" },
    { name: "reproSteps", jsDocType: "string", defaultLiteral: "''" },
    { name: "additionalContext", jsDocType: "string", defaultLiteral: "''" },
  ],
  outputs: [
    { name: "issueUrl", jsDocType: "string", expression: "submitResult.issueUrl" },
    { name: "issueNumber", jsDocType: "number", expression: "submitResult.issueNumber" },
    { name: "summary", jsDocType: "string", expression: "`Bug report submitted: ${submitResult.issueUrl}`" },
  ],
  successExpression: "submitResult.success",
  phases: [
    // Phase 1: Sequential — fits cleanly.
    {
      kind: "sequential",
      title: "Gather bug details",
      logMessage: "Phase 1: Gathering bug details",
      resultVar: "bugDetails",
      taskRef: "gatherBugDetailsTask",
      args: { bugDescription: "bugDescription", component: "component", additionalContext: "additionalContext" },
    },
    // Phase 2: Parallel — fits cleanly.
    {
      kind: "parallel",
      title: "Reproduction steps & environment",
      logMessage: "Phase 2: Gathering reproduction steps and environment info",
      resultVars: ["reproResult", "envInfo"],
      branches: [
        {
          taskRef: "gatherReproStepsTask",
          args: {
            bugDescription: "bugDetails.description",
            component: "bugDetails.component",
            reproSteps: "reproSteps",
          },
        },
        { taskRef: "gatherEnvironmentInfoTask", args: { component: "bugDetails.component" } },
      ],
    },
    // Phase 3a: Sequential search.
    {
      kind: "sequential",
      title: "Search existing issues",
      logMessage: "Phase 3: Searching for existing similar issues",
      resultVar: "existingIssues",
      taskRef: "searchExistingIssuesTask",
      args: {
        bugDescription: "bugDetails.description",
        component: "bugDetails.component",
        labels: "bugDetails.labels",
      },
    },
    // Phase 3b: ── GAP #1 ── conditional wrapping a retry-with-feedback loop.
    // The original wraps a retry inside `if (existingIssues.duplicateFound)`.
    // Our ConditionalPhase only supports a single task body, not a nested phase.
    // For now, downgrade to a plain conditional task — loses the duplicate-check
    // approval-gate loop entirely.
    {
      kind: "conditional",
      title: "Maybe handle duplicate",
      condition: "existingIssues.duplicateFound",
      resultVar: "duplicateAck",
      taskRef: "duplicateAckPlaceholderTask", // GAP: would be inline retry
      args: {},
    },
    // Phase 4: Sequential compose.
    {
      kind: "sequential",
      title: "Compose issue",
      logMessage: "Phase 4: Composing GitHub issue",
      resultVar: "issueComposition",
      taskRef: "composeIssueTask",
      args: {
        bugDetails: "bugDetails",
        reproResult: "reproResult",
        envInfo: "envInfo",
        existingIssues: "existingIssues",
      },
    },
    // Phase 5: ── GAP #2 ── retry-with-feedback that ONLY re-runs the task
    // on retry, not on every iteration. The first iteration just hits the
    // breakpoint because composeIssueTask already ran in Phase 4.
    // Our RetryPhase always re-runs the task, so we'd duplicate composeIssueTask.
    // The shape we'd want: { runTaskOn: 'retry-only' }.
    {
      kind: "retry",
      title: "Review before submit",
      maxAttempts: 3,
      resultVar: "issueComposition", // intentional reuse (would need mutable)
      taskRef: "composeIssueTask",
      args: {
        bugDetails: "bugDetails",
        reproResult: "reproResult",
        envInfo: "envInfo",
        existingIssues: "existingIssues",
      },
      question: "Please review the bug report before submission.\nApprove or request changes.",
      bpTitle: "Review Bug Report Before Submission",
      options: ["Approve", "Request changes"],
      expert: "owner",
      tags: ["approval-gate", "review"],
    },
    // Phase 6: ── GAP #3 ── confirmation loop with NO task body.
    // The original has a retry-shaped breakpoint loop that gates submission
    // without running any task on retry. RetryPhase requires a taskRef.
    // We'd want a `ConfirmLoopPhase` kind, or `taskRef?: null`.
    // Workaround here: emit it as a single breakpoint (loses retry behavior).
    {
      kind: "breakpoint",
      title: "Confirm submit",
      question: "Confirm: Open this issue on a5c-ai/babysitter GitHub repository?",
      options: ["Approve", "Request changes"],
      expert: "owner",
      tags: ["approval-gate", "submit"],
    },
    // Phase 7: Sequential submit.
    {
      kind: "sequential",
      title: "Submit issue",
      logMessage: "Phase 6: Submitting issue to GitHub",
      resultVar: "submitResult",
      taskRef: "submitIssueTask",
      args: {
        title: "issueComposition.title",
        body: "issueComposition.body",
        labels: "issueComposition.labels",
      },
    },
  ],
  tasks: [
    {
      kind: "agent",
      factoryName: "gatherBugDetailsTask",
      taskKey: "gather-bug-details",
      title: "Gather bug details",
      agentName: "general-purpose",
      role: "Bug report analyst gathering structured bug information",
      taskDescription:
        "Analyze the provided bug description and extract structured bug details",
      contextKeys: ["bugDescription", "component", "additionalContext"],
      instructions: ["Identify the affected component", "Determine severity"],
      outputFormat: "JSON with description, component, severity, labels",
      outputSchema: {
        type: "object",
        required: ["description", "component", "severity"],
        properties: {
          description: { type: "string" },
          component: { type: "string" },
          severity: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
        },
      },
      labels: ["agent", "bug-report", "gather"],
    },
    {
      kind: "agent",
      factoryName: "gatherReproStepsTask",
      taskKey: "gather-repro-steps",
      title: "Gather reproduction steps",
      agentName: "general-purpose",
      role: "QA engineer building clear reproduction steps",
      taskDescription: "Create numbered reproduction steps",
      contextKeys: ["bugDescription", "component", "reproSteps"],
      instructions: ["Validate or generate steps", "Include prerequisites"],
      outputFormat: "JSON with steps, prerequisites, triggerCommand",
      outputSchema: {
        type: "object",
        required: ["steps"],
        properties: {
          steps: { type: "array", items: { type: "string" } },
          prerequisites: { type: "array", items: { type: "string" } },
          triggerCommand: { type: "string" },
        },
      },
      labels: ["agent", "bug-report", "repro"],
    },
    {
      kind: "agent",
      factoryName: "gatherEnvironmentInfoTask",
      taskKey: "gather-environment-info",
      title: "Gather environment information",
      agentName: "general-purpose",
      role: "Systems engineer collecting environment information",
      taskDescription: "Collect SDK / Node / OS / harness versions",
      contextKeys: ["component"],
      instructions: ["Run babysitter --version", "Run node --version", "Detect OS"],
      outputFormat: "JSON with sdkVersion, nodeVersion, os, harness",
      outputSchema: {
        type: "object",
        required: ["sdkVersion", "nodeVersion", "os", "harness"],
        properties: {
          sdkVersion: { type: "string" },
          nodeVersion: { type: "string" },
          os: { type: "string" },
          harness: { type: "string" },
        },
      },
      labels: ["agent", "bug-report", "environment"],
    },
    {
      kind: "agent",
      factoryName: "searchExistingIssuesTask",
      taskKey: "search-existing-issues",
      title: "Search existing GitHub issues",
      agentName: "general-purpose",
      role: "GitHub issue researcher",
      taskDescription: "Search a5c-ai/babysitter for existing matching issues",
      contextKeys: ["bugDescription", "component", "labels"],
      instructions: ["Use gh issue list", "Search both open and closed"],
      outputFormat: "JSON with duplicateFound, matches",
      outputSchema: {
        type: "object",
        required: ["duplicateFound", "matches"],
        properties: {
          duplicateFound: { type: "boolean" },
          matches: { type: "array", items: { type: "object", properties: {} } },
        },
      },
      labels: ["agent", "bug-report", "search"],
    },
    {
      kind: "agent",
      factoryName: "duplicateAckPlaceholderTask",
      taskKey: "duplicate-ack-placeholder",
      title: "Acknowledge duplicate",
      agentName: "general-purpose",
      role: "Operator confirming duplicate resolution",
      taskDescription: "Placeholder to satisfy the conditional gap",
      contextKeys: [],
      instructions: ["GAP placeholder"],
      outputFormat: "JSON",
      outputSchema: { type: "object", properties: {} },
      labels: ["agent", "bug-report", "gap-placeholder"],
    },
    {
      kind: "agent",
      factoryName: "composeIssueTask",
      taskKey: "compose-issue",
      title: "Compose GitHub issue",
      agentName: "general-purpose",
      role: "Technical writer composing a GitHub issue",
      taskDescription: "Compose title, body, and labels",
      contextKeys: ["bugDetails", "reproResult", "envInfo", "existingIssues"],
      instructions: ["Title format [Component] ...", "Body uses standard template"],
      outputFormat: "JSON with title, body, bodyPreview, labels",
      outputSchema: {
        type: "object",
        required: ["title", "body", "labels"],
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          bodyPreview: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
        },
      },
      labels: ["agent", "bug-report", "compose"],
    },
    {
      kind: "agent",
      factoryName: "submitIssueTask",
      taskKey: "submit-issue",
      title: "Submit bug report to GitHub",
      agentName: "general-purpose",
      role: "GitHub operations agent",
      taskDescription: "Submit the composed issue via gh CLI",
      contextKeys: ["title", "body", "labels"],
      instructions: ["Use gh issue create", "Capture URL and number"],
      outputFormat: "JSON with success, issueUrl, issueNumber",
      outputSchema: {
        type: "object",
        required: ["success"],
        properties: {
          success: { type: "boolean" },
          issueUrl: { type: "string" },
          issueNumber: { type: "number" },
        },
      },
      labels: ["agent", "bug-report", "submit", "github"],
    },
  ],
};

type Counts = {
  lines: number;
  defineTask: number;
  ctxTask: number;
  ctxBreakpoint: number;
  parallelAll: number;
  retryLoops: number;
  conditionals: number;
  sharedImports: number;
  letDeclarations: number;
};

function countShape(source: string): Counts {
  return {
    lines: source.split("\n").length,
    defineTask: (source.match(/defineTask\(/g) ?? []).length,
    ctxTask: (source.match(/await ctx\.task\(/g) ?? []).length,
    ctxBreakpoint: (source.match(/await ctx\.breakpoint\(/g) ?? []).length,
    parallelAll: (source.match(/ctx\.parallel\.all\(/g) ?? []).length,
    retryLoops: (source.match(/for \(let \w+ = 0; \w+ < \d+; \w+\+\+\) \{/g) ?? []).length,
    conditionals: (source.match(/^\s*if \(/gm) ?? []).length,
    sharedImports: (source.match(/^import .* from ['"]\.\.\//gm) ?? []).length,
    letDeclarations: (source.match(/^\s*let \w+ = await /gm) ?? []).length,
  };
}

function tableRow(label: string, generated: number, original: number): string {
  const delta = generated - original;
  const sign = delta === 0 ? " " : delta > 0 ? "+" : "";
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
  return `  ${pad(label, 22)} generated=${pad(String(generated), 4)} original=${pad(String(original), 4)} (${sign}${delta})`;
}

async function main(): Promise<void> {
  const original = await fs.readFile(
    path.join(REPO_ROOT, "library/workflows/cradle/bug-report/workflow.js"),
    "utf8",
  );
  const generated = generateWorkflow(bugReportSpec);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wfgen-validate-"));
  const outFile = path.join(tmpDir, "bug-report.generated.workflow.js");
  await fs.writeFile(outFile, generated, "utf8");

  const a = countShape(generated);
  const b = countShape(original);

  console.log("=".repeat(72));
  console.log("STRUCTURAL COMPARISON: cradle/bug-report");
  console.log("=".repeat(72));
  console.log(`  generated → ${outFile}`);
  console.log(`  original  → library/workflows/cradle/bug-report/workflow.js`);
  console.log("");
  console.log(tableRow("lines", a.lines, b.lines));
  console.log(tableRow("defineTask() calls", a.defineTask, b.defineTask));
  console.log(tableRow("ctx.task() calls", a.ctxTask, b.ctxTask));
  console.log(tableRow("ctx.breakpoint() calls", a.ctxBreakpoint, b.ctxBreakpoint));
  console.log(tableRow("ctx.parallel.all()", a.parallelAll, b.parallelAll));
  console.log(tableRow("retry-style loops", a.retryLoops, b.retryLoops));
  console.log(tableRow("if conditionals", a.conditionals, b.conditionals));
  console.log(tableRow("shared imports", a.sharedImports, b.sharedImports));
  console.log(tableRow("let X = await ...", a.letDeclarations, b.letDeclarations));
  console.log("");
  console.log("=".repeat(72));
  console.log("GAPS SURFACED");
  console.log("=".repeat(72));
  const gaps = [
    "GAP #1  Conditional that wraps a nested phase (e.g. retry-with-feedback)",
    "        — current ConditionalPhase only wraps a single task body.",
    "GAP #2  Retry-with-feedback that re-runs the task ONLY on retry",
    "        — current RetryPhase always re-runs every iteration.",
    "        Pattern shape: `if (lastFeedback) { result = await task(...) }`",
    "GAP #3  Confirmation loop with NO task body — just a breakpoint loop",
    "        gating the next sequential step. RetryPhase requires a taskRef.",
    "GAP #4  Shared-helper imports (e.g. cradle/bugfix imports rootCauseDiagnosisTask",
    "        from methodologies/shared/workflows/root-cause-diagnosis.js).",
    "        Spec has no `imports` field; the SDK import is hardcoded.",
    "GAP #5  Mutable result vars — Phase 1 in bug-report uses `let` because",
    "        Phase 3 reassigns inside a retry. SequentialPhase always emits `const`.",
    "GAP #6  Multi-line phase descriptions in JSDoc header. Spec only carries",
    "        Phase.title; the original lists each phase as 'Title - description'.",
    "GAP #7  Header note block (separator text between @description and the",
    "        phase list, e.g. 'Bug Report Contribution Process').",
    "GAP #8  Breakpoint `question` rendered from a code expression rather than a",
    "        string literal — bugfix uses `diagnosisBreakpointQuestion(diagnosis)`.",
  ];
  for (const g of gaps) console.log(g);
  console.log("");
  console.log("=".repeat(72));
  console.log("VERDICT");
  console.log("=".repeat(72));
  console.log("  Structural primitives covered:    sequential, parallel, breakpoint,");
  console.log("                                    retry, conditional (single-task)");
  console.log("");
  console.log("  Smallest set of additions to cover bug-report + bugfix faithfully:");
  console.log("  1. ConditionalPhase: wrap-other-phase variant (covers GAP #1 and #3)");
  console.log("  2. RetryPhase.runTaskOn: 'every-iteration' | 'retry-only'  (#2)");
  console.log("  3. SequentialPhase.mutable: boolean                         (#5)");
  console.log("  4. WorkflowSpec.extraImports: ImportSpec[]                  (#4)");
  console.log("  5. Phase.description?: string + WorkflowSpec.headerNote     (#6, #7)");
  console.log("  6. Breakpoint.question: string | { call: string }           (#8)");
  console.log("");
  console.log("validation OK");
}

await main();
