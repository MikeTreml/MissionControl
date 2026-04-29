# Feature plans — review pass

A critical second read of `docs/FEATURE-PLANS.md`. For each feature
section, two short blocks:

- **Gaps** — what the plan glosses over, gets wrong, or assumes without
  justification. Things that will bite you mid-implementation.
- **Alternatives** — different shapes the same feature could take. Often
  simpler, sometimes a strict trade-off. Listed so you can pick the
  shape before you start.

The point is to surface the decisions buried inside the plan so they
get made deliberately. Read this side-by-side with FEATURE-PLANS.md;
nothing here replaces a section there, it sharpens it.

A cross-cutting section at the end covers patterns the plan doc
re-derives in every feature (new IPC channels, new event types, new
Zod schemas) — those probably want a single decision instead of 17.

---

## 1. Plannotator hand-off

### Gaps

- The whole plan is gated on "what surface does plannotator expose?"
  but I never said *make discovery the first concrete deliverable*.
  Step 1 should be: install plannotator, run it once by hand against
  a real planner artifact, document the actual invocation, **then**
  open this section again. Anything before that is fiction.
- `PlannotatorFeedbackSchema` assumes structured comments. Plannotator
  may just emit free-form markdown. Plan should accept "raw markdown
  blob + optional parsed fields" rather than enforcing structure we
  don't control.
- No path defined for "plannotator isn't installed at all" — currently
  the manual buttons disappear when the launcher is wired. Need
  capability detection (does the binary exist?) before swapping UI.
- The plan copies feedback into `<taskId>-p.md` as a markdown
  appendix. That mutates an artifact the planner agent owns; loop-back
  semantics get muddled (is the appendix part of the planner's next
  iteration input, or a separate review file?). Suggest a sibling
  `<taskId>-p-review.md` instead.

### Alternatives

1. **Watch-a-sentinel** — don't integrate at all. Open plannotator
   pointed at the artifact via OS shell, then poll
   `<taskFolder>/<taskId>-plannotator-result.json` until it lands.
   Plannotator becomes a black box that the user drives separately.
   Simplest possible wiring; works with any plannotator version.
2. **Pi extension** — if plannotator ships as a pi extension (it
   might), invoke it via `/plannotate <path>` slash command in the
   active pi session. Same machinery as `/yolo`; zero new IPC.
3. **In-app annotator** — skip plannotator entirely. Render the
   planner artifact in a markdown editor with comment threads (a
   500-LOC component, not trivial but bounded). Trade external dep
   for full control. Only worth it if plannotator turns out to be
   a poor fit.
4. **No-op for now** — keep the manual ✓/↺ buttons. They work. The
   feature is real but its priority depends on whether you actually
   review more than ~10 plans/week.

---

## 2. Pause / Resume actually affecting pi

### Gaps

- Conflates "halt token spend" with "interrupt agent." If
  `session.steer()` queues a message but doesn't abort the in-flight
  HTTP stream to the model, you keep paying for the response that's
  already streaming. No backup path in the plan.
- Doesn't say what happens to babysitter's own state machine when MC
  pauses. Babysitter has hooks (`PreToolUse`, `Stop`) that may or may
  not honor steer. Worst case: pi pauses, babysitter doesn't, you
  get desync.
- `pi:steer-sent` event is fine, but there's no `pi:steer-acked`. We
  send the steer and assume it took. Should record both.
- Resume's `followUp("[resumed]")` injects a literal-looking string into
  the conversation context. Agents read this. We're poisoning the
  conversation with our own bookkeeping. Want a system-level
  signaling channel, not a user-message-shaped one.

### Alternatives

1. **AbortController instead of steer** — capture the pi session's
   underlying AbortSignal at create time. `pause()` calls
   `abortController.abort()`, which actually stops the network call.
   Resume creates a fresh session pointing at the same task folder
   (we already do this on stop+restart). Crude but closes the
   "still spending" hole.
2. **"Pause = stop after current turn"** — soften semantics. Don't
   interrupt. Just don't send the next turn after the current one
   ends. Less effective at saving money on the very next message,
   but trivially safe and predictable.
