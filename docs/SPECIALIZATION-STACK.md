# Specialization Stack

Which `library/specializations/*` to use for which part of Mission Control,
plus the gotchas the babysitter SDK won't warn you about.

> **Created**: 2026-05-06
> **Status**: PROPOSED — adopt or reject after one full loop run.

## TL;DR

Mission Control is an Electron + React 19 + TypeScript desktop app. Five of
the eight specialization directories under `library/specializations/` ship
runnable workflows; layer them by area, don't pick one.

| MC area | Primary spec | Why |
|---|---|---|
| Main process (`src/main/**`) | `desktop-development` | Describes Electron's Main↔Renderer↔Preload pattern, IPC, file-first persistence, system services |
| Renderer (`src/renderer/**`) | `web-development` | React 19 patterns, accessibility, performance, TypeScript config |
| Preload (`src/preload/*.cjs`) | `desktop-development` | `security-hardening.js` covers context isolation + sandbox |
| UI verification (Playwright at `scripts/verify-ui.mjs`) | `ux-ui-design` + `desktop-development` | Visual scoring, design QA, WCAG checks, plus desktop-specific UI testing patterns |
| Build & packaging (`electron-builder.yml`) | `desktop-development` | `desktop-build-pipeline`, `code-signing-setup`, `auto-update-system`, per-OS workflows |
| Cross-cutting design decisions (`// CONFIRMED:` markers, `docs/UI-DESIGN.md`) | `software-architecture` | ADR thinking, refactoring plans, system design reviews |
| Reusable helpers | `common-utilities` | `parallel-combinator`, `docx-conversion` |
| MC-specific looping work (this repo) | `.a5c/processes/` | Project-local processes, e.g. `frontend-improvement-loop.js` |

**Skip:**

- `game-development` — wrong domain.
- `backend-development` — its only workflow (`growing-outside-in-systems`)
  pushes outside-in TDD with heavy fakes; fights MC's smoke-test convention.
- `testing/` as a *workflow source* — but **keep** the directory and its
  contents. See "Testing sandbox" below.

## How to invoke a workflow

Use the lower-level **Agent commands** — `run:create` to seed the run, then
`run:iterate` repeatedly to drive replay. The `harness:*` aliases
(`harness:create-run`, `harness:call`, `harness:yolo`) are listed under
"agents should never call these directly" in `babysitter --help`; they're
intended for higher-level wrappers like MC's RunManager, not for direct
agent or human use at the prompt.

```powershell
# 1. Seed the run (creates .a5c/runs/<runId>/, writes RUN_CREATED to journal).
babysitter run:create `
  --process-id specializations/<spec>/<workflow> `
  --entry library/specializations/<spec>/workflows/<workflow>.js#process `
  --inputs <path-to-inputs.json> `
  --runs-dir .a5c/runs --json

# 2. Drive replay until completion (or first pending agent effect).
babysitter run:iterate .a5c/runs/<runId> --json

# 3. When iteration pauses with pending agent effects, list them, resolve
#    them by executing the agent task externally, post the result, iterate.
babysitter task:list .a5c/runs/<runId> --pending --json
babysitter task:post .a5c/runs/<runId> <effectId> --status ok --value-inline '{...}'
babysitter run:iterate .a5c/runs/<runId> --json
# …repeat steps 2-3 until the run reports complete.
```

For an MC-local process, swap the `--entry` path and pick a `--process-id`
slug that's recognizable in the run directory (the slug is metadata; it
identifies the run, it doesn't change behavior):

```powershell
babysitter run:create `
  --process-id local/frontend-improvement-loop `
  --entry .a5c/processes/frontend-improvement-loop.js#process `
  --inputs .a5c/processes/frontend-improvement-loop.inputs.json `
  --runs-dir .a5c/runs --json
```

## CRITICAL: AGENT.md / SKILL.md inlining

> **The babysitter SDK does NOT load `library/specializations/<spec>/agents/<slug>/AGENT.md`
> bodies into agent prompts at runtime.**

This was confirmed empirically by `.a5c/processes/agent-resolution-test.js`
on 2026-05-06. The test dispatches three identical "introduce yourself"
tasks differing only by `agent.name` (`general-purpose`, `dad-joke-bob`,
`dad-joke-stager`); the dad-joke behavior never appeared, proving the
named-agent definitions never reached the model.

**Implication**: any workflow that does

```js
agent: { name: 'design-mock-analyzer', prompt: { ... } }
```

…will run with whatever `general-purpose` would do — the slug `design-mock-analyzer`
is decoration. The persona, rules, and behavior in
`library/specializations/ux-ui-design/agents/design-mock-analyzer/AGENT.md`
are silently dropped.

