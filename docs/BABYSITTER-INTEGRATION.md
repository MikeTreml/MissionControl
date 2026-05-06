# Babysitter Integration Reference (MC ↔ BS)

> **Scope.** This is the reference MC uses to drive `@a5c-ai/babysitter-sdk`.
> Single-workspace setup only — MC always passes the user's project root as
> `--workspace`. No multi-workspace alternatives are documented here.
>
> Every claim is verified against the installed SDK source under
> `node_modules/@a5c-ai/babysitter-sdk/dist/`. File:line citations are given so
> this doc can be re-validated after SDK upgrades.

---

## 1. The minimum BS needs to start a run

```bash
babysitter run:create \
  --process-id <id>                                           \
  --entry      <abs-path-to-workflow.js>#process              \
  --inputs     <abs-path-to-inputs.json>                      \
  --prompt     "<one-line description>"                       \
  --workspace  <abs-path-to-project-root>                     \
  --runs-dir   <abs-path-to-project-root>/.a5c/runs           \
  --harness    <claude-code|pi|oh-my-pi|codex|cursor|gemini>  \
  --non-interactive                                           \
  --json
```

**Hard requirements** (validated by SDK):

| Flag | What the SDK does with it | Citation |
|---|---|---|
| `--process-id` | Stamped into `run.json`, used as orchestration label | `runtime/createRun.js` |
| `--entry <path>#<export>` | `import()`-ed at every iteration via the run-relative POSIX path | `runtime/createRun.js:102-115` |

**Effectively required for normal use** — not enforced by the SDK, but the run
is hard to interpret without them:

| Flag | Why MC must always pass it |
|---|---|
| `--workspace` | Anchors `cwd`, agentic-tool path boundary, `.a5c/` location |
| `--runs-dir`  | Where the run directory lives (default: `<workspace>/.a5c/runs`) |
| `--harness`   | Selects the LLM/CLI that will actually do the work |
| `--inputs`    | The frozen JSON payload replayed deterministically |
| `--prompt`    | Free-text description, surfaced in run history and audits |

**Optional flags** (most useful):

| Flag | Effect |
|---|---|
| `--run-id <id>` | Override the auto-generated ULID. Validated only as "non-empty string" (`runtime/createRun.js:97-101`). Becomes the run's directory name, so must be filesystem-safe. |
| `--non-interactive` | Auto-approves breakpoints; equivalent to "yolo" mode |
| `--model <name>` | Run-level default model. Per-task `execution.model` overrides this. |
| `--max-iterations <n>` | Caps replay loop iterations (default 256, env: `BABYSITTER_MAX_ITERATIONS`) |
| `--json` | Machine-readable stdout. MC parses these lines into journal events. |

