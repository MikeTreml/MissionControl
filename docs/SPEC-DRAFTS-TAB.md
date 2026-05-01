# SPEC — Drafts tab on Board (item #41)

Status: **PROPOSED** — design only. No code yet.
Supersedes the per-task CTA approach in #39 (workflow selection
prominence on Task Detail). The CTA on Task Detail still lives, but it
becomes the secondary path; the Drafts tab is the primary surface for
"a draft has no workflow yet — pick one."

Cross-references:
- `docs/COMP-RESEARCH.md` §3 (Linear triage view validation, #39
  reshape, #41 surfaced)
- `docs/UI-FLOW.md` §1 (top-level navigation), §3 (modify surfaces)
- `docs/AUDIT-2026-04.md` §I3 (`BOARD_STAGES` hardcoded)
- `docs/UI-DESIGN.md` (tokens, calm palette, accent rules)

---

## 1 · Where it lives

**Decision: a tab on the Board page (Kanban / Drafts).** Not a separate
top-level sidebar entry. Not a filter on the Kanban.

### Why a tab and not a filter

A filter on the existing Kanban would technically work — toggle "show
only drafts" and the Draft lane fills with its current TaskCards. But
TaskCard today is title-summary-pill-cycle-model; a draft's *missing*
data (no workflow, no model, no kind decision) is what the user needs
to see and act on. Stretching TaskCard to surface picker affordances
inline would either bloat every card or fork TaskCard with conditional
chrome. A separate tab gives us a fit-for-purpose row layout without
contaminating the kanban card.

### Why a tab and not a top-level sidebar entry (the Linear pattern)

Linear puts Triage in its own sidebar slot because triage is a
project-manager workflow distinct from "look at my board." For MC, the
user is the same person doing both, the draft volume is low (single-
user tool, dozens of tasks not hundreds), and adding a new top-level
entry inflates the sidebar. The Board page is already the user's
landing — putting Drafts one tab away keeps it discoverable without
fragmenting navigation.

### Concretely

The Board page header gains a tab strip:

```
┌──────────────────────────────────────────────────────────┐
│  [ Kanban ]  [ Drafts (3) ]              Show archived ▸ │
├──────────────────────────────────────────────────────────┤
│  …current Board content or Drafts table…                 │
└──────────────────────────────────────────────────────────┘
```

The count next to "Drafts" is live (re-derived on every `tasks`
publish). When the count is 0 the tab is still visible — it's a real
view of the system, not a notification. A muted "(0)" instead of
hiding keeps the surface predictable.

**Reservation.** A future "view picker" pattern (Kanban / Drafts /
Table / Calendar) is a slippery slope toward Linear-style multi-view
sprawl. COMP-RESEARCH §S2 already deferred Table view. The tab strip
should hold *exactly* Kanban + Drafts for now. New views require their
own spec.

---

## 2 · Data scope

### What counts as a draft

A task is a draft if `boardStage === "Draft"`. Per
`useTasks.deriveBoardStage` (verified against
`src/renderer/src/hooks/useTasks.ts:81-90`):

```
status=archived              → Archived
status=done                  → Complete
status=failed                → Failed
blocker || waiting || paused → Attention
runState=running             → Active
else                         → Draft  ← us
```

So a Draft is "not archived, not done, not failed, not blocked, not
paused, not running." That is: a task that exists but has not started
(or has finished its first turn and is now idle waiting for the user
to act). This catches both:

- **No-workflow-yet drafts** — newly created, no `RUN_CONFIG.json` or
  `RUN_CONFIG.libraryWorkflow == null`.
- **Workflow-picked drafts** — `RUN_CONFIG.libraryWorkflow` set, user
  hasn't clicked Start.

Both belong on this view: the user's job here is "decide and Start."
The visual difference is in the workflow column (see §3).

### Edge case — running once, now idle

A task that ran once, finished a turn, and went back to `runState=idle`
**will** show up in Drafts under this rule. That is arguably wrong —
it's not a "draft," it's "between turns." Two options:

**Option A** *(recommended).* Filter on `cycle === 0` for the Drafts
tab. New, never-run, that's a draft. Returning-to-idle tasks stay on
the Kanban under whatever stage they belong to.

**Option B.** Keep the `boardStage === "Draft"` rule as-is. Treat the
Drafts tab as "tasks awaiting a decision," which includes "ran once,
needs review."

I recommend Option A because the Drafts triage flow is specifically
about workflow/model assignment for first run. A returning-to-idle
task already has its workflow chosen. The `cycle === 0` filter
narrows the view to its actual purpose.

**Q:** Can `cycle` be `0` after a run on the auto-gen path? (Need to
verify against `RunManager` before locking in.)

### What is excluded explicitly

- Archived tasks (already excluded by Stage rule)
- Demo/mock tasks when `isDemo === true` — show the empty state
  instead, with a dev hint that real data is empty (matches the way
  Board treats demo today)

---

## 3 · Row layout

A table-style row, not a card. Each row is one draft.

### Columns (left → right)

| # | Column | Source | Why it's there |
|---|--------|--------|----------------|
| 1 | **ID** | `task.id` | Stable handle. Click navigates to Task Detail. Format: `PREFIX-NNN`. |
| 2 | **Title** | `task.summary` | The thing the user wrote. Single-line ellipsis at narrow widths. |
| 3 | **Project** | project icon + project name | The user almost always has multiple projects active; project is the strongest mental grouping. Icon + short name ≈ 60-100px. |
| 4 | **Kind** | `task.kind` (`single` / `campaign`) | Pill, muted color. Toggle inline (§4). |
| 5 | **Workflow** | `RUN_CONFIG.libraryWorkflow.name` or **(none)** | The decision-bearing column. Empty = needs assignment. Inline picker (§4). |
| 6 | **Model** | `task.currentModel` short label, or **(default)** | Per #10, model badge was commented out on TaskCard but the value is live in `UiTask.currentModel`. Drafts is the right place to surface it. Inline picker (§4). |
| 7 | **Parent** | link to `task.parentTaskId`, if set | Pre-empts #43 ("Spawned from" panel). When parent exists, show as `↳ ABC-001` linking to that task's detail. Empty for top-level drafts. |
| 8 | **Created** | `task.createdAt` | Relative ("3h ago", "2d ago") with absolute on hover. Helps spot stale never-started drafts. |
| 9 | **Actions** | inline buttons | Start (only when workflow set), Open (always). See §4. |

### What is intentionally NOT a column

- **boardStage** — by definition every row is `Draft`.
- **runState / status** — same, by definition `idle` / `draft`.
- **Updated** — for drafts, `updatedAt` ≈ `createdAt`; redundant.
- **Cycle** — always `0` per §2 Option A.
- **Stale/idle indicator** — the audit-surfaced "idle 3h" badge belongs
  on TaskCard (Kanban). Drafts already shows `Created`; redundant here.

### Visual

Use `<table>` + token CSS, not a CSS grid hack. Rows are 36-40px tall,
zebra-striped via `--card` / `--bg` alternation, hover `--card-hover`.
Truncate Title with ellipsis; make the cell `title=` the full value.
Project column is the icon-glyph + first ~12 chars of name; full name
on hover.

**Reservation.** Don't build a generic data-grid. A
`<table className="drafts-table">` with hand-rolled cells is the
right scope. No sorting, no resizing, no column hide/show. If we
later want sort, add it; don't pre-build it.

---

## 4 · Inline actions

Affordance density: **picker controls visible per-row, action buttons
visible per-row.** No hover-only affordances on the Drafts tab.

The whole point of this view is to make each row's missing decisions
clickable in one motion. A hover-reveal hides the affordance and
defeats the triage rhythm. (Hover-reveal IS appropriate on the Kanban
TaskCard — see #42 — because the kanban's primary job is *scan*, not
*act*.)

### Per-row controls

- **Workflow picker.** A `<select>` populated from
  `useLibraryIndex().items.filter(kind === "workflow")`, sorted by
  `logicalPath`. First option: `Auto-generate (no workflow)`. Selecting
  a value writes `RUN_CONFIG.json` via the same path as
  `ChangeWorkflowModal.onSave` — same `kind: "library-workflow-run"`
  shape, same `taskContext`, same `runSettings.inputs`. Reuse the
  modal's logic; do not fork it.

  **Inputs schema friction.** A workflow with a non-trivial
  `inputsSchema` cannot be reasonably edited in a one-line dropdown.
  When the user picks such a workflow inline, defer to
  `ChangeWorkflowModal` (open it pre-populated with the selection).
  When a workflow has no schema or a trivial one, write
  `RUN_CONFIG.json` directly with empty/default inputs and surface a
  muted "Inputs ▸" link for editing.

  **Q:** Is "trivial schema" something we can detect? (Has properties
  but all optional? No properties at all?) Need to check
  `library/_index.json` shape. If detection is fuzzy, default to
  always-open-modal — safer than half-writing a config.

- **Model picker.** A `<select>` from
  `window.mc["pi:listModels"]()`. First option: `(pi default)` =
  empty value. Writes the same way Task Detail's model picker writes
  today.

- **Kind toggle.** Two-button segmented control: `single | campaign`.
  Switching to campaign on a draft requires a `items` field; if the
  task has none, switching opens a small inline editor (or defers to
  Task Detail). If the task has items, switching back to `single`
  warns ("3 items will be ignored on Start") with a confirm.

  **Q:** Is changing kind on a draft safe? Need to verify
  `RunManager.startCuratedWorkflow` and the campaign branch don't
  cache decisions before Start.

### Per-row buttons

- **Start.** Enabled only when a workflow is selected (or
  Auto-generate is explicitly chosen — that's a valid choice). Disabled
  with a `title=` tooltip when no workflow + no decision: "Pick a
  workflow or choose Auto-generate." Calls the existing `start` IPC.
  On success the row leaves the Drafts list (its boardStage flips to
  `Active`), and the count in the tab decrements.

- **Open.** Navigates to Task Detail. Same as clicking the ID.
  Redundant but discoverable.

### Affordances NOT exposed inline

- Edit title / description — that's Task Detail's job. Drafts tab is
  about *configuration for run*, not *content authoring*.
- Delete / archive — same reasoning, plus deletion is destructive and
  should require a confirm dialog, not a one-click row button. If
  needed later, add a row-level "⋯" menu.
- Re-run / clone — drafts haven't run; doesn't apply.

---

## 5 · Bulk actions

COMP-RESEARCH §S6 dropped multi-select bulk actions on the Board for
single-user-tool reasons. Re-evaluating for Drafts specifically:

**Recommendation: DO NOT add bulk actions in v1.** Same reasoning
holds — single user, tens of tasks at most, the per-row inline
pickers already make per-task assignment a one-click flow. Bulk
"assign workflow X to all selected" sounds appealing but the
inputs-schema friction (§4) makes it dangerous: a workflow with
required inputs cannot be bulk-assigned without each row getting its
own form. A bulk action that *only* works for input-less workflows is
a bear trap.

**Re-evaluate when:** the user is regularly creating ≥5 same-type
draft tasks at once (e.g., from a planning task spawning subtasks per
#40, or from importing a CSV of TODO items). At that point, bulk
assignment becomes worth the UX investment, *and* it becomes
specifically useful in the planning-task-spawn flow rather than as a
generic affordance. Track as a future task; do not preempt.

---

## 6 · Empty state

When the filtered draft list is empty:

```
┌──────────────────────────────────────────────────────────┐
│                                                           │
│                  ✦   Nothing to triage                    │
│                                                           │
│      Every task is either running or finished.            │
│                                                           │
│              [ + Create Task ]   [ Run from library ]    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

Copy:
- **Heading**: "Nothing to triage." (Linear-style — calm, not
  cheery.)
- **Sub**: "Every task is either running or finished."
- Two CTAs: `+ Create Task` (opens `CreateTaskForm` modal —
  same affordance as Topbar) and `Run from library` (navigates to
  `library` view). The second points the user at the curated-workflow
  path, which often produces a fresh task that lands on Drafts.

In `isDemo === true`, the empty state is replaced with a single muted
line: "Demo data — create a real task to see drafts here." This
mirrors how Board treats demo today (it shows the demo Kanban
unchanged; the Drafts tab specifically does *not* fabricate demo
drafts because the affordances would do nothing).

---

## 7 · Interaction with existing surfaces

### Task Detail's "Workflow…" button (`ChangeWorkflowModal`)

Stays. The Drafts tab is the *primary* surface for first-time
assignment; Task Detail's button is the *secondary* surface for
re-assignment after the task has progressed. Two cases to support:

1. **Pre-Start** — user is on Drafts tab, picks workflow, hits Start.
2. **Post-Start re-assignment** — user is on Task Detail looking at a
   completed or paused run, decides to swap workflow before re-run.
   That's the existing `ChangeWorkflowModal` flow.

Both paths write the *same* `RUN_CONFIG.json` shape via the *same*
IPC. There must be no schema divergence. The Drafts inline picker
delegates to `ChangeWorkflowModal` for non-trivial schemas (§4),
which makes this a single code path with two entry points.

### Topbar `+ Create Task`

Unchanged. After creating, the new task lands on Drafts (if no
workflow was picked in the form) or somewhere on the Kanban (if it
was). The user's mental model: "make a task, then go to Drafts to
finish setting it up." This is consistent with Linear's Inbox →
Triage flow.

### Project Detail's task list

Unchanged. Project Detail shows *all* tasks for one project in its
own format. Drafts tab shows *only drafts* across *all* projects (or
filtered, see §8). Different jobs.

### Kanban's Draft lane

Stays. A user can still see drafts as kanban cards in the leftmost
lane on the Kanban tab. The Drafts tab is an *alternate* view of the
same set, not a replacement. The trade-off is intentional: Kanban
gives spatial context (drafts vs. running vs. done), Drafts tab gives
configuration density. Some users will live on one, some on the
other.

**Reservation.** Two views of the same data inevitably drift in
perceived authority. Keep the Drafts tab strictly a *focused
projection* — never show a count or status not also visible on
Kanban. If we ever introduce a "Drafts-only field" (e.g., "ready to
start" boolean), it has to render on Kanban too, or we've created a
hidden state.

---

## 8 · Edge cases

### Task transitions out of Draft mid-edit

Concrete: user is on Drafts tab, has a `<select>` open for a row's
workflow picker. Meanwhile, the Start IPC fires for that task from
*another* surface (e.g., a plannotator-driven flow, or the user's
keyboard shortcut, or — eventually — an external trigger). The task
flips to `boardStage === "Active"`.

Behavior: the `useSubscribe("tasks", load)` hook re-fetches and the
row disappears on next render. The user's open dropdown is also gone
because the parent row unmounted. This is acceptable — the change
they were about to make is no longer relevant (the task already
started). A future enhancement could show a one-second "Started
elsewhere" toast; not in v1.

If the user *was* in the middle of typing in an inline inputs form
(opened via "Inputs ▸"), that's the same problem
`ChangeWorkflowModal` already has, and it's modal — closes on
unmount. Acceptable.

### Demo mode

`isDemo === true` ⇒ the Drafts tab shows the empty state with the
"demo" hint (§6). No drafts are fabricated. This deviates from Board's
demo-Kanban-with-mock-cards behavior because the affordances on Drafts
are write actions; firing them on mock data would either silently
no-op (confusing) or attempt to write to `<userData>` for tasks that
don't exist (broken).

### Project filter

**Q (the big one):** does the Drafts tab honor the Topbar project
switcher, or always show all drafts across all projects?

The whole *point* per COMP-RESEARCH §3 is "all draft tasks across
projects in one place." Filtering by project would amputate that. But
the Topbar project switcher today implies "I'm focused on this
project" globally; ignoring it on Drafts breaks that consistency.

**Recommendation: always show all projects, with an in-row project
column doing the work the Topbar switcher would have done.** Add a
small "Project: All ▾" filter chip *inside the Drafts tab* that
defaults to All but lets the user narrow. The Topbar switcher does
NOT auto-apply here — the Drafts tab explicitly opts out by showing
the chip. The user discovers the override the moment they look at the
chip's value.

**Reservation.** Two possible filter sources (Topbar switcher,
Drafts tab chip) can confuse — the user changes the Topbar, expects
Drafts to follow, doesn't see the change. Counter-argument: putting
the chip *inside* Drafts and labeling it "Project: All" makes the
override visible without the user having to know about Topbar. The
chip wins arguments because the Drafts-specific value is right next
to the data.

If user testing shows confusion, the fallback is to honor the Topbar
switcher and add a "Show all projects" override checkbox in the
Drafts tab header. But default-to-all is the more useful triage
experience and matches Linear's Inbox-is-cross-team default.

### Tasks with `parentTaskId` set

Render normally; the Parent column shows the link. If the parent task
is also a draft, both rows show; the parent's row does NOT visually
nest the children (would clutter the table). #43's "Spawned from /
Spawns" panel on Task Detail covers the hierarchy view; Drafts is
flat.

### Workflow disappeared from library

A draft's `RUN_CONFIG.libraryWorkflow.logicalPath` may reference a
workflow that's since been removed from `library/` (or renamed). The
Workflow column shows `(missing: <logicalPath>)` in `--bad` color,
the Start button disables. Picking a new workflow heals the row.

---

## 9 · Open questions

- **Q1:** `cycle === 0` filter for the "true draft" set — does
  `RunManager` always increment `cycle` on a real first turn? Verify
  against `src/main/run-manager.ts`. If `cycle` can stay `0` past
  start, the filter needs a different signal (`status` or `runState`
  history?).
- **Q2:** "Trivial inputs schema" detection — what counts? Empty
  schema, schema with all-optional properties, schema with only
  defaulted properties? Or always-defer-to-modal? Need to inspect a
  handful of `inputs.schema.json` files in `library/`.
- **Q3:** Kind toggle on a draft — verify `RunManager` does not cache
  any per-kind decision before Start. If it does, the toggle has to
  invalidate that cache.
- **Q4:** Bulk-assign workflow with all input-less workflows — is the
  "input-less" detection cheap and reliable enough to gate a future
  bulk-action UI on? (See §5.)
- **Q5:** Should the tab strip on Board generalize (anticipate Q5 a
  future Calendar / Table view)? Recommendation in §1 is *no*; revisit
  if a third view ships.
- **Q6:** `parentTaskId` is already in `TaskSchema`
  (`src/shared/models.ts:99-102`) — confirmed. The Parent column can
  ship without schema work.
- **Q7:** Does the Drafts tab respect (or override) the Topbar
  `Show archived` toggle? Recommendation: **ignore it.** Archived
  tasks aren't drafts by construction (§2).
- **Q8:** Sort order — created-desc by default (newest at top)?
  Created-asc (oldest first, "fix these old ones")? COMP-RESEARCH
  §3 doesn't say. Recommend **created-asc**: the older a draft is,
  the more it deserves attention.

---

## 10 · Implementation surface

Files to add:

- `src/renderer/src/pages/Drafts.tsx` — the tab content. Renders the
  table. Owns the in-tab project filter chip's local state.
- `src/renderer/src/components/DraftRow.tsx` — one row of the table,
  with the inline pickers and Start button. Receives a `UiTask` plus a
  callback for "open the inputs modal."
- `src/renderer/src/lib/draft-filters.ts` — a small pure module:
  `isDraft(task: UiTask): boolean` (encapsulates the §2 rule),
  `sortDrafts(tasks: UiTask[]): UiTask[]`. Co-located smoke test
  `draft-filters.smoke.ts`.

Files to change:

- `src/renderer/src/components/Board.tsx` — add a tab strip header
  (`Kanban | Drafts (N)`), local `useState<"kanban" | "drafts">`,
  conditionally render `<Drafts />` instead of the current lane wrap.
  The `Show archived` toggle moves under the Kanban tab only.
- `src/renderer/src/hooks/useTasks.ts` — no schema change, but expose
  a small derived value (`draftCount`) so the tab badge can render
  without re-deriving in two places. Or just compute in `Board.tsx`;
  fine either way.
- `src/renderer/src/global.d.ts` — no new IPC. Drafts reuses
  `readTaskRunConfig`, `writeTaskRunConfig`, `pi:listModels`, `start`.
- `src/renderer/src/components/ChangeWorkflowModal.tsx` — small refactor
  to accept an external trigger (the inline Workflow picker on
  DraftRow). Today it's `open` + `task` + `onClose`; that's already
  enough — Drafts can call it directly. No modal change needed if
  Drafts always calls the modal for non-trivial schemas.
- `scripts/verify-ui.mjs` — extend the `TODO(CC)` block per §11.

Files NOT to change:

- `src/main/**` — the Drafts tab is renderer-only.
- `src/shared/models.ts` — no schema change.
- `library/**` — no library change.
- `src/renderer/src/components/TaskCard.tsx` — Kanban TaskCard is
  unchanged. Drafts uses its own row component.

Code flow on "user picks a workflow inline and clicks Start":

1. `DraftRow` workflow `<select>` onChange → if schema-trivial, write
   `RUN_CONFIG.json` directly via `window.mc.writeTaskRunConfig`.
   Publish `tasks`. Else open `ChangeWorkflowModal` with the selected
   workflow pre-applied; modal saves on user confirm.
2. User clicks Start → `window.mc.start(taskId)`. Same path Task Detail
   uses today.
3. Task transitions to `boardStage === "Active"`. `useTasks` re-fetches
   on `tasks` publish. Row disappears from Drafts. Tab count
   decrements.

---

## 11 · Verification

`scripts/verify-ui.mjs` extensions (Playwright):

- **V1.** Boot the app with at least one Draft-stage task in
  `<userData>/tasks/`. Navigate to Dashboard. Assert a `Drafts (N)`
  tab is visible with `N >= 1`.
- **V2.** Click the Drafts tab. Assert a table renders with the
  expected columns (ID / Title / Project / Kind / Workflow / Model /
  Parent / Created / Actions). Assert the row count matches `N`.
- **V3.** Pick a workflow with no inputs schema in the inline
  Workflow `<select>`. Assert the row's Workflow cell updates
  in-place. Assert the Start button becomes enabled.
- **V4.** Pick a workflow with a non-trivial inputs schema. Assert
  `ChangeWorkflowModal` opens pre-populated. Cancel. Assert the row's
  workflow value reverts.
- **V5.** Click Start on a configured row. Assert the row leaves the
  Drafts table within 2 seconds (task transitions to Active). Assert
  the tab count decrements by 1.
- **V6.** Empty-state. Boot with zero drafts. Navigate to Drafts tab.
  Assert "Nothing to triage" copy and both CTAs (`+ Create Task`,
  `Run from library`) render.
- **V7.** Demo mode. Boot with `isDemo === true`. Navigate to Drafts
  tab. Assert the demo-hint copy renders, NOT mock draft rows.
- **V8.** Project filter chip. Boot with drafts spanning ≥2 projects.
  Default Drafts view: assert all drafts visible. Pick one project in
  the chip. Assert only that project's drafts visible. Reset to All.
  Assert all visible again.
- **V9.** Screenshot. After V2, capture `drafts-tab.png` to
  `scripts/screenshots/`.

Smoke tests (Node, no Playwright):

- `src/renderer/src/lib/draft-filters.smoke.ts` — `isDraft`,
  `sortDrafts` correctness against a hand-rolled `UiTask[]` fixture.

Type safety: `npx tsc --noEmit -p tsconfig.web.json` passes after the
new files land.

---

## 12 · What this spec does NOT cover

- **Workflow-driven lanes** (#12 / #27) — the `BOARD_STAGES` enum is
  still hardcoded post-Drafts-tab. Per AUDIT §I3, that's a deeper
  redesign. The Drafts tab uses the same `boardStage` derivation; it
  doesn't fix the root cause.
- **Per-task idle-since-X badge** on TaskCard — surfaced in the audit
  (I4), tracked separately. Drafts tab uses `Created`, not idle-time.
- **Hover-actions on TaskCard** (#42) — Kanban-only feature. Drafts
  uses always-visible per-row affordances per §4.
- **`Spawned from / Spawns` panel** (#43) — Task Detail feature. The
  Drafts tab shows a *link* to parent (column 7) but does not render
  hierarchy.
- **Cmd-K command palette** (S8) — eventually subsumes "go to
  Drafts" but doesn't replace the tab.

---

## 13 · Reservations summary

Surfacing all the explicit reservations in one list, for the
implementer to weigh against time budget:

1. **Tab strip vs. third view** — keep it Kanban + Drafts only; no
   pre-emptive multi-view machinery (§1).
2. **Project filter — Topbar switcher vs. in-tab chip** — go with
   in-tab chip default-All; revisit if user testing shows confusion
   (§8).
3. **Two-views-of-same-data drift** — never introduce a
   Drafts-only field that doesn't render on Kanban (§7).
4. **Inputs-schema friction** — defer to modal when schema non-trivial;
   detection rule is Q2 (§4, §9).
5. **Bulk actions** — re-evaluate when planning-task-spawn (#40)
   actually starts producing batches (§5).
6. **Demo mode** — no fabricated drafts; affordances would be broken
   on mocks (§6, §8).
7. **Idle returning-to-Draft tasks** — `cycle === 0` filter, pending
   verification of `RunManager` semantics (§2 Option A, Q1).
