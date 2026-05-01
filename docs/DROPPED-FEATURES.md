# Dropped features — for periodic revisit

A graveyard for ideas that didn't survive vetting. **Not** a TODO list:
these aren't pending implementation. The point is to remember the
thinking so future-you can revisit and either pivot or confirm the
drop.

Each entry has a "**Revisit if:**" line — the condition that would
flip the call. Periodically scan the file (~every quarter or after a
big architectural change) and check whether any conditions have
changed.

---

## Workflow letter `<W>` in task IDs (was #15)

**What it was**: removing `DEFAULT_WORKFLOW_LETTER` and shortening
task IDs from `<PREFIX>-<NNN><W>` (`DA-001F`) to `<PREFIX>-<NNN>`
(`DA-001`). The letter was a vestige of the old fixed-roster pipeline
(F=fixit, X=campaign, M=multi).

**Why dropped**: small thought, not load-bearing for any new
feature. Touching task ID format is a persisted-data contract change
per CLAUDE.md — too much risk for too little gain.

**Status**: keep the letter as a stable ID convention. Existing
behavior unchanged. The letter no longer carries semantic meaning;
treat it as decorative.

**Revisit if**:
- Task ID generation needs to change for another reason (e.g.,
  collision with a new ID scheme), making the cleanup free
- A user-visible feature exposes the letter to the user and they're
  confused by it
- A library or external system needs MC's task IDs and the letter
  format trips parsing

---

## Generic linked-tasks (relates-to, blocks, duplicates) — S1 from COMP-RESEARCH

**What it was**: a typed graph between tasks beyond just parent/child.
"TaskA *blocks* TaskB", "TaskA *duplicates* TaskB", etc. Sourced from
Linear's linked-issues feature.

**Why dropped**: parent/child via `parentTaskId` (now in the schema)
covers the most common case. Adding a generic graph adds UI surface
(Linked-tasks panel, "add link" affordance) for marginal value in a
single-user tool.

**Revisit if**:
- We hit a real use case where parent/child isn't expressive enough
- Task counts grow to hundreds and users want to express dependencies
- Multi-user collab lands and "blocks" semantics matter for handoff

---

## Cost / token rollup as a Topbar element — S4 from COMP-RESEARCH

**What it was**: live cost ticker in the Topbar showing today's spend
across all tasks. Sourced from Langfuse / Helicone.

**Why dropped**: a desktop tool isn't a billing dashboard. The
RunMetricsCard on TaskDetail covers per-task; the ProjectDetail
rollup covers per-project. A global ticker adds chrome for one glance.

**Revisit if**:
- Spend regularly surprises (hits a daily threshold without warning)
- A "budget" feature lands (e.g., cap tasks at $X/day) — the ticker
  becomes a primary affordance for that

---

## Workflow versioning — S5 from COMP-RESEARCH

**What it was**: pinning a specific workflow.js version per run, so
edits to a workflow mid-run don't affect already-running iterations.

**Why dropped**: babysitter SDK already snapshots the entry on
`run:create`. Mid-run edits to the source file don't affect the
running iteration. Not a real problem.

**Revisit if**:
- We see actual mid-run divergence (e.g., a user reports "I edited
  the workflow, my running task did weird things")
- The SDK changes its snapshot behavior

---

## Bulk actions on Board (multi-select) — S6 from COMP-RESEARCH

**What it was**: Cmd-click cards on the Board, bulk-archive, bulk-rerun.
Sourced from Trello / Linear.

**Why dropped**: single-user tool with low task counts. Multi-select
is rarely used in tools that have it. Adds modifier-key UX surface.

**Revisit if**:
- Task counts regularly exceed ~50 active and bulk operations become
  routine
- A real workflow emerges where the same action is applied to many
  tasks (e.g., "archive all done tasks older than 30 days") — that's
  better as an automated cleanup than as multi-select

---

## Drag-drop status changes on Board — S7 from COMP-RESEARCH

**What it was**: drag a card from "Active" to "Done."

**Why dropped**: status is run-state-derived (running, paused, done).
Dragging would *lie* — you'd be setting a value the system
re-derives from runState + status fields. Confusing.

**Revisit if**:
- Lane derivation changes such that status becomes user-set rather
  than derived
- The UI grows a "manual override" concept (force a task into a lane
  for grooming purposes)

---

## Animated card dot for run state — S12 from COMP-RESEARCH

**What it was**: a pulsing dot on TaskCard for running tasks, static
for paused. Sourced from GitHub Actions / Vercel.

**Why dropped**: today the card uses pill colors for state (warn
yellow for running, etc.). Adding a dot is double-encoding the same
information.

**Revisit if**:
- Pill color stops carrying state (e.g., redesign collapses the role
  pill into something else)
- Color-blind users report state isn't readable

---

## How to use this file

1. **Adding a drop**: when something gets dropped during planning,
   move its description here with a "Revisit if:" condition.
   Don't just delete the idea — the rationale matters.
2. **Periodic review**: every ~quarter, scan the file. For each
   entry, ask "has the revisit condition changed?" If yes, move
   back to the active list with new framing.
3. **Resurrecting**: if an idea gets pulled back, leave a footnote
   here pointing to where it landed in the active list.
