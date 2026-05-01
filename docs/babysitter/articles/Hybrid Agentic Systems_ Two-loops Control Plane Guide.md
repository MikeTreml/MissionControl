# Hybrid Agentic Systems
## Overview

This guide is a conceptual framework for building hybrid agentic systems where:

- a **symbolic, code-defined orchestrator** governs progression, journaling, and phase boundaries
- an **LLM-powered harness** performs adaptive work with tools (planning, command execution, iteration)

symbolic logic is shared and can be used as:

- **orchestrator process rules** (the canonical source)
- **symbolic tools** callable by the harness
- **symbolic tasks** invoked by orchestration

The system’s power comes from **stack-depth interleaving**: orchestration steps can contain harness work sessions, and those sessions can consult (or trigger) symbolic checks mid-flight.

The goal is to help you decide what execution logic belongs where, how to design the integration points, and how to enforce **guardrails + quality gates** without sacrificing capability.

---

## 1) The core building blocks

A hybrid agentic system is built from **two primary components**, plus a shared layer of **symbolic capabilities** that can be invoked from either side.

### A) **Symbolic Orchestrator (Process Engine)**

The orchestrator is a **code-defined process** that enforces:

- the system’s **ground truth state** and progression rules
- invariants (**“this must never happen”**)
- budgets (**time/cost/tool limits**)
- permissions (**what actions are allowed**)
- quality gates (**what must be proven before moving forward**)
- journaling (**what happened, in what order**)
- time travel + forking (**replay a past point, branch a new run**)

It is responsible for making execution **dependable**.

### B) **Agent Harness (LLM Runtime)**

The harness is not “just an LLM call.” Modern harnesses (like coding agents) often include:

- iterative planning and re-planning
- tool calling (files, terminal, search, code execution)
- command execution + parsing results
- incremental fixes until checks pass
- producing structured artifacts (plans, diffs, summaries)
- multi-step reasoning with constraints
- sub-agents and delegation inside the harness

It is responsible for solving **fuzzy parts of work** and adapting to real-world feedback.

### C) **Symbolic logic surfaces (shared, callable capabilities)**

Symbolic logic is not only “inside orchestration.” In a strong design it appears in multiple places, all consistent with the same rules:

- **inside the orchestrator process** (stage transitions, invariants, gates, budgets)
- **as symbolic tools callable by the harness** (policy checks, gate evaluation, scope rules, deterministic transforms)
- **as symbolic tasks callable by orchestration** (validators, analyzers, schedulers, reducers, diff scanners)

This matters because the "**symbolic vs agentic**" split is not about location. It is about **who is responsible for correctness** and **how results are proven**.

---

## 2) The two loops (and why both are needed)

### **Loop 1: Orchestration Loop (Symbolic)**

A process stepper that progresses a run through explicit stages.

Typical cycle:

1. Reconstruct **“what is true”** from the journal
2. Determine what stage the run is in
3. Check gates, constraints, budgets
4. Choose the next allowed transition
5. Emit the next effect (or wait)
6. Record results back into the journal

This loop is about **control, safety, repeatability, and traceability**.

### **Loop 2: Agentic Loop (Harness)**

A tool-using reasoning loop that can iterate until it reaches a local objective.

Typical cycle:

1. Read current objective + constraints
2. Decide what evidence is needed
3. Call tools, inspect results
4. Update plan or actions
5. Produce an output (patch, plan, answer, report)

This loop is about **solving the task**, especially when information is incomplete and the path is uncertain.

---

## 3) The critical point: execution logic can live in either loop

A common mistake is to assume:

- “the agent thinks and proposes”
- “the orchestrator executes”

That’s not the right mental model.

In real systems:

- the harness can execute meaningful work (run commands, edit files, iterate)
- the orchestrator can execute effects too (dispatch steps, run validators, schedule retries)

The real craft is deciding:

- **Which execution decisions must be symbolic, and which can be agentic?**

The system becomes strong when each loop is used for what it’s best at.

---

## 4) A practical allocation guide: what goes where?

The design challenge is not “LLM vs orchestrator.” It is deciding which parts of execution are **deterministic/symbolic** and which parts are **adaptive/agentic**.

Symbolic logic can show up in multiple places:

- process rules inside the orchestrator (stage transitions, budgets, gates)
- symbolic tools the harness can call (policy checks, gate evaluation)
- symbolic tasks the orchestrator can run (validators, analyzers, reducers)

### **Put it in Symbolic Logic (deterministic capabilities) when…**

These are decisions that must be **stable, enforceable, and auditable**:

