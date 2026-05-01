# UI design rules

Locked 2026-04-29; **v2 token reset 2026-05-01** from
`NewUI/Mission Control Design System/`. Treat this as the contract every
component honors. When something here would need to change, edit this
doc *first* — don't drift the components and let the doc go stale.

The v2 reset moved off the cool near-black blue cast (the AI-cliché
"darkness 10/10") to a warmer neutral shell at ~darkness 6, and replaced
1px card borders with **elevation-only** separation (`--lift` inner
highlight on a lighter fill).

## Layout

- **Top nav** (not left sidebar): Tasks / Projects / Library / Settings + bridge dot. Sub-nav (e.g. Settings sections) goes on the left, top nav stays put.
- **Right rail** carries Live events with a pinned tokens/$ footer at the bottom. Persistent across all primary views.
- **Three-column shell** for views that need it (Library = tree + inspector + events; everything else = main + events).

## Color philosophy — calm, semantic-only

Only **state** carries saturated color. Project identity is grayscale-with-an-accent. Chrome is grayscale. If you find yourself reaching for a new hue, you're probably introducing a third axis where two were enough.

### State palette (locked — do not redefine these)

| Role        | Hex        | On bg (12% tint over canvas)  | Used for                       |
|-------------|------------|-------------------------------|--------------------------------|
| Success     | `#5DBF8A`  | `--success-bg`                | running, healthy, bridge dot   |
| Warning     | `#E8B14C`  | `--warning-bg`                | approval, awaiting input       |
| Danger      | `#E87474`  | `--danger-bg`                 | blocked, failed, stop confirm  |
| Info        | `#6BA4E8`  | `--info-bg`                   | selected items, links, ⓘ banners |

Slightly desaturated from v1 to sit on the lighter v2 shell without vibrating.
Greens, ambers, reds are **reserved** — projects can't pick them.

### Surface palette (v2 — warm neutral, elevation-only)

| Role            | Hex        | Token         | Used for                              |
|-----------------|------------|---------------|---------------------------------------|
| Abyss           | `#1C1B1A`  | `--abyss`     | overlays, code blocks                 |
| Canvas          | `#252422`  | `--canvas`    | App background                        |
| Surface         | `#2E2D2A`  | `--surface`   | Panels (sidebar, lanes, rightbar)     |
| Raised          | `#38362F`  | `--raised`    | Cards on top of panels                |
| Floating        | `#423F37`  | `--floating`  | Menus, popovers, hover-on-raised      |
| Hairline        | `#3D3B35`  | `--hairline`  | Subtle separator (table rules)        |
| Hairline strong | `#4A4842`  | `--hairline-strong` | Input borders, focus-ring base  |
| Text primary    | `#ECEAE5`  | `--text`      | IDs, titles, body                     |
| Text secondary  | `#B5B0A6`  | `--text-2`    | Metadata, sub lines                   |
| Text muted      | `#87827A`  | `--muted`     | Timestamps, hints                     |

**Cards lift, they don't border.** Use `box-shadow: var(--lift)` on
`.card`/`.task`/`.project`/`.agent`/`.lane` instead of
`border: 1px solid var(--border)`. Borders are reserved for shell
separators (sidebar↔main, file rows, ghost-button affordance, floating
menus). The 3px project-accent left border on task cards is still applied.

Light mode is a future-tense concern — keep components agnostic by using
CSS custom properties (`var(--surface)` etc.), don't hard-code hex.

Legacy aliases `--bg` / `--panel` / `--panel-2` / `--border` / `--accent`
/ `--good` / `--warn` / `--bad` are still declared in `styles.css` and
resolve to the v2 tokens. Prefer the v2 names for new work.

## Project identity

- **Prefix**: 1–10 chars, entered at create time, **immutable** afterward. Embedded in task IDs as `<PREFIX>-<NNNN>` (e.g. `ALGD-0143`). 4-digit sequence for now; widen later if any project actually crosses 9999.
- **Accent application**:
  - 3px left border on task rows + the task detail panel
  - 7-9px filled dot beside the project name
  - PROMPT.md / STATUS.md cards may carry a tinted background (project-specific content)
  - **Operational panels stay neutral** — lane timeline, plan steps, controls. They're about the *task's* run, not the project's identity. Tinting them made the whole view read "purple" before "task."
- **Color picker** in the create modal: 10 swatches, none from the
  state-reserved hues. v2 hexes (slightly desaturated from v1 to sit on
  the lighter shell): Iris `#8E87DD`, Pine `#2EA882`, Clay `#D86E48`,
  Rose `#D26890`, Sky `#5599DD`, Bronze `#C58432`, Moss `#7BAA38`,
  Mint `#6FCFB0`, Lilac `#BCB6EE`, Stone `#97968F`. Tokens:
  `--proj-iris` … `--proj-stone`.
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