3. **Pause-as-no-op (status quo)** — the current behavior is "MC
   says paused, pi keeps going for one more turn." Document this as
   the design and rename the button "Pause after step." Sets honest
   expectations until pi exposes real interruption.
4. **Soft pause via babysitter** — if babysitter's `Stop` hook can
   be triggered by an external signal (file flag at
   `<projectPath>/.a5c/runs/<runId>/PAUSE`), MC just touches that
   file. Babysitter halts itself. No pi-internal API needed.

---

## 3. Subagent spawn tracking

### Gaps

- Three persistence layers: `events.jsonl` + `runs/<runId>.json` +
  proposed `spawns/<spawnId>.json`. That's a lot of overlap. Plan
  doesn't say why the third layer is needed instead of enriching
  one of the existing two.
- Run History expansion UI ("▸ 2 subagents") needs row-grouping; the
  current table is flat. Adding nested rows might cascade into a
  bigger refactor than the plan estimates.
- Skipped: what happens when a subagent itself spawns a sub-subagent?
  pi-subagents allows arbitrary depth. The flat `spawns/` directory
  loses the parent-child tree.
- Smoke against a stub session is good but the real shape of
  `pi:subagent_spawn` payloads varies by which subagent fires. Plan
  doesn't account for shape divergence.

### Alternatives

1. **Derive-on-render** — drop `spawns/` entirely. Walk events.jsonl
   on Task Detail load, build the subagent tree in memory.
   `derive-runs.ts` already does similar work. One source of truth,
   one fewer write path. Slightly slower for huge journals but
   well within budget.
2. **Embed in RunRecord** — `RunRecord.subagents: SubagentSpawn[]`.
   When a spawn lands during an active run, push to the run's array.
   One file per run captures everything; no new directory.
3. **Tree-aware persistence** — instead of flat `spawns/<id>.json`,
   use `spawns/<rootRunId>/<spawnId>.json` so the parent run is in
   the path. Cleaner for nested subagents, but more complex listing.
4. **Skip subagent UI for v1** — log spawns to events.jsonl, render
   them in RightBar (already supported), and stop. Don't add Run
   History expansion until you actually use subagents enough to want
   it. YAGNI.

---

## 4. pi-memory-md wire-up

### Gaps

- "If utils.ts is still missing, file the issue upstream + skip" —
  too soft. Either commit to a workaround (vendored fork, patch
  script) or commit to deferral. Half-measures rot.
- Project Detail "Open memory folder" + read-only stats are
  decoration. The actual write surface is pi tools inside an agent
  session — but MC doesn't expose that. So the project-detail UI
  shows you data you can't edit from MC. Confusing.
- No story for memory contention: two simultaneous tasks on the
  same project both reading/writing memory. pi-memory-md may or may
  not handle this; plan doesn't say.

### Alternatives

1. **Roll our own** — `<projectPath>/.mc/memory.md` (or
   `~/.mc/memory/<projectId>.md` if path is unset). Agents get the
   contents prepended to their system prompt at session start; agents
   write back via a single `update_memory` tool we expose. ~50 LOC
   total, no external dep, fully under our control.
2. **Defer indefinitely** — pi-memory-md is unproven, the user is
   actively using pi for other work, and memory's value is hard to
   measure. Real cost: a paragraph in HANDOFF.md saying "we
   considered, deferred."
3. **Memory-as-prompt-prefix** — even simpler than #1: drop a
   `<projectPath>/AGENTS.md` (already a convention pi/claude code
   honors) and let the user manually curate. No tooling at all; we
   just document the convention.

---

## 5. pi-superpowers role prompts

### Gaps

- Quality A/B is hand-wavy ("compare to a baseline run"). Without a
  fixed evaluation prompt + scoring rubric, "the planner output looks
  good" is a moving target. Either define the rubric or accept that
  "we'll know it when we see it."
