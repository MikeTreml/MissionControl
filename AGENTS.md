# AGENTS.md

Project-level instructions for AI agents running inside this repo.
Pi-mono auto-loads this file at session start (along with any parent-dir
AGENTS.md and `~/.pi/agent/AGENTS.md`). See `docs/PI-FEATURES.md`.

## What this project is

**Mission Control** — an Electron + TypeScript desktop app that orchestrates
AI coding agents. This repo IS Mission Control's own source.

- Data model: `src/shared/models.ts` (Zod schemas)
- Main (Electron + Node): `src/main/**` — stores, loaders, IPC
- Renderer (React): `src/renderer/src/**` — pages, components, hooks
- Agent definitions (that's you): `agents/<slug>/agent.json` + `prompt.md`
- Workflows: `workflows/<CODE>-<slug>/workflow.json`

## What you are

You're an agent loaded from one of the folders under `agents/`. Your own
`prompt.md` describes your specific job; this file describes the project
you're working on.

The pipeline is flexible: **users assemble workflows from the agent
library** under `library/`. Planner / Developer / Reviewer / Surgeon
are *example* agents, not a fixed roster — the workflow.js for a task
declares which agents run and in what order, and a Reviewer→Planner
loopback (incrementing `Task.cycle`) is one common shape. Subagents
(RepoMapper, DocRefresher, etc.) are spawnable by any agent.

## Ground rules for changes

- **Baby steps.** Smoke test or typecheck between changes. The smokes are
  `src/main/*.smoke.ts` files, run with `node --experimental-strip-types`.
  Or `npm run smoke` for all of them.
- **File-first.** Persistence is JSON + markdown on disk under `userData/`.
  No SQLite, no DB server. Don't add one.
- **Don't hardcode labels.** If a value comes from a file, read it.
- **Flexible over prescribed.** New agents / workflows / subagents are
  drop-a-folder, not code changes.
- **Pi owns the runtime.** Don't duplicate model dispatch, session
  management, or event streaming — MC is the orchestrator + UI only.

## Marker conventions

When you leave notes in code, tag them so humans can find them later:

- `// CONFIRMED:` — design decision locked in by the user
- `// PROPOSED:` — your suggestion, not yet validated
- `// OPEN:` — unresolved question, needs human input
- `// PI-WIRE:` — the specific spot pi integration lands
- `// TODO:` — pending work

Grep these whenever orienting.

## Where to find things

- **Full orientation:** `docs/HANDOFF.md`
- **Workflow execution model:** `docs/WORKFLOW-EXECUTION.md` — how tasks
  actually move between you and the next agent (babysitter-driven)
- **Pi-mono capabilities:** `docs/PI-FEATURES.md`
- **Pi ecosystem survey:** `docs/PI-EXTENSIONS-SURVEY.md`
- **Patterns worth borrowing:** `docs/IDEAS-WORTH-BORROWING.md`
- **Mockup features not built yet:** `FORGOTTEN-FEATURES.md`
- **Claude Code orientation:** `CLAUDE.md`

## Task conventions

- Task IDs: `<PREFIX>-<NNN><W>` where `<W>` is a single uppercase workflow
  letter (F=Feature, X=Brainstorm, etc.). `DA-001F` is task 1 of workflow F
  in project DA.
- Task-linked files use `<taskId>-<agentCode>`:
  - `DA-001F` — base manifest (no agent code)
  - `DA-001F-p` — Planner output (primary roles get 1-char codes)
  - `DA-001F-rmp` — RepoMapper subagent output (subagents get 2-4 char codes)
- Each task folder has:
  - `PROMPT.md` — the mission. Re-rendered by MC on each Start so edits to
    the task's title/description propagate. Read this for context.
  - `STATUS.md` — append-only progress log. MC seeds it at create-time
    and auto-appends lifecycle milestones (Started, Stopped, Run ended,
    Item N done — for campaign tasks). You should also append your own
    one-line updates as you work — that's what humans tail to see what
    the run is doing.
  - `events.jsonl` — structured event journal (lane changes, run events,
    pi tool calls). Don't write here directly; MC appends.
  - `workspace/` — pi's cwd when the task's project has no `path`. Files
    you produce here live with the task. When the project DOES have a
    path, that's pi's cwd instead.
  - `manifest.json` — the persisted Task — don't edit by hand.

## Campaign tasks

When `task.kind === "campaign"`, MC iterates `task.items[]` — one pi
session per item, in order. Each item has `{ id, description, status,
notes }`. Status flows: `pending → running → done` (or `failed`). MC
fires `item-started`/`item-ended` events around each iteration; STATUS.md
gets `Item <id> started/done — N pending` lines. Failed items don't
halt the campaign; the next pending item starts. If you're handling a
campaign item: do the work for THIS item only, summarize what you
produced, then stop. The orchestrator handles the rest.

## Hand-off pattern

When a role completes a cycle, write a HANDOFF.md in the task folder for
the next role:

```markdown
# Handoff from <your role> → <next role>
## What I did
## What remains
## What to watch for
## Anything I'm uncertain about
```

The next role reads HANDOFF.md first, not the full prior transcript. This
is how we survive context resets without losing state.

## Don't

- Don't rewrite large areas outside scope
- Don't skip tests because "it obviously works"
- Don't fabricate decisions that weren't made — leave them as `OPEN:` if unclear
- Don't commit secrets (API keys, tokens). Keys live in env vars; see
  `CLAUDE.md` §"Secrets handling".
