# CLAUDE.md — orientation for Claude Code

You're working in **mc-v2-electron**, the desktop app behind Mission Control.
This file is the short-version orientation. **Read `docs/HANDOFF.md` for the
full walkthrough** once you've skimmed this.

## What this project is

An Electron + React + TypeScript desktop app that orchestrates AI coding
agents. MC is the UI + state layer. Pi-mono (`@mariozechner/pi-coding-agent`)
is the agent runtime — **wired and live**: clicking Start opens a real pi
session and runs babysitter end-to-end. Remaining work is mostly polish
(plannotator hand-off, pi-memory-md, pi-superpowers role prompts) — see
"Not started" below.

**Note (2026-04-29):** agents and workflows are migrating to live under
`library/` rather than the top-level `agents/` and `workflows/` folders.
The loaders in `src/main/agent-loader.ts` and `src/main/workflows.ts`
still read the old paths today — that's an open refactor, not done.

## Who's picking this up

Michael is the user / project owner. He:

- Works primarily with X++, C#, Python, PowerShell
- Builds MC for himself to orchestrate AI dev work across many projects
- Has Codex (OpenAI paid tier) + local Ollama with `qwen2.5-coder` available
- Prefers readable, simple code + small changes, not giant PRs
- Tests UI-heavy things manually; we're moving toward Playwright so AI can self-verify before asking him to look

## Ground rules — honor these

1. **Baby steps.** Smoke test or typecheck between changes. Don't commit 2000 LOC at once.
2. **File-first.** JSON + markdown on disk, no SQLite. Inspect-friendly, git-friendly.
3. **Don't hardcode labels.** If a value comes from a file (agent name, model id, project prefix), read it — don't bake it in.
4. **Flexible over prescribed.** New agents/workflows/subagents = drop a folder, not a code change.
5. **Pi owns the runtime.** Don't duplicate model dispatch, session management, event streaming — those come from pi. MC = orchestration + UI.
6. **Explicit certainty.** When you comment or doc something, mark it:
   - `// CONFIRMED:` = design decision Michael agreed to
   - `// PROPOSED:` = your suggestion, not yet validated
   - `// OPEN:` = unresolved, needs a decision
   - `// PI-WIRE:` = spot pi integration lands
   - `// TODO:` = pending work

## Commands

```bash
# From mc-v2-electron/
npm install
npm run dev            # electron-vite dev server + Electron window

# Type safety
npx tsc --noEmit -p tsconfig.node.json   # main + preload
npx tsc --noEmit -p tsconfig.web.json    # renderer

# Smoke tests — see package.json `smoke` script for the full set.
# Quick way: npm run smoke
```

## Orientation — grep these first

```bash
grep -rn "PI-WIRE"   src agents          # 13 spots — the integration map
grep -rn "CONFIRMED" src docs            # 11 spots — locked decisions
grep -rn "PROPOSED"  src docs agents     # 14 spots — your judgment calls welcome
grep -rn "OPEN:"     src docs            # 4 spots — need Michael's input
```

Then read the docs in this order:

1. `docs/HANDOFF.md` — full orientation (do this before changing anything)
2. `src/shared/models.ts` — domain types; single source of truth for schemas
3. `src/main/index.ts` — boot flow, where stores + IPC come together
4. `docs/PI-FEATURES.md` — what pi-mono + pi-subagents provide
5. `docs/WORKFLOW-EXECUTION.md` — **READ BEFORE WIRING PI.** Explains how tasks
   move between agents, why we layer MC + babysitter + pi, and what the
   per-workflow `process.js` file looks like
6. `docs/PI-EXTENSIONS-SURVEY.md` — ecosystem verdicts (USE/WIRE/STUDY/SKIP)
7. `docs/IDEAS-WORTH-BORROWING.md` — patterns (not tools) worth stealing
8. `FORGOTTEN-FEATURES.md` — features from the mockup that aren't built yet

## Architecture at a glance