**Environment knobs** (set in MC's spawn env, not on every command):

| Var | Default | Purpose |
|---|---|---|
| `BABYSITTER_RUNS_DIR` | `.a5c/runs` | Default `--runs-dir` |
| `BABYSITTER_MAX_ITERATIONS` | `256` | Default `--max-iterations` |
| `BABYSITTER_TIMEOUT` | `120000` | General op timeout (ms) |
| `BABYSITTER_HOOK_TIMEOUT` | `30000` | Per-hook timeout (ms) |
| `BABYSITTER_NODE_TASK_TIMEOUT` | `900000` | Long task timeout (ms) |
| `BABYSITTER_LOG_DIR` | `~/.a5c/logs` | Structured log location |
| `BABYSITTER_LOG_LEVEL` | `info` | Log verbosity |

---

## 2. The single workspace

MC always passes one workspace per run: the user's project root. The SDK uses it
in three concrete ways:

**1. CWD for the spawned harness child process.**
`harness/invoker.js:212` —
```js
const childCwd = name === "codex" ? process.cwd() : options.workspace;
```
Every harness CLI (claude-code, pi, omp, cursor, gemini) inherits this as its
working directory. Codex is the lone exception — it takes `process.cwd()` and
relies on `--workspace` flag-passing to position itself.

**2. Soft path boundary for the SDK's built-in agentic tools.**
`harness/agenticTools.js:116-129` defines `assertInsideWorkspace` and
`resolveSafe`:
```js
function assertInsideWorkspace(target, workspace) {
    const resolved = path.resolve(workspace, target);
    const normalizedWorkspace = path.resolve(workspace) + path.sep;
    const normalizedTarget = path.resolve(resolved);
    if (normalizedTarget !== path.resolve(workspace) &&
        !normalizedTarget.startsWith(normalizedWorkspace)) {
        throw new Error(`Path "${target}" resolves outside the workspace boundary.`);
    }
}
```
Every file read, file write, glob, grep, mermaid render and bash invocation
through the SDK's tool surface calls `resolveSafe(workspace, params.path)`
first. `..` traversal escapes throw.

This is **not** a security sandbox. The spawned harness CLI itself is free to
open absolute paths anywhere on disk; the OS will allow it. The boundary only
applies to tool calls that go through the SDK's agentic-tool layer. Treat
`--workspace` as an organizing convention, not isolation.

**3. Anchor for the `.a5c/` state tree.**
`harnessPhase2.js:533, 798` —
```js
stateDir: path.resolve(args.workspace ?? process.cwd(), ".a5c")
```
This is where runs, locks, journals, session state files, and profile files
live by default. With MC's single-workspace convention, all runs for a given
project end up under `<projectRoot>/.a5c/runs/<runId>/`. If `--runs-dir` is
passed separately, runs split out, but everything else still anchors here.

---

## 3. Run id strategy: task number = run id

`runtime/createRun.js:97-101` —
```js
function validateRunId(runId) {
    if (typeof runId !== "string" || runId.trim() === "") {
        throw new Error("runId must be a non-empty string");
    }
}
```

That is the entirety of the validation. There is no ULID requirement, no
length limit, no character whitelist beyond filesystem safety (the runId
becomes a directory name).

MC's task IDs (`<PREFIX>-<NNN><W>`, e.g. `DA-001F`) are filesystem-safe and
fit. Pass them via `--run-id <taskId>` on `run:create`.

Result: each task on disk gets `<projectRoot>/.a5c/runs/DA-001F/` containing
`run.json`, `journal/`, `tasks/`, `state/`, `blobs/`, and `run.lock`. MC's task
detail page can map 1:1 from task to run directory without lookup.

---

## 4. Workflow file shape

A workflow is a single JS file with a default-named `process` export. MC's
existing `library/**/workflows/*.js` files match this shape.

```js
import { defineTask } from '@a5c-ai/babysitter-sdk';

/**
 * @process some-id/some-workflow
 * @description Free-text description (read by the catalog)
 * @inputs  { ... }
 * @outputs { ... }
 */
export async function process(inputs, ctx) {
  const result1 = await ctx.task(stepOneTask, { ... });
  const result2 = await ctx.task(stepTwoTask, { result1, ... });
  return { success: true, result1, result2 };
}

export const stepOneTask = defineTask('step-one', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Human-readable phase title',
  agent: {
    name: 'general-purpose',           // see §6 for resolution rules
    skills: ['some-skill-name'],       // see §6
    prompt: { role, task, context, instructions, outputFormat },
    outputSchema: { type: 'object', required: [...] },
  },
  execution: {                         // optional — see §5
    model: 'claude-opus-4-7',
    harness: 'claude-code',
  },
  io: {
    inputJsonPath:  `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));
```

**Required at the top level:** `import { defineTask } ...`, an exported
`process` function with the `(inputs, ctx)` signature.

**Required per task:** `kind` and `title`. The other fields are kind-specific.

**Allowed `kind` values:**

| Kind | Use when |
|---|---|
| `agent` | Default. LLM/agent-driven phase. |
| `skill` | A matching installed skill exists (preferred over `agent` when available). |
| `shell` | Running an existing CLI tool, test suite, linter, build, or git command. The orchestrator must execute it intentionally and post the result. |
| `breakpoint` | Human approval gate. Auto-approved when run is `--non-interactive`. |
| `sleep` | Time-based pause. |
| ~~`node`~~ | **Forbidden.** Bypasses the agent orchestration model. |

---

## 5. Per-task model and harness control

Each `defineTask(...)` is independent. Different tasks in the same workflow
can target different models — and different harnesses — by setting their own
`execution` field.

`cli/commands/harnessPrompts.js:61, 68` —
> *"Tasks may include an `execution` field with `model`, `harness`, and
> `permissions`. `execution.model` is universal (plugins and internal harness).
> `execution.harness` and `execution.permissions` are only used by the
> internal harness (`harness:create-run`) and ignored by plugins."*
>
> *"Prefer `task.execution.harness` to route a task to a specific installed
> harness."*

The runtime resolves the effective model per effect at dispatch time
(`harnessPhase2.js:1019`): `delegationConfig.model ?? args.model`. So the
priority chain is:

1. `task.execution.model` (per-task, in the workflow file) — wins
2. `--model <name>` (run-level CLI flag) — fallback
3. Harness default — last resort

**Per-task harness** (e.g. one task on codex, the next on claude-code) requires
the parent run to be using the **internal** orchestration harness — that is,
spawned via `babysitter harness:create-run` without a single forced harness for
all tasks. When MC pins a single harness for the whole run via `--harness`, the
plugin honors `execution.model` but ignores `execution.harness`.

**Practical example** matching the OP's CUDA-kernel use case:

```js
export const operatorSpecificationTask = defineTask('operator-specification', (args, taskCtx) => ({
  kind: 'agent',
  title: `Operator Specification - ${args.operatorName}`,
  agent: {
    name: 'ml-inference-optimizer',
    skills: ['tensorrt-builder', 'cuda-toolkit'],
    // ...
  },
  execution: { model: 'claude-opus-4-7' },        // ← per-task model
  io: { ... },
}));

