# Feature plans — deep dives, one per missing piece

Each section below stands alone. Pick a feature, read the section, ship
it. No section requires reading the others. Everything points at concrete
files, function signatures, and Zod schema deltas so the work can be
executed without re-deriving the design.

Sections are sorted by load-bearingness, not estimated effort. Effort
hints are in the section header.

Conventions used throughout:

- **Module map** — files to create (✚) or modify (✎)
- **Data shape** — what changes in `src/shared/models.ts`
- **Step-by-step** — order of operations; each step ends in a smoke or
  typecheck so you don't accumulate breakage
- **Verify** — what proves the feature is done
- **Open** — the questions you should answer before writing code

---

## 1. Plannotator hand-off

> Effort: M (1–2 days, gated on plannotator's invocation surface)
> Replaces: hand-rolled Approve / Request-changes buttons in the
> Approval gate

### Why

Today's Approval lane is two buttons in `TaskDetail.tsx` that flip the
lane. Plannotator is the actual annotation/approval tool — it lets a
reviewer mark up the planner's artifact with structured comments and
return either approve or reject-with-deltas. Wiring it gives the
reviewer the full review experience and gives the loop-back richer
input than "loop back, no notes."

### Open

1. **What surface does plannotator expose?** Three options seen in the
   ecosystem: a CLI binary (`plannotator review --file ...`), a pi
   extension (`/plannotate <path>` slash command), or a local web
   server. The choice changes everything below. **Ask Michael / read
   plannotator's README before starting.**
2. **Where does the planner artifact live?** Today the planner writes
   to `<taskId>-p.md` in the task folder (per the `taskFile` helper).
   Plannotator must accept that path or we add a copy step.
3. **What's the structured-feedback shape?** Best guess: an array of
   `{ section: string; comment: string; severity: "info" | "issue" }`
   plus a top-level decision `"approve" | "request-changes"`.

### Module map

- ✚ `src/main/plannotator-launcher.ts` — spawn helper. Wraps whatever
  invocation surface plannotator exposes; returns the structured
  feedback. Mirrors the shape of `git-detect.ts` (small, focused, smoke
  testable).
- ✚ `src/main/plannotator-launcher.smoke.ts` — feeds a stub artifact
  through whatever mock plannotator exposes and asserts the parsed
  feedback shape.
- ✎ `src/main/ipc.ts` — new channel `plannotator:review` taking
  `{ taskId: string }`, returning `PlannotatorResult`.
- ✎ `src/preload/index.ts` — expose `reviewWithPlannotator`.
- ✎ `src/renderer/src/global.d.ts` — type the new method.
- ✎ `src/renderer/src/components/ApprovalGate.tsx` (currently inline in
  `TaskDetail.tsx` — extract while you're here) — replace the two
  buttons with a primary "Open in Plannotator" button + a fallback
  "Skip review (manual approve)" link.
- ✎ `src/main/store.ts` — `appendEvent` for two new event types:
  `plannotator-launched` and `plannotator-returned` (the latter
  carrying the parsed feedback).

### Data shape

```ts
// src/shared/models.ts
export const PlannotatorFeedbackSchema = z.object({
  decision: z.enum(["approve", "request-changes"]),
  comments: z.array(z.object({
    section: z.string().default(""),
    comment: z.string().default(""),
    severity: z.enum(["info", "issue"]).default("info"),
  })).default([]),
  reviewer: z.string().default(""),     // user-supplied or env-derived
  reviewedAt: z.string().datetime(),
});
export type PlannotatorFeedback = z.infer<typeof PlannotatorFeedbackSchema>;
```

Two new event types in `TaskEventSchema`:

```ts
{ type: "plannotator-launched", artifactPath: string }
{ type: "plannotator-returned", feedback: PlannotatorFeedback }
```

### Step-by-step

1. Add `PlannotatorFeedbackSchema` + the two event variants. Smoke-test
   `models.ts` parse round-trip. Typecheck.
2. Write `plannotator-launcher.ts` against a stub. Get the smoke green
   without the real binary.
3. Wire IPC + preload + global.d.ts. Typecheck both tsconfigs.
4. Replace the two buttons. Hide them behind a `settings.plannotator =
   "auto"` toggle so the manual buttons stay reachable while you're
   verifying the launcher.
5. On `plannotator-returned`, write the feedback as a markdown
   appendix to `<taskId>-p.md` so the developer agent reads the
   notes verbatim on the loop-back.
6. Verify-ui: open Approval lane, click "Open in Plannotator", assert
   the launcher fires (mock the binary in test mode).

### Verify

- `events.jsonl` contains exactly one `plannotator-launched` followed by
  one `plannotator-returned` per click.
- Loop-back: a "request-changes" decision moves the task back to plan
  with `cycle += 1` AND the planner's artifact has the feedback
  appended.
- Old manual buttons still work when plannotator binary isn't
  installed.

---

## 2. Pause / Resume actually affecting pi

> Effort: S (half day, mostly testing)
> Today's bug: clicking Pause flips `runState` but pi keeps spending
> tokens until its current turn finishes naturally.

### Why

Pause is a lie. The user clicks Pause expecting "stop spending money."
We update local state but don't tell pi. On a long run that's already
queued 8 tool calls, pi blasts through all 8 before noticing. Same for
Resume — we flip state but don't unblock anything because pi never
blocked.

pi has two methods we're not using:
- `session.steer(message)` — interrupt the current turn, inject the
  message, agent considers it next.
- `session.followUp(message)` — wait for the current turn to finish,
  then send a new turn with this message.

Pause should `steer("[paused by user — wait for resume signal]")`.
Resume should `followUp("[resumed — continue from where you left
off]")`. Stop should call pi's `session.dispose()` plus our existing
state flip.

### Open

1. **Does steer actually halt token spend, or just queue a message?**
   Test before relying on it. If steer doesn't truly halt, we may
   need to capture an `AbortController` from pi's session creation and
   call abort instead.
2. **What state does the agent return to on Resume?** If pi snapshots
   conversation context per turn, Resume should be straightforward.
   If it doesn't, we may need to `pi:agent_end` and create a fresh
   session pointing at the same task folder. Pi's session manager
   already handles this for `stop`.

### Module map

- ✎ `src/main/pi-session-manager.ts` — add `steer(taskId, msg)` and
  `followUp(taskId, msg)` methods that look up the live session and
  call through to pi.
- ✎ `src/main/run-manager.ts` — `pause()` and `resume()` are currently
  state-only. Make them call `pi.steer()` / `pi.followUp()` and emit a
  new `pi:steer-sent` event so the journal shows the interruption.
- ✎ `src/main/pi-session-manager.smoke.ts` — exercise steer/followUp
  against a stub session.

### Data shape

No new persistent schema. One new event variant for the journal:

```ts
{ type: "pi:steer-sent", reason: "pause" | "resume" | "user-message", message: string }
```

### Step-by-step

1. In `pi-session-manager.ts`, surface `steer` and `followUp` on the
   public API. Smoke-test against a fake session that records the
   calls.
2. In `run-manager.ts`, change `pause()`:
   - emit `run-paused` (existing)
   - call `piSessionManager.steer(taskId, "[paused by user]")`
   - emit `pi:steer-sent` with reason "pause"
3. Same for `resume()` with `followUp` and reason "resume".
4. UI: no change. The Pause/Resume buttons already exist; their
   handlers just need to flow through the updated run-manager.
5. Verify: kick a real run, click Pause, watch `events.jsonl` —
   expect to see `pi:steer-sent` followed by NO further
   `pi:turn_start` events until Resume.

### Verify

- Manual run with /yolo. Pause mid-run. `events.jsonl` shows
  steer-sent, no further turn_start until resume.
- Cost ticker on Task Detail freezes during pause (pi:turn_end events
  stop landing).
- Resume works without losing context (the agent continues coherently,
  not from scratch).

---

## 3. Subagent spawn tracking — first-class rows

> Effort: M (1 day, mostly UI; relies on installing pi-finder + pi-librarian)

### Why

`SubagentSpawnSchema` already exists (`src/shared/models.ts:310`). The
event-stream filter in `RightBar` already recognizes
`pi:subagent_spawn` and `pi:subagent_complete`. What's missing:

- Pi-finder + pi-librarian aren't installed, so spawn events never fire.
- Even if they fired, we don't persist them anywhere durable. They land
  in `events.jsonl` but there's no per-spawn JSON file the UI can list
  alongside primary runs.
- No UI surface beyond the right-rail row — Task Detail's Run History
  table doesn't include subagents.

### Open

1. **What does pi-subagents emit on spawn?** Documented event shape:
   `{ type: "pi:subagent_spawn", spawnId, parentAgentSlug, agentSlug,
   reason }`. Confirm during install.
2. **Per-spawn folder layout?** Proposed:
   `tasks/<id>/spawns/<spawnId>.json` — one file per spawn. Mirrors the
   `runs/` layout, easy to list + render.
3. **Display rule:** show subagents inline in the Run History table
   with a small ⤴ icon, indented under their parent run? Or a separate
   "Subagent activity" section?

### Module map

- ✚ `src/main/spawn-store.ts` — write `<spawnId>.json` files, list,
  load. ~80 LOC.
- ✚ `src/main/spawn-store.smoke.ts`.
- ✎ `src/main/store.ts` — when `pi:subagent_spawn` event lands, write a
  spawn record. When `pi:subagent_complete` lands, update endedAt +
  exitReason on the record.
- ✎ `src/main/ipc.ts` — channel `tasks:listSpawns(taskId)`.
- ✎ `src/preload/index.ts` + `global.d.ts` — expose + type.
- ✎ `src/renderer/src/lib/derive-runs.ts` — extend `DerivedRun` with
  `subagents: SubagentSummary[]`. Walk the same event stream; bucket
  spawn/complete pairs into the parent run by timestamp.
- ✎ `src/renderer/src/pages/TaskDetail.tsx` — `RunHistory` table gains
  an expandable "▸ N subagents" row that opens an inline list.

### Data shape

`SubagentSpawnSchema` already exists; just persist it. Add nothing.
Event variants we already filter for in RightBar:

```ts
{ type: "pi:subagent_spawn",    spawnId, parentAgentSlug, agentSlug, reason? }
{ type: "pi:subagent_complete", spawnId, exitReason, durationMs? }
```

### Step-by-step

1. `pi install npm:@mariozechner/pi-finder pi-librarian` (or whichever
   subagents you actually want — see `docs/PI-EXTENSIONS-SURVEY.md`).
   Verify with the existing `scripts/list-pi-extensions.ts` probe.
2. Build `spawn-store.ts` + smoke. Don't wire it yet.
3. Hook `store.ts.appendEvent` to call `spawn-store` on the two event
   types. Keep events.jsonl writing exactly as-is (don't break the
   existing event stream).
4. Verify with a real run: spawn folder populates, JSONs are
   schema-valid.
5. Wire IPC + preload + types.
6. Extend `derive-runs.ts` to attach subagent summaries to their
   parent runs.
7. Update Run History UI. Add the small ⤴/⤵ glyph from RightBar's
   `iconForEvent`.

### Verify

- After a real run with subagents, `tasks/<id>/spawns/` has one JSON
  per spawn, all schema-valid.
- Run History row shows "▸ 2 subagents" expander; clicking expands.
- RightBar row click navigates to Task Detail and scrolls to the run.

---

## 4. pi-memory-md wire-up

> Effort: S (half day) — currently paused per user request

### Why

pi-memory-md gives agents per-project persistent memory at
`~/.pi/memory-md/<project>/`. Without it, every run starts cold; with
it, agents carry forward learned conventions, project-specific
gotchas, and prior task context across runs.

### Open

1. **Is the npm tarball still missing `tape/utils.ts`?** Last attempt
   needed a manual git-clone patch. Re-test on the current pi-memory-md
   release before wiring.
2. **Memory key — project ID or path?** Pi-memory-md keys by string.
   `Project.id` (slug) is stable, short, and matches the task ID
   prefix scheme. Use that.
3. **Does memory survive project rename?** No — `Project.id` is
   immutable (CONFIRMED in CLAUDE.md). Renaming "name" doesn't break
   memory.

### Module map

- ✎ Install: `pi install npm:@mariozechner/pi-memory-md` (or
  whatever the package ends up named — verify before relying).
- ✚ `src/main/memory-bridge.ts` — thin shim that ensures
  `~/.pi/memory-md/<projectId>/` exists when the project is opened.
  Pi handles read/write via its own tools.
- ✎ `src/main/run-manager.ts` — when starting a run with a project
  that has a path, call `memoryBridge.ensureForProject(project.id)`
  before `pi.start()`.
- ✎ `src/renderer/src/pages/ProjectDetail.tsx` — tiny "Memory: X
  entries · last updated YYYY-MM-DD" line + a "📁 Open memory folder"
  button. Read-only display; pi tools edit the actual content.

### Data shape

No persistent schema change. Memory is pi's responsibility.

### Step-by-step

1. Reinstall pi-memory-md, run `scripts/list-pi-extensions.ts`,
   confirm it loads cleanly. If utils.ts is still missing, file the
   issue upstream + skip.
2. Add `memory-bridge.ts` (10–20 LOC; just `mkdir -p` + a
   `getStats(projectId)` helper).
3. Run-manager seam: ensure folder before pi session create.
4. Project Detail surface.
5. Verify: run two consecutive tasks against the same project. Memory
   tools (per pi-memory-md docs) should show the second run reading
   from the first.

### Verify

- `~/.pi/memory-md/<projectId>/` populates after first run.
- Manual: tell agent in run #1 "remember that this project uses tabs
  not spaces"; run #2 (same project) honors the convention without
  being told.

---

## 5. pi-superpowers role prompts

> Effort: M (1 day) — touches every agent prompt

### Why

`agents/<slug>/prompt.md` are hand-rolled, reasonably good, but
duplicate skills pi-superpowers already packages: brainstorming,
planning, TDD, code-review, etc. Replacing them with skill references
gives us:

- shared improvements when pi-superpowers updates
- consistent skill names across agents
- shorter local prompts (the "what" is referenced; we keep the "who")

### Open

1. **What's the reference syntax?** pi-superpowers uses a slash command
   `/skills <name>` inside a session, but for agent definitions we
   probably want a frontmatter `skills: [planner, tdd]` array. Confirm
   from pi-superpowers' README.
2. **Is per-agent skill composition supported?** A reviewer agent
   probably wants `code-review + tdd`, not just one skill.

### Module map

- ✎ Install: `pi install npm:@mariozechner/pi-superpowers`. Verify.
- ✎ `src/shared/models.ts` — `AgentSchema` gains optional
  `skills: z.array(z.string()).default([])`.
- ✎ `src/main/agent-loader.ts` — pass `agent.skills` through to pi when
  creating sessions for that agent.
- ✎ `agents/<slug>/agent.json` — six files, each gains a `skills` field.
- ✎ `agents/<slug>/prompt.md` — slim down to identity + custom rules
  only; remove duplicated skill content.

### Data shape

```ts
// AgentSchema delta
skills: z.array(z.string()).default([]),
```

### Step-by-step

1. Install + verify pi-superpowers loads.
2. Schema change + smoke + typecheck.
3. Update agent-loader to pass skills through. Verify with one agent
   first (Planner is the cleanest).
4. Slim the Planner prompt; run a real task; compare planner output
   quality to a baseline run.
5. If quality holds, repeat for the other five agents.
6. **Don't delete the prompt.md files** even after slimming — keep
   them as the human-readable identity layer. The skill references
   are additive.

### Verify

- A planner run with the slimmed prompt produces output of equal or
  better quality than the baseline (judged manually by Michael against
  a known task — not automatable).
- `agents/planner/agent.json` lists `skills: ["planning",
  "brainstorming"]`; pi session log shows those skills loaded.

---

## 6. Run-id capture from `.a5c/runs/`

> Effort: S (half day) — needs a real /yolo run to verify the directory shape

### Why

Babysitter writes per-run state to `<projectPath>/.a5c/runs/<runId>/`.
Right now MC has no idea what `runId` was assigned, which means:

- `/resume <runId>` is hard for the user to invoke (they have to ls
  the directory)
- The journal can't link back to babysitter's own state files
- If babysitter crashes, we have no breadcrumb to the right run dir

### Open

1. **How is `runId` allocated?** Best guess: babysitter assigns at
   `/yolo` invocation and prints it. Confirm by running once + tailing
   stdout.
2. **Detection strategy: parse stdout, watch directory, or read pi
   event?** Watching is most reliable but adds a `chokidar`-style
   dependency we don't have. Stdout parsing is simplest if babysitter
   prints the runId predictably.

### Module map

- ✎ `src/main/run-manager.ts` — capture stdout from the pi session
  in addition to events. Match `/run id: ([a-f0-9-]+)/` and store on
  the active `RunRecord`.
- ✎ `src/shared/models.ts` — `RunRecordSchema` gains optional
  `babysitterRunId: z.string().default("")`.
- ✎ `src/renderer/src/pages/TaskDetail.tsx` — `RunHistory` table gains
  a column "Babysitter run" with a clickable badge that opens
  `<projectPath>/.a5c/runs/<runId>/` in the OS file explorer (reuse
  existing `shell:openTaskFolder` IPC pattern, just generalize the
  path).
- ✎ `src/main/ipc.ts` — `shell:openPath(absPath)` channel.

### Data shape

```ts
// RunRecordSchema delta
babysitterRunId: z.string().default(""),
```

### Step-by-step

1. Run a single `/yolo` task manually. Capture pi stdout. Confirm the
   pattern that contains the runId.
2. Add the regex match in run-manager. Update RunRecord on first hit.
3. Schema + smoke.
4. UI: column + badge.
5. Generalize `openTaskFolder` IPC to `openPath`. Update both call
   sites.

### Verify

- `runs/<runId>.json` for any /yolo run has `babysitterRunId` set.
- TaskDetail's Run History row has a clickable run-id badge that
  opens the right `.a5c/runs/<runId>/` directory.

---

## 7. Per-task-card model badge

> Effort: XS (1–2 hours)

### Why

Mockup shows `Model: Codex` / `Model: Local LLM` on each task card.
It tells the operator at a glance which lane is using which model —
critical when you're running 12 tasks across 3 different providers.
The data is already in events; we just don't surface it on cards.

### Open

None. Pure renderer work.

### Module map

- ✎ `src/renderer/src/hooks/useTasks.ts` — extend `UiTask` with
  `currentModel: string`. Derive from the most recent
  `pi:message_start` event (already loaded via `useAllTaskEvents`).
- ✎ `src/renderer/src/components/TaskCard.tsx` — render the model
  beside the existing role pill. Truncate long model IDs.

### Data shape

```ts
// UiTask delta (renderer-only)
currentModel: string;  // empty if unknown; e.g. "claude-opus-4-7"
```

### Step-by-step

1. Useful subroutine: `latestModelForTask(events)` in `derive-runs.ts`
   (or a new tiny lib file). Walk events backwards looking for
   `pi:message_start.message.model`.
2. Pass through `useTasks` → `UiTask`.
3. Render in TaskCard with `font-size: 11px; color: var(--muted);`.
4. Verify-ui: assert the model string renders for tasks that have a
   run history.

### Verify

- A task with at least one run shows `Model: claude-opus-4-7` on its
  card.
- A fresh task with no runs renders without the badge (no "Model:" with
  empty value).

---

## 8. Per-card subagent strip

> Effort: XS (1 hour) — blocked on #3

### Why

Mockup card: `Subagents: RepoMapper, DocRefresher`. Tells the operator
which helpers a task has been spinning up. Nice diagnostic at a glance.

### Open

Same gating as #3 — depends on subagent persistence existing.

### Module map

- ✎ `src/renderer/src/hooks/useTasks.ts` — derive
  `recentSubagents: string[]` from `pi:subagent_spawn` events
  (deduplicated by agentSlug, most recent first, capped at 3).
- ✎ `src/renderer/src/components/TaskCard.tsx` — render below the
  step line as `Subagents: rmp, drf` with a `title=` tooltip giving
  the full names.

### Data shape

```ts
// UiTask delta
recentSubagents: string[];
```

### Step-by-step

1. Walk events for spawn types; build a Set keyed by agentSlug.
2. Render conditionally — hide the line if the array is empty so
   non-subagent tasks don't carry empty lines.

### Verify

- After running a task that calls RepoMapper, the card shows
  `Subagents: rmp`.

---

## 9. Project sidebar count rollup

> Effort: XS (30 min)

### Why

Mockup sidebar entry: `12 active • 3 waiting • 2 archived`. Today's
sidebar shows only prefix chip + name. The counts make the sidebar a
real navigation aid instead of a static list.

### Open

None. Derived data, no schema change.

### Module map

- ✎ `src/renderer/src/components/Sidebar.tsx` — for each project, count
  matching `tasks` by lane/status. Render a compact line under the
  name.

Color coding:
- active = `lane !== "done" && status === "active"` — `var(--accent)`
- waiting = `status === "waiting"` (approval, paused) — `var(--warn)`
- done = `lane === "done"` — `var(--good)`

### Data shape

None.

### Step-by-step

1. In Sidebar, accept `tasks` (already passed) and group by
   `t.project`. Compute three counts.
2. Render with `font-size: 11px; color: var(--muted)` on the same
   line.
3. Verify-ui: assert the sidebar entry contains "active" text after a
   task is created.

### Verify

- Creating a task under a project bumps that project's "active" count
  from N to N+1.
- Marking it done flips it to the "done" bucket.

---

## 10. "Waiting on" reason for queue tasks

> Effort: S (3–4 hours)

### Why

FORGOTTEN-FEATURES #8. A paused task says "paused"; an approval task
says "awaiting approval"; a failed task says "failed." But mockup
shows real reasons: "Azure build callback pending," "Awaiting customer
clarification," "Blocked on infra ticket." That's the reason a task
sits in queue, and it's the single most useful piece of information
on a stalled task.

### Open

1. **Free text or enum?** Free text is more flexible. Enum is more
   structured. Compromise: enum for known reasons + a free-text
   override.
2. **Set when?** Best UX: a small modal pops up when the user clicks
   Pause that asks "what are you waiting on?" Optional — Skip lets
   them pause without specifying.

### Module map

- ✎ `src/shared/models.ts` — `TaskSchema` gains
  `waitingOn: z.string().default("")`.
- ✎ `src/main/store.ts` — `setWaitingOn(taskId, reason)` method;
  emits `waiting-on-changed` event.
- ✎ `src/main/ipc.ts` — channel `tasks:setWaitingOn`.
- ✎ `src/preload/index.ts` + `global.d.ts`.
- ✎ `src/renderer/src/components/PauseDialog.tsx` (new) — small modal
  with a textarea + 4 quick-pick buttons (Build callback / Human
  review / Customer / External ticket).
- ✎ `src/renderer/src/components/RightBar.tsx` — `NeedsAttentionPanel`
  now shows `task.waitingOn` as the reason text instead of the
  generic "paused" / "awaiting approval" labels when set.
- ✎ `src/renderer/src/pages/TaskDetail.tsx` — small editable label
  near the controls: "Waiting on: <reason> [edit]".

### Data shape

```ts
// TaskSchema delta
waitingOn: z.string().default(""),

// New event variant
{ type: "waiting-on-changed", from: string, to: string }
```

### Step-by-step

1. Schema + smoke + typecheck.
2. Store method + IPC.
3. PauseDialog component. Wire to existing pause button.
4. Display in NeedsAttentionPanel + TaskDetail.
5. Optional: Settings → Global gains a "Waiting reasons" textarea
   (newline-separated quick picks).

### Verify

- Pause a task with reason "Build callback pending" — RightBar shows
  exactly that string instead of "paused."
- Resume clears the reason (or keeps it as historical data — your
  call; "clear on resume" is simpler).

---

## 11. Role rename — `developer` → `builder`

> Effort: XS (30 min, mechanical)

### Why

FORGOTTEN-FEATURES #1. Mockup says "Builder" everywhere; code says
`developer`. Cosmetic but it makes the wireframe and the running app
look like different products.

### Open

1. **Just the label, or the slug too?** Cleanest: rename the slug.
   But the slug is the agent-folder name (`agents/developer/`), task
   IDs reference no agent name (so safe), and `taskFile(taskId,
   agentCode)` uses the 1-char code (`d`), not the slug. So renaming
   `developer/` → `builder/` is local to the `agents/` directory.
2. **Existing task data?** Tasks reference `agentSlug` strings. A
   rename breaks any in-progress task with `agentSlug: "developer"`.
   Migration: a one-shot rename pass in store load (`if agentSlug ===
   "developer", set "builder", save`).

### Module map

- ✎ Rename: `agents/developer/` → `agents/builder/`.
- ✎ `agents/builder/agent.json` — `name: "Builder"`, `slug: "builder"`.
- ✎ `src/main/store.ts` — load-time migration on Task records.
- ✎ Search-replace `"developer"` and `"Developer"` across renderer
  display strings (NOT in code identifiers — that catches too much).
- ✎ `agents/<other>/prompt.md` — references to the developer role.

### Data shape

None changed; just slug values.

### Step-by-step

1. Move folder, update agent.json slug + name.
2. Run agent-loader smoke — should still pass (loader is generic).
3. Add migration to TaskStore.load(): rename developer → builder on
   read. Smoke-test the migration with a fixture containing the old
   slug.
4. Update prompt.md cross-references.
5. Update display strings in renderer (`useTasks.ts:LANE_STYLE` says
   "Developer" — change to "Builder").
6. Verify-ui: assert "Builder" appears, "Developer" does not.

### Verify

- Agent list in Settings → Agents shows "Builder."
- Existing task with agentSlug "developer" loads as "builder" without
  error.
- No raw "developer" string anywhere in the rendered UI (grep the
  built `out/renderer/`).

---

## 12. Cost-per-day KPI

> Effort: XS (1 hour)

### Why

Metrics page shows total cost across all time. Dashboard KPI row
shows count metrics. Neither answers "what am I spending today?" —
the question that matters when you're deciding whether to kick off a
big run.

### Open

1. **Local day or UTC day?** Local — matches how the rest of the app
   thinks about "today" (existing `Failed Runs Today` already uses
   local `startOfToday`).

### Module map

- ✎ `src/renderer/src/hooks/useKpis.ts` — add `costToday` calculation.
  Walk all task events, sum `pi:turn_end.message.usage.cost.total`
  for events with timestamp >= local midnight.
- ✎ Replace one of the existing 4 KPIs OR add as a 5th. **Cleanest:**
  replace "Failed Runs Today" — that's a less actionable metric and
  the failure cases are already surfaced in NeedsAttention.
- ✎ Mock data when `isDemo`: a plausible $4.27 or similar.

### Data shape

None.

### Step-by-step

1. Extend `useKpis.ts` with `costTodayUSD: number`.
2. Replace the failed-runs KPI label/value.
3. Verify-ui: assert "Cost Today" text appears in KPI grid.

### Verify

- After a real run, the dashboard KPI shows non-zero "Cost Today" that
  matches what the Task Detail cost ticker reports for that run.
- At local midnight, the value resets.

---

## 13. Toast notifications

> Effort: S (half day)

### Why

Run-lifecycle events are silent unless you're staring at the right
rail. A toast that fires on `run-started`, `agent_end`, and
`waiting-on-changed` (after #10) makes the app actively informative
without requiring focus.

### Open

1. **Position:** top-right is conventional. Bottom-right is less
   intrusive over the kanban board. Pick top-right; bottom-right is
   in mockup territory we don't have.
2. **Persist:** toasts auto-dismiss after 5s. Click the bell icon (TBD
   in topbar) for the last 20 toasts as history.
3. **Which events warrant toasts?** Conservative initial set:
   `run-started`, `run-ended` (with reason),
   `pi:agent_end`, `lane-changed`. Aggressively *exclude*
   message_update, tool_execution, every per-turn event.

### Module map

- ✚ `src/renderer/src/components/Toaster.tsx` — fixed-position
  container, animates in/out, max 3 visible at once.
- ✚ `src/renderer/src/hooks/useToasts.ts` — subscribes to
  `window.mc.onTaskEvent`; filters; pushes to a small queue.
- ✎ `src/renderer/src/App.tsx` — mount `<Toaster />` once at the root.
- ✎ `src/renderer/src/styles.css` — `.toast` + `@keyframes
  toast-in/out`.

### Data shape

None.

### Step-by-step

1. Build the Toaster component with hardcoded test toasts. Confirm
   layout + animation.
2. Wire useToasts to onTaskEvent, filter to the conservative set.
3. Click-to-dismiss + auto-dismiss timer (5s).
4. Click toast → openTask navigation (reuse `useRoute().openTask`).
5. Verify-ui: trigger a synthetic event, assert toast renders + the
   correct task opens on click.

### Verify

- Starting a run pops one toast. It auto-dismisses after 5s.
- Clicking it navigates to that task.
- During a real run with hundreds of pi events, no spam — only the
  few lifecycle types fire toasts.

---

## 14. Command palette (Cmd+K / Ctrl+K)

> Effort: M (1 day) — non-trivial UX, but a force-multiplier

### Why

You'll live in this app. A command palette beats clicking through
sidebar + board for: "open task DA-015F," "create task in TI,"
"settings → models," "start last task." Power-user feature, optional
but high value.

### Open

1. **Fuzzy search library or hand-rolled?** `fzf`-style is a 50-LOC
   weekend project; libraries (fuse.js) are tiny. Either is fine. Lean
   hand-rolled to avoid the dep.
2. **Action vocabulary:** start with three categories: tasks (open),
   projects (open), commands (Settings, Metrics, Archive, New Task,
   New Project). No need for keyboard nav of arbitrary tree.

### Module map

- ✚ `src/renderer/src/components/CommandPalette.tsx` — modal overlay
  with input + result list. Keyboard-driven (↑↓ Enter Esc).
- ✚ `src/renderer/src/hooks/useCommandPalette.ts` — global Cmd+K
  binding; toggles `isOpen` state; provides indexed corpus.
- ✎ `src/renderer/src/App.tsx` — mount `<CommandPalette />` once.
- ✎ `src/renderer/src/styles.css` — `.cmdk` overlay + result row
  styles.

### Data shape

```ts
// renderer-only
type Command =
  | { kind: "task";    id: string; label: string; subtitle: string }
  | { kind: "project"; id: string; label: string }
  | { kind: "action";  id: string; label: string; run: () => void };
```

### Step-by-step

1. Skeleton component with hardcoded commands. Verify keybinding
   opens/closes. Verify ↑↓ Enter Esc.
2. Index real data: tasks + projects from existing hooks.
3. Add static actions: "New task," "New project," "Settings,"
   "Metrics," "Archive."
4. Fuzzy match: simple subsequence + small bonus for prefix matches.
   Sort by score.
5. Verify-ui: open palette, type "DA," see matching tasks; press
   Enter, navigate.

### Verify

- Cmd+K (or Ctrl+K on Windows) opens the palette anywhere in the app.
- Typing a few characters of a task ID jumps to that task on Enter.
- Actions ("Settings," "Metrics") navigate to those pages.

---

## 15. App icon

> Effort: XS (1 hour, including making the icon)

### Why

Production build ships with the default Electron icon. Looks
unprofessional in the taskbar/dock and in the installer.

### Open

1. **Source format?** Need 256×256 .ico for Windows, .icns for Mac,
   512×512 .png for Linux. Same source SVG → multi-format export via
   `electron-icon-builder` or hand-export.

### Module map

- ✚ `build/icon.ico` (Windows)
- ✚ `build/icon.icns` (Mac, optional)
- ✚ `build/icon.png` (Linux + fallback)
- ✎ `electron-builder.yml` — confirm `directories.buildResources:
  build` (default) or point at wherever you put them.
- ✎ `src/main/index.ts` — `BrowserWindow({ icon: ... })` for the
  in-app window icon.

### Data shape

None.

### Step-by-step

1. Design a 1024×1024 SVG (or commission one).
2. Export to .ico, .icns, .png.
3. Build the app, confirm taskbar icon swaps from default.

### Verify

- `Mission Control.exe` taskbar icon is the new design.
- Installer shows the new icon.

---

## 16. Code signing (Windows + macOS)

> Effort: M to L (1–3 days, mostly procurement of certs)

### Why

Unsigned .exe triggers SmartScreen "Windows protected your PC" on
first run. Friends/colleagues won't bother clicking "Run anyway."
Ditto Gatekeeper on macOS. Signing makes the install painless.

### Open

1. **Cert source:** EV cert (~$300/yr from DigiCert/Sectigo) for
   instant SmartScreen reputation, or OV (~$80/yr) which builds rep
   over downloads. EV is worth it if distributing widely.
2. **macOS:** Apple Developer ID Application cert (~$99/yr) +
   notarization through `notarytool`.
3. **Linux:** AppImage or Snap can be signed but rarely is. Skip.

### Module map

- ✎ `electron-builder.yml` — `win.certificateFile`,
  `win.certificatePassword` (env var), `mac.identity`,
  `mac.notarize: true`.
- ✚ `.github/workflows/release.yml` (if doing CI signing) — runner
  with cert in secrets.

### Data shape

None.

### Step-by-step

1. Procure cert. Store securely (1Password / hardware token).
2. Local-build smoke: sign a test build, run on a fresh Windows VM,
   confirm no SmartScreen warning (or "publisher: <your-name>"
   instead of "unknown").
3. CI flow: cert in encrypted secret, build job signs.
4. Notarize on Mac (separate step).

### Verify

- Fresh Windows install → run installer → no scary dialog.
- Mac: `spctl --assess` returns "accepted."

---

## 17. Auto-update

> Effort: M (1 day, after #16 is done — auto-update needs signed builds)

### Why

Without auto-update, every fix means asking the user to download
again. With it, ship a fix at 3pm, every running instance prompts to
restart by 3:05pm.

### Open

1. **Update server:** GitHub Releases (free, simple) or S3 (more
   control). For an internal tool, GitHub Releases is plenty.
2. **Channels:** stable + beta? Or single channel? Single is simpler.
3. **Notification UX:** auto-restart, prompt-on-restart, or
   silent-download-then-prompt-next-launch? Last is least intrusive.

### Module map

- ✎ `package.json` — add `electron-updater` dep.
- ✎ `src/main/index.ts` — `autoUpdater.checkForUpdates()` 5 minutes
  after launch; `autoUpdater.on("update-downloaded", ...)` shows a
  toast.
- ✎ `electron-builder.yml` — `publish: github` config.
- ✎ Release workflow — push a tag, builder uploads to GitHub
  Releases.

### Data shape

None.

### Step-by-step

1. Install dep + wire `autoUpdater` in main.
2. Bump version locally, build, push tag, publish.
3. On a previous-version install, verify it auto-detects the new
   release.
4. Add toast on `update-downloaded` saying "Update ready — restart to
   apply." Click → `autoUpdater.quitAndInstall()`.

### Verify

- Install version 0.1.0 on a test machine. Tag + publish 0.1.1.
  Within 5 minutes the install has the update downloaded; restart
  picks it up.

---

## Appendix — feature dependency graph

```
1 Plannotator             ── independent
2 Pause/Resume            ── independent
3 Subagent tracking       ── needs pi-finder install
   ├── 8 Card subagent strip
   └── (also drives 13 toast filter)
4 pi-memory-md            ── independent (paused)
5 pi-superpowers prompts  ── independent
6 Run-id capture          ── needs first /yolo run
7 Card model badge        ── independent
9 Sidebar count rollup    ── independent
10 Waiting-on reason      ── independent
11 Role rename            ── independent (mechanical)
12 Cost-today KPI         ── independent
13 Toast notifications    ── independent
14 Command palette        ── independent
15 App icon               ── independent
16 Code signing           ── needs 15 (icon visible during signing flow)
17 Auto-update            ── needs 16
```

Order of attack if you want maximum visible progress per day:
**11 → 7 → 9 → 12 → 8 → 13 → 14** (renderer-only sprint, 2–3 days).
Then runtime: **2 → 6 → 3 → 5 → 4 → 1**. Then ship: **15 → 16 → 17**.

## Appendix — what's NOT on this list

Deliberately excluded:

- **Persistence migration framework.** We're file-first; manual one-off
  migrations in store load (per #11) are simpler than a framework.
- **Multi-window support.** One Mission Control window is the design.
- **Cloud sync.** Files on disk + git is the sync story.
- **Theming.** Dark theme is the design.
- **Remote agents.** pi runs locally; this isn't a control plane for
  fleet orchestration.
- **Mobile.** Not on the table.
- **Plugin system for MC itself.** Workflows + agents already drop-folder
  extensible; that's the plugin surface.
