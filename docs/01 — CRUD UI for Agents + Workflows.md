# Task: CRUD UI for Agents + Workflows in Settings

## Why

Today, agents and workflows are drop-a-folder. The only way to add or edit one
is through the IDE. The Settings tabs (Agents / Workflows) are read-only.
This blocks non-developer use of MC and slows the developer's own iteration.

## Goal

A user can create, duplicate, edit, and delete agents and workflows from the
Settings tabs without touching the filesystem manually.

## Scope (v1 — keep it tight)

- Settings → Agents tab gets: New / Duplicate / Edit / Delete buttons
- Settings → Workflows tab gets the same
- Each opens a modal or side panel with form fields + a markdown editor
- Saves write to `agents/<slug>/agent.json` + `prompt.md` (or workflow folder)
- Reload the in-memory registry after save

## Out of scope (v1)

- Visual workflow builder (drag agents into lanes) — JSON form is enough
- Validation that "this agent is referenced by these workflows" before delete
  — show a warning, but don't block
- Versioning / undo — the user can git-revert if they regret a change

## Files involved

- `src/shared/models.ts` — already has `AgentSchema` and `WorkflowSchema`; reuse
- `src/main/agent-loader.ts` — has the read path; add a write path mirroring it
- `src/main/store.ts` — likely owns the registry; expose `reloadAgents()` /
  `reloadWorkflows()` after disk write
- `src/preload/index.ts` — add `mc.agents.create/update/delete` and same for
  workflows
- `src/renderer/src/pages/Settings/Agents/` — list + form
- `src/renderer/src/pages/Settings/Workflows/` — list + form

## Form contents — agent

- Slug (kebab-case, validated, becomes folder name)
- Display name
- Role: primary | sub
- Model chain (ordered list with + / - / drag-reorder)
- prompt.md body (Monaco editor, markdown highlighting)
- Optional: rubric checklist (deferred — leave a placeholder div)

## Form contents — workflow

- Code (one uppercase letter)
- Slug
- Name
- Description
- Steps editor: ordered list, each row picks an agent + lane
  - Per-step toggles: `breakpoint`, `parallel`
  - Per-step `outputCode` field
- `babysitter` block: targetQuality (0-100 slider), maxIterations (1-10), mode dropdown

## Acceptance criteria

- Create a new agent "tester" via UI → folder `agents/tester/` exists with
  valid `agent.json` and `prompt.md`
- Edit an existing agent's prompt → file changes on disk, registry reload picks
  up new content WITHOUT a full app restart
- Delete an agent → folder removed, registry no longer lists it; if other
  workflows reference it, a confirmation modal warns first
- Same set of acceptance for workflows
- `npm run smoke` still passes — add `agent-loader.smoke.ts` cases for the new
  write path

## Gotchas

- Slug uniqueness must be enforced — collisions = silent overwrite
- `prompt.md` may be large; debounce the markdown editor's onChange
- Don't lose unsaved edits if the user navigates away without saving — confirm dialog
- Windows path quirks: build folder paths with `path.join`, not string concat