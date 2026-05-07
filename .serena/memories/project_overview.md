# MissionControl overview

Mission Control is an Electron + React + TypeScript desktop app for orchestrating AI coding agents. MC is the UI/state layer; Pi (`@mariozechner/pi-coding-agent`) and babysitter (`@a5c-ai/babysitter-sdk`) own runtime/session/orchestration behavior.

Core layout:
- Shared contracts: `src/shared/models.ts` (Zod schemas + inferred types)
- Main process: `src/main/**` stores, IPC, pi/babysitter integration, file persistence
- Preload bridge: `src/preload/index.ts`
- Renderer: `src/renderer/src/**` React pages/components/hooks/libs
- Runtime catalog: `library/` is source of truth for agents, skills, workflows; rebuild `library/_index.json` with `npm run build-library-index`

Persistence is file-first JSON/Markdown under Electron `userData`; do not add SQLite or a DB server. Task folders contain `manifest.json`, `events.jsonl`, `PROMPT.md`, `STATUS.md`, optional `RUN_CONFIG.json`, `artifacts/`, and `workspace/`.

Important docs: `CLAUDE.md`, `AGENTS.md`, `docs/UI-DESIGN.md`, `docs/HANDOFF.md`, `docs/WORKFLOW-EXECUTION.md`, `docs/PI-FEATURES.md`.