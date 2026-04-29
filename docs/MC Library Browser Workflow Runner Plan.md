# MC: Library Browser + Workflow Runner — Plan

A real spec covering everything from "browse the library" to "watch a workflow
run" to "see the result." Written so a planner agent can break it into tasks
and a developer agent can implement.

---

## 1. Three connected features

| Feature | What it does | Lives at |
|---|---|---|
| **Library Browser** | Tree of every agent, skill, workflow, example. Filter, search, multi-select. | new page in MC |
| **Workflow Runner** | Pick a workflow, supply inputs, pick a project, hit Start. Watch it run. See artifacts. | new page in MC, ties into existing TaskDetail |
| **Workflow Author** | Pick agents + skills + a template workflow, ask AI to write a NEW workflow that uses them. | modal off Library Browser |

Each is independently shippable but shares one data layer.

---

## 2. Data layer (what files exist, what they contain)

### 2.1 `library/_index.json` — generated, not hand-written

Built by walking `library/` on disk. Single source of truth for the UI.

```json
{
  "generatedAt": "2026-04-29T...",
  "summary": { "agents": 1329, "skills": 2012, "workflows": 2143 },
  "items": [
    {
      "kind": "agent" | "skill" | "workflow" | "example",
      "id": "library-path-as-id",          // e.g. "agents/methodologies/metaswarm/coder"
      "name": "coder",                     // last path segment
      "diskPath": "C:/.../library/agents/methodologies/metaswarm/coder/AGENT.md",
      "logicalPath": "methodologies/metaswarm/agents/coder",  // for runtime references

      "container": "metaswarm",
      "containerKind": "methodology",      // specialization | methodology | cradle | contrib | core
      "domainGroup": null,                 // "business" | "science" | etc., when applicable

      "description": "...from frontmatter...",
      "role": "implementation",
      "expertise": ["typescript", "javascript"],
      "languages": ["typescript", "javascript"],
      "tags": ["coder"],

      "originalSource": {
        "repo": "dsifry/metaswarm",
        "url": "https://github.com/dsifry/metaswarm",
        "license": "MIT",
        "viaUpstream": "a5c-ai/babysitter"
      },

      "version": "1.0.0",
      "sizeBytes": 8446,
      "modifiedAt": "2026-01-23T..."
    }
  ]
}
```

For workflows, additional fields:

```json
{
  "kind": "workflow",
  "inputsSchemaPath": "...inputs.schema.json",  // null if no schema
  "examplesDir": ".../examples/",                // null if no examples
  "companionDoc": ".../README.md",               // long-form doc
  "usesAgents": ["specializations/.../planner"], // parsed from defineTask calls
  "usesSkills": ["specializations/.../run-tests"],
  "estimatedSteps": 4,                           // number of ctx.task calls
  "hasParallel": true,                           // ctx.parallel.all() present
  "hasBreakpoints": true                         // ctx.breakpoint() present
}
```

### 2.2 `library/_meta.json` — per-container, hand-written

Sits at the root of each container (specialization or methodology). Carries
attribution and bulk metadata that propagates to every item inside.

```json
{
  "containerKind": "methodology",
  "displayName": "MetaSwarm",
  "originalSource": {
    "repo": "dsifry/metaswarm",
    "url": "https://github.com/dsifry/metaswarm",
    "license": "MIT",
    "absorbedBy": "a5c-ai/babysitter",
    "absorbedAt": "2025-XX-XX"
  },
  "languagePrimary": "typescript",
  "languagesSupported": ["typescript", "javascript"],
  "tags": ["multi-agent", "subagent-coordination"],
  "summary": "Sub-agent coordination patterns from metaswarm"
}
```

Walker reads this and propagates `originalSource`, `languages`, etc. to every
item under that container without per-item tagging.

### 2.3 The walker — `scripts/build-library-index.ts`

```
input:  library/  (the folder tree)
output: library/_index.json
```

