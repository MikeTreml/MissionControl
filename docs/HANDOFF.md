# Handoff — read this first

You're picking up an Electron+TypeScript desktop app called **Mission
Control**. It's an orchestration+UI layer on top of `pi-coding-agent` (the
pi-mono SDK). The foundation, data model, IPC, and 90% of the renderer
wireframe are built. What's missing is the actual pi integration — the
buttons that would start/pause/stop agent runs are UI-only today.

This doc gets you oriented in ~10 minutes. Longer background in
`docs/PI-FEATURES.md`, `docs/PI-EXTENSIONS-SURVEY.md`, and
`docs/IDEAS-WORTH-BORROWING.md`.

## 1. Mental model in 6 lines

- **Projects** group Tasks. Each has a `prefix` (e.g. "DA") used in task IDs.
- **Tasks** are the unit of work. ID is `<prefix>-<NNN><workflow>` (e.g. `DA-001F`).
- **Workflows** define how tasks move (today just code+name+description).
- **Agents** (primary + subagent) live in `agents/<slug>/agent.json` — 1-char code = primary role, 2-4 chars = subagent.
- **Models** are the LLM roster (`<userData>/models.json`). Agents reference model ids.
- **Tasks run by** spawning a pi session per agent per cycle. **Not wired yet.**

## 2. Repo tour

```
mc-v2-electron/
  agents/<slug>/agent.json          bundled; 6 starter agents
  workflows/<CODE>-<slug>/          bundled; 2 starter workflows (F, X)
  models-suggested.json             Codex + Ollama defaults (loaded via Settings)
  src/
    shared/models.ts                Zod schemas — the contract
    main/
      index.ts                      Electron boot + bootstrap stores + register IPC
      ipc.ts                        One place for every ipcMain.handle()
      store.ts                      TaskStore (+ events.jsonl journal)
      project-store.ts              ProjectStore (CRUD)
      model-roster.ts               ModelRosterStore (models.json)
      agent-loader.ts               Reads agents/<slug>/agent.json
      workflows.ts                  Reads workflows/<CODE>-<slug>/workflow.json
      git-detect.ts                 Parses .git/config → GitHub/ADO/GitLab
      *.smoke.ts                    Standalone runners — see "Smoke tests" below
    preload/index.ts                contextBridge — exposes window.mc
    renderer/src/
      App.tsx                       3-col shell + router
      router.ts                     ViewId + selectedTaskId/ProjectId
      global.d.ts                   window.mc types (single source of truth)
      hooks/                        Data fetching + demo-default pattern
      components/                   Sidebar, Topbar, Board, TaskCard, Modal, forms
      pages/                        Dashboard, ProjectDetail, TaskDetail, Settings, Metrics
      hooks/data-bus.ts             Pub/sub so mutations refresh all hook instances
  docs/
    HANDOFF.md                      this file
    PI-FEATURES.md                  what pi-mono + pi-subagents do
    PI-EXTENSIONS-SURVEY.md         13 related repos, what to borrow
    IDEAS-WORTH-BORROWING.md        patterns (not tools) worth stealing
    PI-FEATURES.md                  reference for pi capabilities
  wireframe-preview.html            static dashboard preview (no install)
  wireframe-all-pages.html          static tour of every page (click tabs)
```

## 3. Grep recipes — find my notes

Inline markers are scattered throughout the code. Use these to navigate:

```bash
# Where pi plugs in — ALL onClick stubs and data shapes waiting for it
grep -rn "PI-WIRE" src agents

# Design decisions Michael and I locked in
grep -rn "CONFIRMED" src docs

# My suggestions, not yet validated with real data
grep -rn "PROPOSED" src docs agents

# Open questions — need a decision before building further
grep -rn "OPEN:" src docs

# Pending work
grep -rn "TODO" src
```

Start with `grep -rn "PI-WIRE" src` — that's the map for the next work.

## 4. Smoke tests — run before + after any backend change

```bash
cd mc-v2-electron

# All six green. Each is standalone, <2s.
node --experimental-strip-types src/main/store.smoke.ts
node --experimental-strip-types src/main/project-store.smoke.ts
node --experimental-strip-types src/main/workflows.smoke.ts
node --experimental-strip-types src/main/agent-loader.smoke.ts
node --experimental-strip-types src/main/model-roster.smoke.ts
node --experimental-strip-types src/main/git-detect.smoke.ts

# TypeScript is the other safety net
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json
```

No integration/e2e tests exist yet. **If you're in Claude Code**, the
first thing worth doing is installing Playwright globally and writing a
minimal UI smoke that walks Dashboard → Add Project → Verify persistence.
Playwright has a dedicated Electron API (`playwright._electron.launch()`)
that avoids the whole "spin up a browser, navigate to a URL" dance.

## 5. Running the app

```bash
# From mc-v2-electron/
npm install
npm run dev
```

On Windows, if restart goes sideways:
```powershell
Ctrl+C
taskkill /IM electron.exe /F 2>$null
npm run dev
```

