# Style and conventions

General:
- Baby steps; typecheck/smoke between meaningful changes.
- File-first persistence: JSON + Markdown on disk under `userData`; no DB.
- Do not duplicate Pi model dispatch/session management/event streaming; MC is orchestration glue and UI.
- Do not hardcode labels from library/workflows/models/projects; read from files or runtime data.

TypeScript conventions:
- Shared persisted/domain contracts go in `src/shared/models.ts` as `XxxSchema` Zod consts with `type Xxx = z.infer<typeof XxxSchema>`.
- Main-process store/loader: `src/main/<name>.ts` with `<name>.smoke.ts` when stateful or non-trivial.
- IPC additions require 5-layer lockstep: `shared/models.ts` if needed → `src/main/ipc.ts` → `src/preload/index.ts` → `src/renderer/src/global.d.ts` → renderer hook/page.
- React hooks: `src/renderer/src/hooks/useXxx.ts`; pages: `src/renderer/src/pages/Xxx.tsx`; components: `PascalCase.tsx`; utilities: `src/renderer/src/lib/<name>.ts`.
- Files: components `PascalCase.tsx`, hooks `useXxx.ts`, other TS files `kebab-case.ts`.
- Types/components `PascalCase`, variables/functions `camelCase`, slugs `kebab-case`.

UI:
- Follow `docs/UI-DESIGN.md` v2 visual contract.
- Warm neutral dark shell; semantic color only for state.
- Cards lift via `box-shadow: var(--lift)`, not borders.
- Use CSS variables, not hardcoded hex.
- Right rail is live events; simple clean dense UI preferred.

Comments/decision markers:
- `// CONFIRMED:` locked decision
- `// PROPOSED:` suggestion not validated
- `// OPEN:` unresolved question
- `// PI-WIRE:` pi integration landing spot
- `// TODO:` pending work