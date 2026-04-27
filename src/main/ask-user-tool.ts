/**
 * mc_ask_user — pi custom tool that lets an agent pause for a real human
 * decision. Three layers of guardrails make it hard to misuse:
 *
 *   1. SCHEMA. The `category` enum has no value for "sequencing", "status",
 *      or "should-I-continue" — those questions can't be expressed at all.
 *   2. RUNTIME. Even with a valid category, the question text is pattern-
 *      matched against forbidden phrases ("should I continue", "would you
 *      like me to", etc.). Matches return isError=true with feedback so
 *      the agent loops back instead of waiting on us.
 *   3. PROMPT. promptSnippet + promptGuidelines bake the rules into the
 *      system prompt for any session that registers the tool, so the agent
 *      sees the constraint up front, not just on rejection.
 *
 * The tool is decision-only: scope, ambiguity, destructive actions, or
 * credentials the user holds. Anything else, the agent runs to completion.
 *
 * Wiring (see pi-session-manager.ts): the tool's `execute()` returns a
 * Promise that the SessionManager keeps open until the renderer pushes an
 * answer back via `tasks:respondToAsk`. While open, an event lands on the
 * task's events.jsonl so Task Detail can render a question card.
 */
import { Type, type Static } from "typebox";

// Type imports use the full path the SDK exposes (TS gets the shape; runtime
// imports stay in the manager that actually instantiates the session).
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ── 1. SCHEMA ────────────────────────────────────────────────────────────

/**
 * Categories the agent can claim. Deliberately small. There is no
 * "sequencing" or "progress" category — those aren't valid reasons to ask.
 */
export const AskUserCategorySchema = Type.Union(
  [
    Type.Literal("scope"),       // is X in or out of scope for this task?
    Type.Literal("ambiguity"),   // PROMPT.md genuinely doesn't say
    Type.Literal("destructive"), // about to do something irreversible
    Type.Literal("credential"),  // need a value only the user holds
  ],
  {
    description:
      "Why this question requires a human. NEVER use this tool for sequencing ('what order'), status ('I finished X, continue?'), or low-stakes formatting choices — those aren't categories on purpose. Run to completion instead.",
  },
);

export const AskUserParamsSchema = Type.Object({
  question: Type.String({
    minLength: 8,
    description:
      "The single decision you need from the user. Phrase it as a question with a clear yes/no or pick-one answer. Must be a real choice that materially changes the outcome.",
  }),
  category: AskUserCategorySchema,
  why_blocked: Type.String({
    minLength: 30,
    description:
      "Briefly: what you tried, what you couldn't resolve from PROMPT.md / repo, why this is genuinely decision-blocking. Empty / generic answers are rejected.",
  }),
  options: Type.Optional(
    Type.Array(Type.String(), {
      maxItems: 6,
      description:
        "Multiple-choice options if the answer is from a small set. Omit for free-text.",
    }),
  ),
});

export type AskUserParams = Static<typeof AskUserParamsSchema>;

// ── 2. RUNTIME GUARDRAILS ────────────────────────────────────────────────

/**
 * Phrases that mark the question as procedural / status / sequencing
 * regardless of which category the agent claimed. Matched case-insensitively
 * against the question text. These are the patterns the user explicitly
 * called out as anti-patterns.
 */
