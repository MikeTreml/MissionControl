# Mission Control — Design System

A design system for **Mission Control (MC)**, an Electron + React + TypeScript
desktop app that orchestrates AI coding agents. MC is the UI + state layer
on top of two runtimes: `@mariozechner/pi-coding-agent` (the agent runtime)
and `@a5c-ai/babysitter-sdk` (the orchestration layer).

This folder packages MC's visual language so design agents can produce
mocks, prototypes, slides, and additions that read as real Mission Control.

---

## Sources

Everything here was extracted from the canonical MC repo. Treat that repo
as ground truth; this folder is a derivative.

- **Repo:** `MikeTreml/MissionControl` @ `main`
- **Locked visual contract:** `docs/UI-DESIGN.md` in the repo
- **Live token source:** `src/renderer/src/styles.css`
- **Mockup tokens:** `docs/mockups/_shared.css` (mirrors styles.css)
- **Project & agent context:** `AGENTS.md`, `CLAUDE.md` at repo root
- **Owner / primary user:** Michael Treml

If the repo and this folder ever conflict, the repo wins — re-import the
relevant files (`src/renderer/src/styles.css`, `docs/UI-DESIGN.md`).

---

## What Mission Control is

A single-window desktop app for one operator (the user) running many
parallel AI coding agents across many projects. The mental model:

- **Projects** — repos / codebases (~10 active, ~20 max). Each gets a
  short immutable PREFIX (`ALGD`) and a single accent color from a
  10-swatch palette. The accent paints task IDs, not chrome.
- **Tasks** — units of work, scoped to one project, identified
  `<PREFIX>-<NNNN>` (`ALGD-0143`).
- **Workflows** — sequences of agents pulled from `library/` (the
  source of truth). User assembles them; MC runs them.
- **Lanes / phases** — workflow-driven, not enum-driven. The chip row
  on Task Detail reads the running workflow's phase list.
- **Live events** — every running task streams events to a right-rail
  Run Activity feed.

The product surface is one Electron app, so this design system has
**one UI kit**: `ui_kits/mission-control/`.

---

## File index

| File / folder                        | What it is                                              |
|--------------------------------------|---------------------------------------------------------|
| `README.md`                          | This file — orientation, content + visual fundamentals  |
| `SKILL.md`                           | Agent-Skill manifest (works in Claude Code)             |
| `colors_and_type.css`                | All tokens (color, type, radii, spacing, motion)        |
| `assets/`                            | Logos / icon set (none in repo — placeholders + notes)  |
| `preview/`                           | Cards rendered in the Design System tab                 |
| `ui_kits/mission-control/`           | React recreations of MC's three primary surfaces        |

There are **no slide templates** in the source repo, so this folder
ships no `slides/` directory.

---

## Content fundamentals

MC's voice was set by Michael, the project owner, and tuned for
solo-operator engineering. Read 5 of his comments and you have it:

- **Direct, lowercase, terse.** Section headings in `CLAUDE.md`:
  `## Commands`, `## Gotchas`, `## When you're uncertain`. No
  marketing voice.
- **Imperative for rules.** `// CONFIRMED:`, `// PROPOSED:`, `// OPEN:`,
  `// TODO:` are baked into the workflow. The voice mirrors them —
  "Don't hardcode labels", "Baby steps", "Pi owns the runtime."
- **You-not-we.** When the docs talk to a future contributor (human
  or agent), it's *you*: "You're working in mc-v2-electron", "When
  you're uncertain", "If you're handling a campaign item: do the work
  for THIS item only".
- **No emoji as decoration.** Emoji appear only as functional icons
  the OS already renders (`📁 Open folder`, `📦` archive button,
  `↗` open detail, `↩` unarchive). Never as bullets, never to soften.
- **Status verbs over nouns.** Pills read `running`, `paused`,
  `awaiting input`, `awaiting approval — plan ready`. Never
  `Status: Running`. Verb + adverbial context.
- **Owns mistakes, names doubt.** `// OPEN: <question>`, "PROPOSED —
  ask before first commit", "Reversed from earlier:". Honest about
  what's not decided.
- **Specifics over rounded numbers.** `~10 active projects typical,
  ~20 max`, `7-9px filled dot`, `4-digit sequence for now`. Real
  numbers, qualified.