The Topbar has a status dot (🟢/🔴) showing whether preload loaded. If red,
check the dev terminal for `preload-error` — the most common cause is
`out/preload/index.{js,mjs,cjs}` mismatch with what main expects.
**CONFIRMED fix in place:** electron.vite.config.ts forces preload to
`.cjs` because package.json is `"type": "module"`.

## 6. State of play — what works, what doesn't

**Works end-to-end:**
- Create / edit / delete Projects (persists to `<userData>/projects/`)
- Create / delete Tasks (persists to `<userData>/tasks/`, events.jsonl
  updated on lane/cycle changes)
- Git auto-detect on project path
- Unified agent list (Settings → Agents)
- Editable model roster (Settings → Models, with Load defaults button)
- Workflow list (Settings → Workflows, read-only)
- Router + page nav
- Demo default (Sidebar empty → shows mock data with a yellow banner)

**Mocked / canned until pi wires:**
- RightBar Run Activity
- Metrics page numbers
- Task Detail run history (reads from events.jsonl but synthesizes when empty)
- Start/Pause/Resume/Stop buttons on Task Detail — UI-only

**Not started:**
- pi SDK wire-in (step 14 — biggest remaining work; see next section)
- Workflow lane customization (F uses all 6 lanes, X uses the same — OPEN
  question whether workflow should override the default lane set)
