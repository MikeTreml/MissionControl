# MC Workflow Template — Options Guide

Reference doc for designing a `workflow.json` and the per-run overlay UI.
Plain English first, then the schema. Read top-to-bottom.

---

## 1. Glossary — six overlapping terms, one place

These all show up around workflows. They mean different things in different
layers and people get them confused (including me, earlier).

| Term      | Where it lives                | What it actually is                                                               | Example                                         |
| --------- | ----------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| Lane      | **MC UI only** (kanban board) | A column on the board. Shows tasks AT a stage right now.                           | `Plan` / `Build` / `Review` / `Approval` / `Done` |
| Step      | `workflow.json`               | One position INSIDE a workflow. Assigns an agent.                                  | `step 2: developer runs after planner`           |
| Phase     | Babysitter `.js` files        | A logical grouping of related tasks inside a process file. Comment-level.          | `// PHASE 1: RESEARCH`                          |
| Wave      | Swarm-extension YAML          | A set of agents that run in parallel (topological group from a DAG).               | `wave 2: api + ui + tests run together`         |
| Cycle     | MC (your AGENTS.md)           | One pass through the whole workflow. Reviewer kicked back to Planner = new cycle. | `cycle=1, cycle=2`                              |
| Iteration | Babysitter convergence loop   | One round of fix-and-re-verify until a quality threshold is met.                  | `iteration 3: score=85, target=80`              |

**Key correction:** *Lane is NOT a babysitter concept.* It's an MC-only UI
concept. A workflow step can be tagged with which lane it visually shows up in,
but the babysitter side doesn't know or care about lanes.

---

## 2. The two-layer model

Workflows have **two** files contributing to a run:

1. **`workflow.json`** — the static template. Lives in
   `workflows/<CODE>-<slug>/`. Author once, reuse for many tasks.
2. **`<task>/manifest.json`** — the per-run overlay. Created by MC when you
   click Start. Carries any per-run overrides (model swap, target quality,
   skip a breakpoint).

UI flow:
- *Create workflow* → form edits `workflow.json`
- *Start workflow on a task* → "Run settings" panel reads `workflow.json`,
  shows defaults, lets you tweak; saves the merged result into the task's
  `manifest.json` so the run is reproducible.

---

## 3. Workflow template — full schema

Annotated example of every option. Copy/edit.

```json
{
  "code": "F",
  "slug": "feature",
  "name": "Feature",
  "description": "Standard feature pipeline.",

  "lanes": ["plan", "build", "review", "fix"],

  "steps": [
    {
      "id": "plan",
      "agent": "planner",
      "lane": "plan",
      "outputCode": "p",
      "modelOverride": null
    },
    {
      "id": "build",
      "agent": "developer",
      "lane": "build",
      "outputCode": "d",

      "parallel": false,
      "fanOut": null,

      "subagents": ["repomapper"],

      "modelOverride": null
    },
    {
      "id": "review",
      "agent": "reviewer",
      "lane": "review",
      "outputCode": "r",

      "breakpoint": false,
      "breakpointReason": null,

      "qualityGate": {
        "field": "score",
        "minimum": 80
      },

      "onFail": {
        "action": "loopBackTo",
        "target": "plan",
        "maxCycles": 3
      }
    },
    {
      "id": "fix",
      "agent": "surgeon",
      "lane": "fix",
      "outputCode": "s",

      "runWhen": "review.verdict === 'revise'"
    }
  ],

  "babysitter": {
    "targetQuality": 80,
    "maxIterations": 3,
    "mode": "sequential",
    "logLevel": "info",
    "stopOnFirstFailure": false
  },

  "humanGates": ["plan"],

  "campaign": {
    "iteratesItems": false,
    "perItemMode": "sequential"
  }
}
```

### Field-by-field

#### Top level

- **`code`** — single uppercase letter, becomes the `<W>` in `<PREFIX>-<NNN><W>` task IDs. `F`, `X`, `M`, `B` (Bug), `R` (Refactor)…
- **`slug`** — kebab-case, used in folder name and URLs.
- **`name`** — human label shown in UI.
- **`description`** — one-liner shown in the workflow picker.
- **`lanes`** — ordered list of UI lane codes this workflow uses. Steps reference them. *Pure UI* — babysitter never reads this.

#### Per-step

- **`id`** — unique within this workflow, used in `loopBackTo`, `runWhen`, etc.
- **`agent`** — slug of an agent in `agents/<slug>/`.
- **`lane`** — which lane the task moves to while this step runs. UI only.
- **`outputCode`** — the suffix on the task-linked artifact (e.g. `DA-001F-p`). Single char or short string.
- **`parallel`** — when `true`, this step is a fan-out point. See §4.
- **`fanOut`** — when set, runs N copies of `agent` in parallel with different inputs. See §4.
- **`subagents`** — list of subagent slugs the primary agent CAN spawn. Soft permission, not enforced today.
- **`modelOverride`** — force a specific model for this step, ignoring the agent's own model chain.
- **`breakpoint`** — when `true`, MC pauses and asks the human to approve before advancing.
- **`breakpointReason`** — text shown in the approval UI.
- **`qualityGate`** — structured threshold the agent's output must pass. MC reads the agent's output JSON and checks the field.
- **`onFail`** — what to do when the gate fails. Today supports `loopBackTo` with a `maxCycles` cap.
- **`runWhen`** — JS expression evaluated against prior step outputs. Skip the step if false. Keep these expressions tiny — debugging conditions in JSON is awful.