- **Mono is for IDs, paths, types.** `<PREFIX>-<NNN><W>`,
  `src/main/run-manager.ts`, `webContents.send`. Anywhere the user
  would copy-paste it.

Use this voice in any copy you write for MC. If you find yourself
typing "Empower your team to…" or adding ✨, stop.

### Tone examples (real strings from the app)

- Empty state: `Nothing waiting on you.`
- Tooltip: `Archive — hide from default board`
- Banner: `bridge ok` / `bridge offline`
- Pill: `awaiting input`, `failed`, `paused`
- Empty drafts: `✦ Nothing to triage` (the only flourish — it earns it)
- Demo banner: `Demo data` + `Click + to add your first project.`
- Settings copy: `Models = roster + provider toggles. No "Lane defaults".`

---

## Visual foundations

Everything below is locked in `docs/UI-DESIGN.md`. Don't drift.

### Color philosophy

> Only **state** carries saturated color. Project identity is
> grayscale-with-an-accent. Chrome is grayscale.

Three axes, no fourth:

1. **Chrome** — grayscale only (`--canvas`, `--surface`, `--raised`,
   `--border`, `--text`, `--text-2`, `--muted`).
2. **State** — green / amber / red / blue, each with a tinted bg
   for use as pill backgrounds (`#1B2A1F`, `#2A2417`, `#2A1B1B`,
   `#1A2333`).
3. **Project identity** — one of 10 named accent swatches (Iris, Pine,
   Clay, Rose, Sky, Bronze, Moss, Mint, Lilac, Stone). Earth tones
   are over-represented on purpose (Clay, Bronze, Moss, Stone).

If you reach for a fifth color, you're inventing a third axis where
two were enough.

### Type

