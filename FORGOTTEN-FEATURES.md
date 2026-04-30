# Forgotten Features — what's still missing from the mockup

This file used to be a long mockup-vs-code diff from 2026-04-22. Most
of those items shipped, were absorbed by the library/curated-workflow
direction, or are now obsolete. This rewrite (2026-04-30) keeps just
what's actually still open.

For the broader plan, read `docs/HANDOFF.md` (sections 6 + 7) and
`docs/UI-DESIGN.md` (the locked visual rules from the mockup pass).

## Still open

1. **Per-card model badge** — Task cards on the Board don't show
   the active/last-used model yet. The data is available
   (`useTasks` → `currentModel` from `latestModelForEvents`), the
   card just doesn't render it.

2. **Artifacts vs linked-files split** — Task Detail's Linked Files
   panel currently shows the raw task folder. Splitting into
   "agent-produced artifacts" vs "repo files this task touches" is
   on the wishlist. Needs the agents (or babysitter) to write a
   `linked-files.json` sidecar alongside the journal.

3. **Lane redesign** — Board still uses the kanban columns. The
   mockup showed a flat list grouped by run state. Phase chips on
   Task Detail (driven by the journal) already give the
   workflow-specific view; the board could collapse to the state
   bands.

4. **Subagents as first-class rows** — Right Bar shows pi events.
   The babysitter SDK journal at `.a5c/runs/<runId>/journal/*.jsonl`
   carries `EFFECT_REQUESTED` / `EFFECT_RESOLVED_OK` entries that
   would surface subagents (RepoMapper, etc.) directly. Not parsed
   yet.

5. **"Waiting on what" reasons** — `Task.blocker` is a free-text
   field; it could become a tagged enum
   (`waiting-on: build-callback | human-approval | external-api`)
   so the Sidebar / Right Bar can render distinct icons per
   reason. Today the rail just shows the blocker text.

6. **Plannotator integration** — when plannotator-the-plugin
   exposes an invocation surface, drive an approval gate against
   journal `BREAKPOINT_OPENED` events.

## Resolved + closed (don't reopen)

- Task ID convention `<PREFIX>-<NNN><W>` (the `<W>` letter is now
  encoded only in the ID, not as a separate field).
- Project source detection (`git-detect.ts`).
- `selectedProjectId` lives in `router.ts`; Create Task defaults to it.
- Library catalog at `library/_index.json` is the source of truth for
  agents, skills, and workflows. The legacy roster, agent picker,
  workflow letter, lane enum, and approval-lane gate all came out
  during the cleanup pass.