Steps:

1. `glob` every `AGENT.md`, `SKILL.md`, `workflow.js`, `*.json` under `library/`
2. For each: parse frontmatter (markdown), parse `defineTask` calls and JSDoc (`.js`), or just record path (`.json` examples)
3. Walk up to the nearest `_meta.json` and merge its propagated fields
4. Build the items array
5. Write `_index.json` with summary stats

Run modes:
- One-shot CLI: `npm run build-library-index`
- Watch mode for dev: re-runs on disk change
- Hooked into `npm run setup` so first launch always has a fresh index

### 2.4 Per-task folders (already exists in MC's AGENTS.md)

When a workflow runs, MC creates `<userData>/tasks/<taskId>/`:

```
DA-001F/
├── manifest.json        ← persisted Task (auto-managed by MC)
├── PROMPT.md            ← re-rendered on each Start from the workflow + inputs
├── STATUS.md            ← append-only progress log; humans tail this
├── events.jsonl         ← structured event stream from pi
├── workspace/           ← pi's cwd (when project has no path)
├── HANDOFF.md           ← updated by each agent for the next
└── DA-001F-p-c1.md      ← per-agent artifacts (planner, cycle 1)
    DA-001F-d-c1.md      ← developer cycle 1
    DA-001F-r-c1.json    ← reviewer cycle 1
    DA-001F-p-c2.md      ← planner cycle 2 (after kickback)
    ...
```

Already documented. Pull through — runner needs no new conventions.

---

## 3. Library Browser — the tree UI

### 3.1 Layout

