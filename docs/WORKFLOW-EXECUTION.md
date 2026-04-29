# Workflow execution — how tasks actually move between agents

> Decision doc. Written when Michael asked the sharpest architectural
> question of the project: "how does the task get moved to the next
> agent?" See the conversation thread that prompted this for context.

## The question

A task flows through multiple roles: Planner → Developer → Reviewer →
Surgeon (with possible loop-back from Reviewer). Something has to decide
when one role is done and the next one starts. What is that something?

## The three real mechanisms

Every multi-agent system picks from these. Most mix two.

### A. Code-driven orchestrator (deterministic)

A non-agent program watches for explicit signals — session-ended events,
specific output files, exit codes — and transitions state based on them.
The code decides "done" using hard criteria, not the agent's self-report.

**Examples:** babysitter, taskplane, any CI/CD pipeline, Airflow, Temporal.

**Pros:** Deterministic. Replayable. Debuggable. Cheap (no LLM tokens for
routing decisions). Testable without LLMs.

**Cons:** Less adaptive. If the routing logic needs context the code
doesn't have, you have to add a gate and escalate.

### B. Manager / supervisor agent (agent-driven)

An LLM agent whose only job is to watch other agents and decide what's
next. Reads their outputs, makes calls, potentially updates state.

**Examples:** pi-subagents `oracle`, `delegate`. AutoGen manager patterns.
Early ReAct-loops.

**Pros:** Flexible. Can handle novel situations. Good when the routing
rules aren't known in advance.

**Cons:** Lossy — managers hallucinate. Costs tokens on every check.
Can't be deterministically replayed. Hard to debug. Any bug in the
manager propagates to every task.

### C. Event bus / messenger (transport, not decision-maker)

Agents post "I'm done, here's my output" to a shared channel. Consumers
subscribe and react. Still fundamentally code-driven OR agent-driven
underneath — the bus is just the transport.

**Examples:** pi-messenger-swarm, Redis pub/sub, RabbitMQ, any event-
sourced system.

**Pros:** Decoupled. Durable. Multiple consumers (e.g. UI + orchestrator
+ metrics) can react to the same events.

**Cons:** Adds a moving part. Still need to pick A or B for the actual
decision logic.

## What Mission Control uses

**Option A, layered with babysitter**, with `events.jsonl` as a local
event bus for the UI. No manager agents.

Why:

- **Michael's stated preference:** redundant backup plans, predictable
  behavior, no AI-asks-the-orchestrator-every-time tax.
- **Local LLM compatibility:** local models drift more. Code-driven
  routing keeps them honest.
- **Debuggability:** when a task gets stuck, you want to read a log, not
  ask an agent what it was thinking.

## Three cooperating layers

```
  ┌──────────────────────────────────────────────────┐
  │  MC (Electron + React)                           │
  │  · Task / Project / Workflow state               │
  │  · Dashboard, board, CRUD forms                  │
  │  · Tails events from babysitter + pi             │
  │  · Mirrors to its own events.jsonl               │
  └──────────────────────────────────────────────────┘
                       ▲ ▼
  ┌──────────────────────────────────────────────────┐
  │  babysitter (JS process engine)                  │
  │  · Reads workflows/<CODE>-<slug>/process.js      │
  │  · Enforces mandatory stop between steps         │
  │  · Runs quality gates (code, not agent)          │
  │  · Journals to .a5c/runs/<runId>/                │
  │  · Resume on crash from journal                  │
  └──────────────────────────────────────────────────┘
                       ▲ ▼
  ┌──────────────────────────────────────────────────┐
  │  pi (agent runtime)                              │
  │  · LLM session per role per cycle                │
  │  · Tool calls (file read, bash, subagent spawn)  │
  │  · Streams events back via SDK                   │
  │  · Reads agent.json + prompt.md for config       │
  └──────────────────────────────────────────────────┘
```

Each layer does one thing. Failure in one doesn't take out the others.

## The signal chain — end to end

```
USER clicks Start on Task Detail
    │
    ▼
MC invokes babysitter:
    babysitter.run(processFile, { taskId: "DA-001F" })
    │
    ▼
babysitter executes process.js:
    await ctx.task("planner", { task: "DA-001F" })
        │
        ▼
    babysitter → pi.createSession({
        model: resolveModel("planner.primaryModel"),
        prompt: readFile("agents/planner/prompt.md"),
        onEvent: (e) => journal.append(e),
    })
        │
        ▼
    pi runs Planner session → emits events
        │
        ▼
    session-ended
        │
        ▼
    babysitter checks quality gates:
        - Did DA-001F-p.md get written?
        - Does it satisfy the schema?
        - If no → ctx.task("planner", { retry: true }) OR abort
        - If yes → proceed
        │
        ▼
    MANDATORY STOP. babysitter writes journal.
        │
        ▼
    Next step in process.js (breakpoint or task)
        │
        ▼
    If breakpoint: babysitter blocks. MC shows "Approve plan?" UI.
    User clicks Approve → ctx.breakpoint() returns.
        │
        ▼
    await ctx.task("developer", { ... })
    ... and so on through the pipeline ...
```

