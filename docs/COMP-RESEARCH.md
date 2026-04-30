# Comp research — orchestration + PM patterns

A survey of how other tools solve problems MC is solving, with explicit
recommendations for each new task idea (#29–#40 in the active list).
Includes "patterns worth adopting", "patterns to avoid", and a
**speculative-ideas appendix** for things I want to surface even if
I'm not sure they belong.

Reservations are called out explicitly. Some ideas land as KEEP
(adopt with confidence), some as ITERATE (good seed, needs reshape),
some as DROP (looked good but the analog doesn't transfer).

---

## How this doc relates to the codebase

MC is *orchestration software* dressed as a *project management UI*
for AI runs. So we look at both lineages:

- **Orchestration platforms** (Temporal, Airflow, Prefect, n8n,
  GitHub Actions) — they solve "track state of long-running multi-step
  processes." This is closer to MC's run lifecycle.
- **PM tools** (Linear, GitHub Projects, Asana, Trello, Notion) —
  they solve "human workflow with status, hierarchy, archival." This
  is closer to MC's task model.
- **AI agent UIs** (LangGraph Studio, AutoGen Studio, Langfuse) — the
  newest category; the most direct analog to what MC is.

Most existing AI agent UIs are immature. The interesting patterns
come from orchestration + PM, with a few exceptions.

---

## 1 · Orchestration platforms

### Temporal Web UI

**What's good**: the workflow run page splits into tabs — *History*
(ordered event log), *Pending Activities* (effects awaiting), *Stack
Trace* (current process state), *Children* (parent/child workflows),
and *Send Signal* (inject input from UI). The Pending Activities tab
groups effects by kind with state-colored chips.

**Adoptable**:
- Pending effects as a tab/panel that groups by kind — directly
  validates **#7 (Pending Effects panel)**.
- "Send Signal" UI for runtime user→workflow input — analog for
  **#36 (chat surface)**, but Temporal's is *typed* input, not
  freeform chat. Worth understanding the distinction before we copy.
- Children / parent links surface task lineage — validates the
  **`parentTaskId`** field shared by **#32 / #37 / #40**.

**Avoid**: their UI is dense and developer-targeted. Reading a Temporal
event history takes practice. MC users want a narrative ("here's what
happened"), not a raw event log.

**Reservation**: Temporal workflows are *deterministic replay*. MC's
are LLM-driven, so a time-travel-style UI may not transfer cleanly.
Babysitter SDK uses replay internally but the user shouldn't see it.

### Airflow UI

**What's good**: the gantt view shows each task in a DAG run as a
horizontal bar — start time, duration, retries — laid out on a single
timeline. Color-coded by state.

**Adoptable**: a gantt-strip of subagents + phases on TaskDetail
would *visualise* what we already collect via `derivePhases` and
`deriveSubagents`. Could be the "polish" pass for **#23 (Subagents
rail)**.

**Avoid**: the DAG declaration model. Airflow tasks are static —
Python code defines edges before the run starts. MC's workflow is
emergent (the agent decides). Don't show edges that don't exist.

### Prefect Cloud (modern Airflow successor)

**What's good**: notifications are first-class — you configure rules
("notify me when a flow run is stuck > 30 min") in the UI and they
fire to email / Slack / webhook.

**Adoptable**: notification rules surface for **#38 (input routing
+ global indicator)**. But MC is desktop-local, so OS notifications
are the channel, not email/Slack.

**Avoid**: their tagging + work pool model is over-engineered for our
single-user, single-machine scope.

### n8n / Inngest

**What's good**:
- n8n: every node has an "execute step" button that re-runs that step
  with the upstream data. Good for debugging.
- Inngest: "replay run with overrides" — change input values and
  re-execute from a chosen step.

**Adoptable**: validates **#5 (Re-run / clone)**. The good model is
"clone with overrides", not "rerun from scratch."

**Avoid**: the visual node editor (both have one). MC's workflows
are code on disk — that's the right model. Don't bolt a visual editor
on top.

### GitHub Actions

**What's good**: a "Re-run failed jobs" button at the top of any run
page. One click, no confirmation. Plus "Re-run all jobs" for the
fresh-start case.

**Adoptable**: directly maps to **#5 (Re-run / clone)** — two buttons,
not a wizard. "Re-run with same inputs" + "Re-run with new inputs."

---

## 2 · AI agent platforms

### LangGraph Studio

**What's good**: step-through agent execution. Pause, inspect the
graph state at each step, edit state, resume. Time-travel within a
run.

**Adoptable**: validates **#36 (chat surface)** as a *debugging*
affordance, not just a chat. The orch isn't a passive recipient — the
user is poking at state. Reservation: this is heavy. MVP is a
freeform message-the-agent panel; full state inspection is a v2.

**Avoid**: their UI is laid out for graph-thinkers (LangGraph is
graph-of-nodes). MC's tasks aren't graphs visible to the user.

### AutoGen Studio

**What's good**: per-agent conversation history pane — every message
the agent sent and received, expandable.

**Adoptable**: per-subagent conversation history (relates to RightBar
+ SubagentsPanel + #23 polish). MC has the journal data; the
presentation could be richer.

**Avoid**: their in-UI YAML editor for agents and workflows. Fragile,
loses on-disk authority. Validates the **reservation on #31** — don't
try to fully edit library entries in a modal.

### Langfuse

**What's good**: trace inspection (every LLM call's input / output /
cost / latency) + cost rollups by user / model / day.

**Adoptable**: cost rollup is already on ProjectDetail's
RunMetricsCard. Token / cost as a Topbar element (running total) is
a nice-to-have; flagged as **S4** in the speculative appendix.

**Avoid**: it's an observability tool, not orchestration. The
trace-as-primary view is wrong for MC where the journal+chips+cards
are the primary view.

---

## 3 · PM tools

### Linear

**What's good**:
- **Sub-issues** (parent → children) with "auto-add to parent's
  cycle" semantics
- **Triage view** — incoming issues that haven't been categorised
  yet; one-click to assign to a project / cycle / status
- **Archive** as a soft-delete state (we just shipped this for tasks)
- **Linked issues** (relates-to, blocks, duplicates) — generic ref
  graph
- Views are saved filters, not separate hierarchies

**Adoptable**:
- Sub-issues directly map to `parentTaskId` for **#32 / #37 / #40**
  — the canonical model is "child knows its parent; parent doesn't
  enumerate children." Render the children inline on the parent page
  via a query.
- Triage view validates **#39 (workflow selection prominent in draft)**
  — draft tasks are MC's triage queue. A "Drafts" tab on the Board
  is closer to Linear's pattern than promoting CTAs in TaskDetail.
- Linked issues = MC's reference picker for **#33** but generalised
  beyond library entries (a task could "relate to" another task).
  Worth surfacing as **S1** in the speculative appendix.

**Avoid**: cycles / teams / initiatives. MC is single-user; this
hierarchy is overkill.

### GitHub Projects

**What's good**: multi-view per project — Board / Table / Roadmap
all read the same data, just laid out differently. User picks the
layout that fits the moment.

**Adoptable**: validates **#27 (Board layout decision)**. The right
answer is probably "both" — keep the kanban as default, add a Table
view for dense scanning. Custom filters per view.

**Reservation**: triple maintenance. Don't ship until the value is
clear. Surfaces as **S2** in the speculative appendix.

**Avoid**: custom field engine. MC's domain is fixed.

### Trello

**What's good**: cards have always-visible "quick actions" on hover
(rename, label, archive, due-date) without opening the card.

**Adoptable**: hover-actions on TaskCard could surface Archive +
Re-run inline without a click-through. Cheap win once **#5** lands.

**Avoid**: drag-and-drop status changes. MC's status is run-state-
derived, not user-set. Drag would lie.

### Asana

**What's good**: every task can be a sub-task of another, *and* a
member of any number of projects. Many-to-many.

**Reservation**: many-to-many is overkill for MC's scope. Surfaces as
**S6** below — drop unless we hit the use case.

### Notion

**What's good**: relations between databases (a Task references a
Skill, etc.). Generic graph.