```
┌─ Library Browser ─────────────────────────────────────────┐
│  [search box]  [filter chips: language, kind, source...]  │
├──────────────────────┬────────────────────────────────────┤
│ TREE                 │  DETAIL PANEL                      │
│                      │                                    │
│ ☐ ▾ Agents (1,329)   │  Selected: figma-integration       │
│   ☐ ▾ specializations│  ───────────────                   │
│     ☐ ▾ ux-ui-design │  Senior Design Technologist...     │
│       ☐ ab-testing   │  Languages: TS, JS                 │
│       ☐ figma-integ. │  From: dsifry/metaswarm via baby.. │
│   ☐ ▾ methodologies  │  Used by: 4 workflows              │
│ ☐ ▸ Skills (2,012)   │  [Star as template] [Add to bag]   │
│ ☐ ▸ Workflows        │                                    │
│ ☐ ▸ Examples         │                                    │
└──────────────────────┴────────────────────────────────────┘
│ SELECTION BAG (running list of checked items)             │
│ • figma-integration (agent)                               │
│ • figma-api (skill)                                       │
│ • component-library (workflow, ★ template)                │
│ [Generate Workflow From Selection] [Clear]                │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Tree behavior

- Click parent checkbox → checks all children. Indeterminate state when partial.
- Click a row → loads detail panel (no selection change).
- ★ icon on workflow rows → "Use as template." Single-select; clicking another star moves the marker. Orthogonal to checkbox.
- Right-click row → context menu: copy logical path, open AGENT.md/SKILL.md/workflow.js source, view raw JSON metadata.

### 3.3 Filter chips (above tree)

| Chip | Source | Example |
|---|---|---|
| Language | item.languages[] | `typescript`, `python`, `x++` |
| Kind | item.kind | `agent`, `skill`, `workflow`, `example` |
| Source | item.originalSource.repo | `dsifry/metaswarm`, `a5c-ai/babysitter`, `MikeTreml/...` |
| Container kind | item.containerKind | `specialization`, `methodology`, `cradle`, `contrib` |
| Domain group | item.domainGroup | `business`, `science`, `social-sciences-humanities` |
| Tag | item.tags[] | `coder`, `reviewer`, `multi-agent` |
| Has tests | derived (workflow has examples folder) | bool |

Chips are AND-combined. Multiple values within one chip are OR'd.

### 3.4 Search

Plain text matches against `id`, `name`, `description`, `tags`, `languages`, `expertise`, `originalSource.repo`. Live-filters the tree; counts update on each parent.

Path-style queries also work: `methodologies/metaswarm/coder` → exact match. `agent:figma` → kind-restricted. `language:x++` → equivalent to filter chip.

### 3.5 Selection bag

Persists during session (resets on app close unless user "saves selection set"). Drives the Generate button.

---

## 4. Workflow Runner — invoking + watching

### 4.1 Pre-run config (modal off a workflow row)

```
┌─ Run Workflow: cog-second-brain/cog-orchestrator ────────┐
│                                                          │
│  Inputs:                                                 │
│  ┌─ Auto-generated form from inputs.schema.json ──────┐ │
│  │  • topic         [textarea]                        │ │
│  │  • iterations    [number, default 25]              │ │
│  │  • model         [dropdown of available models]    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Project:    [dropdown of MC projects]                   │
│  Workflow:   [info — read from _index.json]              │
│  Cycle policy: [auto-loop / manual-approval / no-loop]   │
│                                                          │
│  Run settings (override workflow defaults):              │
│  • targetQuality   [slider 0-100, default from .js]      │
│  • maxIterations   [number, default 3]                   │
│  • Per-step model overrides:                             │
│      planner   [model dropdown]                          │
│      developer [model dropdown]                          │
│      reviewer  [model dropdown]                          │
│  • Force breakpoints: ☐ planner ☐ reviewer ☐ surgeon     │
│                                                          │
│  Tags (free-form, for filtering later runs):             │
│  [coding, ts, dogfood]                                   │
│                                                          │
│       [Cancel]    [Save as Template]    [Start]          │
└──────────────────────────────────────────────────────────┘
```

Form auto-generates from `inputs.schema.json` (the `.schema.json` files we
saw in `devops-sre-platform/`). If no schema: free-form JSON editor with
the workflow's example as starter content.

`Save as Template` → drops the filled inputs into MC's `templates/` for
re-use. Saves "I always run this workflow against this project with these
defaults."

### 4.2 What Start actually does

1. MC creates task: assigns `taskId` (e.g. `DA-001F`), creates folder, manifest, PROMPT.md, STATUS.md
2. Resolves the workflow path against `_index.json` → finds the `.js` file on disk
3. Spawns a pi `AgentSession` with the resolved inputs as the user message
4. Listens to pi event stream → appends to `events.jsonl` and updates RunActivity rail
5. On `agent_end` → flips MC task state, fires next step or finishes

### 4.3 Live status panel (during run)

```
┌─ DA-001F: cog-second-brain (Running) ───────────────────┐
│                                                          │
│  Step 2 of 5: developer    Cycle 1                      │
│  Started 0:07:23 ago    Tokens: 12,403 in / 4,521 out   │
│  Cost: $0.18    Model: claude-sonnet-4-5                │
│                                                          │
│  ┌── Step Progress ──────────────────────────────────┐  │
│  │  ✓ planner          0:01:12   $0.04   (cycle 1)   │  │
│  │  ▶ developer        0:06:11   $0.14   (cycle 1)   │  │
│  │    reviewer         pending                        │  │
│  │    surgeon          pending                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Live log:                                               │
│  10:07  pi:tool_use      bash (npm test)                │
│  10:07  pi:tool_result   2 failures                      │
│  10:07  pi:message       "I see two type errors..."     │
│                                                          │
│         [View files]  [Pause]  [Cancel]                  │
└──────────────────────────────────────────────────────────┘
```

State machine that drives this:

| State | When | UI |
|---|---|---|
| `queued` | task created, not started | grey, "Start" button shown |
| `running:<step>` | currently executing step `<step>` | blue, progress bar pulses |
| `awaiting-human` | breakpoint hit | yellow, [Approve][Reject] buttons |
| `parallel:<n/m>` | parallel step, n of m agents done | progress bar shows fraction |
| `cycle-loop` | reviewer kicked back, cycle++ | orange "Cycle 2" badge |
| `failed` | error or quality gate failed past maxIterations | red, [Retry] [Postmortem] buttons |
| `done` | workflow returned success | green |

### 4.4 Status display — three places

1. **Per-task page**: full status panel shown above
2. **Project board**: each task tile shows `▶ developer (cycle 1)` or status badge
3. **Global Run Activity rail** (already in MC): live stream of step-events across all running tasks

### 4.5 Cycle / iteration display

When reviewer kicks back to planner:

```
Cycle 1 [completed]   ▼
  ✓ planner    DA-001F-p-c1.md
  ✓ developer  DA-001F-d-c1.md
  ✓ reviewer   DA-001F-r-c1.json   verdict: revise
                ↓ kicked back

