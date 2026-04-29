# Pi extensions — survey + MC relevance

Review of the 13 pi-world projects Michael flagged (12 extensions + taskplane).
Each entry: one-line summary · MC-relevance verdict · why.

Verdict legend:
- **USE** — build MC directly on this
- **WIRE** — integrate when we hit the use case
- **STUDY** — read for ideas, don't depend on
- **SKIP** — overlap / not needed

---

## 1. Orchestration precedents

### taskplane  (github.com/HenryLach/taskplane)  —  **STUDY (deep)**

> **This is the one Michael was inspired by.** Read this section carefully.

Multi-agent orchestration framework on top of pi. Turns specs into production
code with agent collaboration and human-visible progress.

**Vocabulary to steal:**

| taskplane term | What it means                                           |
|----------------|--------------------------------------------------------|
| `PROMPT.md`    | Per-task file — mission, steps, constraints            |
| `STATUS.md`    | Per-task file — progress log that survives context resets |
| Wave           | Dependency-aware execution phase (group of tasks)       |
| Lane           | One parallel git worktree (filesystem isolation)        |
| Segment        | Repo subdivision for polyrepo projects (with DAG deps)  |
| Orch branch    | Dedicated branch where merges happen; main stays stable |

**Agent roles:**
- `Worker` — executes all steps in a single context; auto-detects window limits
- `Reviewer` — spawned at step boundaries; different model strongly recommended
- `Merger` — conflict resolution on the orch branch
- `Supervisor` — conversational monitor that invokes orchestrator commands autonomously

**Slash-command surface:**
`/orch`, `/orch-plan`, `/orch-status`, `/orch-pause`, `/orch-resume`,
`/orch-integrate`, `/taskplane-settings`