- Safety and permissions (what actions are allowed)
- Budgets and hard limits (time, money, number of tool calls)
- State transitions (what stage you’re in)
- Concurrency rules (what can run in parallel)
- Retry/timeout policy (what happens when tools fail)
- Idempotency and deduplication (avoid double execution)
- Quality gates (what proof is required to progress)
- Compliance requirements and audit logging

Where it lives:

- as **orchestrator process rules** (canonical)
- and/or as **symbolic tools/tasks** (so both loops can consult the same truth)

### **Put it in the Agent Harness (adaptive capabilities) when…**

These are decisions that benefit from **flexible reasoning**:

- Interpreting ambiguous instructions
- Choosing a likely-good approach under uncertainty
- Searching for relevant files and context
- Drafting code, documentation, or analyses
- Debugging by iterating against tool results
- Summarizing and compressing evidence
- Proposing candidate solutions and tradeoffs

### **The middle zone (where architecture matters)**

Many tasks are mixed. Examples:

- “Fix the failing tests”
- “Refactor safely”
- “Ship feature X within standards”

In these cases:

- **Symbolic logic** should define the envelope (constraints + gates + budgets)
- **The harness** should do the exploration inside that envelope
- Both sides should be able to invoke symbolic rules via tools/tasks so nothing is “guesswork”

---

## 5) Interleaving (stack depth, not time)

Interleaving means **nesting**: within a single top-level run, the orchestrator can enter a harness work session, and inside that session the harness can invoke symbolic tools (and sometimes spawn smaller sub-sessions). In the other direction, the orchestrator can call symbolic tasks (validators, analyzers) as part of the same step.

### One clear nested flow

1. Orchestrator frames a step: objective, constraints, budgets, required evidence
2. Orchestrator may call symbolic tasks to prepare or constrain the work (compute allowed scope, run analyzers, preflight checks)
3. Harness runs a bounded work session: explores, edits, runs commands/tools, iterates
4. During the session, the harness calls symbolic tools to stay aligned with rules:
   - “Is this change allowed?”
   - “What checks are required in this stage?”
   - “Does this evidence satisfy the gate?”
5. Harness returns **artifact + evidence + status**
6. Orchestrator validates gates (often via symbolic tasks) and decides: **advance, retry, fork, or request approval**

### 4 common nesting patterns

- **Orchestrator → Harness (bounded work)**  
  Orchestrator delegates adaptive work (implement, fix, refactor) within a strict envelope.

- **Harness → Symbolic Tool (rule consultation)**  
  Harness consults deterministic logic instead of guessing policies and constraints.

- **Harness → Symbolic Tool → Harness (work → check → repair)**  
  Harness checks gates/policies mid-session and immediately performs targeted repairs.

- **Orchestrator → Symbolic Task → Orchestrator (evidence verification)**  
  Orchestrator invokes validators/analyzers to produce pass/fail evidence before proceeding.

### Rules that keep nesting safe and understandable

- Every harness session is **bounded** (budget + stop condition)
- Symbolic checks return **explicit outcomes** (pass/fail + reasons)
- Harness outputs are **structured** (artifact + evidence + status)
- Limit delegation depth: prefer small focused sessions over one huge autonomous run

---

## 6) Guardrails: the system’s safety and containment layer

Guardrails are not a single feature. They are a **layered approach**.

### A) **Capability guardrails (what actions are possible)**

- tool allowlists (only these tools exist)
- path/working-dir restrictions (only operate inside certain folders)
- network restrictions (no network, or allow only specific hosts)
- read-only vs write permissions
- destructive actions require explicit confirmation

### B) **Budget guardrails (how far actions can go)**

- max tool calls per step
- max wall-clock time per run/phase
- max token spend per phase
- rate limits for expensive operations

### C) **Policy guardrails (what actions are allowed)**

- “never exfiltrate secrets”
- “never modify prod directly”
- “always run tests before merge”
- “security scans required for dependencies”

### D) **Behavioral guardrails (how decisions are made)**

- require structured outputs for decisions
- require citing evidence (tool output references)
- require explicit uncertainty (“I’m not sure; need X to proceed”)

Guardrails should be enforced by **symbolic logic** even if they are reasoned about agentically.

In practice that symbolic enforcement may appear as:

- orchestrator process rules (hard stops)
- symbolic tools callable by the harness (“is this allowed?”)
- symbolic tasks invoked by orchestration (validators, scanners)

---

## 7) Quality gates: turning agentic work into reliable outcomes

Quality gates are how you convert “it seems done” into **“it is done.”**

### Common gated steps

- unit tests, integration tests
- lint, formatting
- type checking
- static analysis, security scans
- reproducibility checks (clean run in fresh environment)
- diff review rules (no touching certain files)
- performance thresholds

### A useful mental model

Each phase should end with:

