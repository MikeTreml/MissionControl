# Pi-mono feature reference

Source of truth for "what pi already gives us". Before building a new concept
in MC, check this doc. If pi already does it, use pi's primitive and have MC
wrap or extend it — don't duplicate.

Compiled 2026-04-22 from pi-mono docs (user-provided) + live repos:
- `https://github.com/nicobailon/pi-subagents`
- `https://github.com/a5c-ai/babysitter`
- `https://pi.dev/packages` (npm registry listing — `pi install npm:<pkg>`)

---

## Pi-mono core

### Context engineering

Pi's minimal system prompt is designed to be shaped, not worked around.

- **`AGENTS.md`** — project instructions loaded at startup from `~/.pi/agent/`,
  then each parent directory, then cwd. Layered — closest wins on overrides,
  others concat.
- **`SYSTEM.md`** — replace or append to pi's default system prompt per project.
- **Compaction** — auto-summarizes older messages as the context window fills.
  Fully customizable via extensions: topic-based, code-aware, different
  summarization models.
- **Dynamic context (extensions)** — inject messages before each turn, filter
  history, implement RAG, long-term memory. This is where MC lives.

### Skills

Capability packages (instructions + tools) loaded on-demand.

- Live in `~/.pi/agent/skills/<name>/SKILL.md` (user) or `.pi/skills/<name>/SKILL.md` (project) or npm packages.
- Progressive disclosure — skill content doesn't bust the prompt cache when unused.
- Agents declare default skills in frontmatter; runtime injects wrapped in XML tags.
- Missing skills warn but don't block.

### Prompt templates

Reusable prompts as Markdown files. Type `/<name>` to expand.

### Session model

- Sessions are stored as **trees**, not linear logs. All branches in one file.
- `/tree` — navigate to any previous point, continue from there.
- Filter by message type, label entries as bookmarks.
- `/export` — HTML export.
- `/share` — upload to a GitHub gist, get a shareable URL that renders it.

### Steer while the agent works

- `Enter` — steering message. Delivered after current tool call; interrupts remaining tools.
- `Alt+Enter` — follow-up. Waits until the agent finishes.

### Four run modes