- "Don't delete prompt.md" — but if the skill reference fully replaces
  the role content, prompt.md becomes a 3-line file that just says
  "you are the planner." That's not a problem; just say so.
- Six agents × six prompts is a sequential migration with risk
  accumulating. Plan implies you migrate them serially; nothing about
  rolling back if quality drops on agent #4.

### Alternatives

1. **Additive layering** — keep prompt.md *exactly* as-is. Add
   `skills: [...]` as extra context that pi loads on top. No
   regression risk; you compose, not replace. Less elegant
   ("duplicate" content), but the duplication is in our agents/
   directory, easy to slim later.
2. **Roll your own skill library** — agents reference shared
   `.md` files in `agents/_skills/<name>.md` via a frontmatter
   `extends: [...]` array. Same pattern, no pi-superpowers dep,
   you control the content.
3. **Migrate planner only, indefinitely** — pick the one agent
   whose output you most want to improve, migrate that, and stop.
   Defer the rest until you have evidence the skills approach
   actually moved the quality needle.

---

## 6. Run-id capture from `.a5c/runs/`

### Gaps

- Stdout regex `/run id: ([a-f0-9-]+)/` is a load-bearing assumption
  about babysitter's output format. Babysitter is pre-1.0; format
  *will* change.
- "Generalize `openTaskFolder` to `openPath(absPath)`" introduces a
  security smell. An IPC channel that opens an arbitrary absolute
  path is a path-traversal vector waiting to happen. Plan should
  whitelist (must be inside `<userData>` or a known project path).
- No mention of cleanup. `.a5c/runs/` accumulates per-run dirs
  forever; eventually large. Who prunes?

### Alternatives

1. **Watch the directory** — `fs.watch(<projectPath>/.a5c/runs/,
   { persistent: false })`. New subdir = new runId. Deterministic,
   format-independent, no stdout parsing. One small dep on
   chokidar (or use built-in fs.watch and accept platform jankiness).
2. **Read state.json** — babysitter likely writes a manifest at
   `<projectPath>/.a5c/runs/<runId>/state.json`. Tail the runs/
   directory at start, pick the newest mtime, read its state.json
   for the runId. Two filesystem reads, no parsing.
3. **Skip capture; surface a button** — "Open .a5c folder" on Task
   Detail, user picks the right run by mtime. Trades 30 seconds
   of user time per `/resume` for zero engineering. Honest answer:
   if you `/resume` once a month, this is fine.
4. **Ask babysitter to tell us** — open an issue upstream
   requesting a `pi:run_id` event. Right answer long-term; doesn't
   help today.

---

## 7. Per-task-card model badge

### Gaps

- "Truncate long model IDs" — at what length? `claude-opus-4-7-20251001`
  is 24 chars, doesn't fit a card. Plan doesn't pick a value.
- `latestModelForTask(events)` walks events on every render of every
  card. With 30 cards and 5000 events each, that's 150k iterations
  per re-render. Probably fine. But not benchmarked.

### Alternatives

1. **Persist on Task** — add `currentModel: string` to TaskSchema,
   updated on each `pi:message_start`. Cards just read the field,
   no event walk. Tiny schema change, big perf win.
2. **Provider color, no text** — instead of `Model: claude-opus-4-7`,
   show a 6×6px colored dot keyed to provider (Anthropic = orange,
   OpenAI = green, local = gray, unknown = default). Tooltip on hover
   reveals the full model name. Zero card real estate; encodes the
   one piece of info that actually matters at a glance.
3. **Abbreviation lookup** — table mapping `claude-opus-4-7-2025...` →
   "Opus 4.7", `gpt-5-codex` → "Codex". Readable, fits cards.
   Maintenance: one entry per new model; a dozen-row table covers a
   year.

---

## 8. Per-card subagent strip

### Gaps

- Same single-source-of-truth question as #3 — derive vs persist.
- Card real estate is precious. "Subagents: rmp, drf" might push
  the card height when subagents are present, leading to layout
  jitter as runs progress. Need a fixed-height treatment.

### Alternatives