export const forwardKernelTask = defineTask('forward-kernel', (args, taskCtx) => ({
  kind: 'agent',
  title: `Forward Kernel - ${args.operatorName}`,
  agent: {
    name: 'cuda-kernel-expert',
    skills: ['cuda-toolkit', 'warp-primitives'],
  },
  execution: { model: 'codex/gpt-5' },            // ← different model, same workflow
  io: { ... },
}));
```

---

## 6. Agent name and skill resolution — what BS actually looks for

This is the section that explains why moving files around in `library/` does
not break agent links: **the link never pointed at `library/`**. The SDK
resolves names against fixed workspace-relative paths.

**Agent lookup** (`cli/commands/harnessUtils.js:568-581`):
```js
const subagentName = args.delegationConfig?.subagentName
    ?? readStringMetadata(metadata, "subagentName");
let agentDir;
if (subagentName) {
    const candidates = [
        path.join(args.workspace ?? process.cwd(), ".claude", "agents", subagentName),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            agentDir = candidate;
            break;
        }
    }
}
```

So `agent: { name: 'cuda-kernel-expert' }` is resolved as:
```
<workspace>/.claude/agents/cuda-kernel-expert/
```
**One candidate path. No recursion. No `library/` scan.**

**Skill lookup** (`cli/commands/harnessUtils.js:551-560`):
```js
const candidates = [
    path.join(args.workspace ?? process.cwd(), ".a5c",   "skills",  skillName, "SKILL.md"),
    path.join(args.workspace ?? process.cwd(), ".claude","plugins", skillName, "SKILL.md"),
];
for (const candidate of candidates) {
    if (existsSync(candidate)) {
        skillContents.push(readFileSync(candidate, "utf8"));
        break;
    }
}
```

So `skills: ['cuda-toolkit']` is resolved as:
```
<workspace>/.a5c/skills/cuda-toolkit/SKILL.md
<workspace>/.claude/plugins/cuda-toolkit/SKILL.md
```
**Two candidates in order. First hit wins.**

**The silent-failure trap.** If neither candidate exists:
- For agents (`harnessUtils.js:594`), `agentDir` is conditionally spread; missing → field is omitted → harness uses its built-in default agent.
- For skills (`harnessUtils.js:562`), `catch { /* skip missing skills */ }` swallows the read error and that skill simply isn't appended to the system prompt.

**No error, no warning, no journal event.** The workflow runs to completion
with stripped-down defaults. This is exactly the kind of "looks like it
worked but didn't" symptom the curated path has been producing.

**MC's options for making `library/` actually back the agent/skill names:**

1. **Mirror on bind.** Before launching a curated workflow, copy the chosen
   agent's `library/.../agents/<name>/AGENT.md` into
   `<workspace>/.claude/agents/<name>/`, and skill `SKILL.md` files into
   `<workspace>/.a5c/skills/<name>/`. Keep the originals in `library/` as the
   editable source of truth.

2. **Symlink on bind.** Same idea, but symlinks instead of copies. Faster, no
   sync drift, but requires symlink permissions on Windows (developer mode or
   admin).

3. **Pre-flight validation.** Before spawning the run, walk the workflow file
   for every `agent.name` and `skills[]` reference, check that each exists at
   the resolved path, and refuse to start the run if any are missing. Surfaces
   the silent-failure case as a real error.

The current file-first design favors option 1 — copy-on-bind. Picks up
library edits between runs, no symlink permission issues, easy to inspect.

---

## 7. The OMP operator loop

The strategic direction is to use OMP as the orchestration LLM for ongoing
operator work — checking tasks, watching files, running periodic chores —
without authoring multi-task workflows for everything.

OMP is supported as a first-class harness:

`harness/invoker.js:66` —
```js
"oh-my-pi": { cli: "omp", workspaceFlag: "--workspace", supportsModel: true, promptStyle: "flag" }
```

For a long-running loop process:

```bash
babysitter harness:forever \
  --harness oh-my-pi \
  --process    <abs-path-to-ops-loop.js>#process \
  --workspace  <project-root> \
  --runs-dir   <project-root>/.a5c/runs \
  --non-interactive \
  --json