#### `babysitter` block (the runtime knobs)

Every field here is a default that the per-run "Run settings" panel can override.

- **`targetQuality`** — 0-100. Default convergence threshold. Steps without their own `qualityGate` use this.
- **`maxIterations`** — global cap on convergence loops. Failsafe.
- **`mode`** — `sequential` (default), `parallel`, `pipeline`. Top-level execution mode.
  - `sequential` = one step at a time, declaration order
  - `parallel` = run everything that doesn't depend on prior steps simultaneously
  - `pipeline` = repeat the whole workflow N times (campaign-style)
- **`logLevel`** — `info` / `debug` / `error` for `ctx.log()` output in events.jsonl.
- **`stopOnFirstFailure`** — if a step throws, do we abort the whole workflow or try to keep going?

#### `humanGates`

Convenience list — step IDs that should require human approval.
Equivalent to setting `breakpoint: true` on each. Use whichever feels cleaner.

#### `campaign`

For workflows like `M-maintenance-forever` that iterate over `task.items[]`.

- **`iteratesItems`** — if true, MC runs the workflow once per item.
- **`perItemMode`** — `sequential` / `parallel`. Run items one at a time, or fan them all out.

---

## 4. Parallel patterns — the three flavors

You'll need different shapes for different cases. Here's the menu.

### 4a. Static parallel — known agent set

Two named agents, both run, then a synthesizer picks up.

```json
{
  "id": "build",
  "parallel": true,
  "agents": ["developer-a", "developer-b"]
}
```

Babysitter equivalent: `ctx.parallel.all([...])`.

### 4b. Dynamic fan-out — N copies, one per input

You have 5 files to refactor. Spawn 5 dev sessions, one per file.

```json
{
  "id": "refactor-files",
  "agent": "developer",
  "fanOut": {
    "source": "plan.tasks",
    "as": "task",
    "maxConcurrency": 3
  }
}
```

Babysitter equivalent: `ctx.parallel.map(plan.tasks, t => ctx.task(devTask, t))`.

`maxConcurrency` caps how many run at once (rate-limit sanity).

### 4c. Pipeline — same agents, N iterations

Run the whole thing 25 times, each iteration accumulates.
Maps to `mode: "pipeline"` + `target_count` at the top level (NOT per step).

---

## 5. Quality gates — what the gate sees

The gate reads the step's output file (`<task>-<outputCode>.json` or `.md` with
parseable JSON block). MC enforces:

```js
output[qualityGate.field] >= qualityGate.minimum
```

Common shapes:

```json
"qualityGate": { "field": "score", "minimum": 80 }
"qualityGate": { "field": "verdict", "equals": "ship" }
"qualityGate": { "field": "blockers.length", "maximum": 0 }
```

If gate fails → trigger `onFail`. Today only `loopBackTo` is implemented; later
add `escalate` (require human) and `abort`.

---

## 6. Things deliberately NOT in v1

To stop the schema from sprawling:

- **Conditional branches based on dynamic data** — beyond simple `runWhen`, no full DAG editor. Use multiple workflows instead.
- **Cross-workflow handoffs** — one workflow per task. No "complete this in F-feature, then send to M-maintenance-forever."
- **Approval routing** — breakpoints are binary (approve/reject); no "send to user X for approval, fall back to Y."
- **Time-based triggers** — schedule lives outside MC for now.

These are fine to add later. Don't add them on day one.

---

## 7. Per-run overlay — what the Run Settings panel touches

When the user clicks Start on a task, they see a panel that lets them
override (without editing the workflow file):

- `babysitter.targetQuality` — slider
- `babysitter.maxIterations` — number
- Per-step `modelOverride` — dropdown of available models
- Per-step `breakpoint` — toggle (force human gate even if workflow doesn't)
- Skip a step entirely — checkbox

Whatever they tweak gets merged into the task's `manifest.json` under a
`runSettings` field, so the run is reproducible and auditable later.

---

## 8. Where this fits in MC code

- Schema: `src/shared/models.ts` — extend `WorkflowSchema` with the new fields above
- Loader: `src/main/agent-loader.ts` (or whatever owns workflow loading) — read the new fields
- UI:
  - Workflow CRUD form: `src/renderer/src/pages/Settings/Workflows/`
  - Run Settings panel: `src/renderer/src/pages/TaskDetail/RunSettings.tsx`
- Smoke: `src/main/workflows.smoke.ts` — assert load + validate the new schema

Keep additions baby-stepped: ship the schema + the per-step `breakpoint` + `qualityGate` first. Add `parallel`/`fanOut` in a later iteration once the sequential case is rock-solid.