1. **Count badge** — "↗ 3" with tooltip listing names. One line, fixed
   width, no jitter. Loses agent identity at a glance but reclaims
   space.
2. **Stacked icons** — each subagent gets a 1-letter circle (R, D)
   in a row. Up to 4 visible, "+N" suffix beyond. Visual density,
   no truncation problems.
3. **Defer** — until subagents are firing in real runs (#3 actually
   shipped), there's nothing to render. This whole section can wait.

---

## 9. Project sidebar count rollup

### Gaps

- Three counts × N projects = a lot of muted text on a narrow column.
  Sidebar is already busy.
- Color choices (active=accent, waiting=warn, done=good) clash with
  existing card pills using the same colors. Visual confusion when
  scanning.

### Alternatives

1. **Single number** — show only "active" count (or `total active`).
   Drop waiting/done. The most common question is "what's busy under
   this project?" One number answers it.
2. **Mini stack-bar** — 1-pixel-tall bar under each project name with
   three filled segments (active|waiting|done) proportional to count.
   Encodes ratio without numbers. Eye-catching; readable in
   peripheral vision.
3. **Hover-tooltip only** — sidebar stays clean; hover any project
   to reveal `12 active · 3 waiting · 2 done`. Discoverability
   suffers but daily noise drops to zero.
4. **Skip until N > threshold** — when you have 3 projects you don't
   need rollups. Re-evaluate at 10+.

---

## 10. "Waiting on" reason

### Gaps

- PauseDialog adds a modal to a path that today is one click. Friction
  cost: every pause is now two interactions. Some pauses are quick
  context switches where the reason genuinely is "I dunno, came back
  later" — modal feels heavy.
- Quick-pick reasons hardcoded in the modal; plan says "optionally"
  pull from settings, which means in practice nobody will configure it.
- Free-text + enum is muddy. Plan doesn't pick.
- No story for *clearing* the reason: on resume? On lane change?
  Manually? Each has different implications.

### Alternatives

1. **Inline edit, no modal** — pause flips the button to "Paused
   ⌫ <inline-textbox>". User can type a reason or just walk away.
   Zero friction; reason is opt-in.
2. **Decoupled blocker field** — separate the "pause" button from
   the "set blocker" UI entirely. Pause stays one-click. A separate
   "Blocker:" field on Task Detail (always visible, editable) holds
   the reason. Works whether the task is paused, in approval, failed,
   whatever. More general, less coupled.
3. **Free-text only, no enum** — drop the quick picks. Just a textbox.
   Users will write what they need. Less structured, much simpler.
4. **Defer until it's painful** — current NeedsAttention rail
   labels (paused / awaiting approval / failed) are sufficient for
   a single user with <50 tasks. Add "waiting on" when you actually
   forget what you were waiting for.

---

## 11. Role rename — `developer` → `builder`

### Gaps

- Migration runs `if agentSlug === "developer"` on every load. After
  every task is migrated, this is dead code that still runs. No
  marker to skip.
- Folder rename mid-task is risky: a task with `currentAgentSlug:
  "developer"` whose folder was just renamed to `builder/` will fail
  to load the prompt.
- Renaming a slug breaks any external script (wireframes, demos,
  docs) that hard-codes "developer."

### Alternatives

1. **Don't rename anything** — keep slug `developer` forever; change
   only the displayed label in `LANE_STYLE` from "Developer" to
   "Builder". 5-line change. No migration. The slug is internal.
2. **Symlink** — `agents/builder/` is a symlink to `agents/developer/`.
   Both names load the same agent; old data still works; new data
   prefers `builder`. Eventually deprecate via doc, never via code.
3. **One-shot script** — `scripts/migrate-rename.mjs` walks
   `<userData>/tasks/`, rewrites slugs once. Run manually.
   No live-migration code in the load path.
4. **Just don't** — the mockup vs code label drift is 3 years old
   and harming nobody. Update the mockup, leave the code.

---

## 12. Cost-today KPI

### Gaps

- O(N) walk of all events on every dashboard render. With one heavy
  campaign task carrying 100k events, this becomes noticeable.