**Adoptable**: validates the **reference picker for #33** — refs as
typed links between library entities + tasks. But Notion's UI for
managing relations is mediocre; don't copy verbatim.

### Jira

Skipped. Heavy ceremony, sprint planning, enterprise-shaped. Nothing
transfers cleanly to MC.

---

## 4 · Patterns worth adopting (synthesis)

These show up in 3+ tools and have direct MC analogs:

| Pattern | Source | MC ticket |
|---|---|---|
| Pending effects panel grouped by kind | Temporal | #7 |
| Re-run with overrides (button on run page) | GH Actions, Inngest, n8n | #5 |
| Sub-issues / parent-child links | Linear, Asana | #32, #37, #40 |
| Triage / drafts queue as a view | Linear | #39 |
| Notification rules → channel surface | Prefect, GH | #38 |
| Linked-items reference graph | Linear, Notion | #33 |
| Multi-view per project (Board, Table, Roadmap) | GH Projects | #27 + S2 |
| Per-agent conversation history | AutoGen Studio | #23 |
| Step inspection / state intervention | LangGraph Studio | #36 |
| Hover-actions on cards | Trello | new (small) |

---

## 5 · Patterns to avoid (synthesis)

| Pattern | Source | Why it's wrong for MC |
|---|---|---|
| Visual node-based workflow editor | n8n, Flowise, AutoGen | MC's workflows are code on disk; visual editor fights that |
| In-UI YAML / file editing for library | AutoGen Studio | On-disk authority; opening in $EDITOR is the right escape |
| Static DAG declared upfront | Airflow | MC's structure emerges per run |
| Custom field engine | GH Projects, Notion | Single-domain app; fixed schema is fine |
| Sprint / cycles / teams ceremony | Jira, Linear | Single-user; no team coordination |
| Drag-drop status changes | Trello | MC's status is derived, not set |
| OS-level notifications | Prefect, Slack-bots | Desktop tool; in-app indicator is enough |
| Time-travel debugging surfaced to user | LangGraph | Babysitter does replay internally; surfacing it confuses |