```
  Renderer (React)                  Main (Node+Electron)
 ┌───────────────────┐            ┌───────────────────────┐
 │  hooks/*.ts       │  IPC       │  ipc.ts               │
 │  components/*.tsx │ ◄───────►  │  store.ts             │
 │  pages/*.tsx      │            │  project-store.ts     │
 │  router.ts        │            │  settings-store.ts    │
 └───────────────────┘            │  agent-loader.ts      │
           ▲                      │  workflows.ts         │
           │                      │  git-detect.ts        │
     preload/index.ts             │  pi-session-manager.ts│
     (contextBridge)              │  run-manager.ts       │
                                  │  library-index.ts     │
                                  └───────────────────────┘
                                           │
                                           ▼
                                  Disk (file-first)
                                  ├ <userData>/tasks/<id>/
                                  ├ <userData>/projects/<slug>/
                                  ├ <userData>/settings.json
                                  ├ agents/<slug>/agent.json + prompt.md
                                  ├ workflows/<CODE>-<slug>/
                                  └ library/_index.json (built artifact)
```

- **Hooks** fetch via `window.mc.*`, use mock data with `isDemo: true` when needed.
- **Mutations** publish via `hooks/data-bus.ts` so every hook instance refetches.
- **Shared models** (`src/shared/models.ts`) drive both sides — Zod schemas, TS types.

## Current state

**Works end-to-end:**

- CRUD on Projects (create/edit/delete, git auto-detect, icon picker)
- Create + delete Tasks (persists to `<userData>/tasks/`)
- Unified agent list (6 starter agents, drop-folder extensible)
- Editable LLM roster with "Load defaults" button (ships Codex + Ollama stubs)
- Workflow list (F-feature, X-brainstorm)
- All pages route, all hooks wired
- Demo defaults so fresh installs show something

**Real + live:**

- **Start button runs a full babysitter-orchestrated pipeline.** Clicking
  Start invokes `/babysit <task brief>` inside a pi session. Babysitter-pi
  (installed via `pi install npm:@a5c-ai/babysitter-pi`) generates a
  `process.js` per task and drives Planner → Developer → Reviewer →
  Surgeon with loopbacks + mandatory stops. When babysitter's final
  `agent_end` fires, the task flips to idle. Expect runs to take minutes
  — babysitter is deliberately paced.
- **Workspace cwd**: `project.path` when set (babysitter writes
  `.a5c/processes/` + `.a5c/runs/` there — add `.a5c/` to that project's
  `.gitignore`); otherwise use `<userData>/tasks/<id>/workspace/` per-task
  scratch dir otherwise.
- **Per-task files**: every task folder carries `PROMPT.md` (mission —
  overwritten on each Start with the current title/description) and
  `STATUS.md` (append-only progress log, seeded at createTask, updated
  by RunManager on each lifecycle transition — Started, Paused, Resumed,
  Stopped, Run ended). Task Detail renders both as scrollable cards
  above the lane timeline. "📁 Open folder" button reveals the task
  folder in the OS file explorer.
- **Approval lane gate**: when `task.lane === "approval"`, Task Detail
  renders an amber banner with ✓ Approve / ↺ Request changes buttons.
  Approve advances to the workflow's next lane (or "done"); request
  changes loops back to the first lane and increments `cycle`.
  PROPOSED integration: swap buttons for a plannotator launch when the
  plugin exposes an invocation surface.
- **Live events** (debounced): TaskStore emits → main forwards via
  `webContents.send` → `lib/live-events-bridge.ts` republishes to the
  data-bus with a 400 ms leading+trailing debounce (pi emits 20–50
  events/sec during babysitter runs — raw republish was an IPC storm).
  RightBar shows real pi events, suppressing `pi:message_update` and
  `pi:tool_execution_update` streaming-token noise. RunHistory +
  Metrics derive tokens/cost from the journal.
- **Model picker** on Task Detail pulls from pi's `ModelRegistry` via
  `pi:listModels` IPC. Empty value = let pi use its default.
- **Campaign task kind** end-to-end: kind selector + items textarea +
  Campaign Items table with progress bar. **Runtime iteration is wired**
  — RunManager dispatches single vs campaign on `task.kind`, opens one
  pi session per item, marks items done/failed/running as it
  progresses. Stop marks any running item failed; failed items don't
  halt the campaign. Per-item /babysit prompt includes "item N of M"
  context. State-machine fully smoke-tested.
