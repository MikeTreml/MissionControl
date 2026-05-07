# Suggested commands

Run from repository root `C:\Users\Treml\source\repos\MissionControl`.

Setup/dev:
- `npm install`
- `npm run dev` — electron-vite dev server + Electron window
- `npm run setup` or `pwsh scripts/setup.ps1` — one-shot install/typecheck/smoke

Build/typecheck/test:
- `npm run build`
- `npm run typecheck` — node + web + tests
- `npm run typecheck:node`
- `npm run typecheck:web`
- `npm run typecheck:tests`
- `npm run smoke` — all main-process smoke tests
- `npm run test:workflow`
- `npm run test:workflow-guards`
- `npm run verify-ui`
- `npm run doctor` — pre-commit gate: typecheck + smoke + workflow + build + verify-ui

Library:
- `npm run build-library-index` after adding/editing `library/` agents/skills/workflows

Windows utility:
- If Electron lingers after Ctrl+C: `taskkill /IM electron.exe /F 2>$null` in PowerShell.

Use specialized harness tools for file/search operations during agent work; do not shell out to grep/find/cat when tools exist.