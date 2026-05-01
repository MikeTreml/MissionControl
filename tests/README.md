# tests/

Workflow- and journal-level test layer for MC.

## What lives here vs. `src/main/*.smoke.ts`

| Layer | Where | What it tests | Speed |
|-------|-------|---------------|-------|
| **Unit (smoke)** | `src/main/*.smoke.ts` | Individual main-process modules — store, IPC handlers, run-manager state machine. No SDK. | ms |
| **Workflow (this)** | `tests/workflow/` | A workflow's `process()` function end-to-end via the SDK fake runner. No real LLM, no Docker. | seconds |
| **Replay (this)** | `tests/replay/` | A captured journal from a real run replays cleanly against current code. | seconds |
| **UI** | `scripts/verify-ui.mjs` | Playwright over the built Electron app. | tens of seconds |

The unit smokes already exist; this directory adds the two layers that
mc-v2-electron previously lacked. Convention is identical: standalone
`.smoke.ts` scripts run via `node --experimental-strip-types`, no test
framework — see [CLAUDE.md](../CLAUDE.md) "Don't add" rule re: Jest/Vitest.

## Layout

```
tests/
├── _helpers/                    # shared infrastructure (underscore = "not a test")
│   ├── assert.ts                # tiny assert(cond, msg) — exit on first fail
│   ├── assert-journal.ts        # RUN_CREATED → n×EFFECT_REQUESTED → n×EFFECT_RESOLVED → RUN_COMPLETED
│   ├── run-fake.ts              # wrapper over @a5c-ai/babysitter-sdk/testing
│   └── replay.ts                # journal replay (V1 stub — see below)
├── workflow/                    # one .smoke.ts per workflow under test
│   ├── example-workflow.smoke.ts
│   └── README.md
└── replay/                      # one .smoke.ts per captured journal
    ├── fixtures/<name>/journal/ # captured event files (commit selectively)
    └── README.md
```

## Running

```bash
npm run test:workflow            # all workflow smokes (deterministic, fast)
npm run test:replay              # all replay smokes (once fixtures land)
npm run smoke                    # unit smokes only (the dev tight loop)
```

Workflow tests are intentionally **not** part of `npm run smoke` — they boot
node + the SDK per file, which is fine for CI but adds a noticeable second
to the dev loop. Run them before commits or wire them into a separate hook.

## Why this matters

Each layer catches a different class of regression:

- **Workflow smokes** prove that a process file's task graph, ordering, and
  output shape behave correctly without spending LLM dollars or touching the
  network. They're how you test "does this workflow do what its phases say
  it does" before any real run.
- **Replay smokes** prove that a successful run from yesterday still
  completes identically against today's code. This is the strongest
  regression net for an event-sourced system — a code change that breaks
  replay is, by definition, non-deterministic with respect to the recorded
  history.

See `_helpers/assert-journal.ts` for the rationale on journal-shape
assertions; see `_helpers/replay.ts` for the V1 → V2 plan on replay.

## Decision log

- **No Vitest.** CLAUDE.md bans it; standalone `.smoke.ts` scripts match the
  established `src/main/` convention.
- **No Docker.** Babysitter's e2e-tests use Docker because they're testing
  multiple harnesses (Claude Code, Codex, Cursor, etc.) in clean rooms. MC
  is a consumer of those harnesses, not a comparator — Docker would be
  overhead with no payoff.
- **Underscore-prefixed `_helpers/`** so the directory listing makes
  test-vs-infrastructure obvious at a glance.
- **Replay deferred to V2.** The helper signatures and the capture
  instructions are in place, but the full `replayAgainstFreshRun` lands
  once we have at least one captured journal from a real MC run.