- **Per-workflow lanes**: `workflow.json` accepts optional `lanes[]`.
  Settings → Workflows shows per-workflow lane sequence with
  default/custom label. X-brainstorm uses `[plan, develop, done]`.
- Pi inherits auth from the environment — `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` in the shell, or `pi` CLI login populating
  `~/.pi/agent/auth.json`.

**Not started:**

- **Plannotator hand-off** — current Approval gate is manual
  buttons. When plannotator exposes an invocation surface, open it
  pointed at the planner's artifact, consume approve/reject +
  annotations as structured feedback.
- **pi-memory-md wire-up** — per-project memory at `~/.pi/memory-md/<project>/`.
  Agents gain memory tools automatically once set up.
- **pi-superpowers role prompts** — swap hand-rolled `agents/<slug>/prompt.md`
  for pi-superpowers skill references (brainstorming, planning, TDD,
  code-review, etc.).
- **Pause/Resume affecting pi** — currently MC-state only. pi's
  `session.steer()` / `session.followUp()` could interrupt mid-turn.
- **Subagent spawn tracking** — install pi-finder + pi-librarian; capture
  `subagent_spawn` / `subagent_complete` events in RightBar as
  first-class rows (per wireframe spec).

## Dep notes

- **Two direct deps now.** `@mariozechner/pi-coding-agent` is the AI
  agent runtime; `@a5c-ai/babysitter-sdk` is the orchestration layer that
  knows how to drive workflow.js files via its built-in pi adapter
  (`packages/sdk/src/harness/pi.ts`). RunManager spawns
  `babysitter harness:create-run --process <path>` directly when a task
  carries a curated workflow path — no slash command, no auto-gen.
  (See `docs/UI-DESIGN.md` and the `feedback_no_hardcoded_values` /
  `project_workflow_invocation_path` memories.)

- **Reversed from earlier:** previously this doc said "deliberately do
  NOT depend on `@a5c-ai/babysitter-sdk`" — that was based on avoiding
  version skew with pi's loaded copy. Now MC's curated-workflow path
  needs the SDK locally to spawn the CLI and (eventually) read journal
  events. Keep MC's SDK version compatible with whatever a user's pi
  extension carries.

- **`@a5c-ai/babysitter-pi` is optional.** It's a pi extension that
  registers the `/babysit`, `/plan`, `/yolo` slash commands. Only
  needed for the auto-gen fallback path (when a task has no curated
  workflow selected). Install once per user:
  ```
  pi install npm:@a5c-ai/babysitter-pi
  ```
  MC doesn't gate on it.

## Gotchas

- **Main/preload don't hot-reload.** Renderer HMR works; changes to
  `src/main/**` or `src/preload/**` need full restart. On Windows,
  `electron.exe` sometimes lingers after Ctrl+C:
  ```powershell
  taskkill /IM electron.exe /F 2>$null
  ```
- **Preload is `.cjs`, not `.js`.** Our package.json is `"type": "module"`
  but Electron's preload loader is CommonJS-only. `electron.vite.config.ts`
  forces `.cjs` output. Don't switch `sandbox: true` without rebuilding
  preload as CJS.
- **Hook state is per-component.** Each `useProjects()` call owns its own
  state. Mutations must `publish("projects")` via `hooks/data-bus.ts` or
  other consumers won't refetch. (Learned this the hard way.)
- **DevTools `Autofill.enable` errors are harmless.** Electron doesn't ship
  the autofill service. Filter them out.
- **`id` and `prefix` on Projects are immutable after create** (task IDs
  embed them). Edit form locks both fields in edit mode.

## When you're uncertain

- If it's about pi-mono behavior → check `docs/PI-FEATURES.md` first.
- If it's about design intent → grep for `CONFIRMED` or ask Michael.
- If you're about to hardcode a label → re-read rule #3.
- If you're about to skip a smoke test → re-read rule #1.

## File organization — where new code goes

Follow these conventions so files don't scatter:

