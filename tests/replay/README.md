# tests/replay/

Captured-journal regression tests. Each fixture is a journal directory from
a real MC run; each smoke replays it against the current workflow code and
asserts that completion is identical.

## Why this layer matters

Babysitter's whole runtime contract is "the journal is the source of truth."
Re-running a workflow with a complete journal should short-circuit at every
intrinsic and reach the same final output, deterministically. If a code change
breaks that property, the change is non-deterministic with respect to the
prior run — and that's a class of bug no other test layer catches.

## V1 status

The `_helpers/replay.ts` exposes:

- `loadCapturedJournal(fixtureDir)` — reads all events from a fixture's
  `journal/` directory.
- `extractFinalOutput(events)` — convenience for the last `RUN_COMPLETED`'s
  payload.

The full `replayAgainstFreshRun` helper is V2 — it'll copy the fixture
journal into a new run dir, run `runToCompletionWithFakeRunner`, and assert
that `result.executed.length === 0` (no new effects requested) plus the
final output matches the captured one.

## How to capture a journal (until V2 lands)

1. Run a workflow normally in MC. Wait for it to complete successfully.
2. Find the run directory:
   - **Curated library workflows**: `<project.path>/.a5c/runs/<runId>/`
   - **Auto-gen runs**: `<userData>/tasks/<taskId>/workspace/.a5c/runs/<runId>/`
   - On Windows, `<userData>` is typically
     `%APPDATA%/mc-v2-electron/` — the main process logs the path on boot.
3. Copy the `journal/` subdirectory into a new fixture folder:
   ```
   tests/replay/fixtures/<descriptive-name>/journal/
   ```
4. Add a smoke at `tests/replay/<descriptive-name>.smoke.ts` that calls
   `loadCapturedJournal` and asserts:
   - The event chain is well-formed (`assertJournalComplete`).
   - The final output matches what you observed in MC.
   - The expected sequence of taskIds is recorded (`assertEffectOrder`).

## What to commit vs. gitignore

Journal events are small JSON; they diff cleanly. **Commit them.** That's
the whole point — they become the regression baseline.

What you should NOT commit (consider per-fixture `.gitignore`):

- `tasks/<effectId>/result.json` files larger than ~10 KB
- `blobs/` directory contents (binary blobs)
- `state/state.json` (derived; rebuildable from the journal)
- Anything containing API keys or user data

## Naming convention

Use a name that describes the *test scenario*, not the original runId:

- `bugfix-happy-path.smoke.ts` ✓
- `01H5K4...ulid.smoke.ts` ✗

The captured runId is recorded inside the journal events themselves; the
fixture folder name is for readers.
