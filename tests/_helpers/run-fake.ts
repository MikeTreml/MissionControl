/**
 * Thin wrapper over @a5c-ai/babysitter-sdk/testing — runs a process source string
 * to completion against a fake action resolver in a deterministic temp run dir.
 *
 * Why a wrapper rather than calling the SDK directly:
 *  - Defaults the clock + ulid handles so journal output is byte-stable across
 *    runs (so we can later capture a journal and replay it).
 *  - Cleans up the temp dir even when assertions throw.
 *  - Returns the journal alongside the result so callers can run journal-shape
 *    assertions without a second SDK import.
 *
 * Pairs with assert-journal.ts for the babysitter pattern of asserting the
 * RUN_CREATED → n×EFFECT_REQUESTED → n×EFFECT_RESOLVED → RUN_COMPLETED chain.
 */
import {
  createDeterministicRunHarness,
  runToCompletionWithFakeRunner,
  loadJournal,
  type FakeActionResolver,
  type RunToCompletionResult,
  type JournalEvent,
} from "@a5c-ai/babysitter-sdk";

export interface RunFakeOptions {
  /** ES module source for the workflow's process function. */
  processSource: string;
  /** Inputs passed to process(inputs, ctx). Defaults to {}. */
  inputs?: unknown;
  /** Fake-action resolver (action) → resolution. Required. */
  resolve: FakeActionResolver;
  /** Stable runId for the temp run dir. Defaults to a fixed value. */
  runId?: string;
  /** Cap on iterations. Defaults to the SDK's default (100). */
  maxIterations?: number;
}

export interface RunFakeOutcome {
  result: RunToCompletionResult;
  journal: JournalEvent[];
  runDir: string;
}

/**
 * Run a workflow process source to completion against a fake resolver.
 * Always cleans up the temp run dir in `finally`.
 */
export async function runWorkflowFake(
  options: RunFakeOptions,
): Promise<RunFakeOutcome> {
  const harness = await createDeterministicRunHarness({
    processSource: options.processSource,
    inputs: options.inputs ?? {},
    runId: options.runId ?? "smoke-run-0001",
  });

  try {
    const result = await runToCompletionWithFakeRunner({
      runDir: harness.runDir,
      resolve: options.resolve,
      maxIterations: options.maxIterations,
      clock: harness.clock,
      ulids: harness.ulids,
    });
    const journal = await loadJournal(harness.runDir);
    return { result, journal, runDir: harness.runDir };
  } finally {
    await harness.cleanup();
  }
}