| What you're adding | Goes in |
|--------------------|---------|
| A new Zod schema or shared type | `src/shared/models.ts` (single file — all shared contracts live here) |
| A new main-process store or loader | `src/main/<name>.ts` + matching `<name>.smoke.ts` |
| A new IPC channel | Register in `src/main/ipc.ts`, expose in `src/preload/index.ts`, type in `src/renderer/src/global.d.ts` |
| A new React hook | `src/renderer/src/hooks/useXxx.ts` (one hook per file; re-exports via direct import) |
| A new small UI component | `src/renderer/src/components/Xxx.tsx` |
| A new top-level page / route | `src/renderer/src/pages/Xxx.tsx` + register in `App.tsx` `CurrentView` switch + add to `ViewId` in `router.ts` |
| A new agent | Drop a folder at `agents/<slug>/` with `agent.json` + `prompt.md`. No code change. |
| A new workflow | Drop a folder at `workflows/<CODE>-<slug>/` with `workflow.json`. No code change. |
| A reusable renderer utility | `src/renderer/src/lib/<name>.ts` |
| A main-process helper (no state) | `src/main/<name>.ts` + consider a smoke test |
| Documentation | `docs/<NAME>.md` for long docs; inline JSDoc for anything code-adjacent |

## Naming conventions

- **Files:** component files `PascalCase.tsx`, hooks `useXxx.ts` (camelCase), everything else `kebab-case.ts`
- **Types + components:** `PascalCase` (`TaskStore`, `ProjectDetail`)
- **Zod schemas:** `XxxSchema` const; infer the type as `Xxx` via `z.infer<typeof XxxSchema>`
- **Variables + functions:** `camelCase`
- **Slugs (folder names, IDs, workflow/agent keys):** `kebab-case`, lowercase
- **Task IDs:** `<PREFIX>-<NNN><W>` — `DA-001F`. CONFIRMED, don't deviate.
- **Smoke tests:** co-locate beside source as `<name>.smoke.ts`; they run standalone via `node --experimental-strip-types`

## Naming for agent-linked files

Task-linked filenames follow the `<taskId>-<agentCode>` convention:

- `DA-001F` — base manifest
- `DA-001F-p` — Planner output (code: p)
- `DA-001F-d` — Developer output (code: d)
- `DA-001F-rmp` — RepoMapper subagent output (code: rmp)

Use the `taskFile(taskId, agentCode?)` helper in `src/shared/models.ts`.

## STOP and ask Michael before these

- Renaming or reshaping anything in `src/shared/models.ts` — changes
  the persisted-data contract
- Touching `electron.vite.config.ts` (especially the preload CJS config)
  or the `electron`/`electron-vite`/`vite` versions in `package.json`
- Adding a dependency with a native module (or anything > 1MB bundled)
- Deleting persisted data programmatically (only user-initiated delete is safe)
- Breaking a CONFIRMED convention (grep for `CONFIRMED`)
- More than ~30 min of grinding on the same problem with no progress

When in doubt: write your best guess in a comment, leave a `// OPEN: <question>`
marker, and surface it in the response.

## Debugging recipes — where to look for what

| Symptom | Look here |
|---------|-----------|
| 🔴 bridge offline dot in Topbar | `[main]` terminal for `preload-error`; check `out/preload/index.cjs` exists |
| IPC call seems to hang or fail | DevTools Console for `[preload]`/`[hook]` logs, then `[main]` terminal for `[ipc] ← <channel>` |
| Hook shows stale data after mutation | Did the mutation call `publish("<topic>")`? See `src/renderer/src/hooks/data-bus.ts` |
| Form submits but data doesn't persist | `[ProjectForm] submit started { windowMcAvailable }` in DevTools; if false, preload fail |
| Renderer crash / white screen | DevTools Console; also the dev terminal often logs a React stack |
| Type error only in one tsconfig | Run `npm run typecheck:node` vs `:web` separately — error will only show in the affected side |
| Persisted data looks wrong | Inspect `<userData>` files directly (path varies by OS; main logs it on boot) |

## Dependencies — treat like a minefield

We hit a nasty `vite 8` / `electron 41` / `electron-vite 5` auto-upgrade
bug that required nuking `node_modules` and pinning versions. As a result:

**Don't bump these without a plan:**

- `electron` (pinned at `^32.0.0`)
- `electron-vite` (pinned at `^2.3.0`)
- `vite` (pinned at `^5.4.2`)
- `@vitejs/plugin-react` (pinned at `^4.3.1`)