---

## 6 · Per-idea vetting (#29–#40)

For each new idea, the comp research recommendation:

### #29 — Library catalog refresh button
**Recommendation: KEEP.** Standard admin pattern (Temporal "reload
namespace", Airflow "refresh DAGs"). Implementation: in-process walk
via `library-walker`, not spawning the npm script. Toast on
success/error.

### #30 — Per-task worktree toggle
**Recommendation: ITERATE.** No clean comp analog — closest is
Inngest's "replay with overrides" but they don't fork the workspace.
**Reservation**: worktree management has a long tail (cleanup,
branch lifecycle, conflicts with the user's open editor session,
leaked branches). Start manual: a "📂 Open in worktree" button that
*creates* the worktree but doesn't manage cleanup. User cleans up
themselves until we've felt the pain. Don't auto-delete worktrees on
task delete in v1.

### #31 — Library "+ Create" surface
**Recommendation: ITERATE.** AutoGen Studio's in-UI YAML editing
**failed** — fragile and disagrees with the on-disk source of truth.
The right v1 is **scaffolding**: the modal collects basic fields,
generates skeleton files on disk under `library/<kind>/<slug>/`, then
opens them in the user's editor (`shell.openPath`). User edits the
content where they edit any other code. The modal's job is to get
the boilerplate right, not to be a code editor.

### #32 — Cascading / system-generated tasks
**Recommendation: ITERATE.** Linear's sub-issues are the canonical
model — `parentTaskId` field, children rendered inline on parent.
**Reservation**: auto-spawning is dangerous when detection misfires.
The safer model is **suggestion**: detection produces a "missing
skill: `xxx`" notice on the agent's edit page, with a "Create task
to author this skill" button. User clicks → child task spawned. Same
schema, different trigger.

### #33 — Library Create with reference picker
**Recommendation: KEEP.** Linear linked-issues + Notion relations
both validate. Storage: refs inline in entry frontmatter (one file per
entity is the existing pattern; don't add a separate refs.json).
Runtime: refs are *hints to the agent's prompt assembly*, not
hard imports. Library walker tracks ref relationships for the picker.

### #34 — Audit pass
**Recommendation: KEEP.** Running it now (companion doc).

### #35 — Comp research
**Recommendation: KEEP.** This is it.

### #36 — Terminal / chat surface
**Recommendation: ITERATE.** LangGraph Studio + Temporal signals
both validate the *intent*. Reservation: this is a heavy feature with
a lot of failure modes (what does "skip this step" actually do? Does
the agent honor it?). MVP scope: a single text box that calls
`pi.session.steer(text)`. Investigate first whether `steer()` actually
does what we want — if pi just queues it as a follow-up message,
then it's not really *intervention*. If it interrupts the current
turn, we have something. **Spend 30 min reading pi-coding-agent's
session.steer source before designing the UI.**

### #37 — Doctor / spin-off task pattern
**Recommendation: KEEP.** Linear sub-issues, with a specific trigger:
"Spin off doctor task" button on stuck/failed Task Detail. Workspace
**shared** with parent (most useful default — the doctor needs to see
what's broken). Starter prompt template: "Diagnose why <parent task>
got stuck at <last phase>. Read STATUS.md and events.jsonl." Same
`parentTaskId` infrastructure as #32 / #40.

### #38 — Input routing audit + global indicator
**Recommendation: KEEP.** GitHub's pending-review banner is the
model — a single colored pill in the Topbar showing "N tasks
awaiting input." Click → the count opens a small list, click on a
row → navigate to that task. Sources to surface: mc_ask_user,
breakpoint_opened, missing inputs at Start, runConfig validation
errors. **Don't** use OS notifications; they're the wrong channel
for a desktop app the user is already focused on.

### #39 — Workflow selection prominent in draft
**Recommendation: KEEP, but reshape.** Linear's triage view is the
better pattern than promoting a CTA. The reshape: a **Drafts tab/
filter on the Board** that surfaces all draft tasks across projects
with their assigned-or-unassigned workflow visible. Picking a
workflow on a draft task is a one-click action *from the Drafts
tab*, not a journey through Task Detail. Combine with **#10 (model
badge)** so the draft card shows: title, project, workflow-or-(none),
model-or-(default).

### #40 — Planning task that spawns subtasks
**Recommendation: ITERATE.** Asana's "Convert to project" + Linear
initiative→issues both validate. **Reservation**: bulk-spawning is
dangerous. The right shape: planning task produces a *proposal* (a
list of suggested tasks) the user reviews; "Create N tasks" button
commits the batch. Schema: planning task has its own
`status: "proposing" | "proposed" | "committed"` micro-state, plus
the `parentTaskId` infrastructure for the children.

---

## 7 · Speculative ideas — surface for review

The user explicitly asked me to list bad/speculative ideas with
reservations. Each gets a recommendation, but more importantly a
reservation that explains why it might be wrong.

### S1 — Generic linked-tasks (relates-to, blocks, duplicates)
**Source**: Linear linked-issues.  
**Idea**: a typed graph between tasks beyond just parent/child. "TaskA
*blocks* TaskB", "TaskA *duplicates* TaskB."  
**Reservation**: parent/child (#32/#37/#40) covers the most common
case. Adding a generic graph adds UI surface (Linked-tasks panel,
"add link" affordance) for marginal value in a single-user tool.  
**Recommendation**: DROP unless we hit a real use case post-#37.

### S2 — Multi-view per project (Board / Table / Roadmap)
**Source**: GitHub Projects.  
**Idea**: same task list, three layouts. User picks per moment.  
**Reservation**: triple maintenance. The Board kanban + ProjectDetail
already cover the common views. A Table view might be useful for
bulk-scanning across many tasks; Roadmap (gantt) only matters when
tasks have dates we don't track.  
**Recommendation**: ITERATE — only build a Table view, only when the
user has 50+ tasks and the Board feels cramped. Defer.

### S3 — Templates as a first-class UI surface
**Source**: Linear templates.  
**Idea**: surface WorkflowRunTemplates not as a Settings sub-list but
as a "+ Run from template" button on the Library page.  
**Reservation**: small concept; promoting it to a primary surface
might oversell it.  
**Recommendation**: ITERATE — fold into **#8 (Templates loadable
from Create Task)** rather than a separate surface.

### S4 — Cost / token rollup as a Topbar element
**Source**: Langfuse, Helicone.  
**Idea**: live cost ticker in the Topbar showing today's spend.  
**Reservation**: a desktop tool isn't a billing dashboard. The
RunMetricsCard on TaskDetail is enough for per-task; the
ProjectDetail rollup covers per-project. A global ticker is one
glance for one user.  
**Recommendation**: DROP (or KEEP if you specifically want the
budget-watching habit).

### S5 — Workflow versioning
**Source**: nothing direct — speculative.  
**Idea**: what if workflow.js is edited mid-run? Pin the workflow
version per run.  
**Reservation**: babysitter SDK already snapshots the entry on
`run:create`. Mid-run edit doesn't affect the running iteration.
This isn't a real problem yet.  
**Recommendation**: DROP.

### S6 — Bulk actions on Board (multi-select)
**Source**: Trello, Linear.  
**Idea**: Cmd-click cards, bulk-archive, bulk-rerun.  
**Reservation**: single-user tool with low task counts. Multi-select
is rarely used in tools that have it.  
**Recommendation**: DROP unless you're routinely doing 5+ same-action
flows.

### S7 — Drag-drop status changes on Board
**Source**: Trello.  
**Idea**: drag a card from "Active" to "Done."  
**Reservation**: status is run-state-derived (running, paused, done).
Dragging would *lie* — you'd be setting a value the system
re-derives. Confusing.  
**Recommendation**: DROP.

### S8 — Search / command palette (Cmd-K)
**Source**: Linear, GH, VS Code.  
**Idea**: keyboard-driven nav.  
**Reservation**: small app, ~6 views. The sidebar covers it.  
**Recommendation**: ITERATE later — useful when task counts grow.
Track as a possible *post-shipping* enhancement.

### S9 — Activity feed / notification center (Topbar bell)
**Source**: Linear, GitHub, Slack.  
**Idea**: a bell icon with a feed of "task X started", "task Y
needs input", etc.  
**Reservation**: the global indicator from **#38** covers
"awaiting input" — the most actionable. A general feed adds noise.  
**Recommendation**: FOLD INTO #38. Keep the Topbar pill scoped to
input-needed; don't expand to a general feed.

### S10 — "Unread" markers on tasks the user hasn't visited since the last event
**Source**: GitHub PR review states.  
**Idea**: a dot on the task card for "events have happened since you
last looked."  
**Reservation**: requires tracking last-viewed-at per task per user.
Single-user simplifies this but it's still state we don't have.  
**Recommendation**: ITERATE — could be useful but only if the user
runs many concurrent tasks.

### S11 — Hover-actions on TaskCard
**Source**: Trello.  
**Idea**: Archive / Re-run / Open buttons that appear on hover, no
click-through to TaskDetail.  
**Reservation**: small surface; could conflict with mobile-style
tap-to-open.  
**Recommendation**: KEEP after #5 lands. Cheap UX win.

### S12 — Inline run-status indicator on TaskCard (animated dot, pulse)
**Source**: GitHub Actions, Vercel.  
**Idea**: a pulsing dot for running tasks, static for paused, etc.  
**Reservation**: today the card uses pill colors. Adding a dot is
double-encoding state.  
**Recommendation**: DROP — pill is enough.

### S13 — Per-task changelog / diff view
**Source**: GitHub commits + diff.  
**Idea**: when a task has run, show what files changed in the
project since the run started.  
**Reservation**: requires git integration on every project. Not a
generic capability.  
**Recommendation**: ITERATE — interesting but blocked on per-project
git status detection that's already partially built (`git-detect.ts`).
Worth tracking once #28 (artifacts split) makes file-write events
visible.

---

## 8 · New tasks this research surfaces

Three additions to the active list, plus a category recommendation:

**#41. Drafts tab on Board** — combine #39 (workflow selection
discoverability) with Linear's triage pattern. Cross-project view of
all draft tasks with their workflow / model / kind shown inline.
Click a draft → quick assign workflow + model without leaving the
tab.

**#42. Hover-actions on TaskCard** — Archive / Re-run / Open buttons
that appear on hover. Cheap UX win once #5 (Re-run/clone) lands.

**#43. "Spawned from" / "Spawns" panel on TaskDetail** — shared
infrastructure for #32 / #37 / #40. Reads `parentTaskId` and the
inverse query (children whose `parentTaskId` is this task). Single
component, used by all three features.

**Schema decision needed before #32 / #37 / #40 / #43 land**: add
`parentTaskId: string | null` to `TaskSchema`. This is a "STOP and
ask" item per CLAUDE.md.

---

## 9 · How this should shape the active list

Recommended next-pass priorities, informed by this research:

1. **Schema decision** on `parentTaskId` — gates #32 / #37 / #40 /
   #43.
2. **#5 Re-run / clone with overrides** — well-validated pattern
   (GH Actions, Inngest, n8n). Direct user value.
3. **#41 Drafts tab + #39 workflow discoverability** — Linear's
   triage view applied to MC's draft state.
4. **#33 Library Create with refs picker** — solid pattern, no
   architectural risk.
5. **#7 Pending Effects panel broadening** — Temporal validates the
   shape.
6. **#36 Terminal / chat surface** — but spec only after reading
   `pi.session.steer()` source so we know what's actually possible.

**Defer or drop**:
- S1 (generic linked-tasks), S4 (cost ticker), S5 (workflow
  versioning), S6 (bulk actions), S7 (drag-drop status), S12
  (animated card dot)

**Iterate / fold**:
- #31 (Library Create) — reshape to "scaffolding only"
- #32 (cascading) — reshape to "suggestion, not auto-spawn"
- #40 (planning) — reshape to "proposal → user commits"
- S2 (multi-view) — defer until task count justifies
- S9 (activity feed) — fold into #38
- S13 (changelog) — track until artifacts story lands
