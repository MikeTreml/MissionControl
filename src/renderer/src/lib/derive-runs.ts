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
