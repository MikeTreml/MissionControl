# mc-v2-electron

Mission Control — all-TypeScript Electron desktop app that orchestrates AI
coding agents.

**Stack:** Electron 32 · Vite 5 · React 18 · TypeScript 5.5 · electron-vite 2 · Zod

## Quick start

```powershell
npm install
npm run dev
```

Expected on first run: a dark window opens, Topbar shows "Mission Control"
with a 🟢 green dot ("bridge ok"), sidebar displays a yellow "Demo data"
banner with a `+` button to create your first project.

## Working on it

For anything beyond a quick tweak, **read `docs/HANDOFF.md` first** — it's
the full orientation.

If you're Claude Code: **`CLAUDE.md` is your short-version entry point**
(loaded automatically).

## What it does today

- CRUD on Projects (create/edit/delete, git auto-detect from the folder path,
  icon picker)
- Create + delete Tasks (persists to `<userData>/tasks/<TP-NNN>/`)
- Unified agent registry — primary roles (Planner/Developer/Reviewer/Surgeon)
  + spawnable subagents (RepoMapper, DocRefresher) all live in `agents/<slug>/`
- Editable LLM roster (Settings → Models) with one-click "Load defaults" for
  Codex + Ollama
- 4-tab Settings (Agents / Models / Workflows / Global)
- Metrics and Run Activity pages scaffolded

## What's missing

The pi-mono SDK wire-in. Start/Pause/Resume/Stop buttons on Task Detail
flip `Task.runState` and append events via `RunManager` but don't spawn a
pi session yet — that's the next step. See `grep -rn "PI-WIRE" src` for
the integration map.

## Commands

```powershell
# Dev
npm run dev                 # electron-vite watch + live window
npm run build               # produces out/ (packaged main+preload+renderer)
npm run start               # preview the built app

# Type safety
npm run typecheck           # both sides
npm run typecheck:node      # main + preload
npm run typecheck:web       # renderer

# Smoke tests (standalone, no Electron)
node --experimental-strip-types src/main/store.smoke.ts
node --experimental-strip-types src/main/project-store.smoke.ts
node --experimental-strip-types src/main/workflows.smoke.ts
node --experimental-strip-types src/main/agent-loader.smoke.ts
node --experimental-strip-types src/main/model-roster.smoke.ts
node --experimental-strip-types src/main/git-detect.smoke.ts
```

## Layout

```
mc-v2-electron/
├── CLAUDE.md                  # orientation for Claude Code
├── docs/
│   ├── HANDOFF.md             # full walkthrough
│   ├── PI-FEATURES.md         # pi-mono + pi-subagents reference
│   ├── PI-EXTENSIONS-SURVEY.md  # ecosystem verdicts
│   └── IDEAS-WORTH-BORROWING.md  # patterns to copy
├── agents/<slug>/             # bundled agent definitions (drop-folder extensible)
├── workflows/<CODE>-<slug>/   # bundled workflow definitions
├── models-suggested.json      # defaults for the "Load defaults" button
├── FORGOTTEN-FEATURES.md      # mockup features not built yet
├── wireframe-preview.html     # static dashboard preview (no install)
├── wireframe-all-pages.html   # static tour of every page (tabbed)
└── src/
    ├── shared/models.ts       # Zod schemas — the contract
    ├── main/                  # Electron main: stores, loaders, IPC
    ├── preload/index.ts       # contextBridge → window.mc
    └── renderer/              # React app
```

## Why this stack

- **Pi-mono is Node.** Node-in-Electron lets us import the SDK directly
  with no subprocess bridge.
- **TypeScript + Zod** gives runtime validation and static types from one
  schema — safer than bare JSON IO.
- **Electron** makes this a real desktop app, not a localhost web page.

See `docs/HANDOFF.md` §9 for the full decision history.