```

`harness:forever` is documented as a `harness:create-run` alias for an
infinite-loop process (see CLAUDE.md's harness command list). The minimal
`ops-loop.js` can be a single-task workflow that wakes up, scans state, and
returns — letting BS's iteration loop drive the cadence — or a true
no-task harness session driven by OMP's internal loop function.

For external schedule control, drive the same command from a cron / scheduled
task on the host. Each invocation creates a fresh runId, or you can pass
`--run-id <date-stamp>` to keep them deterministic.

---

## 8. The orchestration loop — what MC has to do

```
   run:create  ──►  RUN_CREATED in journal, --harness binds session
        │
        ▼
   run:iterate  ──►  status = "executed" | "waiting" | "completed" | "failed"
        │              │
        │              ├─ "executed":   tasks ran, more pending → loop again
        │              ├─ "waiting":    breakpoint/sleep → external event needed
        │              ├─ "completed":  RUN_COMPLETED + completionProof emitted
        │              └─ "failed":     RUN_FAILED + error
        ▼
   on each iteration:
     • task:list --pending --json     → effects to execute externally
     • execute the effect (agent/skill/shell)
     • task:post <runId> <effectId> --status ok --value <file>
        │                                       (or --value-inline '{...}')
        ▼
   loop until completed or failed
```

In MC, `RunManager.startCuratedWorkflow` spawns the SDK CLI directly and
forwards JSON lines to the task journal. The JSON lines map onto:

- `bs:phase` events ↔ phase markers from `run:iterate`
- `bs:error` events ↔ `RUN_FAILED` or non-zero exit codes
- `bs:log` events ↔ everything else

**Honest success detection.** Exit code 0 alone is not proof of work. To
detect the silent-success case, MC should additionally check:

1. The journal's last event is `RUN_COMPLETED` (not `RUN_CREATED` or
   `EFFECT_REQUESTED`).
2. `EFFECT_RESOLVED` count >= the workflow's declared phase count
   (countable by parsing `await ctx.task(` occurrences in the workflow file —
   the catalog already does this in `_index.workflow.json` as `estimatedSteps`).
3. Each `EFFECT_RESOLVED` carries a non-empty `value` payload.

If any of those fails, mark the task `failed` even though the CLI exited 0.

---

## 9. Common pitfalls (kept short)

- **Forgetting `--non-interactive` on the curated path.** Breakpoints sit
  pending forever and the run looks "waiting" in the journal even though
  there's no human to approve.
- **Relative imports inside workflow files.** `import { foo } from '../../shared/...'`
  breaks when files move. Six MC workflows currently use this pattern; they
  need re-pointing whenever the directory structure changes. Prefer absolute
  package imports.
- **Forbidden `kind: "node"`.** Bypasses the orchestration model. The SDK
  enforces by convention only — the orchestration prompt actively rejects it.
- **Skill or agent name typo.** Silent fallback to default. No journal event.
  Pre-flight validation (§6 option 3) is the only catch.
- **Workspace too narrow.** If the workspace is set to a subdirectory of the
  actual project, agentic tools refuse to read the rest of the project. Hard
  error on first traversal attempt.
- **Workspace too wide.** Currently MC's choice (entire repo as workspace).
  Acceptable trade — runs sort by date in one place, no per-project
  bookkeeping. Cost: agentic tools can read across project boundaries.

---

## 10. Citations

All file:line references in this document point at the installed SDK source
under `node_modules/@a5c-ai/babysitter-sdk/dist/`. Re-run the relevant
commands when bumping the SDK to confirm nothing has shifted:

```bash
grep -n "validateRunId\|runId.*non-empty" node_modules/@a5c-ai/babysitter-sdk/dist/runtime/createRun.js
grep -n "assertInsideWorkspace\|resolveSafe"           node_modules/@a5c-ai/babysitter-sdk/dist/harness/agenticTools.js
grep -n "subagentName\|\.claude/agents\|\.a5c/skills"  node_modules/@a5c-ai/babysitter-sdk/dist/cli/commands/harnessUtils.js
grep -n "execution.harness\|execution.model"           node_modules/@a5c-ai/babysitter-sdk/dist/cli/commands/harnessPrompts.js
grep -n "oh-my-pi\|workspaceFlag"                      node_modules/@a5c-ai/babysitter-sdk/dist/harness/invoker.js
```

---

*Source of truth for this doc: SDK installed at the time of writing. If MC's
SDK pin changes, re-validate before relying on the cited line numbers.*
