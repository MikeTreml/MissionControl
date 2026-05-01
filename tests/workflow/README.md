# tests/workflow/

Workflow-level smokes. Each file drives one `process(inputs, ctx)` workflow
through `runToCompletionWithFakeRunner` and asserts on its journal + output.

## How to add one

1. **Create `<workflow-name>.smoke.ts`** modeled on
   [`example-workflow.smoke.ts`](./example-workflow.smoke.ts).
2. **Point it at a real workflow** by passing `processPath` instead of
   `processSource` to the helper (see V2 TODO in `_helpers/run-fake.ts` —
   the SDK supports both via `createDeterministicRunHarness`).
3. **Write a fake resolver** — given an `EffectAction`, return
   `{ status: "ok", value: ... }` or `{ status: "error", error: ... }`.
   Dispatch by `action.taskId` (most stable) or `action.kind`.
4. **Assert on the journal**, not just the return value:
   ```ts
   assertJournalComplete(journal, expectedEffectCount);
   assertEffectOrder(journal, ["taskA", "taskB", "taskC"]);
   ```
5. **Wire it into `package.json`** by appending to the `test:workflow` chain.

## What the fake resolver should do

A real harness would route the effect to its underlying CLI and return the
actual result. The fake resolver returns a *plausible* result that satisfies
downstream phases:

- For `kind="agent"` tasks: return whatever shape the workflow's `outputSchema`
  declares. If the next task reads `result.steps`, your resolver returns
  `{ status: "ok", value: { steps: 3 } }`.
- For `kind="breakpoint"`: return `{ status: "ok", value: { approved: true } }`
  to test the happy path; `{ approved: false, response: "fix X" }` to test
  rejection branches.
- For `kind="node"`: return what the script would have written to its
  `outputJsonPath`.
- For unknown taskIds: return `undefined`, which causes the run to fail —
  forcing the test author to acknowledge every effect explicitly.

## What NOT to do

- **Don't run a real LLM here.** That's a separate (expensive, slow) tier.
  This layer is for deterministic correctness of the workflow's task graph.
- **Don't use real timestamps.** `runWorkflowFake` installs a fixed clock
  for you. If you compare timestamps, compare them to the harness's clock,
  not `Date.now()`.
- **Don't assert on payload contents the workflow itself doesn't shape.**
  Effect IDs and ULIDs are stable across runs only because of
  `installDeterministicUlids`; if you start asserting them you couple the
  test to the SDK's internals.
