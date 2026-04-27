/**
 * Walk a task's events.jsonl in chronological order and collapse it into
 * one row per `run-started` / `run-ended` pair. Accumulates model, tokens
 * and cost from the `pi:*` events that fire between them.
 *
 * Used by Task Detail's Run History and the Metrics page. Kept here (not
 * in the TaskStore) so the UI stays authoritative about how to interpret
 * its own journal — main just writes the events; the renderer decides what
 * a "run" means for display.
 *
 * Shape of events we read:
 *   run-started       { agentSlug }
 *   run-ended         { reason }
 *   pi:message_start  { message: { role: "assistant", model, provider, ... } }
 *   pi:turn_end       { message: { usage: { input, output, cost: { total } } } }
 */
import type { TaskEvent } from "../../../shared/models";

export interface DerivedRun {
  startedAt: string;
  endedAt?: string;
  agentSlug?: string;
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUSD?: number;
  reason?: string;
}

export function deriveRuns(events: TaskEvent[]): DerivedRun[] {
  const runs: DerivedRun[] = [];
  let current: DerivedRun | null = null;

  for (const e of events) {
    const rec = e as unknown as Record<string, unknown>;
    if (e.type === "run-started") {
      current = {
        startedAt: e.timestamp,
        agentSlug: typeof rec.agentSlug === "string" ? rec.agentSlug : undefined,
      };
      runs.push(current);
    } else if (e.type === "run-ended" && current) {
      current.endedAt = e.timestamp;
      current.reason = typeof rec.reason === "string" ? rec.reason : undefined;
      current = null;
    } else if (current && e.type === "pi:message_start") {
      const msg = rec.message as Record<string, unknown> | undefined;
      if (msg && msg.role === "assistant") {
        if (!current.model    && typeof msg.model    === "string") current.model    = msg.model;
        if (!current.provider && typeof msg.provider === "string") current.provider = msg.provider;
      }
    } else if (current && e.type === "pi:turn_end") {
      const msg = rec.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, unknown> | undefined;
      if (usage) {
        const inp  = typeof usage.input  === "number" ? usage.input  : 0;
        const outp = typeof usage.output === "number" ? usage.output : 0;
        const cost = usage.cost as Record<string, unknown> | undefined;
        const total = typeof cost?.total === "number" ? cost.total : 0;
        current.tokensIn  = (current.tokensIn  ?? 0) + inp;
        current.tokensOut = (current.tokensOut ?? 0) + outp;
        current.costUSD   = (current.costUSD   ?? 0) + total;
      }
    }
  }
  return runs;
}

/** Duration in ms, undefined if still running. */
export function runDurationMs(run: DerivedRun): number | undefined {
  if (!run.endedAt) return undefined;
  return new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
}

/**
 * Latest model the task has been running on. Walks events in reverse looking
 * for the most recent assistant `pi:message_start` and returns its model id.
 * Empty string when the task has never had a real run.
 */
export function latestModelForEvents(events: TaskEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "pi:message_start") continue;
    const rec = e as unknown as Record<string, unknown>;
    const msg = rec.message as Record<string, unknown> | undefined;
    if (msg && msg.role === "assistant" && typeof msg.model === "string" && msg.model) {
      return msg.model;
    }
  }
  return "";
}

/**
 * Compact a model id for display on a card. Trims provider prefixes and dated
 * suffixes that don't add information at a glance:
 *   "claude-opus-4-7-20251001" → "Opus 4.7"
 *   "claude-sonnet-4-6"         → "Sonnet 4.6"
 *   "gpt-5-codex"               → "Codex"
 *   "qwen2.5-coder"             → "qwen2.5-coder"  (unknown — leave as-is)
 */
export function shortModelLabel(model: string): string {
  if (!model) return "";
  const m = model.toLowerCase();
  // Claude family: claude-{tier}-{major}-{minor}[-{date}]
  const claude = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/.exec(m);
  if (claude) {
    const tier = claude[1].charAt(0).toUpperCase() + claude[1].slice(1);
    return `${tier} ${claude[2]}.${claude[3]}`;
  }
  // OpenAI Codex
  if (m.includes("codex")) return "Codex";
  // GPT-N
  const gpt = /^gpt-(\d+)/.exec(m);
  if (gpt) return `GPT-${gpt[1]}`;
  // Local Ollama models — keep as-is, they're already short
  return model;
}
