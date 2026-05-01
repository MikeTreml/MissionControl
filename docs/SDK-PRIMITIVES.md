# SDK primitives — what to adopt, what we already use, what's untested

Read of `@a5c-ai/babysitter-sdk@0.0.187` source against MC's current
RunManager / JournalReader / derive-* helpers. Goal: lean on the SDK's
tested primitives instead of rolling our own state derivation.

---

## SDK runtime functions (under the CLI surface)

### `runtime/createRun.ts` — invoked by `babysitter run:create`

What it does, in order:

1. Generates a ULID for `runId` if not supplied.
2. Resolves `runDir = <runsDir>/<runId>`, normalises the entrypoint
   (`<importPath>#<exportName>`) to a run-relative POSIX path.
3. Generates a **`completionProof`** — a random 16-byte hex token
   stored in `run.json` metadata. It's the "this exact run actually
   finished, not a journal forge" marker the iteration loop returns
   when the process completes.
4. Writes the run directory layout via `createRunDir()` —
   `run.json` (immutable RunMetadata), empty `journal/`, empty
   `state/`, empty `tasks/`.
5. **Acquires a filesystem lock** at `<runDir>/lock` (`acquireRunLock`).
6. Appends a `RUN_CREATED` event to the journal.
7. Releases the lock.
8. Calls the `on-run-start` runtime hook with `{runId, processId,
   entry, inputs}` — extension point for plugins.
9. Returns `{ runId, runDir, metadata }`.

**MC equivalents missing today:**
- File-level locking — concurrent writers (e.g. our JournalReader
  while babysitter is appending) can race. The SDK's `withRunLock`
  serialises everything that mutates `<runDir>`.
- `completionProof` — we don't surface this. Should appear on Task
  Detail when the run completes; it's the unforgeable "done" signal.
- Runtime hooks (`on-run-start`, `on-run-complete`, `on-run-fail`).
  Plugins like babysitter-pi register here. Not blocking but worth
  knowing about.

---

### `runtime/orchestrateIteration.ts` — invoked by `run:iterate`

The replay-based heart of the orchestrator. ~328 lines.

The pattern: each iteration **re-runs the entire process function from
the start**, but the replay engine intercepts `ctx.task(...)` /
`ctx.breakpoint(...)` calls and either returns a cached result (if
already resolved in the journal) or throws an `EffectRequestedError`
to pause the iteration. State lives in the journal; the process is
pure rehearsal that gets re-run on every step.

Sequence:

1. Acquires the run lock.
2. Initialises a **replay engine** (`createReplayEngine`) that loads
   the journal + state cache and rebuilds the effect index.
3. Loads the process module via `pathToFileURL` + dynamic import.
4. Calls `processFn(inputs, ctx)` inside a process-context wrapper.
5. **Three terminal cases:**
   - Process returns normally → `RUN_COMPLETED` event with output ref;
     state cache rebuilt; `on-run-complete` hook fires; returns
     `{status: "completed", output}`.
   - Process throws `EffectRequestedError`/`ParallelPendingError` →
     returns `{status: "waiting", nextActions}` so the caller can
     execute the effects and post results.
   - Process throws unexpected → `RUN_FAILED` event with serialised
     error; `on-run-fail` hook; returns `{status: "failed", error}`.
6. Always emits an `iteration` metric and calls `on-iteration-end`.

**Key design implications:**
- The process function MUST be deterministic except where it calls
  `ctx.*` methods. Otherwise replay will diverge from the journal.
- "Iteration" doesn't mean "step forward by one tick"; it means
  "re-run the whole thing and see how far you get this time."
- The waiting state is the runtime saying "I hit a fresh effect and
  need someone to resolve it." It's not blocking — the process is
  paused mid-execution.

---

### `runtime/commitEffectResult.ts` — invoked by `task:post`

Validates + commits an effect result.

1. Acquires the run lock.
2. Builds an effect index from the journal.
3. Validates: effect exists; effect is in `requested` state (refuses
   double-resolve); invocation key matches if supplied; result
   payload schema is correct (status=ok needs `value`, status=error
   needs `error`, etc.).
4. Writes `tasks/<effectId>/result.json` via
   `serializeAndWriteTaskResult()` (handles stdout/stderr refs,
   schema, metadata).
5. Appends an `EFFECT_RESOLVED` event to the journal.
6. Updates the global task registry.
7. Emits a metric.

**MC's `respondBreakpoint` already shells out to this via
`babysitter task:post --status ok --value-inline ...`. Good.**

---

### CLI `run:iterate` (cli/commands/runIterate.ts) — 383 lines

Thin shell around `orchestrateIteration`. Adds:

- `detectIterationCount` — reads from `state/snapshot.json`
  (`stateVersion`) or counts `RUN_ITERATION` events. We could call
  this directly instead of inferring iteration from our own events.