- Campaign task kind (schema field `kind: "campaign"` is there, UI isn't)
- Playwright smoke tests
- Packaging (electron-builder)

## 7. Next concrete work — pi wire-in

See every `PI-WIRE` marker in the code. The shortest path:

1. **Install pi**  
   `npm install @mariozechner/pi-coding-agent`

2. **Create `src/main/pi-session-manager.ts`** — owns a Map<string, pi.Session>
   keyed by `<taskId>:<agentSlug>`. Methods: `start`, `pause`, `resume`, `stop`,
   `list`. On every session event, it:
   - appends to `<taskId>/events.jsonl`
   - broadcasts via `win.webContents.send("task-event", taskId, event)`

3. **Register IPC handlers** in `ipc.ts` (new section):
   - `runs:start` → `pi.start(taskId, agentSlug?)`
   - `runs:pause` / `runs:resume` / `runs:stop`

4. **Expose on preload** + declare in `global.d.ts`.

5. **Renderer: wire the TaskDetail Controls** — the onClick stubs are
   already in the right shape. See the PI-WIRE block in that file.

6. **Renderer: subscribe to `task-event`** in the RightBar Run Activity
   feed via `ipcRenderer.on("task-event", ...)`. Use the existing
   `data-bus.ts` pattern — publish after each event so hooks re-fetch.

7. **Hello-world test:** add a project with a real git path, create a
   task with workflow F, click Start. Watch events.jsonl tick up.

8. **Models to validate:**
   - **Codex** via `gpt-5-codex` (needs OPENAI_API_KEY set in env before
     launching Electron)
   - **Local** via Ollama + `qwen2.5-coder` (needs `ollama pull qwen2.5-coder`
     and Ollama running on localhost:11434)

   Click **Load defaults** in Settings → Models to populate these.

## 8. Gotchas Michael and I hit

- **Electron sandbox + ESM:** package.json is `"type": "module"` so
  electron-vite emits ESM. Electron's preload loader is CJS-only, so we
  force preload build to `.cjs` via `electron.vite.config.ts`. Don't
  flip `sandbox: true` without rebuilding preload as CJS.
- **Hot reload:** renderer reloads automatically, main + preload do NOT.
  Changes to `src/main/**` or `src/preload/**` need `Ctrl+C` + full
  restart. On Windows, `electron.exe` can linger — `taskkill /IM
  electron.exe /F` if needed.
- **Hook state is per-component:** I learned this the hard way. Every
  `useProjects()` call has its own state; mutations need `publish()`
  via `hooks/data-bus.ts` so every consumer refetches.
- **DevTools Autofill errors are noise** — `Autofill.enable` / `setAddresses`
  fail because Electron doesn't ship the autofill service. Filter them
  out in the DevTools console; they don't affect anything.

## 9. Ground rules Michael set

- **Don't hardcode labels.** Read from data. If a label comes from a
  file, the file is the source of truth.
- **Baby steps.** Smoke test between changes. Don't commit 2000 LOC at
  once.
- **File-first philosophy.** JSON + markdown on disk, no SQLite. Easier
  to inspect, diff, back up.
- **Flexible over prescribed.** New agents / workflows / subagents are
  drop-a-folder, not a code change.
- **Pi owns the runtime.** Don't duplicate what pi already does — agents,
  sessions, model dispatch. MC is the orchestrator + UI.

## 10. Cheap vs expensive to change

Knowing what's safe to tweak saves a lot of back-and-forth.

**Near-free** (do these without asking; just smoke test):

- CSS tokens in `styles.css` (colors, spacing, radii)
- Component layout and copy — button labels, placeholders, demo banners
- Sidebar row density, card padding, icon placement
- Adding a new React page + new ViewId (just update `router.ts` + `App.tsx` switch)
- Adding an agent folder (`agents/<slug>/agent.json` + `prompt.md`) — zero code
- Adding a workflow folder (`workflows/<CODE>-<slug>/workflow.json`) — zero code
- Adding a new field to `ModelDefinition` if it's optional with a default

**Cheap with care** (do it, but smoke + tsc + run the affected page):

- New IPC channels (register in three spots: `ipc.ts`, `preload/index.ts`, `global.d.ts` — forgetting any one = runtime error)
- New hooks (follow the `useProjects` pattern; subscribe to `data-bus.ts` topics)
- New fields on existing Zod schemas, when **optional with `.default(...)`** —
  old persisted data still parses
- New event types in `events.jsonl` (the schema is `.passthrough()` so
  payloads are open-ended)

**Medium cost** (think first, smoke rigorously):

- Renaming a Zod field. If data already exists on disk, you're breaking
  parsing for every old record. Either write a migration on read, or
  add the new field in parallel and deprecate the old one.
- Changing a ViewId string. Router state is in-memory so runtime is fine,
  but any persisted URL-like state would break (none today — but keep
  it in mind if we ever add "remember last view").
- Moving files between `main/`, `renderer/`, or `shared/`. Import paths
  update fine; what breaks is the tsconfig include globs if the target
  doesn't already match.

**Expensive** (ask Michael):

- Renaming or reshaping `Task` / `Project` / `Agent` schemas in a way that
  breaks existing persisted data. Migrations are doable (read old, write
  new) but add complexity. Current usage is small so a one-shot "reset
  userData" is often easier than a migration — but that's the user's call.
- Changing the task-ID format (`<PREFIX>-<NNN><W>`). Every linked file
  name assumes this shape. CONFIRMED.
- Changing the `code` convention (1 char = primary, 2-4 = subagent).
  Multiple bits of logic depend on it: `agent-loader`'s sort, task-linked
  file naming, the pill rendering in Sidebar, the PI-WIRE dispatch hints.
- Removing `"type": "module"` from package.json, or flipping `sandbox: true`
  on the BrowserWindow. We fought these battles; don't re-open them.

**Cross-cutting principle:** data on disk is more expensive to change
than code in memory. The code can be refactored; the 47 task manifests
you wrote last week can't. Err on the side of adding new fields and
leaving old ones untouched.

## 11. Execution engine — three-layer model

When pi wires up, MC will NOT be the thing driving step-by-step agent
execution. That job goes to **babysitter** (`@a5c-ai/babysitter`). Three
cooperating layers:

| Layer | Owner | What it does |
|-------|-------|--------------|
| Task / project / workflow state | **MC** | Dashboard, board, CRUD, event surface |
| Per-run orchestration | **babysitter** | JS process file with `ctx.task()` + gates; mandatory-stop between steps; journal for resume |
| Individual agent session | **pi** | LLM call, tool use, streaming events per role |

### Why babysitter (not an in-house orchestrator)

Addresses real failure modes that pure "agent says done" can't:

- Agent stalls mid-step with fake clarifying questions → process code, not the agent, decides what's next
- Agent declares "done!" early → code-defined quality gates verify artifacts before advancing
- Process dies mid-run → event-sourced journal (`.a5c/runs/<runId>/`) resumes at the last completed step
- Local LLM wanders off → mandatory stop prevents run-away

### Redundancy by design

Both MC's `events.jsonl` AND babysitter's `.a5c/runs/` journal are written
on every transition. Intentional duplication — if one system fails, the
other is the backup source of truth. Michael explicitly wants this:
"I like redundant backup plans."

### Shape of integration

Each workflow folder points at a babysitter process file:

```
workflows/F-feature/
  workflow.json     { code, name, description, process: "./process.js" }
  process.js        PROPOSED — babysitter process (stub committed)
  prompts/          per-role prompts (already there)
```

The process file declares the pipeline using babysitter primitives:

```javascript
module.exports = async function feature(inputs, ctx) {
  const plan    = await ctx.task("planner",   { task: inputs.taskId });
  await ctx.breakpoint({ question: "Approve plan?", context: plan });
  await ctx.task("developer", { task: inputs.taskId, plan });
  const review  = await ctx.task("reviewer",  { task: inputs.taskId });
  if (review.verdict === "loopback") {
    await ctx.task("planner", { task: inputs.taskId, feedback: review.notes });
    // loop handling — recursion or a while loop; decide at wire-in time
  }
  await ctx.task("surgeon",  { task: inputs.taskId });
  await ctx.breakpoint({ question: "Ship it?" });
};
```

MC's future `PiSessionManager` becomes thin: forward Start clicks to
babysitter, subscribe to babysitter's journal, mirror events into MC's
own `events.jsonl` for the dashboard.

See `docs/WORKFLOW-EXECUTION.md` for the deeper write-up — triggers,
resume semantics, open questions, and why code-driven orchestration is
preferred over manager-agent designs.

## 12. Where to find more

- `docs/PI-FEATURES.md` — what pi does, field-by-field
- `docs/PI-EXTENSIONS-SURVEY.md` — 13 ecosystem projects, verdicts
- `docs/IDEAS-WORTH-BORROWING.md` — patterns to copy even from skipped tools
- `FORGOTTEN-FEATURES.md` — features the mockup had that we haven't built yet