**Web dashboard:** `http://localhost:8099` with Server-Sent Events for live
updates — lane progress, reviewer activity, merge telemetry, batch history.
(This is a direct precedent for MC's dashboard.)

**Config:** `.pi/` per project; `~/.pi/agent/taskplane/preferences.json` global
(thinking level, model preferences). Auto-detects monorepo vs polyrepo.

**What taskplane does well:**
1. Deterministic orchestration via explicit dependency mapping
2. PROMPT+STATUS pattern for context-reset survival
3. Worktree isolation is non-negotiable for safe parallelism
4. Role separation with per-role model config
5. Dashboard + structured files — no black-box execution

**What taskplane is missing (= MC's opportunity):**
1. **No cost/token tracking** — no budget or spend telemetry
2. **No model-selection UI** — agents inherit session model; must edit settings
3. **No cross-project view** — single-project orchestrator
4. **No human approval UX** — reviews happen in prompts, no visual gate
5. **Limited failure recovery granularity** — resume exists, granular retry doesn't
6. **No persistent memory / lessons** — each batch starts fresh
7. **No workflow typing** — everything is one shape; no "Feature vs Brainstorm vs Bug" differentiation

**Lessons for MC:**
- Steal the PROMPT.md / STATUS.md idea — our `tasks/<id>/shared/` already hints at it.
  Formalize it: `tasks/<id>/PROMPT.md` (the mission — hand-written or generated) and
  `tasks/<id>/STATUS.md` (append-only progress — agents update it every cycle).
- Worktrees per parallel run — let pi-subagents handle (it already does).
- "Supervisor" role is interesting: a long-running agent that watches others and
  steers. We don't have this; could be a future MC feature.
- Web dashboard at localhost:8099 — that's exactly what MC does, but better
  (Electron + IPC rather than HTTP polling).

---

### compound-engineering-pi  (github.com/gvkhosla/compound-engineering-pi)  —  **STUDY / WIRE**

84 skills + 9 legacy workflow prompts. Implements Every's **Plan → Work →
Review → Compound** loop.

Commands: `/workflows-plan`, `/workflows-work`, `/workflows-review`,
`/workflows-compound`, `/workflows-brainstorm`, `/deepen-plan`,
`/resolve_todo_parallel`, plus newer `/skill:ce:*` aliases.

Supports single, parallel, chain subagent execution modes. MCP integration.

**MC relevance:** If Michael wants the Plan/Work/Review/Compound loop as a
first-class workflow, this is the pre-built version. Our "Feature" workflow
could literally *be* this chain. Wire later when we have the wireframe nailed.

---

### pi-superpowers  (github.com/coctostan/pi-superpowers)  —  **WIRE**

Jesse Vincent's "Superpowers" adapted for pi. Six composable skills:

1. **Brainstorming** (`/skill:brainstorming`) — Socratic design refinement
2. **Planning** (`/skill:writing-plans`) — TDD-task breakdown
3. **TDD** (`/skill:test-driven-development`) — RED-GREEN-REFACTOR with anti-patterns
4. **Debugging** (`/skill:systematic-debugging`) — 4-phase root-cause investigation
5. **Code Review** (`/skill:requesting-code-review` + `/skill:receiving-code-review`) — pre-merge
6. **Finishing** (`/skill:finishing-a-development-branch`) — merge/PR decision

Includes a `plan_tracker` tool for session-based progress viz.

**MC relevance:** These map 1:1 to stages of our Feature workflow. Each role
could "invoke" a superpower when it starts: Planner uses writing-plans,
Developer uses TDD, Reviewer uses requesting-code-review. Cleaner than us
writing prompts from scratch. **This is probably the fastest path to
high-quality role prompts.**

---

## 2. Planning / human approval UX

### plannotator  (github.com/backnotprop/plannotator)  —  **USE (must-have)**

Visual annotation tool for AI-agent plans and diffs. Browser-based. Auto-opens
when an agent finishes planning. User marks up (delete/insert/replace/comment),
clicks Approve or Request Changes, annotations return to the agent as context.

Also does code review on git diffs or remote PRs via `/plannotator-review`,
and general file annotation via `/plannotator-annotate`.

**Encryption:** small plans fit entirely in URL hash (no server); larger plans
use zero-knowledge AES-256-GCM — server sees only ciphertext.

**Multi-harness:** Claude Code, Copilot CLI, Gemini CLI, OpenCode, Pi, Codex.

**MC relevance:** This IS our Approval lane. When a task hits Approval, MC
hands off to plannotator. User approves or requests changes in plannotator's
UI; feedback flows back as structured context and the task returns to the
Planner (cycle++) or advances to Done. **Don't build our own approval UX —
wire plannotator.**

---

## 3. Subagent infrastructure (two competing implementations)

### nicobailon/pi-subagents  —  **USE**

Covered in detail in `PI-FEATURES.md`. Chains, parallel, 9 built-in agents
(scout/planner/worker/reviewer/context-builder/researcher/delegate/oracle/
oracle-executor), worktree isolation, intercom bridge, recursion guard.

**Primary subagent runtime for MC.** Our "subagents" register = `.pi/agents/*.md`.

### tintinweb/pi-subagents  —  **SKIP (for now)**

Claude Code-style: general-purpose / Explore / Plan. YAML frontmatter in
`.pi/agents/` or `~/.pi/agent/agents/`. Fields: tools, model, thinking,
max_turns, memory, isolation, disallowed_tools.

Unique: graceful max-turn shutdowns with 5 grace turns, live conversation
viewer, cross-extension RPC event bus, persistent agent memory across 3 scopes
(project/local/user), git worktree isolation.

**Why skip for now:** Feature overlap with nicobailon's. Picking both creates
config confusion (same folder, two consumers). **Revisit if** the live
conversation viewer or cross-extension event bus turn out to matter for our
"Run Activity" feed.

---

## 4. Specialized subagents (drop-in reconnaissance)

### pi-finder  (default-anton/pi-finder)  —  **WIRE**

Read-only local workspace reconnaissance via `rg`, `fd`, `ls`. Returns a
structured Markdown map: `Summary`, `Locations` (with line citations),
`Evidence`, `Searched`, `Next steps`. Not raw grep output.

Configurable failover via `PI_FINDER_MODELS` env var.

**MC relevance:** Drop-in as an MC subagent (like our "RepoMapper" placeholder).
Planner spawns it when scope is unclear.

### pi-librarian  (default-anton/pi-librarian)  —  **WIRE (when doing research-flavored tasks)**

GitHub research subagent using `gh` CLI. Searches repos, retrieves structure,
caches files in `/tmp/pi-librarian/`. Strict 10-turn budget.

Requires `gh auth login`.

**MC relevance:** Second drop-in subagent. Planner/Developer spawns when a
task needs external code references.

### pi-web-access  (nicobailon/pi-web-access)  —  **WIRE**

Web search (Exa / Perplexity / Gemini), content extraction (URL → markdown),
video understanding (YouTube + local), GitHub repo cloning, code search.
Smart provider defaults and redundancy. Zero-config using Exa MCP; API keys optional for
more providers.

**MC relevance:** Non-optional for any research-flavored work. Wire early;
it's a safe, broad capability.

---

## 5. Multi-session coordination

### pi-messenger-swarm  (monotykamary/pi-messenger-swarm)  —  **STUDY (high signal)**

> Michael flagged this as "something that makes sense to me" — agreed.

File-based multi-agent mesh. Multiple pi sessions in different terminals join
the same network via filesystem (no daemon). Each session gets a human
channel name (`#quiet-river`). Named durable channels (`#memory`) persist
across sessions.

- Direct messages: `{ action: 'send', to: 'AgentName', message: '...' }`
- Channel posts: `{ action: 'send', to: '#memory', message: '...' }`
- Durable even when recipient is offline

Task lifecycle: create → claim → progress → done. Agents spawn specialized
subagents via `pi_messenger({ action: 'spawn', role: '...', message: '...' })`.

State in `.pi/messenger/`:
- `channels/*.jsonl` — event-sourced channel feeds
- `tasks/<session>.jsonl` — per-session task logs
- `agents/<session>/` — spawned agent definitions
- `registry/` — joined agent registrations

**MC relevance — potentially big:**
- MC's "Run Activity" right-rail could **be** a tail of the messenger feed.
  When a Planner pi session spawns RepoMapper, it posts to its channel; MC
  reads the channel and renders the event.
- Cross-task coordination: a long-running task can post to `#memory` and
  later tasks pick up the context (like our pi-memory use).
- **Doesn't require us to re-implement an event bus.** Pi-messenger is the
  bus; MC subscribes.

Worth a dedicated design pass once pi is wired. Not first thing to build.

---

## 6. Memory (two competing implementations)

### samfoy/pi-memory  —  **SKIP**

SQLite-based (`~/.pi/memory/memory.db`). Three tables: semantic (facts with
confidence), lessons (learned corrections), events (audit). Auto-consolidates
at session end if ≥3 user messages. Injects `<memory>` block (8KB cap) at
session start. Tools: `memory_forget`, `memory_lessons`, `/memory-consolidate`.

**Why skip:** SQLite breaks our file-first philosophy. Harder to inspect,
diff, back up. Auto-extraction with confidence thresholds is nice but opaque.

### VandeeFeng/pi-memory-md  —  **USE**

> This is the one.

Letta-style memory in Git-backed markdown. Per-project isolation under
`~/.pi/memory-md/<project>/core/{user,project}/` + `reference/` for on-demand
docs. Frontmatter on every file (description, tags, created, updated).

Agents access via:
- Auto index injection at session start (descriptions + tags only)
- `memory_read` tool for full content on demand
- Tools: `memory_write`, `memory_search`, `memory_list`, `memory_sync`

**MC relevance:**
- Matches our "file-based, diff-friendly, grep-friendly" philosophy.
- **Per-project memory aligns with our Project model** — each MC project has
  its own memory space.
- Agents write lessons as they go; future cycles pick them up. This is
  exactly the "cycles per task" efficiency we'd want to measure.
- Wire after pi-subagents. Could even be the backing for MC's Project Notes
  section.

---

## 7. Session / context management

### ogulcancelik/pi-extensions  —  **STUDY + cherry-pick**

Bundle of 12. Highlights relevant to MC:

- **pi-handoff** — Context transfer to new sessions (critical for our
  "session restart across cycles" story — worth studying)
- **pi-session-recall** — Search and retrieve past session conversations
- **pi-ghost** — Temporary overlay for side conversations within current session
- **pi-goal** — Task decomposition with parallel worker agent spawning
- **pi-spar** — Multi-agent code review via peer conversations
- **pi-herdr** — Pane/tab/workspace management for extended workflows
- **pi-session-recall** — Searchable session history
- **pi-tmux** — Named pane management
- **pi-web-browse** — Headless browser via Chrome DevTools Protocol
- **pi-sketch**, **pi-minimal-footer**, **pi-ghostty-theme-sync**,
  **pi-ssh-tools** — UI polish / connectivity; MC-irrelevant

Not a single install; pick individual extensions by relevance.

---

## 8. Presentation / UI

### pi-markdown-preview  (omaclaren/pi-markdown-preview)  —  **SKIP (for now)**

Terminal / browser / PDF rendering of markdown (+ LaTeX, Mermaid, syntax
highlighting). Commands: `/preview`, `/preview --browser`, `/preview --pdf`,
`/preview --pick`.

**Why skip:** Electron already renders markdown natively (in the React
renderer). This is a pi-TUI UX improvement; MC is not a pi TUI. **Revisit**
if we ever expose a "pi terminal" panel inside MC.

---

## Proposed wire order

Given what we've seen, here's the recommended order of pi-extension adoption
when we get to baby step 10 (pi wire-up):

1. **pi-subagents** (nicobailon) — core orchestration; everything else depends on it
2. **pi-superpowers** — backs each role's base prompt for free; high-quality starter
3. **pi-web-access** — so any role can do research without engineering effort
4. **plannotator** — becomes the Approval lane; biggest UX lift for least work
5. **pi-memory-md** — per-project memory; matches MC's project model
6. **pi-finder** + **pi-librarian** — drop-in as MC subagents (replace our placeholders)
7. **pi-messenger-swarm** — evaluate as the event bus for MC's Run Activity feed
8. **compound-engineering-pi** — evaluate as a pre-built workflow if we add multi-stage Feature
9. **pi-handoff** (from ogulcancelik bundle) — evaluate when we cross-reference cycle loop-back

Everything else: skip or defer until a use case forces it.

---

## What this changes about MC

Not the wireframe. Not the data model we've built. It changes **implementation
depth**:

- Instead of writing our own Subagent / Workflow / Approval / Memory /
  Research systems, MC becomes a **conductor** that composes pre-built pi
  extensions and exposes them through a unified dashboard.
- The work shifts from "build these features" to "configure these features,
  watch their events, surface their output."
- Our SKIP list and STUDY-only list keep us from getting distracted by the
  adjacent ecosystem.

Adding anything from this list is a wire-up, not a build. Small, cheap, and
individually reversible.
