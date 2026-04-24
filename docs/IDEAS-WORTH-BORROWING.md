# Ideas worth borrowing

**Correction to the previous survey.** I framed each extension as USE / SKIP.
That misses the real value — an extension we skip can still have a pattern
worth copying. This doc re-reads the same list asking: *what one idea would
we steal, even if we never install the thing?*

Then grounds it in the DLL-harvest use case (1000+ decompiled files,
extract functional knowledge one at a time), because that's a perfect test
of whether our model handles long-running, item-by-item work.

---

## Per-extension: the one idea worth keeping

### samfoy/pi-memory  —  **Auto-extract lessons at session end with a confidence threshold**

Not the SQLite. The method: at session end (if ≥3 user turns), ask the LLM
to extract preferences / patterns / lessons, only persist facts with
confidence ≥ 0.8. Auto-inject into the next session as a `<memory>` block
capped at 8KB.

**Steal as:** after any MC agent cycle finishes, run a small "distill"
step — extract `{pattern, confidence, scope}` tuples into a markdown file
in the project's memory folder. Auto-injected next cycle. Storage shape
(JSON/MD) is orthogonal to the pattern.

**Concretely for DLL harvest:** after each DLL processed, distill
"patterns I saw" (`"Core.*` DLLs are utility libraries", "V2 methods mirror
V1 with added cancellation tokens"). Next DLL gets those patterns injected
up front so the model isn't rediscovering from scratch.

---

### tintinweb/pi-subagents  —  **Graceful max-turn shutdown + live conversation viewer**

Skipped because it overlaps nicobailon's. But two ideas to hold:

1. **Graceful max-turn shutdown with 5 grace turns before hard abort.**
   An agent given 50 turns shouldn't be cut off mid-sentence. At turn 45
   it's told "5 turns left, wrap up" and can summarize/save state. This is
   exactly what you want when a long DLL extraction times out — give the
   agent a chance to write what it got before dying.

2. **Live conversation viewer for sessions in flight.** The "Run Activity"
   panel on MC's dashboard should let you drill into any running session
   and watch the conversation live — not just event headers.

---

### pi-markdown-preview  —  **Structured preview format for agent outputs**

Skipped for MC's UI, but the *format* matters: every agent response becomes
a renderable markdown document with code highlighting, math, diagrams. If
MC agents emit markdown (not raw text), we get a visual story per cycle
for free.

**Steal as:** every agent run in MC emits one markdown file
(`DA-015F-p.md`, `DA-015F-d.md`, etc. — matches our taskFile convention).
Task Detail page renders each inline. You can read the full reasoning,
not a truncated summary.

---

### pi-messenger-swarm  —  **Event-sourced channel feeds with durable named channels**

Not "use it as-is." Borrow the pattern: every running session has a file
it appends events to; channels aggregate events across sessions.

**Steal as:** MC's own event log. `<task>/events.jsonl` per task,
append-only. Every lane transition, cycle start, subagent spawn, error
writes one JSONL line. The right-rail "Run Activity" reads this. Rebuildable
— if the UI crashes, replay the log to restore state.

**Concretely for DLL harvest:** each file processed is one event line.
Crash recovery = tail the log, see what file we were on, resume.

---

### pi-handoff (from ogulcancelik bundle)  —  **Context briefing at session boundaries**

Our "session-per-role" model means a Developer starting cycle 2 has to
rebuild context from scratch. pi-handoff's insight: prepare a structured
"briefing document" when closing a session, that the next session reads
first.

**Steal as:** when a role hands off to the next (Planner → Developer, or
Reviewer loop-back → Planner), MC auto-generates a HANDOFF.md with:
what I did, what remains, what to watch for, what I'm uncertain about.
Next role reads it as the first prompt, not the whole prior transcript.

---

### pi-superpowers / compound-engineering-pi  —  **Named skills as workflow stages**

Both encode the same observation: development has *phases* (brainstorm,
plan, TDD, review, compound), each with its own best-practice prompt.
Rather than one monolithic "coding agent" prompt, give agents a menu of
stage-specific skills they invoke as needed.

**Steal as:** MC's Planner doesn't have one system prompt — it has access
to `brainstorming`, `writing-plans`, `deepening-plan` skills and picks
what fits the task at hand. Same for every role.

---

### taskplane  —  **PROMPT.md + STATUS.md as durable per-task state**

Covered in the other doc but reinforces: two files per task, one "what
are we doing / constraints" and one "progress log." Agents survive
context resets. STATUS.md is append-only.

**Steal as:** formalize in MC. `tasks/<id>/PROMPT.md` + `tasks/<id>/STATUS.md`
alongside `manifest.json`.

---

## Babysitter patterns worth stealing (re-read)

Babysitter is too heavy to adopt wholesale, but it encodes patterns we
should learn from — especially for the DLL harvest case.

### 1. Process-as-code authority

Workflow is a JS function, not a JSON config:

```javascript
async function process(inputs, ctx) {
  await ctx.task(plan);
  await ctx.breakpoint({ question: 'Approve plan?' });
  await ctx.task(implement);
  const score = await ctx.task(verify);
  if (score < 80) await ctx.task(refine);
}
```

**Why it matters:** JSON workflows can't express "if quality is low,
retry with a different prompt." Code can. For 1000-item batches, the
ability to encode "if 3 in a row fail, pause" is a big deal.

**Steal as:** our `workflows/<CODE>-<slug>/` folder can optionally contain
a `workflow.ts` or `workflow.mjs` that exports an async function. The
workflow.json stays for metadata (name, description, lanes); the code
file handles "what happens between lanes" if the simple transition model
isn't enough.

Don't force this everywhere — simple workflows stay pure JSON. Only
batch / adaptive workflows reach for code.

### 2. Mandatory stop after each step

After every task action, the harness halts at a hook. Only the process
code decides what's next. Prevents agent run-away.

**Steal as:** after each role finishes its session, MC doesn't
auto-transition. A hook runs: "process says next lane is Review — move
there? yes/no/abort." For routine work this is instant. For gated work,
it's a human breakpoint.

### 3. Event journal → deterministic replay

`.a5c/runs/` stores every task + gate + decision. Crash mid-step-347,
replay from journal, resume at step 348.

**Steal as:** our `events.jsonl` per task (mentioned above under
pi-messenger). Campaign-level journal too — see DLL harvest case below.

### 4. Token compression at 4 hook points

Automatic compression at:
- user prompts (density filter, ~29% reduction)
- command output (command-compressor, ~47% reduction)
- SDK context (sentence-extractor, ~87% reduction)
- library files (pre-cached, ~94% reduction)

99% fact retention, 50-67% overall reduction.

**Steal as:** pi already has compaction built in. But the COMMAND OUTPUT
compressor is the key one for DLL harvest — decompiled DLLs produce
enormous output. Before handing an agent the output of `ildasm` or similar,
compress it. Pi doesn't do this by default; we could add a simple
pre-processor in MC (drop attributes, collapse whitespace, keep signatures).

### 5. Breakpoints with structured context

Breakpoints include context metadata so the human isn't approving
blind. "Approve plan?" comes with the plan attached.

**Steal as:** MC's Approval lane should show the thing being approved
*in the approval UI*, not just a "click to approve" button. Plannotator
gives us this for free.

---

## Concrete case: 1000-DLL harvest

This is a new *shape* of work MC needs to handle. Different from our
current model (one task × N cycles). This is one campaign × N items.

### What makes it hard

1. **Volume.** Agent can't hold 1000 files in context; must process one
   at a time.
2. **Drift.** Output quality varies across files; prompt tuning needed
   mid-run.
3. **Crashes.** Network, rate limits, timeouts — must resume mid-batch.
4. **Knowledge accumulation.** Later files benefit from patterns learned
   in earlier ones.
5. **Validation fatigue.** You can't review 1000 outputs; need sampling
   + escalation.

### MC model for handling it (proposal)

New task shape: **Campaign**. Sits alongside our existing single-task model.

**Data:**

```
tasks/DA-017H/             # H = Harvest workflow letter
  manifest.json            # regular task manifest; adds kind: "campaign"
  PROMPT.md                # the harvest instructions (goal, expected output shape)
  STATUS.md                # append-only progress log
  events.jsonl             # every item processed = one event line (resumable)
  items/
    index.jsonl            # full item list (1 line per DLL)
    DllName1.result.md     # per-item output
    DllName2.result.md
    ...
  lessons/                 # auto-extracted patterns (pi-memory idea)
    LL-001-naming-pattern.md
    LL-002-deprecated-api.md
```

**Flow:**

1. **Seed.** Create Campaign task, point at an `items/index.jsonl` listing
   1000 DLLs. Each line: `{ id, path, size, hash }`.
2. **Loop, resumable.** Agent reads next unprocessed item (events.jsonl
   is truth), runs extraction prompt with:
   - PROMPT.md (base instructions)
   - Any lessons accumulated so far (size-capped, like pi-memory's 8KB)
   - The specific item content (command output pre-compressed)
3. **Write.** Per-item result to `items/<name>.result.md`. Distill one
   new lesson if warranted. Append event.
4. **Checkpoint every N (e.g. 50).** Mandatory stop. Show a sample of
   recent results + new lessons. Operator: continue / tune prompt / abort.
5. **On quality anomaly.** If the distill step flags "low confidence" or
   the result file is unusually short/long, escalate early — don't wait
   for the 50-item checkpoint.

**New MC concepts that fall out:**

- `CampaignSchema` — extends Task with `items[]` source + `itemsDone`
- `JournalEntry` — an append-only event log model
- `Lesson` — persisted pattern with confidence + scope (borrowed from
  pi-memory's shape)
- **Workflow letter H for Harvest** — naturally slots into our existing
  task-ID system
- **Pre-process compression hooks** — pluggable pre-processors before
  agent prompt (command output compressor, attribute stripper, etc.)

### What this suggests about MC architecture

Our current model assumes **tasks are the unit of work and cycles are the
unit of progress**. The DLL case says **campaigns are a unit of work and
items are a unit of progress**, with cycles playing a smaller role (maybe
each item gets 1-2 cycles, not 5+).

Both shapes deserve first-class support. The board lanes still apply
(Plan the campaign → Harvest the items → Review sample → Compile final
report → Done), but each lane "Harvest" does 1000 inner iterations.

**Small design answer:** `Task.kind: "single" | "campaign"` at the model
level. `single` is what we've built. `campaign` adds the items/events
folder layout and a different Task Detail view (progress bar, per-item
results, lessons panel).

---

## Net new concepts to track (not decisions yet)

- **Task kinds: single vs campaign** — different shapes, same board
- **Per-task event journal** — append-only JSONL, enables resume + Run Activity feed
- **Auto-distilled lessons** — short, confidence-tagged patterns accumulated per project (and per campaign)
- **Handoff documents** — auto-generated at role transitions so next role doesn't start cold
- **Pre-process hooks** — cheap content compressors before agent prompts (DLL case, but generally useful)
- **Optional workflow.ts** for workflows too adaptive for pure JSON
- **Mandatory-stop transitions** — not every lane change should be automatic; some need a check
- **Markdown-native agent outputs** — every run emits a renderable .md, not raw text

Not everything gets built. But they now have names, so when we hit a
use case that needs one, we know where to reach.
