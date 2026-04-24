# Forgotten Features — mockup vs current models

Generated 2026-04-22 by diffing `mission_control_saved_mock_v2.html` against
`src/shared/models.ts` and `src/main/store.ts`. Each item below appears in the
mockup but has NO representation (or a wrong one) in the current code.

Grouped by blast-radius. Top of the list = biggest implications for data shape.

## 1. Role naming — "Builder" vs "dev"
- Mockup sidebar: **Builder**. Task pill in Build lane: **Builder**. Flow caption: "Planner → Builder → Reviewer → Doc".
- Current `RoleSchema`: `"planner" | "dev" | "reviewer" | "doc"`.
- Decision needed: rename `dev` → `builder` (matches mockup + session-boundaries memory)
  OR keep `dev` internally and label it "Builder" in UI only.
- Same question for lanes: mockup says **Build** + **Docs** (plural); models say `dev` + `doc`.

## 2. Task ID convention — `DA-015F` vs `TP-NNN`
- Mockup IDs: `DA-015F`, `DX-008F`. That's `<project-prefix>-<number><type-suffix>`.
  - Project prefix: DA = DogApp, DX = D365 (presumed)
  - Type suffix: F = Feature (mocked); implied B=Bug, R=Refactor, S=Spike.
- Current store: `TP-001`, generic + global counter.
- Implications: task IDs need a **project** context to be generated, plus a **task type** field. Counter becomes per-project, not global.

## 3. Task type / category
- Mockup selected panel: **"Feature • Dev workflow • Project: DogApp"**.
- Not in `TaskSchema`. Needs a new enum field: `taskType: "feature" | "bug" | "refactor" | "spike"` (at minimum).

## 4. Workflow types
- Mockup pill: **"Workflow: Dev"**. Sidebar project notes: "brainstorm heavy". Selected task: "Dev workflow".
- Implies a **Workflow** concept separate from lane — e.g. Dev, Brainstorm, Fix — each probably with its own lane sequence.
- Not in models. Worth designing before hardcoding lane order.

## 5. Subagents (first-class, not just strings)
- Mockup task card: `Subagents: RepoMapper, DocRefresher`.
- Run Activity lists subagents as first-class runs: `RepoMapper • Spawned 10:19 PM • Local`.
- Implies: subagents have (name, parent task, spawn time, model, status). Need a `SubagentRun` model plus a relationship to `Task`.

## 6. Task-linked files — two kinds
- Mockup shows:
  - `DA-015F__spec.md`, `DA-015F__decision-log.md`, `DA-015F__diff-report.md` — **generated artifacts** (prefix = task ID).
  - `api/tasks/files.http`, `ui/task-detail.tsx` — **actual repo files** touched by the task.
- Today's store only has free-form `shared/` folder. Needs a clearer concept:
  - `artifacts[]` — files the agents produce, live under `TP-NNN/shared/`.
  - `linkedFiles[]` — repo paths the task edits, live in the project's git repo.

## 7. Run Activity — active runs with timestamps + model
- Mockup right rail: live list of current runs (role or subagent) with start time and model.
- Not modeled. Needs an `ActiveRun` record, probably in-memory (derived from pi session events) rather than persisted.

## 8. Queue — tasks waiting on external events
- Mockup Queue: `DX-008F — Azure build callback pending`.
- Not just "status=waiting" — the queue tracks **what** is being waited on (build callback, human approval, etc.).
- Consider a `WaitingOn` enum or free-text reason field on `Task`.

## 9. Blocked duration
- Mockup Approval lane: `Blocked 18m` on a task.
- Need a timestamp for when the task entered its current waiting state so we can render "Blocked Nm/h".

## 10. Agent primary / fallback model pairs
- Mockup sidebar: per-role pairing like "Codex • Claude fallback".
- Already covered by `AgentSlotSchema` — **no gap here**, just confirming it's carried forward.

## 11. Project source integration
- Mockup: "GitHub repo linked", "Azure DevOps linked".
- `ProjectSchema.source` is a free-form string. Consider a proper type: `{ kind: "github" | "azure-devops" | "local", repo?: string, url?: string }`.

## 12. Project stats in sidebar
- Mockup: "12 active • 3 waiting • 2 archived".
- These can be **derived** from the task list at render time — no schema change needed, just a `projectStats(project)` helper.

## 13. Model shown per task card
- Mockup task cards: `Model: Codex`, `Model: Local LLM`.
- `Task` has `currentRole` but not `currentModel`. Either add `currentModel` to Task, or join through the `AgentSlot` at render (simpler; less to persist).

## 14. Current project filter
- Mockup topbar: `"DogApp — Mission Control"`, and board pill `"Project: DogApp"`.
- Implies a **selected project** in app state. Not persisted in models, but needed in renderer state.

---

## Recommended next-step ordering

1. **Rename `dev` → `builder`** in models + store (small, clears the naming mismatch early).
2. **Add `taskType` enum + project-prefixed IDs** to the store (changes ID generation; do before much data exists).
3. **Introduce `Workflow` enum** — just Dev for now, but stub it so brainstorm / fix can be added without a schema migration later.
4. **Artifacts vs linked files** split — shapes how the renderer's files panel is built.
5. **Subagent model + run activity feed** — depends on pi session events; design alongside the IPC layer.

Items 11, 12, 13, 14 are renderer-only and can wait until after IPC is wired.