- "Replace Failed Runs Today" is a value judgment buried in the plan.
  Different users want different KPI sets.
- "Local day" sounds simple but DST transitions / timezone changes
  give weird boundary effects (a run at 1am during the autumn clock change
  can get counted twice if "local midnight" moves backward).

### Alternatives

1. **Pre-aggregated cache** — `<userData>/daily-costs.json`:
   `{ "2026-04-26": 4.27, "2026-04-25": 3.18, ... }`. Updated on
   each `run-ended`. KPI reads one number from one file.
2. **7-day sparkline panel** — replace the single KPI card with a
   tiny line chart showing cost-by-day. More information density,
   helps spot trends ("Tuesday's run cost 5x normal — what changed?").
3. **Per-project, not global** — show today's cost in the sidebar
   under each project. More actionable than a global number for
   prioritization decisions.
4. **Skip; defer to Metrics page** — cost data already lives on
   Metrics. The dashboard doesn't need to duplicate. Add a "Cost
   →" link instead.

---

## 13. Toast notifications

### Gaps

- Top-right collides with the Cost Ticker pill on Task Detail (we
  literally just put it there).
- 5s auto-dismiss is too short for `run-ended` (reason=failed) — the
  one toast you actually want to read.
- No setting to disable. First time someone running 12 simultaneous
  tasks gets toast-bombed they'll want one.
- No story for unfocused window: a toast fires while the user is in
  another app and they never see it.

### Alternatives

1. **System notifications** — Electron's `Notification` API surfaces
   the toast at the OS level (Windows Action Center, macOS
   Notification Center). Visible even when the window is unfocused.
   Free OS-level dismiss/history.
2. **Notification bell + count badge** — small icon in the topbar.
   Click to expand a panel listing the last 20 events. No interrupt
   on the workflow; you check when you want to.
3. **Sound only on critical** — `run-ended:failed` plays a short
   tone; no visual. Lowest visual cost; works while you're heads-down
   in another window.
4. **Status bar at the bottom** — single-line "Last event: TST-001F
   run-ended (completed) 2s ago." Always visible, never interrupts.

---

## 14. Command palette (Cmd+K)

### Gaps

- "50 LOC fuzzy match" is optimistic. Good ranking (typo tolerance,
  prefix bonuses, recency boost) is a non-trivial weekend on its own.
- Value is unclear at current scale. Sidebar already shows all
  projects; board shows all tasks. Cmd+K wins when N is large
  enough to scroll.
- Static "actions" (New Task, Settings, etc.) are 4 keystrokes
  *more* than just clicking the existing buttons. The palette only
  pays off for *navigation* to specific entities.

### Alternatives

1. **Recent + jump panel** — keep an MRU list of the last 10 tasks
   touched. Cmd+R cycles through them like browser tabs. Faster than
   palette for the 95% case (jump back to where you just were).
2. **Global search bar** — always-visible text input in the topbar.
   Same fuzzy-search corpus as the palette but no keybinding gymnastics.
3. **Defer** — until you have >50 tasks across >5 projects, sidebar
   + board is fine. The pain that justifies a palette doesn't exist
   yet.
4. **Use a library** — `cmdk` (npm package) is the de-facto Cmd+K
   primitive. Trades ~30KB of bundle for ranking that actually works.
   Violates "no UI library" rule mildly; arguably worth it.

---

## 15. App icon

### Gaps

- "Commission an icon" with no budget guidance. $20 (Fiverr) and $2000
  (boutique studio) both produce icons.
- macOS .icns and Windows .ico have different DPI tiers. Plan says
  "export from SVG" but doesn't list the actual sizes (16, 32, 48,
  64, 128, 256, 512, 1024). Skip a tier and the icon looks blurry
  in some context.

### Alternatives

1. **Emoji-as-icon** — pick an emoji (🎯, ⛵, 🛰️) and render via Canvas
   to PNG at all sizes. Free, unique-ish, instantly recognizable.
   Looks toy-like to some; charming to others.