**Likely also true for SKILL.md files** referenced by workflows. Treat
SKILL.md the same way until proven otherwise.

### Mitigation

Inline the AGENT.md content yourself, in the process file, before passing
the prompt. The pattern in `frontend-improvement-loop.js` (Phase 0):

```js
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadAgentMd(repoPath, specialization, agentSlug) {
  const path = join(repoPath, 'library', 'specializations',
                    specialization, 'agents', agentSlug, 'AGENT.md');
  if (!existsSync(path)) throw new Error(`AGENT.md missing: ${path}`);
  const md = readFileSync(path, 'utf8');
  return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim();
}

// then, in the task definition:
const body = loadAgentMd(repoPath, 'ux-ui-design', 'visual-qa-scorer');
agent: {
  name: 'general-purpose',
  prompt: {
    role: '...',
    task: '...',
    instructions: [
      '=== INLINED AGENT DEFINITION (visual-qa-scorer) ===',
      body,
      '=== TASK-SPECIFIC INSTRUCTIONS ===',
      ...realInstructions,
    ]
  }
}
```

The `name: 'general-purpose'` stays. The named agent is communicated via
the inlined body, not the slug. This is what
`.a5c/processes/frontend-improvement-loop.js` does for `ui-implementer` and
`visual-qa-scorer`.

### Existing library workflows that need adaptation

Any workflow with `@agents` listed in JSDoc and `agent: { name: '<slug>' }`
in its task definitions is affected. Examples:

- `desktop-development/workflows/auto-update-system.js` — uses
  `name: 'update-analyst'` etc. without inlining.
- `desktop-development/workflows/desktop-ui-implementation.js` — uses
  `name: 'analyze-ui-requirements'` etc. without inlining.
- All other named-agent workflows.

These need either (a) wrapping in an MC-local process that re-dispatches
each task with inlining, or (b) upstream patching of the workflows
themselves to load the AGENT.md content.

`pixel-perfect-implementation.js` is the **exception** — it uses
`name: 'general-purpose'` for every dispatch, with detailed inline
prompts. It works without AGENT.md loading. Its `@agents` JSDoc is
documentation only; the named agents are not actually dispatched.

## Testing sandbox: keep it, document it

`library/specializations/testing/agents/` contains three agents that look
like cruft but are actually intentional regression fixtures for the
AGENT.md resolution bug above:

| Agent | What it tests |
|---|---|
| `dad-joke-bob` | An agent whose mandatory behavior (always open with a dad joke) is **unguessable from the slug**. If a response opens with a joke, AGENT.md was loaded. |
| `helper-x` | Ends every response with codename `CYAN-7` — also unguessable from the slug. Detects whether AGENT.md content ever reaches the model. |
| `frank` | Mismatched-name fixture: `agent.name='bob'` but path points to `frank/AGENT.md`. Used in test E3 to disambiguate which signal wins (slug name vs file path). |

**Recommendations:**

1. **Keep the agents.** They're the regression fixtures that proved the bug.
2. **Add a `library/specializations/testing/README.md`** explaining their
   purpose so future readers don't delete them as test rubbish.
3. **Wire `agent-resolution-test.js` into a doctor-style smoke** so any
   future SDK upgrade that fixes (or breaks) AGENT.md loading is caught
   immediately. A trivial check: if `dad-joke-bob`'s introduction contains
   a joke, the bug is fixed; otherwise it isn't. Surface that in
   `npm run doctor` output.
4. **Consider renaming the dir to `_test-fixtures/`** if you want to make
   the intent obvious without a README. (Optional. Costs an
   `_index.json` rebuild and possibly hardcoded paths in test files.)

## MC integration smoke test (dad-joke)

`.a5c/processes/dad-joke-mc-test.js` is a small curated workflow that
proves the entire MC → babysitter → pi → result-back-to-MC chain is
healthy. It dispatches two parallel-style agent tasks:

- **A** — `agent.name='general-purpose'` with `dad-joke-bob`'s AGENT.md
  body inlined into the prompt (the workaround pattern).
- **B** (control) — `agent.name='dad-joke-bob'` with no inlining. The
  slug alone reaches the runtime.

The oracle is the literal phrase `"I'm Bob"` taken from line 16 of
`dad-joke-bob/AGENT.md`. The slug `dad-joke-bob` cannot have produced
that phrase; only the inlined file body could. So:

| Result | Verdict | Meaning |
|---|---|---|
| A says "I'm Bob", B does not | **pass** | Pipeline healthy, workaround works |
| Both say "I'm Bob" | **unexpected** | SDK started auto-loading AGENT.md (workaround now redundant — investigate before removing) |
| A does NOT say "I'm Bob" | **fail-pipeline** | Pipeline broken at one of: filesystem read, prompt build, agent dispatch, pi response, result write-back. Diagnostic fields point at which leg. |
| Only B says "I'm Bob" | **fail-test** | Impossible state in theory; likely a test bug — inspect `tasks/<effectId>/input.json` |

### Recipe

```powershell
# 1. Create a test sandbox project pointing at the MC repo (so library/
#    is reachable when the process resolves libraryRoot from cwd).
npm run mc -- project create test-sandbox `
  --name "Test Sandbox" --prefix TS --icon 🧪 `
  --path C:\Users\Treml\source\repos\MissionControl

# 2. Create the dad-joke task wired to the curated workflow.
npm run mc -- task create `
  --project test-sandbox `
  --title "Dad-joke MC integration test" `
  --workflow .a5c/processes/dad-joke-mc-test.js `
  --inputs .a5c/processes/dad-joke-mc-test.inputs.json `
  --mode yolo

# 3. Open MC, find the new task in test-sandbox, click Start.

# 4. Watch the task journal. The final run output shows the verdict.
#    A "pass" means MC's pipeline is fully wired.
```

### What "pass" verifies, end to end

1. MC reads `<userData>/tasks/<id>/RUN_CONFIG.json` and finds
   `libraryWorkflow.diskPath`.
2. MC's RunManager spawns
   `babysitter run:create --entry .a5c/processes/dad-joke-mc-test.js#process …`
   with workspace = project.path (the MC repo).
3. MC drives `run:iterate`, which loads the process and runs Phase 1
   (`loadAgentMd` reads the file from disk).
4. Phase 2 issues two `kind: 'agent'` effects. MC's RunManager dispatches
   each to its pi session manager.
5. Pi receives the prompt (with the inlined AGENT.md body for A, slug-only
   for B), generates a response.
6. The response lands back in `tasks/<effectId>/output.json`. MC posts
   the result via `task:post`. `run:iterate` resumes.
7. Phase 3 compares introductions, picks a verdict, returns.
8. MC writes the run output to the task journal where you can see it.

If any single step breaks, the verdict becomes `fail-pipeline` and the
diagnostic fields (`agentMdSnippet`, both `introduction` strings) tell
you which step.

## Available workflows by specialization (current count)

- `desktop-development/workflows/` — 24 workflows (auto-update-system,
  code-signing-setup, cross-platform-app-init, desktop-build-pipeline,
  desktop-ui-implementation, file-system-integration, mvvm-implementation,
  performance-optimization, security-hardening, system-tray-integration,
  windows-features, macos-features, linux-packaging, native-notifications,
  inter-app-communication, system-services-integration, desktop-migration,
  desktop-i18n, desktop-accessibility, desktop-analytics,
  desktop-ui-testing, desktop-unit-testing, cross-platform-testing,
  incremental-feature-e2e-gate)
- `ux-ui-design/workflows/` — 22 workflows (pixel-perfect-implementation,
  design-qa, accessibility-audit, wcag-compliance, design-system,
  component-library, hifi-prototyping, design-handoff, ab-testing,
  responsive-design, usability-testing, design-sprint, …)
- `web-development/workflows/` — 60+ workflows (most are framework-specific;
  for MC the relevant ones are `react-app-development`,
  `unit-testing-react`, `keyboard-navigation-focus`, `aria-implementation`,
  `web-performance-optimization`, `bundle-size-optimization`,
  `typescript-configuration`, `vite-build-configuration`. Skip
  `redux-state-management`, `zustand-state-management`,
  `react-query-server-state` — CLAUDE.md rule against state libs.)
- `software-architecture/workflows/` — 23 workflows (adr-documentation,
  refactoring-plan, system-design-review, tech-stack-evaluation,
  data-architecture-design, …). Adapt `adr-documentation` output to
  `// CONFIRMED:` markers per CLAUDE.md.
- `common-utilities/workflows/` — 3 helpers (docx-conversion,
  parallel-combinator, index).

## Local processes in `.a5c/processes/`