const FORBIDDEN_QUESTION_PATTERNS: RegExp[] = [
  /\bshould i (continue|proceed|keep going|go ahead|move on|start)\b/i,
  /\bwould you like me to\b/i,
  /\bdo you want me to\b/i,
  /\b(want|ready) (me|for me) to\b/i,
  /\bshall i\b/i,
  /\blet me know if you (want|wish|would like)\b/i,
  /\bin (what|which) order\b/i,
  /\bare these the (right )?steps\b/i,
  /\bis this the right order\b/i,
  /\bnext,? (i('| wi)ll|should i)\b/i,
  /\bbefore i (continue|move|proceed)\b/i,
  /\bi('m| am) (about to|going to|ready to)\b.*\?/i, // "I'm about to do X, ok?"
  /\b(i('| ha)ve|i) finished\b.*\?/i,                 // "I've finished X, continue?"
];

/**
 * Generic / empty `why_blocked` values that should be rejected even if
 * length passes. Catches the agent dressing up a status check as ambiguity.
 */
const FORBIDDEN_REASON_PATTERNS: RegExp[] = [
  /^(i (just )?(want|need) to (check|confirm|verify))/i,
  /^(checking|confirming|verifying) (with|that)/i,
  /^(making sure|just to confirm)/i,
];

export interface RuleCheckResult {
  ok: boolean;
  reason?: string;       // why we rejected (returned to agent so it loops back)
  matchedPattern?: string;
}

/**
 * Apply runtime rules to a parsed AskUserParams. Returns ok=true when the
 * call should proceed, or ok=false with a reason that gets returned as the
 * tool result so the agent learns to stop asking these.
 *
 * Pure function — no I/O, no state. Smoke-testable in isolation.
 */
export function checkAskUserRules(
  params: AskUserParams,
  options: { now?: number; lastAskedAt?: number; minIntervalMs?: number } = {},
): RuleCheckResult {
  const minIntervalMs = options.minIntervalMs ?? 60_000; // 1 minute floor
  const now = options.now ?? Date.now();

  // Rate limit: one ask per task per minute. The whole point is that
  // asking is rare; a chatty agent should hit this and back off.
  if (typeof options.lastAskedAt === "number") {
    const elapsed = now - options.lastAskedAt;
    if (elapsed < minIntervalMs) {
      const wait = Math.ceil((minIntervalMs - elapsed) / 1000);
      return {
        ok: false,
        reason:
          `You asked the user a question ${Math.round(elapsed / 1000)}s ago. ` +
          `Rate limit: at most one ask_user per ${Math.round(minIntervalMs / 1000)}s per task. ` +
          `Continue executing for at least ${wait}s before asking again, and only ` +
          `if you have new context that produced a new decision-blocker.`,
      };
    }
  }

  // Question phrasing — the procedural / status patterns the user named.
  for (const pat of FORBIDDEN_QUESTION_PATTERNS) {
    if (pat.test(params.question)) {
      return {
        ok: false,
        matchedPattern: pat.source,
        reason:
          "This is a procedural / status question, not a decision. " +
          "mc_ask_user is for decisions you genuinely cannot resolve from PROMPT.md / repo " +
          "(scope, ambiguity, destructive actions, credentials). " +
          "Don't ask 'should I continue' or 'in what order' — pick the most reasonable interpretation and run to completion. " +
          `Matched anti-pattern: /${pat.source}/`,
      };
    }
  }

  // why_blocked must show real effort.
  for (const pat of FORBIDDEN_REASON_PATTERNS) {
    if (pat.test(params.why_blocked.trim())) {
      return {
        ok: false,
        matchedPattern: pat.source,
        reason:
          "`why_blocked` reads as a status check, not a real blocker. " +
          "Describe what you tried to resolve from PROMPT.md and the repo, " +
          "and why neither answered the question. " +
          `Matched anti-pattern: /${pat.source}/`,
      };
    }
  }

  return { ok: true };
}

// ── 3. PROMPT-LEVEL GUIDANCE ─────────────────────────────────────────────

const PROMPT_SNIPPET =
  "mc_ask_user — pause for a human decision. Use ONLY for scope / ambiguity / destructive / credential questions. NEVER for sequencing, status, or 'should I continue'.";

const PROMPT_GUIDELINES = [
  "Use mc_ask_user only when blocked on a real decision: PROMPT.md is genuinely ambiguous AND the choice materially changes the result.",
  "NEVER ask the user about ordering ('should I do A then B?'), progress ('I finished X, continue?'), or low-stakes formatting. Pick the most reasonable interpretation and proceed.",
  "Before asking, prove you tried: read PROMPT.md fully, scan related files, attempt the most reasonable interpretation. Put what you tried in `why_blocked`.",
  "Run to completion. Pause only at genuine decision points or destructive actions (file deletion, force-push, schema change).",
  "At most one ask_user per task per minute. Repeated asks are rate-limited; use the wait time to keep working.",
];

// ── tool factory ─────────────────────────────────────────────────────────

/**
 * Build the tool. The factory takes the runtime hooks the SessionManager
 * provides:
 *   - postQuestion: called when the call is allowed; the manager pushes a
 *     `pi:awaiting_input` event, opens a renderer card, and returns a
 *     promise that resolves when the user answers (or rejects on cancel).
 *   - getLastAskedAt: returns the last-ask timestamp for the task, used by
 *     the rate-limit check.
 *
 * Kept as a factory so tests can pass mock hooks; the actual tool gets
 * registered per-session in pi-session-manager.ts.
 */
export interface AskUserHooks {
  postQuestion: (
    toolCallId: string,
    params: AskUserParams,
  ) => Promise<{ answer: string; cancelled?: boolean }>;
  getLastAskedAt: () => number | undefined;
  recordAsk: (now: number) => void;
}

export function makeAskUserTool(
  hooks: AskUserHooks,
): ToolDefinition<typeof AskUserParamsSchema> {
  return {
    name: "mc_ask_user",
    label: "Ask user",
    description:
      "Pause execution to ask the human user a single decision-blocking question. " +
      "Categories: scope (in/out of task), ambiguity (PROMPT.md unclear), destructive (about to do something irreversible), credential (user holds the value). " +
      "NOT for sequencing, status updates, or 'should I continue' — run to completion instead. " +
      "At most one call per task per minute.",
    parameters: AskUserParamsSchema,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    executionMode: "sequential",
    async execute(toolCallId, params, signal) {
      // Layer 2: runtime check.
      const check = checkAskUserRules(params, {
        lastAskedAt: hooks.getLastAskedAt(),
      });
      if (!check.ok) {
        return errResult(check.reason ?? "Rejected by runtime rule.");
      }
      if (signal?.aborted) {
        return errResult("Tool call aborted before user could answer.");
      }
      hooks.recordAsk(Date.now());
      try {
        const { answer, cancelled } = await hooks.postQuestion(toolCallId, params);
        if (cancelled) {
          return errResult("User cancelled the run before answering.");
        }
        return {
          content: [{ type: "text", text: answer }],
          details: { cancelled: false, length: answer.length },
        };
      } catch (err) {
        return errResult(
          `ask_user failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

/**
 * Pi's tool-result shape doesn't have an isError flag — errors are just
 * text the agent reads. We prefix with "ERROR:" so the model treats it as
 * a constraint to react to, not a payload to use verbatim.
 */
function errResult(message: string): {
  content: [{ type: "text"; text: string }];
  details: { error: string };
} {
  return {
    content: [{ type: "text", text: `ERROR: ${message}` }],
    details: { error: message },
  };
}
