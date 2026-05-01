# SPEC — Pending Effects panel (item #7)

Status: **PROPOSED**. No code yet. Replaces today's
`BreakpointApprovalCard` (inline component in
`src/renderer/src/pages/TaskDetail.tsx`) with a panel that handles
every pending effect kind the babysitter SDK knows about — not just
breakpoints.

The breakpoint flow that ships today MUST keep working byte-for-byte
through this change. This spec is conservative: ship breakpoint +
sleep in v1, custom kinds in v1.1 once the SDK shape and any new IPC
surfaces are nailed down.

Validated shape: Temporal's *Pending Activities* tab — chips grouped
by effect kind, state-colored, each row carries kind-specific actions.
See `docs/COMP-RESEARCH.md` §1.

---

## 1. Effect kinds to support

The SDK's effect index (`task:list --pending`) covers three families
of effect. What the SDK is **guaranteed** to return per row, and what
the user needs to see/do, differs per kind.

### 1a. Breakpoint (existing — preserve byte-for-byte)

- **Source of truth**: a `breakpoint_opened` journal event PLUS the
  `task:list --pending` row that confirms the SDK still considers it
  open.
- **SDK row fields** (from `runListPending`): `effectId`, `kind:
  "breakpoint"`, optional `label`, `status` (`requested` while
  pending, anything else means resolved).
- **Rich payload** (from `derivePendingBreakpoint`):
  `payload.question`, `payload.title`, `expert`, `tags`, `openedAt`.
  These do NOT come from the SDK CLI today; they come from walking
  the journal events.
- **What the user sees**: title, freeform question, optional expert
  + tags, an "effect: <id>" footer.
- **What the user does**: types optional feedback into a textarea,
  clicks Approve OR Request changes. Response goes through
  `respondBreakpoint` IPC → `task:post --status ok --value-inline
  '{"approved":<bool>,"response":...}'`.
- **Reservation**: PRESERVE this exact UI — copy + colors + textarea
  + buttons + footer. The redesign wraps it in a panel; the inner
  card body for `kind === "breakpoint"` should be visually
  indistinguishable from today.

### 1b. Sleep (v1)

- **Source of truth**: a sleep effect appears in `task:list
  --pending` with `kind: "sleep"`. The SDK adds it to the index when
  the workflow calls `ctx.sleep(durationMs)`. **Q: does the journal
  emit a corresponding `sleep_opened` event with the duration in
  `data`?** If yes we can derive a richer payload (start time,
  duration); if no, we render with only what `task:list` gives us.
- **SDK row fields** (assumed minimum): `effectId`, `kind: "sleep"`,
  optional `label` (workflow-supplied human name), `status`.
  **Q: does the SDK row include `wakeAt` (ISO timestamp) or
  `durationMs` directly?** If yes, we can show a countdown without
  a derive helper. If no, we need the journal `payload`.
- **What the user sees**: kind chip ("Sleep"), label if any,
  countdown ("wakes in 4m 12s") if duration known, otherwise
  "sleeping…" with the start time.
- **What the user does**: nothing required — sleeps resolve
  themselves. Optional "Wake now" button if the SDK exposes a way
  to short-circuit. **Q: is there a `task:post --status ok` path
  that resolves a sleep early? Or is sleep purely time-driven from
  the SDK side?** If no early-resolve path exists, we render
  read-only with no action buttons.

### 1c. Custom kinds (v1.1, deferred)

- **Source of truth**: `task:list --pending` rows with arbitrary
  `kind` strings other than `breakpoint` / `sleep`. Today: nothing
  in the curated `library/workflows/*.js` set emits one, so this is
  forward-compatibility, not an active need.
- **SDK row fields**: `effectId`, `kind`, optional `label`,
  `status`. The shape of any `value` payload the workflow expects
  is workflow-defined and not introspectable from MC.
- **What the user sees**: kind chip with the literal kind string,
  label if any, "details" expand that pretty-prints the raw row.