2. **Wordmark only** — render "MC" in your accent color on a dark
   square. 5 minutes in any image editor. Honest minimalism.
3. **Defer** — the default Electron icon is professional-enough for
   internal use. Address before public distribution.

---

## 16. Code signing

### Gaps

- Plan compares EV vs OV certs but doesn't mention you can't pool
  EV certs across projects (single-org per cert).
- No mention of HSM / hardware token requirement: EV certs ship on
  a USB token, which makes CI signing painful (the token needs to
  be physically present).
- macOS notarization requires an active Apple Developer membership
  ($99/yr) — a recurring cost the plan elides.

### Alternatives

1. **Azure Trusted Signing** — Microsoft's managed signing service,
   ~$10/mo. Cloud-native, no HSM dance, integrates with GitHub
   Actions easily. Cheaper and less painful than DigiCert/Sectigo.
2. **Distribute via package managers** — winget (Windows), brew
   (Mac), scoop (Windows). They handle trust signaling on behalf
   of the package. Skip code signing entirely.
3. **Internal-only distribution** — if Mission Control stays
   yours/your-team's, sign nothing. Run unsigned, accept the
   SmartScreen friction once per machine.
4. **Self-signed + manual trust** — for a small known-user base,
   sign with a self-generated cert and have users install it once.
   Free; ugly; works.

---

## 17. Auto-update

### Gaps

- electron-updater requires a publish target (GitHub Releases, S3,
  generic URL). Plan picks GitHub but doesn't address private repos:
  if Mission Control stays private, GitHub Releases need an OAuth
  token in the app, which is awkward to ship securely.