Cycle 2 [running]    ▼
  ✓ planner    DA-001F-p-c2.md
  ▶ developer  (in progress)
    reviewer
```

User can expand any cycle, click any artifact filename to view content side-by-side.

### 4.6 Breakpoint / human gate

When workflow hits `ctx.breakpoint()`:

```
┌─ Approval Required: Plan Review ────────────────────────┐
│                                                          │
│  Reviewer asks:                                          │
│    "Approve plan for the new auth middleware? See        │
│    artifacts/plan.json"                                  │
│                                                          │
│  Files to review:                                        │
│    ▢ DA-001F-p-c1.md  (planner output)                   │
│                                                          │
│  Notes for the next step (optional):                     │
│  [free-form text]                                        │
│                                                          │
│       [Approve]    [Reject]    [Defer]                   │
└──────────────────────────────────────────────────────────┘
```

`Approve` → workflow continues. `Reject` → workflow halts with reason. `Defer` → status becomes `awaiting-human`, picks up later.

---

## 5. Workflow Author — generate from selection

Triggered by Library Browser's `Generate Workflow From Selection` button.

### 5.1 Generate prompt assembly

Input: the selection bag + the user's free-form goal.

Output: a prompt the user can review/edit before sending to AI.

```markdown
# Build a new babysitter workflow

## Goal
{{user free-form goal text}}

## Available agents (you may use any of these)
- `methodologies/metaswarm/agents/coder` — Senior Design Technologist...
- `agents/core/planner` — Mission Control planner...
(one bullet per checked agent, with first 200 chars of AGENT.md)

## Available skills
- `skills/figma-api` — Direct Figma API access...
(one bullet per checked skill, allowed-tools list included)

## Reference workflows (study these for shape, do not copy)
{{checked workflows: full source code, fenced}}

## Template (preferred shape — match this structure)
{{starred workflow: full source code, fenced}}

## SDK conventions
- export async function process(inputs, ctx)
- Use defineTask() to declare each step
- ctx.task() for sequential agent calls
- ctx.parallel.all([...]) for fan-out
- ctx.breakpoint(...) for human gates
- Reference agents/skills by their library path

## Output
Produce ONE .js file. No prose. Strict JavaScript that parses.
```

### 5.2 AI dispatch

Modal shows the assembled prompt, user can edit it, hits `Send to AI`. MC routes to whichever model the user has configured (typically their planner or a dedicated authoring model). AI returns a `.js` file body.

### 5.3 Save flow

```
[ Workflow Code ]: F  (single uppercase letter, e.g. F=Feature, R=Refactor)
[ Slug ]:          new-x++-table
[ Display Name ]:  New X++ Table
[ Categorize ]:    workflows/d365fo/ ▼
                                                    [Save Workflow]
