/**
 * Worked example for the workflow-test layer.
 *
 * Drives a tiny 3-effect process through the SDK's fake runner and asserts
 * the full journal chain. This is the template for testing real library
 * workflows once we wire one up via `processPath` instead of `processSource`.
 *
 * The process exercises three task kinds in sequence:
 *   1. kind=agent       (planTask)
 *   2. kind=breakpoint  (approvalTask)   — defined explicitly via defineTask
 *                                         so its taskId is stable across runs
 *   3. kind=node        (buildTask)
 *
 * The fake resolver dispatches by `taskId` (the most stable discriminator);
 * a real harness would dispatch by `action.kind` to route to the right
 * underlying CLI/runtime.
 */
import { runWorkflowFake } from "../_helpers/run-fake.ts";
import {
  assertJournalComplete,
  assertEffectOrder,
  effectsByTaskId,
} from "../_helpers/assert-journal.ts";
import { assert, assertEqual, assertDeepEqual } from "../_helpers/assert.ts";

// ESM source; createDeterministicRunHarness writes this as .mjs.
// We use ctx.task throughout (rather than ctx.breakpoint sugar) so every
// task has an author-defined stable taskId — easier to assert on.
const PROCESS_SOURCE = `
import { defineTask } from "@a5c-ai/babysitter-sdk";

const planTask = defineTask("plan", (args, taskCtx) => ({
  kind: "agent",
  title: "Plan: " + (args.goal || "unknown"),
  agent: { name: "planner", prompt: { task: "Make a plan for: " + args.goal } },
  io: {
    inputJsonPath: "tasks/" + taskCtx.effectId + "/input.json",
    outputJsonPath: "tasks/" + taskCtx.effectId + "/result.json",
  },
}));

const approvalTask = defineTask("approval", (args) => ({
  kind: "breakpoint",
  title: "Approve plan",
  metadata: { payload: { question: "Approve this plan?", plan: args.plan } },
}));

const buildTask = defineTask("build", (args, taskCtx) => ({
  kind: "node",
  title: "Build from plan",
  node: { entry: "scripts/build.js", args: ["--steps", String(args.steps || 0)] },
  io: {
    inputJsonPath: "tasks/" + taskCtx.effectId + "/input.json",
    outputJsonPath: "tasks/" + taskCtx.effectId + "/result.json",
  },
}));

export async function process(inputs, ctx) {
  const goal = inputs.goal || "ship something";
  const plan = await ctx.task(planTask, { goal });
  const approval = await ctx.task(approvalTask, { plan });
  if (!approval.approved) {
    return { ok: false, reason: "rejected", feedback: approval.response };
  }
  const built = await ctx.task(buildTask, { steps: plan.steps });
  return { ok: true, files: built.files, plan };
}
`;

async function main(): Promise<void> {
  const { result, journal } = await runWorkflowFake({
    processSource: PROCESS_SOURCE,
    inputs: { goal: "test the fake runner" },
    resolve: (action) => {
      switch (action.taskId) {
        case "plan":
          return {
            status: "ok",
            value: { steps: 3, summary: "fake plan with 3 steps" },
          };
        case "approval":
          return {
            status: "ok",
            value: {
              approved: true,
              option: "Approve",
              response: "looks good",
            },
          };
        case "build":
          return {
            status: "ok",
            value: { files: ["a.js", "b.js"] },
          };
        default:
          // Returning undefined leaves the action pending → the harness
          // returns status="waiting" instead of "completed", which surfaces
          // any taskId the test forgot to handle.
          return undefined;
      }
    },
  });

  // Run-level assertions
  assertEqual(result.status, "completed", "fake runner reaches `completed`");
  assert(result.iterations >= 4, "took at least 4 iterations (one per effect + final)");
  assertEqual(result.executed.length, 3, "exactly 3 effects executed");

  // Final output shape
  const output = result.output as { ok: boolean; files: string[]; plan: { steps: number } };
  assertEqual(output.ok, true, "final output ok=true");
  assertDeepEqual(output.files, ["a.js", "b.js"], "final output carries built files");
  assertEqual(output.plan.steps, 3, "final output threads plan through");

  // Journal-shape assertions (the babysitter-style backbone)
  assertJournalComplete(journal, 3);
  assertEffectOrder(journal, ["plan", "approval", "build"]);

  // Specific-effect introspection — kind on the breakpoint phase
  const byTask = effectsByTaskId(journal);
  const approvalEffect = byTask.get("approval");
  assert(approvalEffect, "approval effect was requested");
  assertEqual(approvalEffect!.kind, "breakpoint", "approval effect kind=breakpoint");

  console.log("[smoke] example-workflow OK");
}

main().catch((err) => {
  console.error("  FAIL: example-workflow threw", err);
  process.exit(1);
});