- **What the user does**: **nothing** in v1.1 — read-only.
  Acting on custom kinds requires knowing the value schema, which
  MC has no way to discover. Surfacing the row at all already
  beats today (where they're invisible). A future v2 could add a
  generic "respond with JSON" textarea, but that's beyond this
  spec.

---

## 2. Data model

### Two sources, two shapes — preserve the hybrid

The current breakpoint flow uses **two data paths in parallel**:

| Source | Shape | Role today | Role in spec |
|--------|-------|------------|--------------|
| `derivePendingBreakpoint(events)` | rich payload (question, title, expert, tags, openedAt, runPath) | primary; renders the card | primary for breakpoint; not available for sleep/custom |
| `window.mc.runListPending(taskId)` | `{ tasks?: Array<{ effectId, kind, label?, status }> }` | gate; hides card if SDK says resolved | primary list (drives the panel itself); per-row gate for breakpoint |

**Key inversion in the new design**: `runListPending` becomes the
primary list driver. We render one row per pending effect from the
SDK list. For each row:

- If `kind === "breakpoint"` AND `derivePendingBreakpoint` returns a
  match for the same `effectId`, render the rich breakpoint UI from
  the derive helper.
- If `kind === "breakpoint"` and the derive helper has nothing
  (race: SDK ahead of journal), render a stub breakpoint row with
  the SDK's `label` only. Action buttons remain enabled because the
  SDK confirms the effect is pending. **Q: do we have `runPath`
  available without the derive helper, since `respondBreakpoint`
  needs it?** Today derive supplies it from
  `babysitter-run-detected` events; the SDK CLI knows it
  intrinsically. May need a `runPath` field added to the
  `runListPending` return shape, OR we always derive `runPath`
  separately from the events. (See §8.)
- If `kind === "sleep"`, render with SDK metadata only — no derive
  helper.
- If `kind` is anything else, render the generic custom row.

### Inversion implication

Today the breakpoint card is hidden when the derive helper returns
null. In the new design, if `runListPending` returns rows but the
journal is silent, **the panel still shows them** — we trust the SDK
list. This catches a class of "user can't see the pending thing"
bugs (journal rotation, missing events.jsonl, etc.) at the cost of
slightly less rich rendering during the race window.

### Fallback when CLI is unreachable

When `runListPending` rejects (SDK not installed, child process
errored), fall back to the existing derive-only behavior **for
breakpoints**: if `derivePendingBreakpoint` returns a match, render
it. Sleep + custom rows are simply not shown in this offline state —
we have no journal-derived equivalents and faking them would be
wrong. A small "SDK CLI unreachable — sleep/custom effects hidden"
footer warns the user.

---

## 3. UI states

The panel is its own `<section className="card">`, slotting in where
`BreakpointApprovalCard` is rendered today (between
`PhaseChipStrip` and `RunStatusCard` in `TaskDetail`).

### 3a. Empty (no pending effects)

The panel does **not render at all**. Same as today: no pending
breakpoint = no card. Avoids a permanent empty placeholder cluttering
Task Detail.

### 3b. Single pending effect

Single row, max-width-of-content. Layout matches today's breakpoint
card almost exactly:

```
┌────────────────────────────────────────────────────────────┐
│  ⏸  Awaiting human approval  · expert: arch · planning      │  ← header
│  Should we use Postgres or DynamoDB for the audit log?      │  ← title (bold)
│  Decide now; rationale will be appended to ADR-007.         │  ← question (muted)
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Optional response or change request                 │   │  ← textarea
│  └─────────────────────────────────────────────────────┘   │
│  [✓ Approve]  [↺ Request changes]   effect: bk-7f3a…        │
└────────────────────────────────────────────────────────────┘
```

Single sleep:

```
┌────────────────────────────────────────────────────────────┐
│  ⏳  Sleep · wakes in 3m 47s                                │
│  Cooldown before next planning iteration                    │  ← label, if SDK supplies one
│                                                             │
│  effect: sl-a90b…                                           │
└────────────────────────────────────────────────────────────┘
```

### 3c. Multiple pending effects, single kind

Header summarizes the count, rows stack vertically with a thinner
divider between them:

```
Pending effects · 2
─────────────────────
[breakpoint row …]
─────────────────────
[breakpoint row …]
```

Rare in practice (two breakpoints open simultaneously implies two
parallel agents both gating). Keeps order from `task:list` (SDK
walk order — closest to "most recently requested first"). Each
breakpoint row keeps its own textarea + buttons; they're
independent.

### 3d. Multiple pending, mixed kinds (breakpoint + sleeps)

Breakpoints float to the top because they require user action; sleep
+ custom rows below because they're informational. Within each
group, SDK order is preserved.

```
Pending effects · 3 (1 needs you)
─────────────────────
[breakpoint row — full UI, action buttons]
─────────────────────
[sleep row — countdown, no buttons]
─────────────────────
[sleep row — countdown, no buttons]
```

The "(1 needs you)" parenthetical counts only rows that have user
actions. Sleeps and custom rows don't count.

### 3e. SDK unreachable

Render breakpoint-only fallback (from derive helper), with a footer:

```
[breakpoint row …]
⚠ SDK CLI unreachable — sleep/custom effects hidden
```

---

## 4. Per-kind rendering

### 4a. Breakpoint — preserved

- Yellow-tinted card body (`rgba(244,201,93,0.08)` / `var(--warn)`
  border) inherited from today.
- Header: `⏸ Awaiting human approval`, expert + tags suffix.
- Title (bold) + question (muted whitespace-pre-wrap), both optional
  per the SDK payload.
- Textarea — `feedback` state, 2 rows, "Optional response or change
  request".
- Two buttons: `✓ Approve` (primary) and `↺ Request changes` (warn).
- Effect ID footer: `effect: <id>` in muted monospace.
- Error line shown below the buttons on action failure.

These rules are non-negotiable — copy them from the existing
component verbatim. The only structural change is moving the
component from "self-contained section" to "row inside a panel
section".

### 4b. Sleep

- Neutral card body (no warn tint — sleep is informational).
- Header: `⏳ Sleep` + countdown if duration known: `· wakes in 3m
  47s`. Recompute countdown every second via `setInterval` while the
  row is mounted; clear on unmount.
- Label below the header if `row.label` is non-empty.
- No textarea, no action buttons in v1. **Q: if the SDK exposes
  early-wake** (see §1b), add a `→ Wake now` button on the right.
  Posts via the same `task:post --status ok` path; value payload
  shape **Q: is it `{}` or something specific?**
- Effect ID footer.

If duration is unknown (no journal payload, no `wakeAt` in SDK
row), header reads `⏳ Sleep · sleeping…` and shows the start time
("started 2m ago") if we can derive it from the journal `recordedAt`.
If we can't, just `⏳ Sleep`.

### 4c. Custom (v1.1)

- Neutral card body.
- Header: `· <kind>` chip (lowercase literal kind string). e.g.
  `· http_request`, `· db_query`. Use a generic icon (☉) on the
  left.
- Label below if present.
- A "details" disclosure (`<details>` element or local state
  toggle) that pretty-prints the raw `task:list` row as JSON. Helps
  workflow authors debug.
- No actions.
- Effect ID footer.

---

## 5. Interaction flow

### 5a. Breakpoint approve / reject — unchanged

```
[user clicks Approve]
  → respondBreakpoint IPC ({ taskId, runPath, effectId, approved: true, response })
  → run-manager.ts spawns: babysitter task:post <runPath> <effectId>
                            --status ok --value-inline '{"approved":true,"response":"…"}'
  → MC appends events.jsonl: { type: "breakpoint-responded-by-user", … }
  → MC appends STATUS.md line
  → publish("tasks") → hooks refetch → derive + SDK list both report resolved
  → row disappears
```

Reject identical except `approved: false` and `feedback` instead of
`response` in the value payload.

### 5b. Sleep — passive in v1

No interaction. Row updates its countdown; on next `task:list` poll
(or live-events bridge debounce), the SDK reports the effect
resolved and the row disappears.

If we add early-wake, the action would route through a NEW IPC,
because `respondBreakpoint` is breakpoint-coded:

- **Q: do we add a generic `runs:postEffect` IPC** that takes
  `{ taskId, effectId, status, valueInline }` and let the
  per-kind component build its own value? That would future-proof
  custom kinds too. Today's `respondBreakpoint` becomes a thin
  wrapper around it.
- Alternative: a kind-specific `wakeSleep({ taskId, effectId })`.
  Clean per-call, but doesn't generalize.

Recommendation in this spec: **add `runs:postEffect` as the generic
IPC**, and make `respondBreakpoint` route through it (preserving its
public signature for the breakpoint card). Sleep and v1.1 custom
both use `runs:postEffect`.

### 5c. Custom — none in v1.1

Read-only.

### 5d. Refresh cadence

The panel re-fetches `runListPending` whenever:

- The component mounts (Task Detail navigation).
- A `tasks` topic publish lands (from any mutation).
- A live-events debounce tick fires (covers SDK CLI emissions).

Avoid spinning a polling timer just for this panel — the live-events
bridge already covers the "something happened in the journal" case.

---

## 6. Edge cases

### 6a. Race: SDK ahead of journal

Today's gate hides the card when the SDK says resolved but the
derive helper still thinks open. Preserve this for breakpoint rows.

In the new design, the inverse race becomes possible: SDK reports
pending but journal hasn't surfaced the `breakpoint_opened` yet.
Today this means "no card"; in v1, it means "render a stub
breakpoint row using SDK metadata until the journal catches up." The
stub still has working buttons because `task:list` already confirms
pending.

**Q: stub-row breakpoint missing `runPath`** — `respondBreakpoint`
requires it. Solution: derive `runPath` from the latest
`babysitter-run-detected` event independently of the breakpoint
derive helper, OR add `runPath` to the `runListPending` return
shape (preferred — single source of truth).

### 6b. Race: derive ahead of SDK

The journal shows `breakpoint_opened` but `task:list` returned
nothing. Today: card renders unguarded. In v1: don't render the
breakpoint row from derive alone if the SDK list is reachable but
empty — the SDK already resolved it and we're seeing a stale
journal. EXCEPTION: when the SDK CLI itself is unreachable
(`runListPending` rejected), derive-only fallback kicks in (today's
behavior). Preserve.

### 6c. CLI unreachable

`runListPending` throws. Render breakpoint-only via derive helper;
hide sleep/custom rows entirely; show the unreachable footer. This
keeps today's "the SDK isn't installed but breakpoints still work"
guarantee.

### 6d. Effect resolved between fetch and click

User clicks Approve, but in the ~ms between render and click the
SDK already resolved the effect (e.g. timeout). Today
`task:post` would either succeed redundantly or error with a
"already resolved" message. Surface the error in the row's error
line (existing pattern) and let the next refresh remove the row.
Don't pre-validate — round-trip cost > value.

### 6e. Multiple opens of the same effectId

Shouldn't happen per SDK contract. The derive helper handles it by
overwriting. The new panel should also dedupe by effectId, with the
SDK list as the canonical reference (it can't have duplicates by
construction).

### 6f. Sleep countdown drift

`setInterval(1000)` is rough; the wall-clock can drift if the tab
sleeps. Recompute against `wakeAt` (or `start + duration`) every
tick rather than decrementing — handles tab suspend/resume cleanly.

### 6g. Sleep without known duration

Countdown is omitted; show "sleeping…" only. No spinner — sleep is
inherently slow, a spinner implies "loading" and misleads.

---

## 7. Open questions

- **Q: SDK row shape for sleep.** Does `task:list --pending` return
  `wakeAt` or `durationMs` for sleep effects? Determines whether we
  need a journal-side derive helper or can render from CLI alone.
  **Investigate**: install babysitter-sdk locally, write a tiny
  workflow with a single `ctx.sleep(60000)`, run it, inspect the
  CLI JSON output. (10 min experiment.)
- **Q: SDK row shape for custom kinds.** What does `task:list`
  return for `ctx.effect(...)` calls with arbitrary `kind`? Same
  experiment as above with a custom kind.
- **Q: Sleep early-wake.** Is there a supported way to short-circuit
  a sleep? If yes, what value payload? If no, the sleep row is
  read-only forever.
- **Q: Generic `runs:postEffect` IPC.** Add it, or keep
  per-kind methods? This spec recommends adding it, with
  `respondBreakpoint` wrapping it. Confirm with Michael before
  implementing.
- **Q: `runPath` in `runListPending` return.** Currently each row
  has `effectId, kind, label?, status`. Should we add `runPath` so
  consumers don't have to derive it separately? Aligns with the
  SDK CLI's natural output (it already knows the runPath).
- **Q: Order of mixed-kind rows.** This spec puts breakpoints first.
  Alternative: preserve raw SDK list order (insertion / requested
  order). Michael's call.
- **Q: Should custom kinds (v1.1) ever surface action UI?** A
  "respond with JSON" textarea is technically possible but very
  power-user. Default: no. Revisit when an actual custom-kind
  workflow exists.

---

## 8. Implementation surface

### Files that change

- `src/renderer/src/pages/TaskDetail.tsx`
  - Remove the inline `BreakpointApprovalCard` function (or
    rename + reduce it to a row component).
  - Import a new `<PendingEffectsPanel />` and render it where
    `BreakpointApprovalCard` was.
- `src/renderer/src/components/PendingEffectsPanel.tsx` — **NEW**.
  Owns the panel section, the SDK list fetch, the derive-helper
  overlay, the per-row dispatch.
- `src/renderer/src/components/PendingEffectRow.tsx` — **NEW**.
  Switches on `kind`, renders the correct row body.
- `src/renderer/src/lib/derive-pending-breakpoint.ts` — keep
  unchanged. Becomes the rich-payload overlay for breakpoint rows.
- `src/renderer/src/lib/derive-pending-sleeps.ts` — **NEW, optional**.
  Only if §7 investigation shows the SDK doesn't include duration
  in `task:list` rows. Walks the journal for `sleep_opened`-style
  events to extract `durationMs` / `startedAt`. If the SDK does
  include it, this file is unnecessary.
- `src/main/run-manager.ts`
  - Add `postEffect({ taskId, effectId, status, valueInline })` —
    the generic spawn.
  - Refactor `respondBreakpoint` to call `postEffect` internally
    (preserve external signature + the `breakpoint-responded-by-user`
    event + the STATUS.md append).
  - Update `listPendingEffects` to also include `runPath` in each
    row (post-process the CLI JSON before returning).
- `src/main/ipc.ts` — register `runs:postEffect` channel.
- `src/preload/index.ts` — expose `postEffect`.
- `src/renderer/src/global.d.ts` — type `postEffect` on the McApi;
  update `runListPending` row type to include `runPath` (and any new
  fields confirmed by §7 investigation).

### IPC additions

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `runs:postEffect` | renderer → main | Generic effect-resolution POST. `{ taskId, effectId, status: "ok"\|"error", valueInline: string }`. Returns `void`. Wraps `task:post --status <s> --value-inline <v>`. |

`runs:listPending` exists already; only the **return shape**
extends (additive: `runPath` + any sleep-specific fields).
`runs:respondBreakpoint` stays for back-compat — internally
delegates to `postEffect`.

### Out of scope

- Live event streaming changes — keep using the existing
  `live-events-bridge` for refresh signals.
- New event types in events.jsonl — `breakpoint-responded-by-user`
  is the only effect-action event today; v1 doesn't add more.
  v1.1 may add `effect-resolved-by-user` if custom-kind actions
  ship.

### Order of work (smallest first)

1. Run the §7 SDK investigation. Document findings inline in this
   spec or a new `docs/SDK-PRIMITIVES-EFFECTS.md`. **No code yet.**
2. Add `runs:postEffect` IPC + main impl. Refactor
   `respondBreakpoint` to use it. **Verify breakpoint flow still
   passes verify-ui smoke.**
3. Extract `BreakpointApprovalCard` body into
   `<PendingEffectRow kind="breakpoint" …/>`. Wrap it in a thin
   `<PendingEffectsPanel />` that passes through a single derive-
   only row. **Visual no-op; verify-ui still passes.**
4. Switch the panel to use `runListPending` as the primary list
   driver, with derive overlay for breakpoint rows. Mixed-kind
   handling not yet exercised. **Verify-ui regression: same
   breakpoint behavior.**
5. Add sleep row rendering. Add countdown logic. Add a sleep test
   workflow under `library/workflows/` that fires a 30-second
   sleep, exercise it manually + via verify-ui.
6. (Later) Add custom-kind read-only row. Ship behind a flag
   until a real custom-kind workflow exists in the library.

---

## 9. Verification

### Existing assertions (keep, do not change)

`scripts/verify-ui.mjs` already covers the legacy "approval" lane
gate (lines 559+). That UI is being removed entirely (see
`docs/DROPPED-FEATURES.md` — manual approval gate is dropped). Those
specific assertions can be retired in this same change. The
**SDK-driven** breakpoint flow is what we add coverage for.

### New assertions to add to `verify-ui.mjs`

1. **Empty state**: with no pending effects, the panel does not
   render. Assert `locator(".pending-effects-panel").count() === 0`.
2. **Single breakpoint**: simulate a `breakpoint_opened` event +
   stub `runListPending` to return the matching row. Assert:
   - panel header reads `Awaiting human approval`
   - title + question render from the payload
   - `✓ Approve` and `↺ Request changes` buttons present + enabled
   - effect ID footer matches
3. **Approve dispatches**: click Approve, assert
   `runs:postEffect` (or `runs:respondBreakpoint`) IPC fired with
   `{ status: "ok", value containing approved: true }`. Assert
   `breakpoint-responded-by-user` lands in events.jsonl.
4. **Single sleep with duration**: stub `runListPending` returning
   a sleep row + `wakeAt = now + 90s`. Assert countdown text
   matches `/wakes in 1m 2[7-9]s/` (loose to absorb test latency).
   No action buttons rendered.
5. **Mixed kinds ordering**: stub list with `[sleep, breakpoint,
   sleep]`. Assert DOM order is `[breakpoint, sleep, sleep]`
   (breakpoints first per §3d).
6. **CLI unreachable**: make `runListPending` reject. Inject a
   `breakpoint_opened` journal event so derive-only path renders.
   Assert breakpoint row visible, sleep rows absent (they have no
   derive fallback), unreachable footer visible.
7. **Race — SDK resolved between fetch and click**: after
   rendering a breakpoint row, mutate the stub so the next
   `runListPending` returns empty, then click Approve. Assert
   `task:post` errors are surfaced inline in the row, NOT thrown
   as an unhandled toast.
8. **Screenshot**: `shoot("pending-effects-panel")` after the
   single-breakpoint case so design changes show up in the
   diff-on-PR loop.

### Smoke tests

- `src/renderer/src/lib/derive-pending-breakpoint.smoke.ts` —
  preserve, no change.
- (If `derive-pending-sleeps.ts` is added) corresponding
  `.smoke.ts` covering: sleep with duration, sleep without
  duration, sleep + early resolve.
- `src/main/run-manager.smoke.ts` — extend with a `postEffect`
  case (currently covers `respondBreakpoint` only).

### Manual checks before calling done

- Curated workflow with a real breakpoint (any
  `library/workflows/*.js` with a `ctx.breakpoint(...)` call) —
  approve → run continues → reject → run loops back. Watch
  STATUS.md for the line.
- Workflow with a `ctx.sleep(60000)` call — countdown ticks down,
  row disappears at zero, run continues to the next phase.
- Force `runListPending` to throw (rename
  `node_modules/@a5c-ai/babysitter-sdk` temporarily) — breakpoint
  flow still works through the derive fallback; sleep rows hidden;
  footer visible.

---

## Summary of reservations

- **v1 = breakpoint + sleep**, not custom kinds. Custom kinds need
  the §7 SDK investigation and a real workflow to test against.
- **Sleep early-wake** is a Q, not a commitment. If the SDK can't
  short-circuit, sleep rows are read-only forever — that's fine.
- **Generic `runs:postEffect` IPC** is recommended but not
  pre-approved. Confirm with Michael before adding the channel.
- **Breakpoint UI must not regress.** The redesign is a wrapper, not
  a rewrite. Side-by-side screenshots before/after should look
  identical for the single-breakpoint case.
- **Inverted gate**: SDK list becomes the primary driver instead
  of the gate. This is a behavior change worth flagging — it
  trades "rich-but-occasionally-stale" for "complete-but-
  occasionally-sparse" rendering during the small race window.
