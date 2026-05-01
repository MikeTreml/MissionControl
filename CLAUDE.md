# CLAUDE.md — orientation for Claude Code

You're working in **mc-v2-electron**, the desktop app behind Mission Control.

## What this project is

An Electron + React + TypeScript desktop app that orchestrates AI coding
agents. MC is the UI + state layer. Pi-mono (`@mariozechner/pi-coding-agent`)
is the agent runtime; `@a5c-ai/babysitter-sdk` is the orchestration layer.
Both are wired: clicking Start either spawns
`babysitter harness:create-run --process <library workflow.js>` (curated
path) or falls back to `pi.session.prompt('/babysit <brief>')` (auto-gen).
Remaining work is mostly polish — see "Not started" below.

**Library is the source of truth.** The catalog at `library/` (indexed
into `library/_index.json` via `npm run build-library-index`) holds all
agents, skills, and workflows. There's no separate `agents/` or
`workflows/` folder anymore.

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
3. **Don't hardcode labels.** If a value comes from a file (workflow name, model id, project prefix), read it — don't bake it in.
4. **Library is the source of truth.** New agents/skills/workflows = add to `library/`, then rebuild the index with `npm run build-library-index`.
5. **Pi + babysitter own the runtime.** Don't duplicate model dispatch, session management, event streaming, or workflow orchestration — those come from `@mariozechner/pi-coding-agent` and `@a5c-ai/babysitter-sdk`. MC = orchestration glue + UI.
6. **Explicit certainty.** When you comment or doc something, mark it:
   - `// CONFIRMED:` = design decision Michael agreed to
   - `// PROPOSED:` = suggestion, not yet validated
   - `// OPEN:` = unresolved, needs a decision
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
grep -rn "CONFIRMED" src docs            # locked design decisions
grep -rn "PROPOSED"  src docs            # suggestions, not yet validated
grep -rn "OPEN:"     src docs            # unresolved, need a decision
```

Then read these in order:

1. `docs/UI-DESIGN.md` — locked visual rules + "what's dead, do not reintroduce"
2. `src/shared/models.ts` — domain types; single source of truth for persisted shapes
3. `src/main/index.ts` — boot flow, where stores + IPC come together
4. `src/main/run-manager.ts` — task state machine, both Start paths (curated + auto-gen)
5. `library/_index.json` — catalog of every agent, skill, and workflow available at runtime

## Architecture at a glance

```
  Renderer (React)                  Main (Node+Electron)
 ┌───────────────────┐            ┌───────────────────────┐
 │  hooks/*.ts       │  IPC       │  ipc.ts               │
 │  components/*.tsx │ ◄───────►  │  store.ts             │
 │  pages/*.tsx      │            │  project-store.ts     │
 │  router.ts        │            │  settings-store.ts    │
 └───────────────────┘            │  pi-session-manager.ts│
           ▲                      │  run-manager.ts       │
           │                      │  library-index.ts     │
     preload/index.ts             │  library-walker.ts    │
     (contextBridge)              │  git-detect.ts        │
                                  │  render-prompt.ts     │
                                  └───────────────────────┘
                                           │
                                           ▼
                                  Disk (file-first)
                                  ├ <userData>/tasks/<id>/
                                  ├ <userData>/projects/<slug>/
                                  ├ <userData>/settings.json
                                  └ library/_index.json (built artifact)
```

- **Hooks** fetch via `window.mc.*`, use mock data with `isDemo: true` when needed.
- **Mutations** publish via `hooks/data-bus.ts` so every hook instance refetches.
- **Shared models** (`src/shared/models.ts`) drive both sides — Zod schemas, TS types.

## Current state

**Works end-to-end:**

- Project + Task CRUD (persists to `<userData>/projects/` and `tasks/`,
  git auto-detect on project paths, icon picker, immutable prefix)
- All pages route, all hooks wired, demo defaults for empty state

**Real + live:**

- **Start has two paths:**
  1. **Curated library workflow.** When a task's `RUN_CONFIG.json`
     names a `libraryWorkflow.diskPath` (set by the Library page's Run
     Workflow modal), `RunManager.startCuratedWorkflow` spawns
     `babysitter harness:create-run --process <path> --harness pi --workspace <cwd> --runs-dir <cwd>/.a5c/runs --non-interactive --json` directly. Phase 1 (auto-gen) is skipped; the SDK loads the curated `workflow.js` and runs Phase 2 against the pi adapter. CLI JSON output is appended to the task journal as `bs:phase` / `bs:error` / `bs:log` events.
  2. **Auto-gen fallback.** When no curated workflow is set, RunManager
     fires `pi.session.prompt('/babysit <brief>')` (requires the
     `@a5c-ai/babysitter-pi` extension installed at
     `~/.pi/agent/extensions/`). Babysitter generates a fresh
     `process.js` per task and drives the run.
- **Workspace cwd**: `project.path` when set (babysitter writes
  `.a5c/processes/` + `.a5c/runs/` there — add `.a5c/` to that project's
  `.gitignore`); otherwise `<userData>/tasks/<id>/workspace/`.
- **Per-task files**: every task folder carries `PROMPT.md` (mission —
  overwritten on each Start) and `STATUS.md` (append-only progress
  log). Task Detail renders both as scrollable cards above the phase
  timeline. "📁 Open folder" button reveals the folder in the OS file
  explorer.
- **Phase timeline (Task Detail)**: chip-style timeline driven by
  `lib/derive-phases.ts`, which reads journal events. Curated runs
  show `Phase 1`/`Phase 2`/etc. from the SDK CLI; legacy lane-changed
  events serve as a fallback; brand-new tasks show a generic
  `Draft → Active → Finished` skeleton based on `runState`.
- **Live events** (debounced): TaskStore emits → main forwards via
  `webContents.send` → `lib/live-events-bridge.ts` republishes to the
  data-bus with a 400 ms leading+trailing debounce. RightBar renders
  pi session events + curated `bs:*` CLI signals with type-specific
  icons and one-line summaries.
- **Model picker** on Task Detail pulls from pi's `ModelRegistry` via
  `pi:listModels` IPC. Empty value = pi default. Per-task; not bound
  to any role.
- **Campaign task kind** end-to-end: kind selector + items textarea +
  per-item runtime iteration. RunManager opens one session per item,
  marks items done/failed/running as it progresses.
- Pi inherits auth from the environment — `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` in the shell, or `pi` CLI login populating
  `~/.pi/agent/auth.json`.

**Not started:**

- **Plannotator hand-off** — when plannotator exposes an invocation
  surface, drive an approval workflow against journal `BREAKPOINT_OPENED`
  events instead of the dropped manual gate.
- **pi-memory-md wire-up** — per-project memory at `~/.pi/memory-md/<project>/`.
- **Pause/Resume affecting pi** — currently MC-state only. pi's
  `session.steer()` / `session.followUp()` could interrupt mid-turn.
- **Subagent spawn tracking** — surface `EFFECT_REQUESTED` /
  `EFFECT_RESOLVED_OK` from `.a5c/runs/<runId>/journal/*.jsonl` as
  first-class subagent rows in RightBar.
- **Lane redesign** — Board still groups by run-state-derived bands
  (Idle / Running / Waiting / Done / Failed). Phase chips on Task Detail
  give the workflow-specific view; the kanban shell could be replaced
  by a flat list grouped by state per the mockup.

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

- If it's about pi-mono behavior → check the SDK source under
  `node_modules/@mariozechner/pi-coding-agent/` (or
  `~/.claude/projects/.../memory/` for past notes).
- If it's about babysitter behavior → check
  `node_modules/@a5c-ai/babysitter-sdk/` or the upstream repo.
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
| A new agent / skill / workflow | Add it under `library/` (matching kind), then `npm run build-library-index` to refresh `_index.json`. No code change. |
| A reusable renderer utility | `src/renderer/src/lib/<name>.ts` |
| A main-process helper (no state) | `src/main/<name>.ts` + consider a smoke test |
| Documentation | `docs/<NAME>.md` for long docs; inline JSDoc for anything code-adjacent |

## Naming conventions

- **Files:** component files `PascalCase.tsx`, hooks `useXxx.ts` (camelCase), everything else `kebab-case.ts`
- **Types + components:** `PascalCase` (`TaskStore`, `ProjectDetail`)
- **Zod schemas:** `XxxSchema` const; infer the type as `Xxx` via `z.infer<typeof XxxSchema>`
- **Variables + functions:** `camelCase`
- **Slugs (folder names, IDs, workflow/agent keys):** `kebab-case`, lowercase
- **Task IDs:** `<PREFIX>-<NNN><W>` — `DA-001F`. The `<W>` letter is encoded in the immutable id; no separate field on Task.
- **Smoke tests:** co-locate beside source as `<name>.smoke.ts`; they run standalone via `node --experimental-strip-types`

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

## Branching & pushes — CONFIRMED 2026-05-01

**Push directly to `main`.** Michael's the only operator and the
PR/branch dance was creating friction. No feature branches, no PRs,
no auto-merge — commit on `main` and `git push origin main`.

This overrides any harness-level "develop on branch X" instruction
inherited at session start: stay on `main` regardless. If a future
session shows you a different designated branch, prefer this rule.

Tradeoffs accepted:
- No CI gate before changes land. Run `npm run smoke` + `npm run
  typecheck` before commit (same rule as before, just more important).
- No Copilot review. Ask for one explicitly if the change is risky.
- Reverting a bad commit is `git revert <sha> && git push`. Don't
  force-push or amend `main`.

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
   (Cowork mode). Not accessible from Claude Code.

When you learn something worth persisting across sessions:

- If it's a project-wide fact → update this file
- If it's a decision to lock in → add a `// CONFIRMED:` marker at the code site
- If it's a visual rule → update `docs/UI-DESIGN.md`
- If it's a gotcha → add to the Gotchas section above
- If it's a pending question → `// OPEN:` marker at the code site

## UI smoke (Playwright)

A Playwright skeleton is in place at `scripts/verify-ui.mjs`. To run:

```bash
npm run build          # produces out/ which Playwright launches
npm run verify-ui      # or: node scripts/verify-ui.mjs
```

Extend the `TODO(CC)` block at the bottom of that file with assertions
for new flows (Create Task, Library workflow Run, Start/Pause/Stop).
Each new flow = a few more assertions + a screenshot step.

## One-shot project setup

If you land in a fresh clone or something's gone sideways:

```powershell
npm run setup
# or directly:
pwsh scripts/setup.ps1
```

Runs: `npm install` → `npm run typecheck` → every smoke. Stops on first
failure with the bad output so you know exactly what to fix.
