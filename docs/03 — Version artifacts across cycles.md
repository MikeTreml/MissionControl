# Task: Version task-linked artifacts across loop cycles

## Why

When Reviewer kicks back to Planner with `cycle=2`, the new Planner overwrites
`<taskId>-p.md`. Cycle-1 plan is lost. We can't compare what changed, audit
why the loop happened, or recover if cycle-2 is worse.

## Goal

Task-linked artifacts include the cycle number in the filename. Latest cycle is
findable in O(1). All prior cycles remain on disk for diffing.

## Scope

- Filename convention changes from `<taskId>-<code>.<ext>` to
  `<taskId>-<code>-c<cycle>.<ext>`
- `cycle` defaults to `1` (so first run is `DA-001F-p-c1.md`)
- A "current pointer" file (or just a max() lookup) lets UI know which is latest
- Update `TaskStore.readTaskFile(id, stem)` to resolve to the latest cycle
  unless an explicit cycle is passed
- Update STATUS.md auto-append messages to include cycle: `Item N done — cycle 2`

## Out of scope

- A diff viewer between cycles — UI affordance later
- Pruning old cycles — keep all forever for now
- Versioning the task manifest itself — only artifacts version

## Files involved

- `src/shared/models.ts` — `Task.cycle` already exists per AGENTS.md; verify
- `src/main/task-store.ts` (or wherever `readTaskFile`/`writeTaskFile` live)
- `src/main/run-manager.ts` — bump `task.cycle` when a step's `onFail.action === 'loopBackTo'` fires
- `src/main/pi-session-manager.ts` — when writing agent output, include current cycle
- `src/renderer/src/pages/TaskDetail/LinkedFiles.tsx` (per FORGOTTEN-FEATURES.md #6)

## Filename pattern

```
<taskId>-<code>-c<cycle>.<ext>

DA-001F-p-c1.md       Planner, cycle 1
DA-001F-p-c2.md       Planner, cycle 2 (after Reviewer kickback)
DA-001F-d-c1.md       Developer, cycle 1
DA-001F-d-c2.md       Developer, cycle 2
DA-001F-r-c1.json     Reviewer output, cycle 1 (verdict: revise)
DA-001F-r-c2.json     Reviewer output, cycle 2 (verdict: ship)
DA-001F-rmp-c1.md     RepoMapper subagent, cycle 1
```

Resolution rule: when an agent reads "the latest planner output," it gets the
file with the highest `c<N>` for that taskId+code combination.

## API changes

```ts
// Before
TaskStore.readTaskFile(taskId, "p")          // returns DA-001F-p.md

// After
TaskStore.readTaskFile(taskId, "p")          // returns latest cycle
TaskStore.readTaskFile(taskId, "p", { cycle: 1 })   // explicit cycle
TaskStore.listCycles(taskId, "p")            // returns [1, 2, 3]
```

## Acceptance criteria

- Running a workflow with one revise loop produces 2 of each artifact, not 1
  overwritten
- `readTaskFile(id, "p")` returns the cycle-2 content after a kickback
- `readTaskFile(id, "p", { cycle: 1 })` returns the original cycle-1 content
- STATUS.md shows entries like `Reviewer kicked back — cycle 2 starting`
- `npm run smoke` passes with new test cases in `task-store.smoke.ts`

## Migration

Existing task folders without cycle suffixes need a one-time rename. Either:
1. Migration script that renames `<taskId>-<code>.<ext>` → `<taskId>-<code>-c1.<ext>`
   (run once on app start if a flag isn't set)
2. Resolution rule: if no cycled file exists, fall back to non-cycled name (preserves old tasks read-only)

Option 2 is safer (no risk of botched migration). Pick that.

## Gotchas

- Reviewer's `qualityGate` reads the latest review output — make sure the
  resolver doesn't accidentally read its own prior output
- HANDOFF.md is NOT cycled (one per task, last writer wins) — it represents
  the most recent handoff. Cycled artifacts are the audit trail; HANDOFF.md is
  the live message.
- Subagent codes like `rmp` need cycling too. `DA-001F-rmp-c1` not `DA-001F-rmpc1`