```

Save writes:
- `workflows/<category>/<CODE>-<slug>/workflow.js`
- `workflows/<category>/<CODE>-<slug>/workflow.json`
- `workflows/<category>/<CODE>-<slug>/_generation-prompt.md` (the original prompt — for reproducibility)
- `workflows/<category>/<CODE>-<slug>/README.md` (auto-stub from goal)

Now the workflow shows up in the runner, can be invoked like any other.

---

## 6. Things you might be missing — don't skip these

### 6.1 Cost tracking

Every step writes to `artifacts/<taskId>-<step>.metrics.json`:

```json
{
  "step": "planner",
  "cycle": 1,
  "model": "claude-sonnet-4-5",
  "tokensIn": 4321,
  "tokensOut": 1234,
  "costUSD": 0.04,
  "wallTimeSeconds": 72,
  "retries": 0
}
```

Aggregate at task level on completion. Show total $ on the task tile and in the project's metrics page.

Important per your existing memory: do this BEFORE you have lots of runs. Becomes a query, not a vibe.

### 6.2 Cancellation

Cancel button on running tasks: sets pi session aborted, fires `step:end status=cancelled`, marks task `cancelled` (not failed). Artifacts produced so far stay; no rollback.

### 6.3 Resume after crash / restart

MC restarts → reads every `<taskId>/manifest.json` with `status: running`. For each:
- Check pi sessions still alive (pi has SessionManager). If yes, re-attach event listeners.
- If pi process is gone: mark task `interrupted`, offer `Resume` button. Resume re-creates pi session with the same inputs + cycle context, continues from last completed step.

This is critical. Without it, a power blip costs you a 30-minute workflow run.

### 6.4 Concurrent runs / queueing

MC may have N tasks running at once. Pi can spawn multiple sessions. But:
- Rate limits — the model API throttles at X req/min. Queue and back off.
- Local resource caps — don't spawn 30 dev sessions at once even if user clicks 30 Start buttons. Cap concurrent tasks (default 4, configurable in Settings).

### 6.5 Versioning of generated workflows

When user saves a generated workflow, MC writes the `_generation-prompt.md` sidecar. If they re-generate (different goal, same agents), they get a new workflow folder, not an overwrite. Old workflow is preserved. Git history is the audit trail.

For workflows the user manually edits after generation: standard git diff. The `_generation-prompt.md` becomes "what was generated;" diffs from there are "what was hand-edited." Useful for the dogfood loop.

### 6.6 Cross-references — impact analysis

If you delete or rename an agent in `agents/...`, what breaks? Index reverse-references: every workflow.js's `defineTask({ agent: { name: '...' } })` is recorded in `_index.json` as `usesAgents: [...]`. Reverse map: `agent.usedByWorkflows: [...]`.

Detail panel for an agent shows "Used by 4 workflows" — clicking goes to the list. Before deleting an agent, MC warns "this is referenced by N workflows."

### 6.7 Side-by-side runs (your A/B testing intent)

Per your memory: you want to compare configurations empirically. New page in MC: pick a workflow, run it twice with different settings (different model on planner, different rubric, etc.), see both runs side-by-side, compare artifacts, costs, durations.

```
┌─ Side-by-side: F-001F vs F-001F-alt ─────────────────────┐
│                                                           │
│  Variant A                       Variant B                │
│  Planner: claude-opus            Planner: gpt-5.3         │
│  Cycles: 2                       Cycles: 1                │
│  Cost: $1.42                     Cost: $0.71              │
│  Duration: 18m                   Duration: 11m            │
│  Reviewer score: 87              Reviewer score: 92       │
│                                                           │
│  [diff DA-001F-d-c1.md  vs  DA-001F-alt-d-c1.md]          │
└───────────────────────────────────────────────────────────┘
```

Builds the dataset for "which config works better."

### 6.8 Privacy / scope

Your tasks may include code from a private repo, API keys, customer data. The library is public; tasks are local. Make this boundary explicit:

- `tasks/` is gitignored in MC by default
- Workflow generation prompt strips secrets before sending to AI
- Tags on tasks: `private`, `internal`, `public-share` — colored badges. User decides at task creation.

### 6.9 Schema validation at run time

Before starting a workflow, validate the inputs against `inputs.schema.json` (when present). Show a clear error like "field X is missing" rather than letting pi crash with a cryptic error two minutes in.

### 6.10 Search across past runs

`tasks/` accumulates. After 100 runs, "find me the run where I tried gpt-5.3 on cog-orchestrator" needs a search. MC indexes task manifests:

- by workflow used
- by tag
- by date range
- by status (success / failed / partial / cancelled)
- by cost range
- full-text in STATUS.md and artifacts

Reuses the same `_index.json`-style approach but for `tasks/_index.json`.

---

## 7. Phasing — what to build first

Each phase is independently shippable. Stop after any if priorities shift.

| Phase | Deliverable | What it unlocks |
|---|---|---|
| **1** | Walker → `_index.json` | Library is queryable; everything else builds on this |
| **2** | Library Browser tree (read-only, search/filter) | Browse the library, no actions |
| **3** | Library Browser multi-select + selection bag | Selection state, no Generate yet |
| **4** | Workflow Runner: invoke + status panel + per-task folder | Can RUN workflows from library, watch them, see artifacts |
| **5** | Cost tracking + per-step metrics | Empirical comparisons become possible |
| **6** | Cancellation + Resume | Long runs survive interruption |
| **7** | Workflow Author: generate prompt preview, manual paste-to-AI | Compose new workflows from library; no automation yet |
| **8** | AI dispatch + Save flow | Full authoring loop |
| **9** | Side-by-side A/B runs | Empirical config comparison |
| **10** | Cross-reference index + impact warnings | Refactor safely |
| **11** | Past-runs search | Long-term task history is navigable |

Phases 1-4 are the load-bearing core. After phase 4 you have a usable library
browser AND a working runner, which is most of the value.

---

## 8. Files this depends on (existing or to-be-created)

**Already exists in MC:**
- `src/shared/models.ts` — Zod schemas (extend with `IndexEntry`, `RunSettings`, etc.)
- `src/main/pi-session-manager.ts` — pi session lifecycle (smoke tested)
- `src/main/run-manager.ts` — task lifecycle (smoke tested)
- `src/main/agent-loader.ts` — currently loads `agents/*/agent.json`

**To create:**
- `src/main/library-walker.ts` — produces `_index.json` from disk
- `src/main/library-resolver.ts` — translates logical paths to disk paths (only needed if MC's library/ shape diverges from babysitter convention; with current plan, no translation needed)
- `src/main/run-cost-tracker.ts` — records per-step metrics
- `src/main/run-resumer.ts` — re-attaches to live pi sessions on MC restart
- `src/renderer/src/pages/Library/` — the browser page
- `src/renderer/src/pages/Library/Tree.tsx`, `FilterBar.tsx`, `DetailPanel.tsx`, `SelectionBag.tsx`
- `src/renderer/src/pages/TaskDetail/StatusPanel.tsx` — live progress
- `src/renderer/src/pages/TaskDetail/CycleView.tsx` — iteration display
- `src/renderer/src/components/InputsForm.tsx` — auto-generated from JSON Schema
- `scripts/build-library-index.ts` — CLI walker

---

## 9. Open questions you should answer before starting

1. **Where is `library/`?** — `mc-v2-electron/library/` (bundled in repo) or `~/.mc/library/` (per-user, populated by setup script)? Affects shareability.
2. **`_meta.json` population** — backfill all 75 containers manually, or have your planner agent infer from each container's README and write the `_meta.json` files as a one-time dogfood task?
3. **Models config** — where do per-step model choices come from? `agent.json.modelChain` per agent, plus `workflow.json.babysitter.modelOverrides` per step? Pick one ownership model.
4. **Concurrent task cap** — default 4? Configurable per workflow?
5. **Resume policy** — auto-resume on app restart, or always require user click?
6. **Generation prompt — exact AI** — your planner agent? A dedicated authoring model? User picks per generation? Probably the latter.