- **Artifact:** the work product (patch, doc, config, report)
- **Evidence:** proof that it meets requirements (logs, test output, checks)

**If you don’t have evidence, you don’t have completion.**

### Where gates live (symbolic, reusable)

Gates are symbolic logic and should be consistent everywhere:

- the orchestrator uses them to decide phase progression
- the harness can call them as symbolic tools to pre-check during work
- the orchestrator can run them as symbolic tasks to verify evidence objectively

### “Quality gates” are also where humans belong

For high-impact steps, include explicit checkpoints such as:

- “approve the plan before execution”
- “approve the diff before merge”
- “approve the deployment”

These are not signs of weakness. They are how you keep autonomy productive.

---

## 8) Prompt quality is determinism engineering

In a two-loop system, prompts are not just text. They function like **configuration** for the harness.

### Why prompt quality matters

Better prompts reduce:

- output variance
- tool misuse
- hidden assumptions
- inconsistent formatting
- unpredictable branching

This improves:

- repeatability
- debuggability
- fork comparisons
- safe automation

### The real goal is structural consistency

You don’t need identical wording. You need consistent:

- decision formats
- priorities
- stop/ask conditions
- evidence standards

### Prompt versioning is essential

Treat harness prompts like a real engineering surface:

- version them
- log them
- regression-test them
- compare them across forks

This is how prompt iteration becomes systematic rather than chaotic.

---

## 9) The journal: making hybrid execution testable

A journaled control plane turns agentic behavior into something you can:

- replay
- inspect
- diff across forks
- audit
- analyze for failure patterns

### What must be journaled (conceptually)

- inputs and signals
- stage transitions
- requested actions and results
- artifacts produced
- evidence and gate outcomes
- approvals, rejections

This is the foundation for time travel debugging and safe branching.

---

## 10) A concrete workflow example (conceptual)

Scenario: “Implement feature X safely”

Orchestrator defines the process:

- Understand scope
- Plan
- Implement
- Validate
- Review
- Finalize

Each phase has:

- allowed actions
- budget
- required evidence
- symbolic checks (gates) used consistently across the system

Symbolic tasks/tools help both loops:

- orchestrator may invoke symbolic tasks (preflight checks, analyzers, validators)
- harness may invoke symbolic tools (policy checks, gate evaluation, scope rules)

Harness performs work inside phases:

- finds relevant files
- edits code
- runs tests
- iterates until passing
- produces patch + summary

Quality gates enforce outcomes:

- tests pass
- lint passes
- no forbidden files changed
- diff looks safe

The orchestrator uses gate results to decide whether to advance, retry, request human approval, or fork.

---

## 11) Common failure modes (and fixes)

### 1) **Everything is agentic**

Symptom: unpredictable behavior, hard to debug, inconsistent safety.  
Fix: move gates, budgets, and invariants into symbolic orchestration.

### 2) **Everything is symbolic**

Symptom: brittle workflows, poor adaptation, high maintenance.  
Fix: delegate fuzzy decisions and exploration to the harness.

### 3) **Hidden state**

Symptom: the harness “remembers” things the system never logged.  
Fix: journal what matters. The system’s truth must be reconstructible.

### 4) **Wide tool surface**

Symptom: tool confusion, increased risk, unpredictable results.  
Fix: keep tools small, stable, and well-described.

### 5) **No explicit evidence requirements**

Symptom: “done” claims without proof.  
Fix: define completion as **artifact + evidence**, enforced by gates.

---

## 12) A simple doctrine for building these systems

If you define only a few principles, make them these:

1. **The orchestrator owns run progression, journaling, and phase boundaries**
2. **Symbolic logic owns constraints, permissions, budgets, and gates** (usable as rules + tools + tasks)
3. **The harness owns adaptive work inside constraints**
4. **Guardrails are enforced by symbolic checks, not informal intentions**
5. **Quality is evidence-driven, not assertion-driven**
6. **Prompts are versioned control surfaces for harness behavior**
7. **The journal is the source of truth for replay, audit, and forking**

---

## 13) Practical design starting point

If you’re building from scratch, start here:

1. Define the phases of work (a small symbolic process)
2. Define effects/tools available in each phase
3. Add budgets and permissions
4. Decide quality gates per phase
5. Add a harness that can do real work (files + terminal + tools)
6. Journal everything needed for replay and audit
7. Add fork + time travel as first-class operations

If you do only one thing: **make completion require evidence.**

---

## Closing note

Two-loop hybrid systems are not about “LLM vs rules.” They are about designing who owns which execution decisions so that:

- the system remains reliable and inspectable
- the harness remains capable and efficient
- progress remains measurable

When done well, you get autonomy that is **bounded, testable, and steadily improvable**.
