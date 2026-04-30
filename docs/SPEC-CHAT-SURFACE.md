# SPEC — Chat surface (item #36)

Status: **PROPOSED** — investigation complete, design recommendation
included. Gate decision at the end.

This spec is the gate to whether MC's "terminal / chat surface" gets
built or deferred. It exists because COMP-RESEARCH.md §#36 explicitly
said: *"Spend 30 min reading pi-coding-agent's session.steer source
before designing the UI."* That investigation is captured here, and
the design follows from what the SDK can actually do — not from what
we hoped it could do.

Sources read directly from `node_modules/`:

- `@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts`
  (full interface; lines 108–120, 322–386)
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js`
  (`steer`, `followUp`, `_queueSteer`, `_queueFollowUp`, `abort`
  implementations; lines 700–725, 853–918, 1041–1045)
- `@mariozechner/pi-agent-core/dist/types.d.ts`
  (steering / follow-up callback contract; lines 144–161)
- `@mariozechner/pi-agent-core/dist/agent.d.ts`
  (low-level `Agent.steer` / `followUp` queueing API; lines 71–88)
- `@mariozechner/pi-agent-core/dist/agent-loop.js`
  (when steering messages are actually drained; lines 75–129)
- `@a5c-ai/babysitter-sdk/dist/harness/piWrapper.d.ts`
  (`PiSessionHandle.steer` / `followUp`; lines 41–50)
- `src/main/pi-session-manager.ts` lines 325–340
  (MC's existing wrapper)
- `src/main/run-manager.ts` lines 570–609
  (MC already calls steer for Pause and followUp for Resume)

---

## 1. Capability matrix

Methods exposed by `AgentSession` (the object MC holds via
`PiSessionHandle`). Only methods relevant to user→agent input are
listed.

| Method | Signature | Sync/Async | What it actually does | Side effects on a *running* turn | MC currently uses |
|--------|-----------|------------|------------------------|-----------------------------------|-------------------|
| `prompt(text, opts?)` | `(text: string, options?: PromptOptions) => Promise<void>` | async | Sends a new turn. **If `isStreaming === true`** it throws unless `opts.streamingBehavior` is `"steer"` or `"followUp"`, in which case it routes internally to `_queueSteer` / `_queueFollowUp`. So `prompt()` while running is *just* an alias for steer/followUp. | None directly; routed to one of the queues | Yes — `pi.session.prompt('/babysit <brief>')` to start auto-gen runs |
| `steer(text, images?)` | `(text: string, images?: ImageContent[]) => Promise<void>` | async | Pushes the message onto `_steeringMessages` *and* calls `agent.steer(...)` which appends to the low-level `steeringQueue`. Per the contract in `pi-agent-core/types.d.ts` line 144–153: *"Called after the current assistant turn finishes executing its tool calls. If messages are returned, they are added to the context before the next LLM call. **Tool calls from the current assistant message are not skipped.**"* | **None mid-turn.** The current LLM call runs to completion. The current assistant message's tool calls all execute. *Then* at the next `turn_end` boundary, `agent-loop.js` line 124 reads the queue and prepends the steering message to the next user turn. | Yes — Pause uses `pi.steer(taskId, "[paused by user — wait for resume signal]")` (`run-manager.ts` line 575) |
| `followUp(text, images?)` | `(text: string, images?: ImageContent[]) => Promise<void>` | async | Pushes onto `_followUpMessages` and calls `agent.followUp(...)`. Per `agent-loop.js` line 127: drained *only* when the agent has no more tool calls AND no steering messages — i.e., when the agent is about to fall idle. If the queue is non-empty, the agent processes them as a fresh user turn instead of stopping. | **None mid-turn.** Strictly post-turn. | Yes — Resume uses `pi.followUp(taskId, "[resumed — continue from where you left off]")` (`run-manager.ts` line 596) |
| `sendUserMessage(content, opts?)` | `(string \| Content[], options?: { deliverAs?: "steer" \| "followUp" }) => Promise<void>` | async | When streaming, behaves as steer or followUp depending on `deliverAs`. When not streaming, equivalent to `prompt()`. | Same as steer / followUp | No |
| `sendCustomMessage(message, opts?)` | non-text custom payloads | async | Three modes: queue while streaming (steer / followUp), append-and-trigger-turn, append-without-turn. Used for things like `sendUserMessage` extensions. | Same boundary semantics | No |
| `abort()` | `() => Promise<void>` | async | Aborts retry, calls `agent.abort()` (cancels in-flight LLM stream / tool exec) and waits for `agent.waitForIdle()`. | **Mid-stream**: the current LLM request is cancelled. Any partial assistant text is preserved in state but the turn ends abruptly. Queued steering / follow-up messages remain in the queue (we'd need to verify by smoke test, but `clearAllQueues()` is a separate method). | Yes — used by Stop |
| `clearQueue()` | `() => { steering: string[]; followUp: string[] }` | sync | Empties both queues, returns what was removed. | None | No |
| `compact(...)`, `setModel(...)`, `executeBash(...)`, `cycleModel(...)`, etc. | various | various | Out of scope for chat surface. | n/a | partial |

**Other surfaces inspected and *not* found**:

- No `session.interrupt()`, `session.signal()`, `session.input()`,
  `session.cancelTurn()`, or any "send a token mid-stream" API.
- No way to inject a tool result into a partially-completed assistant
  turn.
- No way to pause the agent without sending it a message.
- No way to cancel only the *next* tool call (you can only abort the
  whole turn).
- No way to peek at the in-flight LLM request and decide to redirect
  it.

The closest thing to mid-turn intervention is `abort()` followed by
`prompt()` — i.e., **stop the world, then start a new turn with new
instructions.** That's the only "real" interruption primitive.

---

## 2. Interruption story — be honest

**The user cannot intervene mid-turn in a meaningful way.**

Concretely, here's what happens between the moment the user clicks
Send and the moment the agent reads their message:

1. The agent is currently in turn N. The LLM is streaming a response,
   or one of the tool calls from turn N is executing.
2. User types "stop, you're going down the wrong path" and clicks
   Send. MC calls `session.steer("stop, you're going down the wrong
   path")`.
3. The message is appended to `_steeringMessages` and the
   low-level `steeringQueue`. **Nothing else happens.**
4. The LLM finishes its current response. The assistant message is
   committed.
5. All tool calls from that assistant message execute to completion.
   (`pi-agent-core/types.d.ts` line 149: *"Tool calls from the current
   assistant message are not skipped."*)
6. `agent-loop.js` line 123–124 fires `turn_end` and *now* reads the
   steering queue.
7. The user's message is added as the next user turn. The agent
   does its next LLM call with that message in context.

**Implication:** if the agent is mid-edit on the wrong file, your
"stop" message will arrive after that edit is on disk. If the agent
is in a long bash command, your "skip this" lands after the command
finishes. If the agent is mid-sentence describing a flawed plan,
your correction lands after the plan is fully spoken and tool-called
into reality.

The only *true* interruption is `abort()`, which cancels the in-flight
LLM stream but is *destructive* — the partial response is recorded as
aborted and the queue is not automatically drained into a new turn.
Pause/Resume in MC works around this by using steer + followUp, which
is exactly the queuing semantics described above.

**Honest summary:** `steer()` is not mid-turn intervention. It's
"queue a message that the agent reads at the next turn boundary."
That's still useful — most user corrections don't need to land in
the middle of a tool call — but the framing of the chat surface
should not promise more than this. Calling it "intervention" is
overselling. Calling it "course correction" is fair. Calling it
"chat" is also fair, because it really is chat with a turn-based
agent.

---

## 3. MVP recommendation — build it, but call it what it is

Given the actual capabilities, the MVP is **a course-correction
text box**, not an intervention surface. It should be built; it's
the cheapest improvement to the orchestration UX after the existing
Pause/Resume hack.

### MVP scope

- **One text box** at the bottom of the Task Detail right panel
  (the existing `RightBar` event timeline area), with a small
  `<select>` defaulting to "After current step" and an alt option
  "When agent stops" — these map to `steer` and `followUp`
  respectively. Default = `steer`.
- **One Send button**, disabled when the task is not in `running` or
  `paused` state. (When paused, sending should still queue — pi will
  drain the queue when resume happens.)
- **No streaming reply rendered.** The agent's response shows up in
  the existing event timeline as it always has. The chat surface is
  *write-only* from the user's perspective; the agent's reply is
  read in the same timeline as everything else.
- **Echo the sent message** as a chip / row in the timeline tagged
  "you" with timestamp + `(steer)` / `(followUp)` annotation. This
  is the only new render surface.

### What the MVP does NOT include

- No multi-message thread view stitched together. Use the timeline.
- No typing indicator / token counter / model picker (already exists
  separately on Task Detail).
- No "abort + replace" composite action (Stop already exists).
- No file attachments / images. Pi supports them via the `images`
  parameter, but the wire-up adds complexity; defer to v2.
- No history search across tasks. The events.jsonl already records
  these; if useful, add later.
- No special UI for `clearQueue()`. If the user changes their mind,
  they can hit Stop; granular queue-edit is overkill for MVP.

### Why not defer

Three reasons to build it now rather than wait for "real"
interruption primitives:

1. **The plumbing already exists.** `pi-session-manager.ts` exposes
   `steer()` and `followUp()`; `run-manager.ts` already uses them
   for Pause / Resume. Wiring an IPC channel + one input box is
   tens of lines, not hundreds.
2. **The Pause/Resume hack benefits from a real input.** Right now
   pause sends a hardcoded `"[paused by user — wait for resume
   signal]"` and resume sends `"[resumed — continue from where
   you left off]"`. Letting the user provide the actual content
   (e.g., "while paused: also check the auth flow before
   resuming") is strictly better than canned strings.
3. **The "honest" framing makes the feature defensible.** If we
   ship it as "course correction" with the reservations
   surfaced inline (see §7), users won't form wrong expectations.

### Defer triggers — when to *not* build this

- If pi exposes a real mid-turn interrupt within the next quarter,
  this MVP becomes obsolete and we'd want to redesign rather than
  layer features on the queue model.
- If smoke testing reveals that steer messages routinely land in
  surprising places (e.g., 3 turns later because the agent is in a
  tight tool-call loop), the UX value collapses.

---

## 4. UI placement — Task Detail right rail, inline, below the events

**Recommendation: inline at the bottom of the existing right rail
(`RightBar`) on Task Detail, fixed-position, growing upward into
the timeline.**

Argument:

- **Drawer (slide-out from right edge)**: Task Detail already uses
  the right column as the "live timeline" surface. A drawer covers
  it. Bad.
- **Separate Terminal page**: The existing Topbar nav + the
  capability ("send a message to the running agent") are both
  task-scoped. Pulling the chat into a separate page divorces it
  from the task it acts on, and there's nothing else a Terminal
  page would do.
- **Inline below Run controls (top of right rail)**: workable, but
  splits the user's attention between "buttons up top" and "events
  flowing in below." The text box is more like a continuation of
  the conversation than a control surface.
- **Inline at the bottom of the right rail**: it's a chat box where
  chat boxes go (bottom). Events flow upward from above. The user
  scrolls up to read history. Familiar. Same rationale as Slack /
  iMessage / every other chat UI.

So: **bottom of `RightBar` on `TaskDetail.tsx`. Sticky to the
container bottom. About 80–120 px tall (3-line textarea + Send +
mode select). Empty state hint inside the box: "Course-correct…
(arrives after the current step)."**

When task is `idle` / `done` / `failed`: replace the textarea with
a flat "Task is not running. Restart to send a message." line.
Don't hide the surface entirely — the dead-state hint also serves
as discoverability.

---

## 5. Distinct from `mc_ask_user` (`AskUserCard`)

`AskUserCard.tsx` (199 lines) is the *agent → user* surface: the
agent has paused with a question and is waiting for an answer. It
appears as a card in the right rail event timeline, with a clear
`Awaiting your response` styling, an inline answer textarea, and
Submit / Skip buttons. The card is anchored to the journal event
that asked the question.

The chat surface is the *user → agent* surface: the user
volunteers a message without being asked. It lives at the bottom
of the right rail, not as a card in the flow.

**Visual distinction.** Both can coexist on a single Task Detail
view. To make the distinction obvious:

- `AskUserCard` keeps its current "card with prominent border /
  attention color" treatment — it's a blocker, the agent is
  literally waiting on the user.
- The chat surface uses the calmer surface color from the design
  tokens — it's an always-available input, not a blocker.
- The chat surface's empty-state hint should NOT use the word
  "answer" or "respond" — those imply a question is open. Use
  "Course-correct…" or "Send the agent a note…".
- When an `AskUserCard` is open, the chat surface should still
  be active (the user might want to send a steer message *and*
  answer the question), but the visual hierarchy should put the
  ask card above the chat box. Probably: ask card stays in the
  event flow (pinned via existing logic if any), chat box stays
  at the bottom.

If user testing later shows people confuse the two, fall back to
labeling the chat surface ("Course correction") explicitly above
the textarea.

---

## 6. Persistence

**Recommendation: append to `events.jsonl` as new event types,
no separate file.**

- `mc:user-steer` — `{ type, text, deliveryMode: "steer", at }`
- `mc:user-follow-up` — `{ type, text, deliveryMode: "followUp", at }`

Both are appended *immediately* on Send (before pi confirms),
because the queue is reliable in pi (it's just an in-memory array
that gets drained). If pi rejects the call (e.g., session
disposed), append a `mc:user-steer-failed` event with the reason.

Why events.jsonl, not a separate file:

- The existing timeline already renders `events.jsonl`. Free
  rendering surface.
- Cross-task search / debugging works the same way as everything
  else.
- Pause/Resume already writes `pi:steer-sent` events here for
  the same reason.

What the chat surface displays as "history": a filter over the
existing `events` stream for `mc:user-steer` / `mc:user-follow-up`
+ assistant text replies. The MVP can render *all* events as
today and just add styling for the new event types; a dedicated
"chat-only" filter view is v2.

What the chat surface does NOT need:

- A separate `chat.jsonl` file. The events stream is the
  source of truth.
- Per-message reactions / threads / edits.

**Note on reload:** because pi's queues are in-memory, a process
crash or app restart loses any unsent steer / followUp messages.
The events.jsonl will still record what was *attempted*; on
restart, MC should NOT re-send them automatically (the agent
state is gone). It can show them as "(not delivered — task was
restarted)" in the timeline.

---

## 7. Reservations — explicit

These should surface either inline as tooltips on the chat surface
or in a `?` popover above the input.

1. **Steer messages land at the next turn boundary, not
   mid-stream.** If the agent is mid-edit, your message arrives
   *after* the edit. There is no way to interrupt a tool call.
   Phrasing like "stop and check X" will be read after the
   "stop" point has passed.
2. **Steer messages do not skip queued tool calls.** Per
   `pi-agent-core/types.d.ts` line 149: *"Tool calls from the
   current assistant message are not skipped."* So if the agent
   said "I'll run tests, then deploy, then notify" and you steer
   "skip the deploy," all three tool calls already in the
   current assistant message will run. Your message lands *after*
   them, before the next LLM thought.
3. **The agent isn't required to honor your message.** It's just
   added to context. If you say "delete file X," the agent might
   ignore it because of conflicting prior instructions. This is
   identical to all chat-with-LLM dynamics, but it's worth being
   explicit because users coming from "send a control signal"
   mental models will be surprised.
4. **Follow-up messages stack.** If you queue three follow-ups
   while the agent is running, all three are processed when the
   agent would otherwise stop. Order is FIFO. There is a
   `followUpMode: "all" | "one-at-a-time"` setting on
   AgentSession (default unknown to us — needs verification);
   in `"one-at-a-time"` mode only the first follow-up triggers
   the next turn and the rest stay queued. We should pick a mode
   explicitly when wiring up.
5. **Curated workflow runs may not have a steerable session.**
   The curated path spawns `babysitter harness:create-run` as a
   *child process* — MC doesn't hold the AgentSession in the same
   process. `PiSessionManager` only manages sessions for the
   auto-gen path. So the chat surface needs to gate on "is this
   task using the auto-gen path?" — if it's a curated workflow,
   the chat box should be disabled with a hint: "Chat is only
   available for auto-generated tasks; curated workflows run in
   a separate process." (See `run-manager.ts`
   `startCuratedWorkflow` vs the `pi.session.prompt('/babysit
   ...')` branch.)
6. **Pause/Resume already uses the same channels.** If the user
   pauses, then types a steer message, the message goes onto the
   same queue as the synthetic "[paused by user]" message. Order
   matters but is FIFO and predictable. We should NOT block chat
   while paused — sending while paused is a useful flow ("while
   paused, also do X").
7. **No echo back from the agent for queued messages.** Pi does
   not generate an "I see your steer message" acknowledgement.
   The user's evidence the message was received is purely the
   event log entry. Some users may expect a chat-style "agent
   typing…" affordance — there isn't one.

---

## 8. Open questions

- **Q:** What's the default value of `followUpMode` on
  AgentSession? `"all"` would let stacked follow-ups all run;
  `"one-at-a-time"` would gate them. The setter exists
  (`setFollowUpMode`) but the default isn't immediately visible
  in the .d.ts. Smoke test or read settings-manager defaults
  before shipping.
- **Q:** When `abort()` is called (Stop button), do queued
  steer/followUp messages survive? `clearQueue()` is a
  separate method, suggesting *yes* — but if Stop is followed
  by a fresh Start, are old queued messages re-delivered into
  a new session? Need to verify in smoke test.
- **Q:** Curated workflow case (item #5 in §7): does the SDK
  expose any equivalent steer-while-running capability for the
  CLI-spawned process? Check `babysitter harness:create-run
  --help` and the SDK's `runtime/` dir for a "send signal" or
  "append-input" command. If yes, the chat surface scope
  expands; if no, the disabled-with-explanation behavior is
  correct.
- **Q:** Should the chat surface support `/skill:foo` and
  `/template:bar` expansions like the interactive pi mode?
  `agent-session.js` line 866 does run them through
  `_expandSkillCommand` and `expandPromptTemplate` for steer
  calls. Probably we get this for free as long as we don't
  pre-process the text on the MC side.
- **Q:** Should pressing Enter in the textarea send, or insert
  a newline? Convention varies; recommend Enter = send,
  Shift+Enter = newline, but worth confirming with Michael.
- **Q:** Should we surface `pendingMessageCount` (already
  exposed by AgentSession) somewhere — e.g., a small
  "(2 queued)" badge near the Send button — so the user can
  see what's pending? Probably yes; cheap to add and
  demystifies the queue behavior.

---

## 9. Verification — how to smoke-test once built

A smoke test should live alongside the existing
`pi-session-manager.smoke.ts` and should not require live LLM
calls.

1. **Unit-level (mock pi session):**
   - `pi-session-manager.smoke.ts` already covers steer /
     followUp forwarding with a fake session entry. Extend it
     to assert that the new IPC channel (`pi:user-message` or
     similar) routes to `steer` when mode = `"steer"` and
     `followUp` when mode = `"followUp"`.
   - Add a test that the new `mc:user-steer` event lands in
     `events.jsonl` for the task.
   - Add a test for the curated-path gating: when a task has
     `libraryWorkflow.diskPath` set, the chat IPC returns an
     error or a `not-supported` flag.
2. **Integration-level (real pi, no LLM):**
   - Mock the LLM transport (pi-ai supports stub transports)
     so a turn completes immediately with a known response.
   - Start a fake task. Send a steer mid-turn. Assert the next
     turn's user message contains the steer text.
   - Send a follow-up after `agent_end`. Assert a new turn
     fires.
3. **Manual UX (Playwright → `verify-ui.mjs`):**
   - Start a real task (or a demo task with a short prompt).
     Type into the chat surface, click Send. Verify the
     `mc:user-steer` chip appears in the timeline. Verify the
     agent's next response references the message (in a real
     LLM run; skip in CI).
   - Pause the task. Send a chat message. Resume. Verify both
     the synthetic resume signal and the user's message appear
     in the next turn.
   - Open a curated-workflow task. Verify the chat surface is
     disabled and shows the "curated workflow" hint.
4. **Regression:**
   - Existing Pause / Resume smoke tests must still pass —
     they share the steer / followUp wires.
   - The `derive-phases.ts` timeline should not break on the
     new event types; verify it falls through to "show as raw
     event" rather than crashing.

---

## 10. Gate decision

**Recommendation: BUILD the MVP, scope as described in §3.**

Justification:

- The investigation answered the gating question ("does steer
  interrupt or queue?") with a clear: *queue, drained at the
  next turn boundary.* That's not the rich intervention we
  hoped for, but it's a real capability.
- The plumbing is already in MC (`pi-session-manager.steer`,
  `pi-session-manager.followUp`, both wired through to pi).
  Cost to ship is small.
- The framing in §3 ("course correction, not intervention")
  with reservations from §7 surfaced inline keeps user
  expectations honest.
- The curated-workflow gap (§7.5) is a known limitation and
  documented; not a blocker for the auto-gen path which is the
  more common case today.

**Defer trigger:** if Open Question §8.3 (curated-workflow
steer support) turns out to require non-trivial SDK work to
unlock, ship the MVP for the auto-gen path only and queue
parity-for-curated as a follow-up task. Don't block the MVP on
curated coverage.

**STOP and ask Michael before**:

- Renaming the feature in user-visible copy (e.g., "Chat" vs
  "Course correction" vs "Steering"). Wording shapes
  expectations.
- Adding a streaming reply view in the chat surface itself
  (separate from the event timeline). That's a much bigger
  change.
- Auto-redelivering queued messages after a session restart.
  That has correctness implications and should be an explicit
  design decision.
