# UI design rules

Locked 2026-04-29 from the mockup pass in `~/Downloads/mission_control_*.html`.
Treat this as the contract every component honors. When something here would
need to change, edit this doc *first* — don't drift the components and let
the doc go stale.

## Layout

- **Top nav** (not left sidebar): Tasks / Projects / Library / Settings + bridge dot. Sub-nav (e.g. Settings sections) goes on the left, top nav stays put.
- **Right rail** carries Live events with a pinned tokens/$ footer at the bottom. Persistent across all primary views.
- **Three-column shell** for views that need it (Library = tree + inspector + events; everything else = main + events).

## Color philosophy — calm, semantic-only

Only **state** carries saturated color. Project identity is grayscale-with-an-accent. Chrome is grayscale. If you find yourself reaching for a new hue, you're probably introducing a third axis where two were enough.

### State palette (locked — do not redefine these)

| Role        | Hex        | On bg        | Used for                       |
|-------------|------------|--------------|--------------------------------|
| Success     | `#4ADE80`  | `#1B2A1F`    | running, healthy, bridge dot   |
| Warning     | `#F5B544`  | `#2A2417`    | approval, awaiting input       |
| Danger      | `#F87171`  | `#2A1B1B`    | blocked, failed, stop confirm  |
| Info        | `#60A5FA`  | `#1A2333`    | selected items, links, ⓘ banners |

Greens, ambers, reds are **reserved** — projects can't pick them.

### Surface palette

| Role            | Hex        | Used for                |
|-----------------|------------|-------------------------|
| Canvas          | `#0E0F11`  | App background          |
| Surface         | `#15171A`  | Panels                  |
| Surface raised  | `#1A1D21`  | Cards inside panels     |
| Border          | `#25282D`  | All separators          |
| Text primary    | `#E6E7EA`  | IDs, titles             |
| Text secondary  | `#9DA3AE`  | Metadata                |
| Text muted      | `#6E7480`  | Timestamps, labels      |

Light mode is a future-tense concern — keep components agnostic by using CSS custom properties (`var(--surface)` etc.), don't hard-code hex in components.

## Project identity

- **Prefix**: 1–10 chars, entered at create time, **immutable** afterward. Embedded in task IDs as `<PREFIX>-<NNNN>` (e.g. `ALGD-0143`). 4-digit sequence for now; widen later if any project actually crosses 9999.
- **Accent application**:
  - 3px left border on task rows + the task detail panel
  - 7-9px filled dot beside the project name
  - PROMPT.md / STATUS.md cards may carry a tinted background (project-specific content)
  - **Operational panels stay neutral** — lane timeline, plan steps, controls. They're about the *task's* run, not the project's identity. Tinting them made the whole view read "purple" before "task."
- **Color picker** in the create modal: 10 swatches, none from the state-reserved hues. `#7F77DD`, `#1D9E75`, `#D85A30`, `#D4537E`, `#378ADD`, `#BA7517`, `#639922`, `#5DCAA5`, `#AFA9EC`, `#888780`.
- ~10 active projects typical, ~20 max. If we ever need more, upgrade to hue-+-intensity (option C from the mockup discussion), don't add a 21st new hue.

## Lane timeline — workflow-driven chips

The chip row reads the running workflow's phase list and renders one chip per phase, with the current phase marked active. The workflow is the source of truth, not a hard-coded enum.

- **No `LaneSchema` enum.** The phase list comes from the workflow.js metadata or the journal stream.
- **Generic fallback** (acceptable but lower fidelity): `Draft / active / paused / error / finished`. Use this only if a task has no associated workflow, never for tasks that do.
- Cycle counter + elapsed time on the right side of the chip row (`cycle 1 · 12m`).
- **Implementation:** [`src/renderer/src/lib/derive-phases.ts`](../src/renderer/src/lib/derive-phases.ts) reads the events stream and returns `{ phases[], current, source }`. Source layering: curated `bs:phase`/`bs:error` events first → legacy `lane-changed` events second → generic runState/status fallback. The vertical timeline on Task Detail consumes this; a horizontal chip strip at the top of the page (per the mockup) reads the same data with different layout.

## Tasks list

- Filter sidebar shows counts per state, color-matched to the badge — triage cue. Eye lands on problems first.
- Blocked rows: 2px left border in danger color (`#F87171`). Scannable from across the screen.
- Title cell carries an inline secondary line for state context (`awaiting approval — plan ready`, `missing AxTable reference`). One row, but tells the why.

## Library

- Tree grouped by **kind first** (Agents / Skills / Workflows / Examples), not by source folder. Logical path is the subtitle for disambiguation.
- Inspector has **three zones**:
  1. Identity — kind chip + name + path
  2. Description + tags
  3. Metadata grid + open buttons
- Open buttons (SKILL.md, README, schema.json, examples/, folder) get their **own row at the bottom**, not buried in the metadata table.
- Kind chip uses info color (`#60A5FA`). Tags stay grayscale — don't fight the calm palette.

## Settings

- **Sub-nav on the left**: Models / Lanes & workflows / Runtime / Bridge / Appearance / About.
- **Models** = roster + provider toggles. **No "Lane defaults" mapping models to roles.** Model selection is run-level, picked at task start. (See feedback memory: don't lock model to agent/lane.)
- Info banners (`ⓘ`) use info color and are reserved for "this affects future runs" callouts. Don't dilute by using info color elsewhere.

## Right-rail Live events

- Newest event on top.
- Each entry: monospace timestamp, state dot in the relevant color, one-line summary.
- Pinned footer: `tokens 412k · $2.31`. Same row, both ends. Updates from the journal.

## What's dead — do not reintroduce

- `LaneSchema` enum (`plan/develop/review/surgery/approval/done`)
- `WorkflowLetterSchema` (`F/X/M`)
- `primaryModel` field on agents
- `currentAgentSlug` defaulting to `"planner"` on Tasks
- `code` field with the 1-char primary / 2-4 char subagent convention
- `<TASKID>-<NNN><W>` filename suffix that embeds the workflow letter

These all assume a fixed runtime roster and a fixed pipeline shape. The library-as-source-of-truth direction makes them wrong, not just out-of-date.

## Where new components go

(See [CLAUDE.md](../CLAUDE.md) "File organization" — the conventions there hold. This doc adds the *visual* contract those components must satisfy.)