- "5 minutes after launch" check is arbitrary. No discussion of:
  retry on failure, exponential backoff, what happens during a
  long-running task (don't restart!).
- "quitAndInstall" mid-task is destructive. Need a "wait until idle"
  gate.

### Alternatives

1. **Manual check button** — topbar "Check for updates" link, runs
   electron-updater on-demand. No daemon, no surprise restarts. User
   chooses when. Loses the "auto" but gains predictability.
2. **Package-manager delivery** — winget/scoop/brew. Same as #16-2.
   Free auto-update; no electron-updater, no signing token in app.
3. **Hosted on a static URL** — `your-domain.com/missioncontrol/latest.yml`
   served from any static host. Public read, no auth. Simple, works
   for any visibility tier.
4. **Defer indefinitely** — until you have non-self users who can't
   re-install on demand, manual download/install is fine.

---

## Cross-cutting observations

These are patterns the plan re-derives in every feature. Each is
better solved once, not 17 times.

### A. IPC channel sprawl

Most features add 1–3 new IPC channels (`tasks:listFiles`,
`tasks:listSpawns`, `plannotator:review`, etc.). The pattern is
identical: register handler in `ipc.ts`, expose method in
`preload/index.ts`, type in `global.d.ts`, call from the renderer.

**Improvement:** a single helper at the top of `ipc.ts`:
```ts
function registerCh<I, O>(name: string, handler: (input: I) => Promise<O>) {
  ipcMain.handle(name, async (_e, input) => handler(input));
}
```
plus a renderer-side typed wrapper. Reduces 4 files of boilerplate per
feature to ~3 lines.

**Alternative:** generate the IPC layer from a single contract file
(zod-ipc / tRPC-style). More work upfront, more deps; pays off after
~20 channels. We're at ~25 already.

### B. Event-type proliferation

The plan adds: `plannotator-launched`, `plannotator-returned`,
`pi:steer-sent`, `waiting-on-changed`, plus implicit ones from
subagents. `TaskEventSchema` is currently a `passthrough()` permitting
anything; adding new types means renderer code learns to filter them.

**Improvement:** central registry. `src/shared/event-types.ts` exports
a const array of known types + a literal-union type. Renderer
filtering becomes type-safe. New event = one PR adding one entry,
not "add a discriminated union, hope you remembered the right
filter."

**Alternative:** stop adding event types; encode metadata as fields
on existing events. `lane-changed` already carries `from/to`; bolt
`reason` on rather than minting `lane-changed-via-plannotator`.

### C. `<taskId>-<code>` file naming

The plan invents new file conventions per feature
(`<taskId>-plannotator-result.json`, `<taskId>-p-review.md`). The
codebase already has `taskFile(taskId, agentCode)` helper.

**Improvement:** every artifact path goes through `taskFile()`. New
artifacts get a new agent-code slot (`pa` for plannotator,
`drv` for review). One source of truth for what exists in a task
folder.

**Alternative:** stop using the convention for non-agent artifacts.
Agent outputs use `<taskId>-<code>.md`; human/tool outputs use plain
descriptive names (`plannotator-feedback.json`). Cleaner mental
model: "agents own coded files, tools own descriptive ones."

### D. Effort estimates

Every feature has an XS/S/M/L estimate. None of these are calibrated
against actually-shipped features. The recent batch (linked-files,
direct-mode, cost-ticker, needs-attention) was ~3 hours total — call
that a calibration baseline. Anything in the plan estimated "S
(half day)" is probably 2–3 hours of focused work; "M" is 1 day; "L"
should make you ask whether you're doing too much.

**Improvement:** add an actual-vs-estimated ledger to this file as
features ship. Calibration improves over time.

### E. Test strategy gap

Every section has a "Verify" block, but most are manual. The
project has Playwright (verify-ui.mjs) and per-module smokes;
the plan rarely says which one to use, or which assertions to add
to verify-ui.mjs.

**Improvement:** every UI feature ships with at least one verify-ui
assertion. Every store/IPC change ships with a smoke test. Make this
a checklist in the section template.

### F. Missing entirely from the plan

Things the 17 don't cover that probably should:

- **Undo / restore for deletes.** Task deletion is final; project
  deletion is final. A 30-second undo window is trivial (move to
  `<userData>/.trash/` first; expire after 30 days).
- **Search across task content.** Once you have >50 tasks, finding
  "the one where I asked about Z" requires scanning manually. A grep
  over PROMPT.md + STATUS.md per task is an hour's work.
- **Export / share a task.** "Send me what TST-001F did" — currently
  requires zipping the task folder by hand. A "Export task as zip"
  button is small and high-value.
- **Crash recovery.** If MC crashes mid-run, what state is pi in?
  Currently nothing reconciles. "On startup, scan for orphaned
  sessions" is a reasonable feature.
- **Per-project agent overrides.** Right now all projects use the
  global agent set. Some projects might want different planners
  (X++ vs Python). Workflow-level override exists; project-level
  doesn't.
- **Telemetry / observability of MC itself.** How often does the
  app crash? Which IPC calls error? No instrumentation.
- **Privacy / data ownership statement.** No doc says where task
  data lives, what gets shipped where (only to the model provider),
  what's retained. Important if anyone but you ever runs this.

Each of these is plausibly more useful than items 11, 14, 15, 16, 17
combined. Worth a separate planning pass.

---

## Suggested re-prioritization

The original plan ordered features by "load-bearingness" but that
reflects design weight, not user value. A user-value reorder:

1. **#2 Pause/Resume** — the "Pause is a lie" bug is real today.
2. **#10 Waiting-on reason** OR the lighter Alternative #2 (decoupled
   Blocker field) — surfaces *why* tasks are stuck, the most common
   question with multiple in-flight tasks.
3. **#7 Card model badge** (with Alternative #2: persist on Task) —
   instant glanceable info, tiny effort.
4. **#9 Sidebar counts** (with Alternative #1: single number) — pure
   value, ~30 minutes.
5. **Crash recovery** (from cross-cutting F) — protects you from data
   loss, no upside until it triggers, but the day it triggers it's
   the most valuable thing you ever built.
6. **#3 Subagents** OR **#8 Card subagent strip** — only after
   pi-finder is installed and you actually use them.
7. Everything else, deferred until there's a concrete pain.

Distribution (#15–17) doesn't move until you actually plan to
distribute. That's an external decision, not an engineering one.