**Don't add:**

- Native modules (break Electron's bundled binary)
- Big state-management libs (Redux, Zustand, MobX) — `useState` + `data-bus.ts` is sufficient
- UI component libraries (Material, Chakra, etc.) — custom CSS with the token palette is the convention
- Test frameworks that need a bundler config (Jest, Mocha) — the `.smoke.ts` pattern is simpler and runs directly

**Do consider:**

- Playwright (for E2E UI smoke tests — install globally, not per-project)
- Small focused utilities (< 10KB) with no transitive deps

## Secrets handling

- **Never write API keys or tokens into tracked files.** Not `.env`, not
  `config.json`, not comments, not `agent.json`.
- Pi handles keys via env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
  Set them in the shell that launches `npm run dev`.
- `models.json` (in `<userData>`) stores *references* to models (id, kind,
  model name, endpoint) — **not** the keys themselves.
- If a secret slips in, rotate the key + scrub git history; don't just delete the file.

## Commit conventions (PROPOSED — ask before first commit)

Michael hasn't specified a commit style. Reasonable defaults until he says:

- **Small, focused commits.** Matches the baby-steps rule.
- **Present-tense imperative** subject line, < 72 chars. "Add task delete IPC",
  not "Added" or "Adds".
- **Body** (optional) explains the *why* — "what" is the diff.
- **No co-author tag unless asked.** Michael's preference on AI attribution
  is unknown. Default: just make the commit as the user whose git is
  configured. If adding a Co-Authored-By line, ask first.
- **Never commit secrets.** `.env`, files under `<userData>/`, anything with
  keys. See "Secrets handling" above.
- **Don't commit while tests fail.** Run `npm run smoke` + `npm run typecheck`
  before `git commit`. Include fixes in the same commit, not a follow-up.
- **Don't commit generated output.** `out/`, `node_modules/`, `scripts/screenshots/`
  are in `.gitignore`. If you see them staged, something went wrong.

**STOP and ask before:**

- Any force-push, rebase, or reset
- Amending an existing commit (rewrites history)
- Squashing
- Creating a PR (let Michael decide if/when)

## Memory — what "memory" means where

Three separate systems, don't conflate them:

1. **`CLAUDE.md` (this file)** — project-scoped. Loaded automatically when
   Claude Code runs in this folder. What you're reading.
2. **`~/.claude/CLAUDE.md`** — user-scoped. Global preferences Claude Code
   applies across every project. Michael may or may not have one; don't
   assume content, but respect it if it exists.
3. **Cowork auto-memory** (`/sessions/.../.auto-memory/`) — different tool
   (Cowork mode). Not accessible from Claude Code. If you see references
   to it in docs, they're historical — the relevant facts are mirrored
   here or in `docs/HANDOFF.md`.

When you learn something worth persisting across sessions:

- If it's a project-wide fact → update `CLAUDE.md` or `docs/HANDOFF.md`
- If it's a decision to lock in → add a `// CONFIRMED:` marker at the code site
- If it's a gotcha → add to the Gotchas section above
- If it's a pending question → `// OPEN:` marker at the code site

## First task I'd suggest

A Playwright skeleton is already in place at `scripts/verify-ui.mjs`. It
covers Topbar + bridge + Add Project + disk persistence. To run:

```bash
npm run build          # produces out/ which Playwright launches
npm run verify-ui      # or: node scripts/verify-ui.mjs
```

Extend the `TODO(CC)` block at the bottom of that file with assertions
for Edit, Delete, Create Task, Settings → Models → Load defaults, and
(once pi wires) Start/Pause/Stop. Each new flow = a few more assertions +
a screenshot step. Keep the script one file until it really needs to split.

After the UI smoke is ergonomic, the real work is `PI-WIRE` stop by stop,
starting with `src/main/index.ts` → new `src/main/pi-session-manager.ts`.

## One-shot project setup

If you land in a fresh clone or something's gone sideways:

```powershell
npm run setup
# or directly:
pwsh scripts/setup.ps1
```

Runs: `npm install` → `npm run typecheck` → every smoke. Stops on first
failure with the bad output so you know exactly what to fix.