| Mode         | Command / trigger                              | Use case                                    |
|--------------|-----------------------------------------------|---------------------------------------------|
| Interactive  | `pi` (TUI)                                    | Live coding session                         |
| Print        | `pi -p "query"`                               | Scripts, one-shot                           |
| JSON stream  | `pi --mode json "query"`                      | Event streams for external consumers        |
| RPC          | JSON protocol over stdin/stdout               | Non-Node integrations — see `docs/rpc.md`   |
| SDK          | import `@mariozechner/pi-coding-agent`        | Embed pi in your app (MC's path)            |

### Packages / extensions

Install any npm package as an extension:

```bash
pi install npm:<package>
```

Discover packages at `https://pi.dev/packages` (filters: extension, skill, theme,
prompt, demo — sortable by downloads, recency, A–Z).

---

## pi-subagents (extension)

`pi install npm:pi-subagents` (repo: github.com/nicobailon/pi-subagents)

**This is the big one for MC.** Most of what we were planning under `subagents/`
and `workflows/` has a native home here. Read carefully.

### What it is

Turns a single pi session into a multi-agent system. Main session can spawn
focused child processes ("subagents"), each with its own config, model, tools,
and permissions.

### Execution modes

| Mode                   | Shape                                          |
|------------------------|------------------------------------------------|
| Single                 | One subagent runs a task; optional disk output |
| Sequential chain       | Step 1 → step 2 → step 3; each sees `{previous}` output |
| Parallel               | Concurrent runs; concurrency limit + failure handling |
| Parallel-within-chain  | Fan-out/fan-in inside a chain step             |

### Built-in agents (ships with the extension)

- `scout` — codebase analysis
- `planner` — strategy
- `worker` — implementation (= our "developer")
- `reviewer` — code review
- `context-builder` — builds context bundles
- `researcher` — external research (requires `web-access` extension)
- `delegate` — nested orchestration
- `oracle` — high-context advisory
- `oracle-executor` — implementation escalation from oracle

**Map to MC's roles:**
- MC Planner   ≈ pi `planner`
- MC Developer ≈ pi `worker`
- MC Reviewer  ≈ pi `reviewer`
- MC Surgeon   ≈ no pi equivalent (MC-specific — doc/artifact cleanup role)

### Agent config (Markdown + YAML frontmatter)

Discovered in priority order:

1. **Project** — `.pi/agents/<name>.md` (highest) — searches up dir tree
2. **User** — `~/.pi/agent/agents/<name>.md` (medium)
3. **Builtin** — `~/.pi/agent/extensions/subagent/agents/` (lowest)

Legacy `.agents/<name>.md` also read. Collisions resolved by priority.

Full frontmatter field list:

```yaml
name: agent-name
description: What it does
model: claude-sonnet-4
fallbackModels: openai/gpt-5-mini, anthropic/claude-haiku-4-5
thinking: high                  # off, minimal, low, medium, high, xhigh
systemPromptMode: replace       # or append
inheritProjectContext: false    # include project AGENTS.md etc.
inheritSkills: false            # include discovered skills catalog
tools: read, bash, mcp:chrome-devtools  # explicit tool allowlist
extensions: ""                  # absent=all, empty=none, csv=allowlist
skills: safe-bash, chrome-devtools
output: context.md              # write run output to file
defaultReads: context.md        # files to read before executing
defaultProgress: true           # maintain progress.md
maxSubagentDepth: 1             # nested delegation cap
```

### Override builtins without copying them

`~/.pi/agent/settings.json` (user) or `.pi/settings.json` (project):

```json
{
  "subagents": {
    "agentOverrides": {
      "reviewer": {
        "inheritProjectContext": false,
        "model": "anthropic/claude-opus"
      }
    }
  }
}
```

### Chain files (reusable pipelines)

`~/.pi/agent/agents/<name>.chain.md` or `.pi/agents/<name>.chain.md`:

```markdown
---
name: scout-planner
description: Gather context then plan
---

## scout
output: context.md

Analyze the codebase for {task}

## planner
reads: context.md

Create a plan based on {previous}
```

Each `## <agent>` is a step; blank line separates config from task text.

### Slash commands

- `/run <agent> <task>` — single
- `/chain a1 "t1" -> a2 "t2"` — sequential
- `/parallel a1 "t1" -> a2 "t2"` — concurrent
- Append `--bg` to run in background
- Inline per-step overrides: `scout[model=haiku][output=false]`

### Spawn lifecycle (what happens when a subagent is invoked)

1. **Resolution** — name resolved across project → user → builtin scopes
2. **Config assembly** — frontmatter + inheritance + runtime overrides merged
3. **Session forking** — if `context: "fork"`, branched session from parent's leaf; else fresh
4. **Tool/skill injection** — declared tools + skills prepared for child's system prompt
5. **Spawning** — detached `pi` subprocess with `--session` pointing to child session file
6. **Progress tracking** — foreground streams back to parent; background returns immediately
7. **Artifact collection** — output files, logs, metadata written per-run
8. **Completion notification** — async runs fire `subagent:complete` event

### Execution contexts

- **`context: "fresh"`** (default) — child gets task only, no inherited history
- **`context: "fork"`** — child gets real branched session from parent's current leaf; inherited history is **reference-only**. Fails fast if parent not persisted / leaf missing / branching fails — never silently downgrades.

### Recursion guard

Subagents can call the `subagent` tool themselves. Depth-limited:

- Default: **2 levels** (main → subagent → sub-subagent)
- `PI_SUBAGENT_MAX_DEPTH` env var
- Per-agent `maxSubagentDepth` frontmatter
- Config default in `~/.pi/agent/extensions/subagent/config.json`

Env inherits downward; per-agent can tighten but not relax.

### Extension config (`~/.pi/agent/extensions/subagent/config.json`)

```json
{
  "asyncByDefault": true,
  "forceTopLevelAsync": true,
  "parallel": { "maxTasks": 8, "concurrency": 4 },
  "defaultSessionDir": "~/.pi/agent/sessions/subagent/",
  "maxSubagentDepth": 1,
  "intercomBridge": {
    "mode": "always",
    "instructionFile": "./intercom-bridge.md"
  },
  "worktreeSetupHook": "./scripts/setup-worktree.mjs",
  "worktreeSetupHookTimeoutMs": 30000
}
```

### Intercom bridge

Requires `pi-intercom` extension. Subagents can message the parent session for
questions, status, handoffs — without polluting the conversation. MC's "run
activity" feed would listen on this.

### Worktree isolation (parallel runs)

`worktree: true` on a parallel call gives each agent its own git worktree
branched from HEAD. Isolated in `<tmpdir>/pi-worktree-*/`. Optional setup hook
(JSON I/O). Per-worktree diffs captured in output. Cleanup automatic.

### Async / background execution

- `/run scout "task" --bg` or `async: true` param
- Writes `status.json`, `events.jsonl`, markdown logs for observability
- `/subagents-status` overlay — check running ones
- `subagent_status` tool — programmatic

### Artifact / session management

- **Chain temp dir** — `<tmpdir>/pi-subagents-<scope>/chain-runs/<runId>/` for inter-step files
- **Session logs** — JSONL per-run, resolved via explicit → config default → parent-derived
- **Artifacts** — `{sessionDir}/subagent-artifacts/` — input/output/JSONL/metadata + fallback details

### Agents Manager TUI

`Ctrl+Shift+A` or `/agents`:

- Templates: Blank, Scout, Planner, Implementer, Code Reviewer, Blank Chain
- Saves to user or project scope
- Immediately discoverable

### Programmatic API (LLM-driven creation)

```json
{
  "action": "create",
  "config": {
    "name": "my-agent",
    "description": "Purpose",
    "scope": "user",
    "systemPrompt": "You are...",
    "model": "anthropic/claude-sonnet-4",
    "tools": "read, bash",
    "inheritProjectContext": true
  }
}
```

---

## babysitter (a5c-ai)

`github.com/a5c-ai/babysitter` · `github.com/a5c-ai/babysitter/tree/main/plugins/babysitter-pi`

**CONFIRMED USE as MC's per-run execution engine.** Initial pass called this
"competition" — that was binary thinking. Re-read after Michael flagged the
agent-stalling problem (2026-04-23): babysitter operates at a **different
layer** than MC. See `docs/WORKFLOW-EXECUTION.md` for the full architecture
and why this is now USE-grade.

### What it is

Workflow orchestration framework that enforces **process-as-code**. Agents
can only do what JavaScript process definitions permit. Prevents hallucinated
deviations by making the agent a passenger on a rail.

### Integrates with

Claude Code (primary), Codex CLI, Cursor, Gemini CLI, GitHub Copilot, **Pi**,
Oh-My-Pi, OpenCode, plus an internal headless SDK harness. The internal harness
can **delegate tasks to other discovered harnesses** — multi-agent orchestration
from one entry point.

### Key features

| Feature              | What it does                                            |
|----------------------|--------------------------------------------------------|
| Process Library      | 2,000+ pre-built workflow templates                    |
| Quality Convergence  | Code-defined gates block progression until met         |
| Run Resumption       | Event-sourced journal — deterministic replay from any step |
| Breakpoints          | Structured **mandatory** human approval gates          |
| Parallel Execution   | Multi-task dispatch with dependency management         |
| Token Compression    | 4-layer (29–94% reduction) auto-registered by plugin   |
| Journal System       | Immutable audit trail of decisions + execution         |

### Config file layout

- `.a5c/processes/*.js` — process definitions (the authority)
- `.a5c/compression.config.json` — compression settings
- `.a5c/runs/` — event journal storage
- `.claude-plugin/`, `.cursor-plugin/`, etc. — harness integrations

### Philosophy

- **Process-as-code authority** — engine cannot bypass JS functions
- **Mandatory stop** — every task execution ends with a forced pause
- **Gates are blocking** — not advisory
- **Event sourcing** — all state deterministically replayed, no hidden side effects
- **Multi-harness delegation** — route subtasks to the right agent

Node 20+. MIT licensed.

### Why we ARE using it (updated 2026-04-23)

The initial "we get this elsewhere" framing missed the point. Pi gives us a
good session, but **within a single session**. It doesn't help when:

- An agent stalls mid-step asking "what order should I do this in?"
- An agent declares "done!" at 60% complete
- The process dies and we need to resume from step 3 of 7
- A local LLM wanders off because the prompt is too open-ended

Babysitter solves exactly these failure modes by moving orchestration OUT
of the agent and into a JS process function. Agent executes one step, the
process code decides what's next. Agent cannot bypass it.

### How we layer it

| Layer | Owner | Concern |
|-------|-------|---------|
| Task / project / workflow state | **MC** (this app) | Multi-project dashboard, board, CRUD, user-facing state |
| Per-run step orchestration | **babysitter** | Execute a process, enforce gates, journal for resume |
| Individual agent session | **pi** | LLM call, tool use, streaming events |

Each workflow in `workflows/<CODE>-<slug>/` points at a babysitter process
file. When a task starts, MC invokes babysitter pointing at that process;
babysitter calls pi sessions for each `ctx.task("role", …)` step.

### Key features (why they matter for us)

| Feature              | Why we need it                                          |
|----------------------|--------------------------------------------------------|
| Process Library      | 2,000+ templates — we seed our own but can borrow      |
| Quality Convergence  | Code-defined gates that block agent self-deception     |
| Run Resumption       | Event-sourced journal — crash recovery is deterministic |
| Breakpoints          | Mandatory human gates (the Approval lane)              |
| Parallel Execution   | Task's subagents run concurrently with dependency graphs |
| Token Compression    | 4-layer (29–94% reduction) — huge for DLL harvest case |
| Journal System       | Audit trail + replay — redundant with MC's events.jsonl|

### Config file layout (lives alongside MC)

- `.a5c/processes/*.js` — process definitions (or inline in `workflows/<CODE>-<slug>/process.js`)
- `.a5c/compression.config.json` — compression settings
- `.a5c/runs/<runId>/` — event journal storage

### babysitter-pi plugin

Thin wrapper (`@a5c-ai/babysitter-pi`) that adds slash commands to pi
(`/babysit`, `/plan`, `/resume`, `/doctor`, `/yolo`, `/call`) routing
through pi's skill system. The SDK does the real orchestration; the plugin
is just the invocation surface. MC can either invoke the SDK directly or
route through the plugin if we want agents to have self-heal commands.

### Redundancy story (CONFIRMED requirement)

MC's own `events.jsonl` + babysitter's `.a5c/runs/` journal are both
written on every transition. If MC crashes, babysitter still has the truth.
If babysitter crashes, MC's manifest + events are still inspectable. Two
orthogonal durability mechanisms — expensive in disk bytes, cheap in peace
of mind.

Worth watching if we hit a ceiling with the simple file-based approach.

---

## Where pi overlaps with what MC was planning

| MC concept we were building | Pi already has | Action |
|-----------------------------|----------------|--------|
| `AgentDefinition` (model roster) | Pi's unified `/model` picker | **Drop.** Let pi list models; MC's dropdown queries pi. |
| `SubagentLoader` + `subagent.json` | pi-subagents with full frontmatter + chain support | **Replace.** Use `.pi/agents/<name>.md` instead of our own folder layout. |
| Per-role prompts in `workflows/F-feature/prompts/` | pi-subagents agent files | **Fold in.** MC's "workflow" becomes a pi-subagents chain file + metadata. |
| `WorkflowLoader` | pi-subagents chain files (`.chain.md`) | **Keep MC's concept** (lanes + UI board), **but use chain files under the hood** for the actual execution sequence. |
| `RunRecord.tokensIn/tokensOut/costUSD` | pi session events already carry these | **Cache only.** Rollup for metrics page; pi session is authoritative. |
| "Intervene" buttons (Start/Pause/Resume/Stop) | pi's steering (`Enter` / `Alt+Enter`) + pause/resume per session | **Wrap.** MC buttons call pi steering commands. |
| Subagent status panel (Run Activity) | pi-subagents `/subagents-status` + `subagent:complete` event + intercom bridge | **Subscribe.** MC listens; pi fires. |
| Worktree isolation for parallel tasks | pi-subagents `worktree: true` + setup hook | **Expose.** MC surfaces the flag when kicking parallel runs. |
| Session forking / branching for cycle loop-back | pi tree sessions (`/tree`) | **Use.** Each loop-back becomes a branch, not a new session. |

---

## MC concepts that stay — even after folding in pi

These don't exist in pi and aren't on anyone's roadmap:

- **Task** — a unit of work with project, workflow letter, lanes, cycles. Pi
  has sessions, not tasks.
- **Project + prefix** — groups tasks, generates task IDs (`DA-015F`).
- **Workflow as a lane sequence** — board visualization + transition rules. Pi
  has chains (linear), not lanes with approval/loop-back.
- **Dashboard / Project Detail / Metrics pages** — pure UI layer.
- **Lane history timeline** — our domain concept.
- **Task-linked files convention** (`DA-015F-p`, `DA-015F-rmp`) — our naming rule.
- **Human approval gates** (Approval lane) — MC UI on top of pi's pause.
- **Cross-project metrics** — rollups we compute; pi only knows per-session.

---

## Recommended path forward

1. Keep all the MC schemas we added — they represent our domain (Task/Project/Lane/Workflow as a user-facing concept).
2. Slim `AgentConfigStore` — deprecate the roster half; keep role-to-agent-id mapping only. Mark the `listAgents()` method as a shim that'll call pi once we wire.
3. When we wire pi (baby step ~10), replace `SubagentLoader` with a reader that ingests `.pi/agents/*.md` files — so MC's subagents registry IS pi-subagents' registry. Our wireframe's folder/JSON becomes `.pi/agents/*.md` with full frontmatter.
4. `WorkflowLoader` stays but workflows get a companion `.chain.md` that pi actually runs. The MC `workflow.json` keeps the lane/board metadata; the chain file owns the agent sequencing.
5. Run History + Metrics page reads pi's session JSONL + `events.jsonl` — not a parallel store.
6. All "intervene" buttons translate to pi steering / session pause commands.

This makes MC a **thin orchestration + UI layer over pi**, not a parallel runtime.
