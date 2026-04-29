# Task: Coordinate parallel agents via events.jsonl signals

## Why

When a workflow step has multiple agents running in parallel (e.g. dev1, dev2,
dev3 all working at once), the next step (Reviewer) needs to know when ALL of
them finish before starting. Today, MC has no such coordination — Reviewer
would either start too early or never start.

## Goal

Parallel steps are coordinated by event signals in `events.jsonl`. The
orchestrator advances to the next step only when all expected `step-agent-end`
events for the parallel group are seen.

## Scope

- New event type in `events.jsonl`: `step:start`, `step:agent-end`, `step:end`
- Orchestrator (run-manager) tracks expected agent count per parallel step
- Step is "done" when count of `step:agent-end` for that step equals expected
- Run Activity rail shows partial progress (`2/3 dev sessions complete`)
- Failures: if one parallel agent fails, the step's `onFail` policy decides
  whether to abort the others or wait for them

## Out of scope

- Cross-step parallelism (running step 2 while step 1 is still partially in
  flight) — keep the model simple: one step at a time, even when that step is
  internally parallel
- Cancelling a slow parallel agent — let it finish or time out
- Dynamic respawn of failed agents — failures bubble up, Reviewer decides

## Files involved

- `src/shared/models.ts` — add new event type variants
- `src/main/run-manager.ts` — bookkeeping for parallel steps
- `src/main/pi-session-manager.ts` — emits `step:agent-end` when each pi session
  fires `agent_end`
- `src/main/task-store.ts` — appends events to `events.jsonl`
- `src/renderer/src/pages/TaskDetail/RunActivity.tsx` — show "2/3" progress

## Event shapes

```jsonl
{"ts":"...","type":"step:start","stepId":"build","expected":3,"agents":["dev1","dev2","dev3"]}
{"ts":"...","type":"step:agent-end","stepId":"build","agent":"dev1","status":"ok","outputPath":"..."}
{"ts":"...","type":"step:agent-end","stepId":"build","agent":"dev2","status":"ok","outputPath":"..."}
{"ts":"...","type":"step:agent-end","stepId":"build","agent":"dev3","status":"failed","error":"..."}
{"ts":"...","type":"step:end","stepId":"build","status":"partial","completed":2,"failed":1}
```

## State machine

```
state: STEP_RUNNING
  expected = N parallel agents
  completed = 0, failed = 0
  on step:agent-end (status=ok) → completed++
  on step:agent-end (status=failed) → failed++
  when (completed + failed) === expected:
    if failed === 0:                    → emit step:end status=ok        → next step
    elif workflow.stopOnFirstFailure:   → emit step:end status=aborted   → halt run
    else:                                → emit step:end status=partial  → next step (Reviewer sees what made it)
```

## Acceptance criteria

- A workflow with `parallel: true` on the build step spawns 3 pi sessions
- `events.jsonl` shows one `step:start` followed by three `step:agent-end` lines
- Reviewer step starts AFTER all three agent-ends, never before
- If `stopOnFirstFailure: true`, the step:end fires the moment any agent fails
- Run Activity rail shows live `2/3` progress
- `npm run smoke` adds `run-manager.smoke.ts` case that simulates a parallel
  step with mock pi sessions and verifies the state machine

## Gotchas

- pi's `agent_end` event already fires per-session — that's the trigger; no
  new pi side work needed
- Don't conflate `pi:agent_end` (raw pi event) with `step:agent-end` (MC's
  step-level aggregation) — they're different layers
- `events.jsonl` is append-only; never rewrite. The state machine reads forward
  from a known offset, doesn't mutate.
- For loop cycles (task #03), each cycle gets its own `step:start` / `step:end`
  pair with a `cycle: 2` field on the events
- Concurrency cap: respect `fanOut.maxConcurrency` from the workflow — don't
  spawn 30 pi sessions at once