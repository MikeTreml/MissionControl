/**
 * Feature workflow — babysitter process.
 *
 * STATUS: PROPOSED stub. Not yet wired. See docs/WORKFLOW-EXECUTION.md for
 * the design, and PI-WIRE markers in src/main/ for the integration points.
 *
 * This file is what babysitter will execute when a task of workflow F is
 * started from Mission Control. Each `ctx.task(role, opts)` call spins up
 * a pi session for that role; each `ctx.breakpoint({...})` blocks until
 * a human approves.
 *
 * USAGE (eventual, once wired):
 *   babysitter.run(__filename, { taskId: "DA-001F" })
 *
 * The `ctx` object's shape comes from babysitter's SDK. Primitives used:
 *   ctx.task(agentSlug, opts)       → returns whatever that agent produced
 *   ctx.breakpoint({ question })    → blocks for human input; returns decision
 *   ctx.parallel([...])             → run siblings concurrently
 *
 * DECISIONS REFLECTED HERE (see docs/WORKFLOW-EXECUTION.md "Open questions"):
 *
 *   CONFIRMED: Planner → Developer → Reviewer → Surgeon is the pipeline.
 *   CONFIRMED: Reviewer can loop back, increments Task.cycle.
 *   CONFIRMED: Human breakpoint after planning (review the plan) and
 *              before shipping (final approval).
 *   PROPOSED:  loop-back capped at 5 cycles, then escalates to human.
 *   PROPOSED:  Surgeon runs even after loop-backs (cleanup happens once
 *              the code is good, not every cycle).
 *   OPEN:      parallel subagent spawns during Planner — leaving a
 *              commented example below; wire when spawn API is firm.
 */

// CONFIRMED: CommonJS export — babysitter expects this shape.
// If babysitter's API changes to ESM, revisit.
module.exports = async function featureWorkflow(inputs, ctx) {
  const { taskId } = inputs;
  const MAX_CYCLES = 5;
  let cycle = 1;

  // ── Plan ───────────────────────────────────────────────────────────
  let plan = await ctx.task("planner", { taskId, cycle });

  // OPEN: how does the Planner signal it wants to spawn a subagent?
  // PROPOSED: Planner's output declares `spawnRequests: ["repomapper"]`,
  // and we loop here. Example:
  //
  //   if (plan.spawnRequests?.length) {
  //     await ctx.parallel(plan.spawnRequests.map((slug) =>
  //       ctx.task(slug, { parentTask: taskId, parentRole: "planner" })
  //     ));
  //     plan = await ctx.task("planner", { taskId, cycle, replan: true });
  //   }

  // Human gate — approve the plan before any code gets written.
  // CONFIRMED: this is the "Approval" in the Plan lane — not Approval lane.
  const planOk = await ctx.breakpoint({
    question: "Approve plan?",
    context: plan,
    allow: ["approve", "reject"],
  });
  if (planOk === "reject") {
    return { status: "aborted", reason: "plan rejected" };
  }

  // ── Develop → Review loop ──────────────────────────────────────────
  while (cycle <= MAX_CYCLES) {
    await ctx.task("developer", { taskId, cycle, plan });

    const review = await ctx.task("reviewer", { taskId, cycle });

    if (review.verdict === "approve") {
      break;
    }
    if (review.verdict === "loopback") {
      cycle += 1;
      if (cycle > MAX_CYCLES) {
        // Escalate — human decides whether to keep going or abort.
        const decision = await ctx.breakpoint({
          question: `Reviewer keeps looping back (cycle ${MAX_CYCLES} hit). Continue, ship anyway, or abort?`,
          context: review,
          allow: ["continue", "ship", "abort"],
        });
        if (decision === "abort") {
          return { status: "aborted", reason: "max cycles exceeded" };
        }
        if (decision === "ship") {
          break;
        }
        // "continue" — reset the cap for another round
        cycle = 1;
      }
      // Feed Reviewer's feedback into the next Planner/Developer loop.
      plan = await ctx.task("planner", {
        taskId,
        cycle,
        replan: true,
        feedback: review.notes,
      });
    }
  }

  // ── Surgery (cleanup) ──────────────────────────────────────────────
  // PROPOSED: always runs after the code is approved. Regenerates docs,
  // diff reports, commit tidying. Cheap (local LLM is fine).
  await ctx.task("surgeon", { taskId });

  // ── Final ship gate ────────────────────────────────────────────────
  const shipOk = await ctx.breakpoint({
    question: "Ship it?",
    allow: ["ship", "hold"],
  });
  if (shipOk === "hold") {
    return { status: "awaiting-human" };
  }

  return { status: "done", cyclesUsed: cycle };
};