Throughout, MC subscribes to babysitter's journal and mirrors each event
into its own `events.jsonl`. UI re-renders from MC's journal.

## What signals progression

**NOT signals:**

- Agent's console output ("it said I'm done!")
- Agent's message content ("agent concluded with 'task complete'")
- Free-form text in a file
- Timeouts or polling
- Anything the agent can fabricate

**Real signals:**

- `pi.session.end` event from the SDK — structured, typed, exit reason
- Artifact files with known names (`DA-001F-p.md` means Planner produced)
- Quality gate pass/fail — code runs, checks the artifact, returns bool
- Tool calls — agent's structured request to do something (spawn subagent,
  read file, etc.)
- Human click on a breakpoint — explicit, auditable

## Resume semantics

When the machine dies mid-run:

1. **babysitter's journal** (`.a5c/runs/<runId>/events.jsonl`) records
   every completed step with its output artifacts.
2. `babysitter.resume(runId)` reads the journal, fast-forwards to the
   last completed step, and continues from there.
3. MC reconciles: reads babysitter's journal + its own task manifest,
   surfaces any drift.
4. If babysitter's journal is corrupt, MC has its own `events.jsonl` as
   a secondary. Rebuilding from MC alone is lossy but possible.

This is the redundancy layer. Both journals are append-only; neither
should ever be rewritten.

## Local LLM safety

Local models (Qwen 2.5 Coder via Ollama, etc.) drift more than frontier
models. They "decide" the task is done early, hallucinate completion,
or spiral. Babysitter's mandatory-stop + code gates mean:

- Local LLM can only do ONE STEP per session. When it returns control,
  code checks the output.
- If output is wrong, the code retries with different instructions — or
  escalates to a frontier model (e.g. Codex) via the agent's
  additional model list.
- Local LLM never decides workflow progression. It only produces
  artifacts. Code decides progression.

This is the combination Michael identified: **cheap local model + strict
outer orchestrator = stable cheap pipeline**.

## Open questions (PROPOSED answers, validate during wire-in)

### OPEN: process file location

**PROPOSED:** per-workflow, co-located: `workflows/<CODE>-<slug>/process.js`.
Alternative is a central `.a5c/processes/` directory. Co-location keeps
a workflow's pieces in one place; central is the babysitter default.

Decide at wire-in based on what's less awkward to author/edit.

### OPEN: loop-back shape

**PROPOSED:** When Reviewer returns `verdict === "loopback"`, the process
calls `ctx.task("planner", { feedback })` again. `Task.cycle` increments
on each loop. Cap at some max (say 5) and escalate to human.

Alternative: model loop-back as a while loop in the process. Either works;
the shape is cosmetic.

### OPEN: auto-advance vs always-stop

**PROPOSED:** Workflow-declared. Default: stop after each primary role for
user review. Auto-advance for routine workflows (e.g. Bug fixes). Per-
task override in the UI.

### OPEN: parallel tasks

**PROPOSED:** babysitter's `ctx.parallel([...])` is ready for this. Use it
when (a) Campaign tasks process N items, (b) multiple subagents are
spawned simultaneously (RepoMapper + DocRefresher). Worktree isolation
via pi-subagents' `worktree: true`.

### OPEN: does MC invoke babysitter via SDK or CLI

**PROPOSED:** SDK (`@a5c-ai/babysitter` as a dependency). Tighter
integration, direct event access. CLI invocation (`npx babysitter run`)
is an alternative if the SDK import doesn't play well with Electron.

## How to wire this (next concrete steps)

See `PI-WIRE` markers in:

- `src/main/index.ts` — `PiSessionManager` instantiation point
- `src/main/store.ts` — event types for babysitter journal mirroring
- `src/renderer/src/pages/TaskDetail.tsx` — Start/Pause/Resume/Stop onClicks

Rough order:

1. **Install** `@a5c-ai/babysitter`. Verify it loads in Electron's main
   process without native-module headaches.
2. **Define** `workflows/F-feature/process.js` with the pipeline shown
   above. Start with Planner → Developer only; add Reviewer + Surgeon
   after Planner works.
3. **Build** `src/main/pi-session-manager.ts` that owns babysitter invocation.
   Expose `start`, `pause`, `resume`, `stop` IPC methods.
4. **Mirror** babysitter's journal events into MC's `events.jsonl` via a
   file watcher or babysitter's own event callback.
5. **Wire** TaskDetail buttons to the new IPC.
6. **Test** end-to-end with a throwaway task: Start → Planner runs →
   session ends → babysitter stops → Approve breakpoint → Developer runs.

First goal isn't "all 4 roles working." It's "one role completes, stops
cleanly, events journal correctly, resume works after a force-kill."

## Why this was worth writing down

This is the most load-bearing architectural decision in the project.
If it's wrong, everything above it (dashboard, metrics, approval lane)
sits on a cracked foundation. Writing it down is cheaper than rebuilding
it next month.

If/when the decisions here change, update this doc first, then the
downstream `PI-WIRE` markers in code.
