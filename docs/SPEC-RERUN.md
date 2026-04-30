# SPEC — Re-run / clone (UI-FLOW gap #5)

Status: **PROPOSED** — design only, no code yet.
Owner: tbd.
Closes: UI-FLOW.md §8 row "Re-run / clone with changes"; COMP-RESEARCH.md §6
ticket #5 ("Re-run with overrides").
Cross-refs: COMP-RESEARCH.md §1 (GH Actions, Inngest, n8n), §4 ("Re-run with
overrides — button on run page"), §9 ("well-validated pattern"); UI-FLOW.md
§9 item 3 ("single biggest 'I want this' gap").

---

## 0 · One-paragraph summary

Add a "Re-run…" affordance to Task Detail that creates a **new task**
pre-filled from the current one. Two flavors per the GH Actions /
Inngest / n8n synthesis:

- **Re-run with same inputs** — one click, instant. No modal. New task
  is created with identical title/description/workflow/inputs and (optionally)
  immediately auto-Started. Mirrors GH Actions' "Re-run all jobs."
- **Re-run with new inputs** — opens `CreateTaskForm` already populated
  from the source. User can change anything before clicking Create.
  Mirrors Inngest's "replay with overrides."

The new task is **a separate Task row** with its own ID, journal,
folder, and run history. The source task is unmodified. Lineage is
recorded via the existing `parentTaskId` field so the relationship is
queryable later (sub-task tree, audit, "all variants of X").

This is **not** a "redo" verb on the existing task. It is **clone +
optionally edit + create**.

---

## 1 · Data model

### 1.1 Fields copied from the source task

The new task is created via `window.mc.createTask(input)` which uses
`CreateTaskInput` (see `src/renderer/src/global.d.ts`). Then a
`RUN_CONFIG.json` sidecar is written via `writeTaskRunConfig` (same
path as `CreateTaskForm.onSubmit`).

| Field on source | Copied? | Note |
|---|---|---|
| `id` | **No** — auto-generated (`<PREFIX>-<NNN>F`) | Immutable per CLAUDE.md naming conventions. |
| `title` | Yes, verbatim | User edits in form variant if desired. |
| `description` | Yes, verbatim | Same. |
| `project` | Yes | Pre-selected project; user may change in form variant. |
| `kind` | Yes (`single` / `campaign`) | See §4 for campaign behavior. |
| `items` | Yes when kind=`campaign` | Status reset to `pending` for every item; `notes` cleared. **Q1.** |
| `status` | **No** — defaults to `active` | Source could be archived; the clone is always fresh. |
| `runState` | **No** — defaults to `idle` | New task hasn't run yet. |
| `cycle` | **No** — defaults to `1` | Cycle is per-task, not lineage-wide. |
| `blocker` | **No** — defaults to `""` | Per-task state; doesn't carry. |
| `parentTaskId` | **No** — set to source task's `id` (see §1.2) | NOT copied from source's parent — re-running a child re-parents to the immediate source, not the grand-parent. |
| `createdAt` / `updatedAt` | **No** — set fresh by store | Standard. |

### 1.2 RUN_CONFIG.json carry-over

`RUN_CONFIG.json` is the source-of-truth for the workflow + inputs +
model override. It already exists for any task that was created with a
curated workflow, or that had Workflow… run on it.

Re-run reads source's `RUN_CONFIG.json` via `window.mc.readTaskRunConfig(srcId)`
and writes the same shape to the new task — minus `createdAt` (refreshed)
and with `taskContext` rewritten to the new title/goal/projectId.

| RUN_CONFIG path | Carry behavior |
|---|---|
| `kind` | Copied (`library-workflow-run` or `auto-gen`). |
| `libraryWorkflow.{id,name,logicalPath,diskPath,inputsSchemaPath}` | Copied verbatim. **Reservation R1** below. |
| `taskContext.{title,goal,projectId}` | Rewritten from the new task's values. |
| `runSettings.inputs` | Copied verbatim — this is the whole point of "same inputs." |
| `runSettings.model` | Copied verbatim. |
| `createdAt` | Refreshed to `new Date().toISOString()`. |

When source has **no RUN_CONFIG.json** (legacy tasks, or tasks created
before any workflow was assigned), the clone also has no
RUN_CONFIG.json. New task lands on the auto-gen path on Start, same as
the source would. No special-casing.

### 1.3 What does NOT carry over

- The journal (`events.jsonl`) — new task starts empty.
- `STATUS.md` and `PROMPT.md` — regenerated fresh on the new task's first Start.
- Run history table rows — they're derived from the journal, so empty by construction.
- Task-folder artifacts (`.metrics.json`, breakpoints, etc).
- Any `babysitter` `.a5c/runs/<runId>/` directories — those live in
  the workspace cwd (project path or `<userData>/tasks/<srcId>/workspace`),
  not in the source task folder. Untouched.

### 1.4 parentTaskId — argue for vs against

**For (recommended):** the field already exists with this exact
intent. `models.ts` line 99 says:

> Children are queried by scanning all tasks for matching parentTaskId
> (no inverse index — task counts are small and the scan is cheap).

Re-runs are exactly the cascading-creation pattern the field was added
for. Setting it gives the user free lineage UI later (e.g. "3 variants
of DA-017F" rendered as sub-rows) without any schema change.

**Against:** GH Actions and Inngest don't model lineage between
re-runs — they collapse them into a "run history" of the same job.
That model relies on having a stable parent (the workflow definition)
that owns the run history. MC doesn't have that (the workflow is at
`library/workflows/foo.js` and is referenced by many tasks across many
projects). Without a parent above the task, lineage between
re-runs **is** the only way to express "these belong together."

**Decision: set `parentTaskId = source.id`.** Cost is one field; benefit
is queryable lineage. If we later decide to render sibling tasks
together on Task Detail, the data is already there. **Q2:** should
re-running a re-run point at its immediate parent (chain) or the
original root (flat tree)? Recommend **chain** — matches Linear's
sub-issues and `models.ts` doc; users who want the root can walk up.

### 1.5 New task ID

Reuses the existing `<PREFIX>-<NNN>F` algorithm (see
`CreateTaskForm.tsx` `nextIdPreview`). No special "v2" or "-rerun"
suffix. The ID is opaque; lineage is in `parentTaskId`.

### 1.6 Reservations on the data model

**R1 — Workflow may have been edited or deleted.** `libraryWorkflow.diskPath`
points at a file under `library/workflows/`. Between source-task
creation and re-run, that file could be edited (Δ different process.js)
or deleted (rebuilt index, different name). RunManager will fail at
spawn time if missing.
**Mitigation:** on re-run, re-resolve the workflow by `logicalPath`
against the current `library/_index.json`. If found, use the **fresh**
`diskPath` + `inputsSchemaPath`. If the schema changed, run validation
on the carried inputs and surface a warning before submit (form variant)
or fail the immediate path with a clear error (same-inputs variant).
Don't silently use stale paths.

**R2 — Inputs may not match a changed schema.** If the workflow's
`inputs.schema.json` has new required fields since the source task ran,
the same-inputs path can't satisfy them. Behavior: **degrade to the
new-inputs path** — open the form, prefilled with what we have, with
the missing fields highlighted. Don't ship a clone that we know will
fail at start.

**R3 — Source task currently running.** See §4.5.

---

## 2 · UI states

### 2.1 Placement

Task Detail header, right side, with the existing `Edit · Workflow… ·
📁 Open folder · Archive · Delete · ← Dashboard` row. Insert **between
"Workflow…" and "📁 Open folder"** so adjacent buttons are conceptually
grouped: edit-this-task on the left, open/manage on the right, and
"create new task from this one" sits in the middle.

```
[Edit] [Workflow…] [↻ Re-run ▾]  [📁 Open folder] [Archive] [Delete] [← Dashboard]
```

### 2.2 Single button vs split button — recommend split

Two flavors, two click paths. Three options considered:

| Option | Pros | Cons |
|---|---|---|
| **A. Two separate buttons** ("Re-run" + "Re-run with…") | Fewest clicks, fully discoverable. | Header is already crowded (5 buttons + ticker + dashboard). Two more pushes to 8. |
| **B. Single button → modal with two CTAs** | Header stays small. | Extra click for the common case. |
| **C. Split button** ("Re-run" main · "▾" caret with "Re-run with new inputs…") | One click for the common case; menu reveals the override path. | Slight discoverability cost; have to know to click the caret. |

**Recommendation: C (split button).** Mirrors GH Actions' actual UI
("Re-run all jobs" with a chevron for "Re-run failed jobs"). Default
action is the no-friction one; secondary action is one extra click.
Caret menu items:

- **Re-run with same inputs** (= main button click; redundant for muscle memory).
- **Re-run with new inputs…** (opens `CreateTaskForm` pre-filled; ellipsis signals modal).

If a split button is too much custom CSS for v1, fall back to **A**
(two ghost buttons): `↻ Re-run` and `↻ Re-run with…`. **Q3.**

### 2.3 Copy + icon

- Main button label: `↻ Re-run`. Icon: `↻` (matches existing UI's
  use of single-char glyphs — see "↩ Unarchive" and "📦 Archive").
- Caret menu item: `Re-run with new inputs…`.
- Tooltip on main: "Create a new task with the same workflow and
  inputs and start it immediately."
- Tooltip on caret: "Pre-fill the Create Task form so you can edit the
  workflow, inputs, or model before starting."

No emojis beyond the `↻` glyph already used elsewhere — UI rule from
docs/UI-DESIGN.md.

### 2.4 Disabled / hidden states

| Source task state | Button shown? | Behavior |
|---|---|---|
| Has `RUN_CONFIG.json` (curated or auto-gen recorded) | Yes | Normal. |
| No `RUN_CONFIG.json` (never started, or pre-feature task) | Yes | Same-inputs path: clone with no RUN_CONFIG.json. New-inputs path: open form with workflow defaulted to "Auto-generate." |
| `isDemo` | **No** — same gate as Edit / Workflow… / Archive / Delete | Demo task isn't real persisted data. |
| `runState === "running"` | Yes, but **same-inputs path is blocked**: confirm dialog "Source task is still running. Clone with current inputs anyway?" | The clone is independent — running source isn't actually a problem, but it's worth a heads-up because the user may be expecting one task at a time. **Q4.** |
| `status === "archived"` | Yes | Archive doesn't mean immutable; the user explicitly opened the page. The clone defaults to `status: "active"`. |
| Source uses workflow that's been deleted from library | Yes, **but** same-inputs path errors with toast: "Source workflow 'cradle/foo' is no longer in the library. Re-run with new inputs to pick another." | Form variant prefills as auto-gen. |

### 2.5 No workflow on source (auto-gen path)

Same-inputs path: clone with no RUN_CONFIG.json (or with `kind:
"auto-gen"`). Start fires `/babysit` exactly as it would for the
source. The "inputs" being preserved are *just* the title +
description, since auto-gen has no schema-driven inputs.

Form variant: opens the form with workflow dropdown set to "Auto-generate."
User can swap in a curated workflow and add inputs if they want. Same
flow as creating a fresh task.

---

## 3 · Interaction flow

### 3.1 Same-inputs path — no modal

1. User clicks `↻ Re-run` on Task Detail header.
2. (Optional confirm dialog when source is running — see §2.4 / Q4.)
3. UI calls a new helper, e.g. `cloneTask(srcId)` (renderer-side; see §6).
4. Helper reads source task and `RUN_CONFIG.json`, calls
   `window.mc.createTask(input)` with copied fields, then
   `window.mc.writeTaskRunConfig(newTaskId, config)` if applicable.
5. After success, **navigate to the new task's detail page**
   (`setView("task")` + select new id). Toast at top: "Cloned from
   `DA-017F` — click to view source." Stays for 6s.
6. **Auto-Start question (Q5):** GH Actions' "Re-run" starts immediately.
   MC's same-inputs flow could mirror that — call
   `window.mc.startRun({ taskId: newId })` after creation. **Recommend
   YES — auto-start.** The whole point is "same as before, again, now."
   If that turns out to be wrong, it's one IPC call to remove. Surface
   in the toast: "Cloned and started — click to view." If auto-start
   fails (no auth, missing extension), the new task lands as `idle` and
   the toast says "Cloned (start failed: <reason>) — click to view."

### 3.2 New-inputs path — open CreateTaskForm pre-filled

1. User clicks caret → "Re-run with new inputs…" (or the dedicated
   button in option A).
2. `CreateTaskForm` opens. New prop `prefill?: TaskPrefill` (see §6.2)
   carries the source values.
3. Form behaves as today, but every field is pre-populated:
   - Project: source's `project`.
   - Workflow: re-resolved by `logicalPath` against current
     `library/_index.json`. If resolved → set; else default to
     auto-gen and show a hint "Source workflow not found in library."
   - Inputs: source's `runSettings.inputs`. Validation runs against
     the **current** schema (see §1.6 R2); missing required fields
     highlighted red.
   - Model: source's `runSettings.model` if present. (CreateTaskForm
     doesn't currently expose a model picker — see §6.4.)
   - Kind / items / title / description: copied.
4. User edits whatever, clicks Create.
5. Modal closes. **Q6:** navigate to new task or stay on source?
   **Recommend navigate** — same as today's CreateTaskForm
   ("publish('tasks'); close()" leaves the user wherever they were).
   For Re-run we want the new task's detail visible so the user can
   click Start. Override default behavior in this path.
6. Auto-start in this path: **NO** — user explicitly opted into the
   editing flow, they probably want to review before starting. Show
   the new task with a green "Cloned from `DA-017F`" banner at the top
   (replaces the current PROMPT.md card position only on first load,
   then dismisses).

### 3.3 Source-task survival

The source task is not modified. No event written to its journal. No
`updatedAt` change. `parentTaskId` lives on the **child**; the source
doesn't store a list of clones. (This matches the §1 docstring "no
inverse index — task counts are small and the scan is cheap.")

### 3.4 Lineage UI — out of scope for this spec

Rendering the parent → children tree on Task Detail is a follow-up
once `parentTaskId` carries data. v1 scope: write the field and trust
it'll be useful later. **Q7:** worth a tiny chip "Cloned from `DA-017F`"
on Task Detail header for the new task? Cheap, signals lineage, no
need for a tree view yet. Recommend **yes, ship in this PR**.

---

## 4 · Edge cases

### 4.1 Campaign tasks — do items copy?

`task.kind === "campaign"` carries an `items: CampaignItem[]` list.
Each item has `{ id, description, status, notes }`.

**Recommend: yes, copy items, with status reset to `pending` and notes
cleared.** Rationale: the user wants the *same campaign* re-run; that
means the same item list. Statuses and notes are run output; carrying
them would falsely suggest the new task already made progress.

Item IDs (`item-0001`, `item-0002`) are stable across the clone — no
need to regenerate them; they're item-local, not task-global.

In the new-inputs form, the "Items (one per line)" textarea is
pre-filled with the source descriptions (one per line). User can edit
freely.

### 4.2 Archived source task

Allow re-run. The Re-run button is shown regardless of `status` (only
gated on `isDemo`). The new task is created with `status: "active"`,
so re-running an archived task effectively un-archives the *idea*
without touching the source row.

**Reservation R4:** if the user keeps re-running archived tasks, the
clones pile up active. Consider a future "Archive source automatically
on re-run" toggle. v1: no auto-action.

### 4.3 Demo mode

`isDemo === true` — Re-run button is **not rendered** (same gate as
Edit / Workflow… / Archive / Delete). Demo tasks aren't persisted, so
cloning them would create a real task seeded with fake data, which is
worse than no button.

### 4.4 Source task with broken / missing RUN_CONFIG.json

Two failure shapes:

1. **File missing** (legacy task or never assigned a workflow). Treated
   as "no workflow" — clone has no RUN_CONFIG.json, lands on auto-gen.
   No error.
2. **File present but malformed** (corrupt JSON, missing fields). Today,
   `readTaskRunConfig` returns `null` on parse error (per current
   handling — see `ChangeWorkflowModal` `.catch(() => …)`). Treat as
   case 1. **Q8:** should we surface a one-line warning ("Source
   RUN_CONFIG.json couldn't be read; cloning without it")? Recommend
   yes, in the form variant; in the same-inputs variant it just lands
   on auto-gen silently.

### 4.5 Source task currently running (`runState === "running"`)

Two views:

- **Permissive (recommended):** allow it. Clones are independent. The
  clone gets its own pi session, its own `.a5c/runs/<runId>/`. No
  collision because run-id is babysitter-generated. Same-inputs path
  shows a confirm dialog ("Source is still running — clone anyway?")
  for safety; new-inputs path doesn't (the user is already editing,
  they know).
- **Restrictive:** block until source is `idle`. Avoids the
  "accidentally fired two of the same task" footgun, but it's
  paternalistic and the clone is genuinely independent.

**Recommend permissive with confirm on same-inputs path. Q4** (above).

### 4.6 Re-running a re-run

Set `parentTaskId` to the immediate source. Don't walk up to the root.
Lineage forms a chain. (See §1.4.)

### 4.7 Project deleted between source creation and re-run

`createTask` will fail because the project doesn't exist. Surface the
error to the user via the same toast/error path as a normal create
failure. No special handling.

### 4.8 Source-task workflow inputs schema removed

The source had `runSettings.inputs = { foo: "bar" }`; the workflow's
`inputs.schema.json` no longer exists. Today `InputsForm` falls back
to a free-form JSON view when schema is null, so the inputs render.
Same-inputs path: writes them through verbatim. Form variant: shows
free-form JSON, user can edit. No special handling needed beyond what
`CreateTaskForm` already does.

---

## 5 · Open questions

These need answers before implementation. Each is marked with **Q** in
the body above.

- **Q1:** Campaign items — copy with status reset, or only descriptions
  (rebuild items list from descriptions)? Recommend status reset; flag
  for review.
- **Q2:** `parentTaskId` on a re-run-of-a-re-run — chain (immediate
  parent) or flat (always root)? Recommend chain.
- **Q3:** Split button vs two ghost buttons in header? Recommend split;
  fall back to two if custom CSS is too much for v1.
- **Q4:** Confirm dialog when source is `running` for the same-inputs
  path? Recommend yes.
- **Q5:** Auto-start the new task on the same-inputs path? Recommend
  yes — that's the GH Actions model and the whole pitch.
- **Q6:** After form-variant create, navigate to new task or stay?
  Recommend navigate.
- **Q7:** Render a "Cloned from `<srcId>`" chip on the new task's
  header? Recommend yes; small win, lights up `parentTaskId`.
- **Q8:** Warn when source RUN_CONFIG.json is malformed? Recommend
  yes in form variant, silent in same-inputs variant.
- **Q9:** Should the source task get any visual marker that it has
  clones (e.g. badge with count)? **Out of scope** for v1 — needs the
  reverse-lookup query and a UI element. Defer.
- **Q10:** Toast persistence — 6 s default, or longer for the failure
  cases? Recommend 6 s normal, sticky-until-dismissed for errors.

---

## 6 · Implementation surface

Files that will change (one-line each, no code):

### 6.1 New

- `src/renderer/src/lib/clone-task.ts` — pure helper that takes
  `(srcTask, srcRunConfig)` and returns `{ createInput, runConfig | null }`.
  No IPC, no state. Unit-testable as a `.smoke.ts`.
- `src/renderer/src/lib/clone-task.smoke.ts` — covers carry-over rules,
  parentTaskId, campaign-items reset, missing RUN_CONFIG.

### 6.2 Modified

- `src/renderer/src/pages/TaskDetail.tsx` — add `RerunButton` (or
  split button) in the header row, between "Workflow…" and "📁 Open
  folder." Wire same-inputs handler + open-form handler.
- `src/renderer/src/components/CreateTaskForm.tsx` — add optional
  `prefill?: TaskPrefill` prop. When present, seed the relevant
  `useState` initialisers from it; show a "Cloning from `<srcId>`"
  banner at the top of the modal. Add an optional `onCreated?:
  (task: Task) => void` callback so the Re-run flow can navigate to
  the new task (current callers don't need it; pass-through, default
  to no-op).
- `src/shared/models.ts` — **no schema change** — `parentTaskId` is
  already there per the prompt context. Just consumed for the first
  time.
- `src/renderer/src/global.d.ts` — extend `CreateTaskInput` with
  optional `parentTaskId?: string`. Currently the type doesn't expose
  it; the store likely already accepts `Partial<Task>` fields, but
  verify.
- `src/main/store.ts` — `createTask` should accept and persist
  `parentTaskId` from the input. Verify whether it passes the field
  through Zod parse today; if not, add it. Tiny change.
- `src/renderer/src/lib/derive-phases.ts` (probably no change) —
  spot-check that a generic skeleton renders cleanly for a brand-new
  cloned task before its first Start. Should already be the case.

### 6.3 Possibly modified

- `src/renderer/src/components/TaskCard.tsx` (or wherever TaskCards
  render) — if Q7 lands as yes, render "↳ from `<srcId>`" chip when
  `parentTaskId !== ""`. Optional v1.5.

### 6.4 Not in scope but worth flagging

- `CreateTaskForm` does **not** currently expose a model picker (model
  override lives on Task Detail's Controls row). Carrying
  `runSettings.model` from the source therefore can't be edited in the
  form variant. Options: (a) add a model picker to CreateTaskForm
  (out of scope creep), or (b) document that model override is
  preserved silently and editable post-create on Task Detail
  (recommended for v1). **Q11.**

---

## 7 · Verification

### 7.1 Smoke tests (`scripts/verify-ui.mjs` — extend the `TODO(CC)` block)

- After Create Task flow lands, **clone same-inputs**:
  - Open Task Detail for the just-created task.
  - Click `↻ Re-run`.
  - Assert: a new task row exists in the Board with a fresh ID,
    `parentTaskId` matching the source ID, identical title +
    description, identical RUN_CONFIG.json on disk (sans `createdAt`).
  - Assert: navigation moved to the new task's detail page.
  - Assert (if Q5 = yes): `runState !== "idle"` within 2 s of the click.
- **Clone with new inputs:**
  - Click caret → "Re-run with new inputs…".
  - Assert: form opens with project / workflow / title / description
    pre-filled. Banner reads "Cloning from `<srcId>`."
  - Edit title, click Create. Assert new task has the edited title
    but the original workflow + inputs.
- **Edge: source archived.**
  - Archive a task, then re-run from its detail. New task should be
    `status: "active"`.
- **Edge: workflow logicalPath gone.**
  - (Manual or scripted) Move/rename a `library/workflows/foo` after
    a task is bound to it. Re-run with same inputs. Toast appears with
    error; new task lands without RUN_CONFIG.json (or as auto-gen).

### 7.2 Unit smoke (clone-task.smoke.ts)

- Identity: cloning a non-campaign task with full RUN_CONFIG carries
  every field per §1.1.
- Campaign: items copy, statuses reset to `pending`, notes empty.
- No RUN_CONFIG: returns `runConfig: null`.
- parentTaskId on a re-run-of-a-re-run = immediate source ID.

### 7.3 Manual checks

- Header layout doesn't wrap on a 1280-wide window with all buttons
  shown (CostTicker + Edit + Workflow… + ↻ Re-run + 📁 Open folder +
  Archive + Delete + ← Dashboard + cycle pill). If it wraps, drop
  to "Re-run" without the icon, or move ↻ Re-run + Workflow… into a
  "More…" overflow menu (separate refactor — not blocking).
- Demo project: Re-run button is hidden on demo task detail.
- Cloned task's PROMPT.md is regenerated on first Start (not copied).
- Cloned task's `.a5c/runs/<runId>/` is fresh (no collision with source).
- Two clones of the same source produce two independent tasks; deleting
  one doesn't affect the other or the source.

### 7.4 Type safety

- `npx tsc --noEmit -p tsconfig.web.json` clean after CreateTaskForm
  prop change.
- `npx tsc --noEmit -p tsconfig.node.json` clean after store.ts
  parentTaskId pass-through.
- `npm run smoke` clean (covers `clone-task.smoke.ts` once it lands).

---

## 8 · Out of scope

- Lineage tree UI on Task Detail (renders `parentTaskId` chain). v2.
- "Re-run failed items only" for campaigns (GH Actions' "Re-run failed
  jobs"). Useful, but distinct from the basic clone affordance.
  Tracked as a **follow-up** once campaign runtime iteration is wired.
- Bulk re-run from the Board. Multi-select + bulk actions are
  speculative (COMP-RESEARCH §S6).
- Hover-actions on TaskCard ("Re-run" without opening detail) —
  tracked as task #42 in COMP-RESEARCH §8.
- Re-run-with-different-workflow as a *replacement* for Workflow…
  modal. Out of scope: Workflow… is "edit existing task's workflow,"
  Re-run is "make a new task." Different verbs, both valid.
- Recording an event on the source task ("clone-spawned →
  `<newId>`"). Considered, rejected: source-task journal should be
  the source's run history, not lineage events. Lineage lives in
  `parentTaskId` and a future cross-task index.

---

## 9 · Reservations summary

Pulling the inline reservations into one place so they're easy to
push back on:

- **R1.** Workflow `diskPath` may be stale; always re-resolve by
  `logicalPath`.
- **R2.** Inputs schema may have changed; degrade to form path when
  same-inputs would fail validation.
- **R3.** Source running — permissive with confirm dialog.
- **R4.** Re-running archived tasks accumulates active clones with no
  cleanup; defer to a v2 toggle.
- **General:** the split-button UI is a small custom widget. If it
  doesn't fit the existing button system cleanly, fall back to two
  ghost buttons (option A in §2.2). Don't grind on the chrome.

---

## 10 · Definition of done

Re-run is "done" when:

1. A new task can be cloned from any non-demo task in ≤ 1 click for
   same-inputs and ≤ 3 for new-inputs.
2. The cloned task's `parentTaskId` matches the source's `id`.
3. The cloned task starts cleanly (curated workflow path or auto-gen)
   without manual recovery.
4. Source task is bit-identical before and after the clone.
5. `verify-ui` and `npm run smoke` pass.
6. UI-FLOW.md §8 row "Re-run / clone with changes" is flipped from ☐
   to ✓ in the same PR.