| Process | Purpose |
|---|---|
| `frontend-improvement-loop.js` | Iterative renderer improvement loop with checkpoint, AGENT.md inlining, verify-or-revert, commit-on-pass. |
| `dad-joke-mc-test.js` | MC integration smoke test. Two-variant (with/without inlining) introduction comparison; verdict proves the full MC → babysitter → pi pipeline. See "MC integration smoke test" section. |
| `agent-resolution-test.js` | The empirical AGENT.md SDK probe (no inlining). Run after any SDK upgrade — if results change, update accordingly. |
| `dynamic-agent-activation.js` | Existing pattern: general-purpose + rich inline prompt. Reference template for new MC processes. |
| `cleanup-a5c-runs-and-processes.js` | Periodic housekeeping. |
| `next-10-mission-control.js` | Multi-step MC feature work. |
| `test-a*.js`, `test-b*.js`, `test-c*.js`, `test-d*.js`, `test-e*.js`, `test-f*.js` | Targeted regression tests for specific AGENT.md / prompt-resolution behaviors. Keep. |

## Running the frontend improvement loop

The loop is driven via `run:create` + `run:iterate` (Agent commands path).
Shell tasks (preflight, verify, revert, commit) execute inline during
`run:iterate`. Agent tasks (select-candidate, implement-fix) become
**pending effects** between iterations and are resolved by an external
agent driver — typically you (typing into Claude Code) or any other
agentic CLI you trust.

```powershell
# 1. Commit any in-progress work first (the loop checks for a clean tracked tree).
git add -A; git commit -m "wip: pre-loop checkpoint"

# 2. Seed the run.
babysitter run:create `
  --process-id local/frontend-improvement-loop `
  --entry .a5c/processes/frontend-improvement-loop.js#process `
  --inputs .a5c/processes/frontend-improvement-loop.inputs.json `
  --runs-dir .a5c/runs --json
# → returns { runId, runDir, ... }. Note the runDir.

# 3. Drive replay. This will run shell tasks inline and stop at the first
#    pending agent task (select-candidate or implement-fix).
babysitter run:iterate <runDir> --json

# 4. List pending agent effects.
babysitter task:list <runDir> --pending --json

# 5. Resolve each pending agent effect:
#    Read the task's input.json (in <runDir>/tasks/<effectId>/input.json),
#    do the agent work (pick a candidate / implement the fix), then post the
#    result.
babysitter task:post <runDir> <effectId> --status ok --value-inline '{...}'

# 6. Iterate again. Repeat 3-6 until run completes (status RUN_COMPLETED).
babysitter run:iterate <runDir> --json

# 7. Inspect what got committed.
git log --oneline @{1}..HEAD

# 8. If you don't like any of it, the checkpoint SHA is in the run output
#    (search journal events for the preflight task result).
git reset --hard <checkpointSha>
```

The loop:

1. Records HEAD as the checkpoint SHA (preflight shell task — runs inline).
2. Pre-loads `ui-implementer/AGENT.md` and `visual-qa-scorer/AGENT.md`
   from the library and inlines them into agent task prompts.
3. Per iteration: `select-candidate (agent)` → `implement-fix (agent)` →
   `verify (shell)` → `commit-or-revert (shell)`. Each agent task is a
   pause point during `run:iterate` until you post a result.
4. Verify runs `npm run typecheck && npm run smoke && npm run test:workflow
   && npm run verify-ui` — same as `npm run doctor`.
5. On iteration failure: `git stash --include-untracked && git stash drop`
   (recoverable from reflog for ~30 days).
6. Returns `{ success, checkpointSha, iterations, results: [...] }` once
   the final iteration completes.

### Driving the loop from a single Claude Code session

Easiest workflow: open Claude Code in the MC repo, ask it to "run the
frontend improvement loop". Claude does steps 2–6 itself — calling
`run:create`, then `run:iterate` until pending agent effects appear, then
*it* does the agent work (picking candidates, implementing fixes), then
`task:post`s the result, then iterates again. From your perspective
that's one prompt and a series of commit notifications.

If you want a hands-off background loop instead, that's what
MC's RunManager + the `harness:call` wrapper exist for — but those are
non-agent paths intended for higher-level tooling, not for direct human
or agent invocation at the prompt.

## Open follow-ups

- **`pixel-perfect-implementation` for MC** would need the renderer's
  vite-served URL (default `http://localhost:5173/`) and a way to launch
  `electron-vite dev` in the background, capture, then kill. Doable but
  out of scope for the loop above. Defer until a specific page needs
  pixel-grade matching against a static mock.
- **Patch upstream library workflows** to inline AGENT.md (or wait for
  the SDK to grow that capability). Either way, the inlining pattern in
  `frontend-improvement-loop.js` is the workaround template.
- **Document the testing/ sandbox** with a README and consider promoting
  `agent-resolution-test.js` into a doctor-step.
