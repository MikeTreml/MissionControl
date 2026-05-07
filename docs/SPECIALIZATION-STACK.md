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

```powershell
babysitter harness:create-run `
  --process library/specializations/<spec>/workflows/<workflow>.js#process `
  --harness pi `
  --workspace . `
  --runs-dir .a5c/runs `
  --non-interactive `
  --json
```

For an MC-local process, swap the `--process` path:

```powershell
babysitter harness:create-run `
  --process .a5c/processes/frontend-improvement-loop.js#process `
  --harness pi --workspace . --runs-dir .a5c/runs --non-interactive --json
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
| `frontend-improvement-loop.js` | This file's primary deliverable — iterative renderer improvement loop with checkpoint, AGENT.md inlining, verify-or-revert, commit-on-pass. |
| `agent-resolution-test.js` | The empirical AGENT.md test. Run after any SDK upgrade. |
| `dynamic-agent-activation.js` | Existing pattern: general-purpose + rich inline prompt. Reference template for new MC processes. |
| `cleanup-a5c-runs-and-processes.js` | Periodic housekeeping. |
| `next-10-mission-control.js` | Multi-step MC feature work. |
| `test-a*.js`, `test-b*.js`, `test-c*.js`, `test-d*.js`, `test-e*.js`, `test-f*.js` | Targeted regression tests for specific AGENT.md / prompt-resolution behaviors. Keep. |

## Running the frontend improvement loop

```powershell
# 1. Commit any in-progress work first (the loop checks for a clean tracked tree).
git add -A; git commit -m "wip: pre-loop checkpoint"

# 2. Run the loop with default inputs (3 iterations, non-interactive).
babysitter harness:create-run `
  --process .a5c/processes/frontend-improvement-loop.js#process `
  --inputs .a5c/processes/frontend-improvement-loop.inputs.json `
  --harness pi --workspace . --runs-dir .a5c/runs `
  --non-interactive --json

# 3. Inspect what got committed.
git log --oneline @{1}..HEAD

# 4. If you don't like any of it, the checkpoint SHA is in the run output.
#    Recover with:
git reset --hard <checkpointSha>
```

The loop:

1. Records HEAD as the checkpoint SHA.
2. Pre-loads `ui-implementer/AGENT.md` and `visual-qa-scorer/AGENT.md`
   from the library and inlines them into prompts.
3. Per iteration: `select candidate → implement → verify → commit-or-revert`.
   Verify runs `npm run typecheck && npm run smoke && npm run test:workflow
   && npm run verify-ui`.
4. On iteration failure: `git stash --include-untracked && git stash drop`
   (recoverable from reflog for ~30 days).
5. Returns `{ success, checkpointSha, iterations, results: [...] }`.

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