- Family: **system stack** — Segoe UI on Windows, then Arial. No
  webfonts. (MC is Electron, ships offline, doesn't load fonts.)
- Mono: **`ui-monospace, "Cascadia Code", Consolas, monospace`**.
- Sizes are dense — `11 / 12 / 13 / 14 / 16 / 18 / 22`. No fluid type;
  this is a desktop tool, not a marketing page.
- Weight: 400 / 500 / 600 / 700. Headings are 700; section labels
  uppercase 600 with 0.5px letter-spacing in `--text-2`.

### Spacing

8-px base, half-steps OK for dense UI: `2 / 4 / 6 / 8 / 10 / 12 / 14 /
18 / 24`. **14 is the signature card-padding number; 18 is the
signature shell-padding number** — those two appear all over.

### Backgrounds

- App canvas is solid `#0E0F11`. **No gradients** anywhere in chrome.
- Panels (`--surface`, `#15171A`) and raised cards (`--raised`,
  `#1A1D21`) are flat solids.
- Tints: pill backgrounds use `rgba(<state>, 0.12-0.15)`. The
  selected-tab subtle `rgba(110,168,254,0.08)` is the only "tinted"
  region in chrome and it's barely there.
- The **only** non-solid surfaces:
  - Topbar uses `rgba(23, 26, 33, 0.8)` — slightly transparent over
    the canvas.
  - Skeleton loaders use a moving linear gradient (panel-2 → border →
    panel-2) for shimmer.
- No images, no patterns, no textures. Backgrounds are work surfaces.

### Animation

Three motion patterns, all reserved:

1. **Pulse halo** on running tasks — 2.1s ease-in-out, infinite, scale
   1 → 0.7 + a faint blue ring. Tells the operator "this card is alive."
2. **Skeleton shimmer** — 1.4s linear loop on placeholders.
3. **Toast in** — 140ms ease-out, 8px upward slide.

Hover & press are mostly **state changes**, not motion: hover reveals
the action row on `.task` cards (`display: none → flex`) and tints
hover-buttons; nothing slides or scales. There is **no** "delightful"
microcopy or fade — MC is a tool, not a website.

### Hover & press

- Hover on cards → action row appears top-right with a `rgba(15, 17,
  21, 0.85)` backdrop and 2px blur. No scale.
- Hover on buttons / table rows → `var(--panel-2)` background tint +
  `var(--border)` border.
- Pressed primary buttons keep their accent fill; ghost buttons darken
  the bg. No depression / shadow change.
- Selected state = 1px outline in `--accent` (used on active project /
  active task) + the pulse halo if the task is running.

### Borders

- 1px `--border` (`#25282D`) is the default separator.
- 2px `--danger` left border on blocked task rows.
- **3px** project-accent left border on task rows + the task detail
  panel (project identity rule).
- 2px `--accent` left border on highlighted live-event rows.
- 1px `--good` / `--warn` / `--bad` border around state pills (in the
  mockup CSS). The app's `.pill` style keeps the bg-only treatment.

### Shadows

Reserved. Most chrome is flat — shadows mean "this is floating
above the rest":

- Toasts: `0 12px 28px rgba(0, 0, 0, 0.35)`
- Menus / popovers: `0 8px 24px rgba(0, 0, 0, 0.35)`
- Bridge dot: `0 0 0 2px rgba(<color>, 0.25)` — a halo, not a drop.

No inner shadows. No protection gradients. No blur except the small
`backdrop-filter: blur(2px)` under the hover-actions strip.

### Corner radii

Six steps, used systematically:

| Token        | px | Used for                                  |
|--------------|----|-------------------------------------------|
| `--radius-xs`  | 4  | hover-action buttons                      |
| `--radius-sm`  | 6  | prefix chips, selects, small buttons      |
| `--radius-md`  | 8  | project rows, ghost buttons               |
| `--radius-lg`  | 10 | primary buttons                           |
| `--radius-xl`  | 12 | toasts, mockup `.frame`                   |
| `--radius-2xl` | 14 | **the** card / task / project radius      |
| `--radius-3xl` | 16 | board lane                                |
| pill           | 999 | state pills, count chips                 |

### Cards

`.card` and `.task` look like this:
```
background: var(--raised);   /* #1A1D21 */
border: 1px solid var(--border);
border-radius: 14px;
padding: 14px;
```
That's it — no shadow, no inner gradient. The only embellishment is
the 3px project-accent left border when a task belongs to an active
project.

### Layout rules

- **Three-column shell**: 320px sidebar | flex main | 360px right rail.
  Top nav inside `main`, sub-nav (Settings) on the left of `main`.
  Right rail is persistent.
- The right rail's bottom row pins live `tokens 412k · $2.31` data.
- Lanes on the Board: 6 columns with `min-width: 220px`.
- Drafts table uses container queries to drop the Created column at
  880px and tighten Project at 720px.

### Transparency & blur

Sparingly:

- Topbar bg is 80% panel — barely.
- Hover-action strip has a 2px backdrop blur over an 85% canvas tint.
- That's the entire list. **No glassmorphism**.

### Imagery

There is none. MC has no marketing surface, no hero images, no
illustrations. Use placeholders if you mock something that needs
imagery and flag it for follow-up.

---

## Iconography

MC ships **no icon library**. Iconography is a mix of:

- **Unicode glyphs** for in-app verbs:
  `▶ ■ ⏸ ▷ → ⤴ ⤵ ⚙ ✓ ⚠ ↗ ↩ ↻ ✦ ◇ ◆ ✕ · …`
  (See `RightBar.tsx#iconForEvent` for the canonical mapping.)
- **Functional emoji** for OS verbs only: `📁` open folder, `📦`
  archive, `🚧` blocker.
- **Bridge dot** — a 9px filled circle in `--good` or `--bad`.
- **Project icon** — optional 1-2 character user-supplied marker
  (emoji or short string) shown inside project rows + as a
  fingerprint on task cards. Pure user content; not a system.

There is **no** Lucide / Heroicons / FontAwesome / SVG sprite. If a
new icon is needed, prefer a Unicode glyph that matches the existing
set. If a real icon is unavoidable, use **Lucide** (CDN), 16px stroke
1.5px, in `--text` for default and `--text-2` for muted — the visual
weight matches MC's existing strokes.

> ⚠ **Substitution flagged.** When `assets/` needs an icon set for a
> new mock, this design system links Lucide from CDN. Replace with
> the project's choice if/when it ships one.

---

## Quick start for a designing agent

```
1. Read this README + open colors_and_type.css.
2. Link colors_and_type.css from your HTML.
3. Use --canvas / --surface / --raised / --border / --text / --text-2
   / --muted for chrome.
4. Use --success / --warning / --danger / --info ONLY for state.
5. Use --proj-* for project identity (3px left-border + 7-9px dot).
6. Mirror voice: lowercase, direct, status-as-verb.
7. Look at ui_kits/mission-control/index.html for a working reference.
```
