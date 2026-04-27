/**
 * Smoke test for the mc_ask_user tool's guardrails.
 *
 * Run from mc-v2-electron/:
 *   node --experimental-strip-types src/main/ask-user-tool.smoke.ts
 *
 * Exercises the three layers:
 *   1. SCHEMA — invalid `category` rejected by typebox (out of scope here;
 *      the schema is enforced by pi when the agent calls the tool).
 *   2. RUNTIME — phrase blocklist + rate limit + empty-reason check
 *      via checkAskUserRules. The bulk of this file.
 *   3. TOOL EXECUTION — makeAskUserTool wires execute() to the rules and
 *      to user-supplied hooks; we stub the hooks and verify pass / fail
 *      paths return the right tool result shapes.
 */
import {
  checkAskUserRules,
  makeAskUserTool,
  type AskUserParams,
  type AskUserHooks,
} from "./ask-user-tool.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const baseParams: AskUserParams = {
  question: "Should this feature live in the auth module or its own package?",
  category: "scope",
  why_blocked:
    "PROMPT.md says 'add SSO' but doesn't say where. Two existing modules (auth/, integrations/) could host it; the choice changes import paths for callers.",
};

function isErrorResult(result: { content: ReadonlyArray<{ type: string }>; details: unknown }): boolean {
  // Pi has no isError flag — we encode errors as "ERROR: ..." text + details.error.
  if (typeof result.details === "object" && result.details !== null && "error" in (result.details as object)) {
    return true;
  }
  return result.content.some((c) => c.type === "text" && (c as { text?: string }).text?.startsWith("ERROR:") === true);
}

async function main(): Promise<void> {
  // ── runtime: clean call passes ─────────────────────────────────────────
  {
    const r = checkAskUserRules(baseParams);
    assert(r.ok, `clean call should pass, got reason: ${r.reason}`);
    console.log("[smoke] clean call passes");
  }

  // ── runtime: forbidden question patterns rejected ──────────────────────
  const forbiddenQuestions = [
    "Should I continue with the build step?",
    "I finished the planner output. Continue?",
    "Would you like me to run the tests now?",
    "Do you want me to delete the old config?",
    "In what order should I tackle these three units?",
    "Are these the right steps for the rollout?",
    "Shall I proceed to the developer phase?",
    "I'm about to commit this — ok?",
    "Let me know if you want me to start the next step.",
    "Before I continue, can I confirm the scope?",
  ];
  for (const q of forbiddenQuestions) {
    const r = checkAskUserRules({ ...baseParams, question: q });
    assert(!r.ok, `should reject procedural question: "${q}"`);
    assert(r.reason!.includes("procedural"), `reason should mention procedural for "${q}"`);
  }
  console.log(`[smoke] ${forbiddenQuestions.length} procedural-question patterns rejected`);

  // ── runtime: forbidden why_blocked patterns rejected ───────────────────
  const weakReasons = [
    "Just to confirm before I proceed.",
    "I want to verify with the user before continuing.",
    "Making sure this is the right approach before moving on.",
    "Checking that this matches expectations.",
  ];
  for (const r of weakReasons) {
    const result = checkAskUserRules({ ...baseParams, why_blocked: r });
    assert(!result.ok, `should reject weak reason: "${r}"`);
    assert(result.reason!.includes("status check"), `reason should flag weak reason for "${r}"`);
  }
  console.log(`[smoke] ${weakReasons.length} weak why_blocked reasons rejected`);

  // ── runtime: rate limit ────────────────────────────────────────────────
  {
    const now = 1_000_000;
    const recent = now - 30_000; // 30s ago
    const r = checkAskUserRules(baseParams, { now, lastAskedAt: recent });
    assert(!r.ok, `should rate-limit second ask within window`);
    assert(r.reason!.includes("Rate limit"), `rate-limit reason should say so`);

    const old = now - 70_000; // 70s ago > 60s default
    const r2 = checkAskUserRules(baseParams, { now, lastAskedAt: old });
    assert(r2.ok, `should allow ask after window`);
  }
  console.log("[smoke] rate limit blocks <60s, allows >=60s");

  // ── tool execution: pass-through path ──────────────────────────────────
  const hooks: AskUserHooks = {
    postQuestion: async () => ({ answer: "Auth module — keep it close to the login flow." }),
    getLastAskedAt: () => undefined,
    recordAsk: () => {},
  };
  const tool = makeAskUserTool(hooks);
  const result = await tool.execute(
    "call_001",
    baseParams,
    undefined,
    undefined,
    {} as never,
  );
  assert(!isErrorResult(result), `pass-through should not be an error result`);
  assert(
    JSON.stringify(result.content).includes("Auth module"),
    `content should carry the user's answer`,
  );
  console.log("[smoke] tool execute() pass-through returns answer");

  // Rejection path — feed in a forbidden question, expect ERROR-prefixed
  // text in content + details.error so the agent loops back.
  const rejectingHooks: AskUserHooks = {
    postQuestion: async () => {
      throw new Error("postQuestion should not be called when rules reject");
    },
    getLastAskedAt: () => undefined,
    recordAsk: () => {},
  };
  const rejTool = makeAskUserTool(rejectingHooks);
  const rejResult = await rejTool.execute(
    "call_002",
    { ...baseParams, question: "Should I continue with the build step?" },
    undefined,
    undefined,
    {} as never,
  );
  assert(isErrorResult(rejResult), `forbidden question should produce error result`);
  assert(
    JSON.stringify(rejResult.content).includes("procedural"),
    `error content should mention 'procedural' so agent learns the rule`,
  );
  console.log("[smoke] tool execute() rejection short-circuits and explains");

  // Cancel path — postQuestion returns cancelled=true.
  const cancelHooks: AskUserHooks = {
    postQuestion: async () => ({ answer: "", cancelled: true }),
    getLastAskedAt: () => undefined,
    recordAsk: () => {},
  };
  const cancelTool = makeAskUserTool(cancelHooks);
  const cancelResult = await cancelTool.execute(
    "call_003",
    baseParams,
    undefined,
    undefined,
    {} as never,
  );
  assert(isErrorResult(cancelResult), `user-cancelled should be an error result`);
  assert(
    JSON.stringify(cancelResult.content).includes("cancelled"),
    `cancel reason should be visible to the agent`,
  );
  console.log("[smoke] tool execute() handles user cancellation");

  console.log("GREEN");
}

void main();
