# MC Library Browser + Workflow Runner: Multi-Agent Runbook

This runbook turns the plan into executable waves using Mission Control's
existing pipeline and handoff conventions.

## Objective

Deliver phases 1-4 first (load-bearing core), then reliability and authoring
extensions, with explicit agent ownership and no file collisions.

## Wave 0 decisions (locked)

- `library/` location: `C:\Users\Treml\source\repos\MissionControl\library`
- per-step model ownership: workflow-owned (`workflow.json` source of truth)
- concurrent task cap default: `10`
- resume policy: manual resume (explicit user action after interruption/restart)
- generation model policy: user picks model per generation
- `_meta.json` policy: **OPEN** (needs your call before bulk backfill)

## Agent roster

- **Orchestrator Planner** (`planner`): sequencing, acceptance criteria, unblock decisions.
- **Data/Index Engineer** (`developer` lane A): library walker and index contracts.
- **Browser UI Engineer** (`developer` lane B): library browser page and selection UX.
- **Runner Engineer** (`developer` lane C): invoke workflow, run state, task status views.
- **Reliability Engineer** (`developer` lane D): cancel/resume/queue/concurrency.
- **Analytics Engineer** (`developer` lane E): cost tracking and historical run search.
- **Authoring Engineer** (`developer` lane F): generate workflow prompt, AI dispatch, save flow.
- **Reviewer** (`reviewer`): validates each wave against acceptance checks below.
- **Surgeon** (`surgeon`): cleanup, refactors, naming consistency, docs touch-ups.

## Wave plan

### Wave 0 (must complete first)

**Owner:** Orchestrator Planner

1. Resolve open questions in `MC Library Browser Workflow Runner Plan.md` section 9:
   - library root location
   - `_meta.json` backfill policy
   - per-step model ownership source
   - concurrent task default cap
   - resume policy
   - authoring AI model policy
2. Freeze decisions in one place:
   - `docs/HANDOFF.md` (high-level) and
   - inline `// CONFIRMED:` markers at affected code touchpoints.

**Exit criteria**
- No unresolved decision blocks remain for phases 1-4.

---

### Wave 1 (Phase 1)

**Owner:** Data/Index Engineer

Build foundational index generation:

- `src/main/library-walker.ts`
- `scripts/build-library-index.ts`

Implement:
- scan `library/` and emit `library/_index.json`
- parse markdown frontmatter and workflow traits
- nearest-parent `_meta.json` propagation
- `usesAgents`, `usesSkills`, `estimatedSteps`, `hasParallel`, `hasBreakpoints`

**Exit criteria**
- `npm run build-library-index` produces a valid `_index.json`
- summary counts and representative entries are correct
- smoke test added for walker behavior

---

### Wave 2 (Phases 2-3)

**Owner:** Browser UI Engineer

Create Library Browser UI:

- `src/renderer/src/pages/Library/`
- `Tree.tsx`, `FilterBar.tsx`, `DetailPanel.tsx`, `SelectionBag.tsx`

Implement:
- tree rendering by kind/container
- free text search + path query shortcuts
- filter chips (AND across chips, OR within chip)
- multi-select with indeterminate parents
- single starred workflow template behavior
- selection bag + clear

**Exit criteria**
- read-only browse works first, then selection behaviors
- no hardcoded labels that should come from index data

---

### Wave 3 (Phase 4 core runner)

**Owner:** Runner Engineer

Implement workflow run orchestration UX and wiring:

- pre-run config modal from workflow row
- JSON Schema-driven inputs form
- task creation and run start path
- live status panel and cycle/iteration view

Target files:
- `src/renderer/src/components/InputsForm.tsx`
- `src/renderer/src/pages/TaskDetail/StatusPanel.tsx`
- `src/renderer/src/pages/TaskDetail/CycleView.tsx`
- main/preload/ipc wiring as needed

**Exit criteria**
- user can select workflow -> configure -> start -> observe
- events append to task journal and visible live state updates

---

### Wave 4 (Phases 5-6)

**Owner:** Reliability + Analytics Engineers

Implement:

- `src/main/run-cost-tracker.ts`
- cancellation semantics (`cancelled` distinct from `failed`)
- restart re-attach + interrupted resume path (`src/main/run-resumer.ts`)
- concurrency cap and queue/backoff

**Exit criteria**
- per-step metrics persist and aggregate
- crash/restart does not lose long-running tasks
- concurrent starts respect configurable cap

---

### Wave 5 (Phases 7-8)

**Owner:** Authoring Engineer

Implement workflow author flow:

- assemble generation prompt from selection bag
- preview/edit modal
- AI dispatch (model chosen per policy from Wave 0)
- save generated workflow bundle:
  - `workflow.js`
  - `workflow.json`
  - `_generation-prompt.md`
  - `README.md`

**Exit criteria**
- full "select -> generate -> save -> run" loop works end-to-end

---

### Wave 6+ (Phases 9-11)

**Owners:** Reliability + Analytics + Browser UI Engineers

- side-by-side run comparison
- cross-reference impact warnings before delete/rename
- historical search across runs (`tasks/_index.json`)

## Handoff contract per wave

Every wave produces:

1. `HANDOFF.md` in the active task folder:
   - what changed
   - what remains
   - risks / unknowns
2. Test evidence:
   - command list run
   - pass/fail summary
3. Reviewer verdict:
   - approve or loopback with concrete fixes

## Start now (first run checklist)

1. Run Wave 0 and freeze all section 9 decisions.
2. Immediately open Wave 1 task for `library-walker` + `build-library-index`.
3. Keep Wave 2 unblocked by defining the stable `_index.json` shape early.
4. Use baby-step cadence: implement -> smoke/typecheck -> handoff.

## Suggested task split IDs

- `LB-001`: Wave 0 decision lock
- `LB-002`: Library walker + build script
- `LB-003`: Library browser read-only
- `LB-004`: Browser selection bag + template star
- `LB-005`: Runner invoke + live status/cycle view
- `LB-006`: Cost tracker + cancellation
- `LB-007`: Resume + concurrency cap
- `LB-008`: Authoring prompt + save flow
- `LB-009`: Side-by-side compare
- `LB-010`: Cross-reference impact warnings
- `LB-011`: Past run search index