- Hook calls: `on-iteration-start` (which can auto-execute pending
  effects via babysitter-pi's hooks), `on-iteration-end`.
- Returns a structured result: `{status, action, reason, count,
  nextActions, completionProof?, metadata: {runId, processId,
  hookStatus}}`.

The `harness:create-run` command (which MC spawns today) drives this
loop internally. We don't have to call it ourselves unless we want
control between iterations.

---

## What MC currently does that DUPLICATES SDK functionality

| MC code | What it does | SDK equivalent | Recommendation |
|---|---|---|---|
| `JournalReader.tick()` | Polls `<runPath>/journal/*.jsonl` for new events | `babysitter run:events --reverse --limit N` | **Keep MC version** for live streaming into events.jsonl, but add a `runs:events` IPC that calls the CLI for one-shot reads (e.g. when re-opening a task that was running while MC was closed). |
| `derivePendingBreakpoint(events)` | Walks event pairs to find unmatched breakpoint_opened | `babysitter task:list --pending` (returns ALL pending effects, not just breakpoints) | **Replace** — the CLI consults the effect index and the state cache; correctness > our pair-walk. |
| `derivePhases(events)` reading `bs:journal:*` | Reconstructs phase chips from events | `babysitter run:status` returns current phase + state | **Hybrid** — keep `derivePhases` for the timeline view (we want history), but use `run:status` for the chip-strip "current" indicator. |
| MC iteration count (none — we don't track it) | n/a | `detectIterationCount` in `runIterate` | **Adopt** — surface "Iteration N" on Task Detail. |
| MC writes `run-started` / `run-ended` to events.jsonl | Per-task lifecycle | SDK writes `RUN_CREATED` / `RUN_COMPLETED` / `RUN_FAILED` | **Keep both** — MC's per-task events are MC-state (queued, paused). SDK's run events are run-state. Different axes; both belong. |
| `RunManager.startCuratedWorkflow` spawn `harness:create-run` | Spawns the CLI, lets it drive the loop | `harness:create-run` IS the wrapper around `createRun` + iterate loop | **Already correct** — we're not duplicating; we're using. |
| `RunManager.respondBreakpoint` spawn `task:post` | Posts breakpoint responses | `task:post` → `commitEffectResult` | **Already correct.** |

---

## What MC could do better with what's there

### 1. Surface `completionProof`

The SDK generates a 16-byte hex token in `run.json` and emits it in
`run:iterate` output when the run completes. It's the unforgeable
"this exact run finished" signal.

**Today**: MC reads `bs:phase` events to tell when the run ended.
That's heuristic — the journal is an append-only stream and we trust
it. The proof gives us a defensive check.

**Action**: when `runs:status` reports completed, fetch and display
the `completionProof` next to "Run ended". Tiny UI change, real
correctness improvement.

### 2. Use `task:list --pending` instead of `derivePendingBreakpoint`

The SDK's effect index knows every pending effect (breakpoints,
sleeps, custom kinds) and their `requested`/`resolved` state. Our
`derivePendingBreakpoint` only catches breakpoints AND only by
walking event pairs, which can lose track if a journal file rotates
or the SDK adds new event types we don't know about.

**Action**: add `runs:listPending(taskId)` IPC that runs
`babysitter task:list <runDir> --pending --json`. Use it as the
source of truth for the BreakpointApprovalCard. Keep
`derivePendingBreakpoint` as the optimistic in-memory fallback when
the CLI isn't reachable.

### 3. Use `run:status` for the phase chip strip's "current" marker

Today the chip strip walks events to find the latest `bs:phase`. The
SDK has a state cache (`state/snapshot.json`) that's authoritative.

**Action**: add `runs:status(taskId)` IPC. Cache the result with the
existing live-events bridge debounce. Render the "current" chip from
it.

### 4. Adopt `withRunLock` for our own writes

When we (a) append to events.jsonl while (b) babysitter is rotating
journal files, we can race. The SDK exposes `acquireRunLock` /
`releaseRunLock` from `storage/lock`. We already depend on the SDK,
so we can `import { withRunLock } from "@a5c-ai/babysitter-sdk"` (if
exported) or call its CLI primitives.

**Action**: lower-priority, but if we ever see corrupt events.jsonl
in the wild, this is the fix.

---

## What MC genuinely owns (don't try to push these to the SDK)

- The **multi-task layer**: queue, concurrency cap, per-project
  grouping, the data-bus pub/sub. SDK is single-run-scoped.
- The **pi adapter glue**: PiSessionManager, the auto-gen path
  (`/babysit` slash command), per-task model selection.
- The **UI**: phase chips, approval card layout, Subagents panel,
  derive-* helpers as renderer-only projections.
- **events.jsonl** as a merged stream: MC events + curated `bs:*` +
  pi session events. The SDK's journal is run-scoped; ours is
  task-scoped (one task = many runs over time, e.g. cycles +
  campaign items).

---

## Concrete next steps (smallest first)

1. ✅ **Already correct**: spawn `harness:create-run`, spawn
   `task:post` for breakpoint responses.
2. **Add `runs:status(taskId)` IPC** that calls
   `babysitter run:status <runDir> --json` and returns the parsed
   result. Makes MC's "is this run still alive / what stage" query
   authoritative instead of derived.
3. **Add `runs:listPending(taskId)` IPC** for the BreakpointApprovalCard.
   `derivePendingBreakpoint` becomes the fallback for offline / no-CLI
   environments.
4. **Surface `completionProof`** on Task Detail when a curated run
   completes. Read it from `run.json` via a `runs:metadata(taskId)`
   IPC.
5. **Track iteration count** by reading the SDK state cache (or
   running `run:iterate` with `--dry-run` if that's a thing) instead
   of counting our own events.

None of these change behavior; they replace heuristics with the SDK's
authoritative sources. Each is a 10-30 line IPC + a hook update on
the renderer side.
