/**
 * Journal-replay helper — V1 stub.
 *
 * The full replay pattern is:
 *   1. Capture: snapshot a real run's journal directory after it completes
 *      successfully. Commit it under tests/replay/fixtures/<name>/journal/.
 *   2. Replay: re-run the same workflow code against that journal in a fresh
 *      run dir; assert the same final output and that NO new effects were
 *      requested (because the journal already records every decision).
 *
 * This is the strongest regression net for an event-sourced system: a journal
 * that completed once should always re-complete identically against the same
 * code. If a code change breaks replay, the change is non-deterministic with
 * respect to the workflow's prior history.
 *
 * V1 scope: helper signatures + a working `loadCapturedJournal` reader. Full
 * replay-against-fresh-runDir lands in V2 once we have at least one captured
 * journal under tests/replay/fixtures/.
 *
 * To capture a journal today (until the V2 helper exists):
 *   - Run a workflow normally in MC.
 *   - Locate its run dir (under <project.path>/.a5c/runs/<runId>/ for curated
 *     library workflows, or <userData>/tasks/<id>/workspace/.a5c/runs/<runId>/
 *     for auto-gen runs).
 *   - Copy the `journal/` subdirectory into tests/replay/fixtures/<name>/.
 *   - Add a smoke at tests/replay/<name>.smoke.ts that calls
 *     `loadCapturedJournal(...)` and asserts on the events.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadJournal, type JournalEvent } from "@a5c-ai/babysitter-sdk";

/**
 * Read all journal events from a captured fixture directory.
 * `fixtureDir` should contain a `journal/` subdir of `*.json` files.
 */
export async function loadCapturedJournal(
  fixtureDir: string,
): Promise<JournalEvent[]> {
  const journalDir = join(fixtureDir, "journal");
  const stat = await fs.stat(journalDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(
      `loadCapturedJournal: ${journalDir} is not a directory (did you capture a journal yet?)`,
    );
  }
  return loadJournal(fixtureDir);
}

/**
 * Returns the final output recorded in a captured journal.
 * Throws if the run did not complete successfully.
 */
export function extractFinalOutput(events: JournalEvent[]): unknown {
  const last = events[events.length - 1];
  if (!last || last.type !== "RUN_COMPLETED") {
    throw new Error(
      `extractFinalOutput: journal does not end in RUN_COMPLETED (last=${last?.type ?? "<empty>"})`,
    );
  }
  // RUN_COMPLETED payload may carry an outputRef (path to a blob) or an
  // inline output, depending on SDK version. Callers should re-read from
  // tasks/<lastEffectId>/result.json for the authoritative final value.
  const payload = (last as unknown as { payload?: { output?: unknown } }).payload;
  return payload?.output;
}

// V2 TODO: replayAgainstFreshRun({ fixtureDir, processSource, resolve }) →
//   - copies fixture journal into a new run dir
//   - calls runToCompletionWithFakeRunner
//   - asserts result.executed.length === 0 (no new effects requested)
//   - asserts result.output deep-equals extractFinalOutput(captured)
