import type { TaskEvent } from "../shared/models.ts";
import type { TaskStore } from "./store.ts";

export interface RunMetricsArtifact {
  step: string;
  cycle: number;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  wallTimeSeconds: number;
  retries: number;
  runStartedAt: string;
  runEndedAt: string;
  reason: string;
}

export async function writeLatestRunMetricsArtifact(
  tasks: TaskStore,
  taskId: string,
  fallbackStep: string,
  cycle: number,
): Promise<string | null> {
  const events = await tasks.readEvents(taskId);
  const metrics = deriveLatestRunMetrics(events, fallbackStep, cycle);
  if (!metrics) return null;
  const stamp = safeStamp(metrics.runEndedAt);
  const fileName = `${taskId}-${metrics.step}-c${metrics.cycle}-${stamp}.metrics.json`;
  return tasks.writeArtifactJson(taskId, fileName, metrics as unknown as Record<string, unknown>);
}

function deriveLatestRunMetrics(
  events: TaskEvent[],
  fallbackStep: string,
  cycle: number,
): RunMetricsArtifact | null {
  let startIdx = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.type === "run-started") {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  const start = events[startIdx]!;
  const end = findRunEndAfter(events, startIdx + 1) ?? {
    timestamp: new Date().toISOString(),
    type: "run-ended",
    reason: "unknown",
  };

  let tokensIn = 0;
  let tokensOut = 0;
  let costUSD = 0;
  let model = "";
  let provider = "";
  let retries = 0;

  for (let i = startIdx; i < events.length; i += 1) {
    const event = events[i] as Record<string, unknown>;
    const type = String(event["type"] ?? "");
    if (i > startIdx && type === "run-started") break;
    if (type === "pi:message_start") {
      const msg = event["message"] as Record<string, unknown> | undefined;
      if (msg && msg["role"] === "assistant") {
        if (!model && typeof msg["model"] === "string") model = msg["model"];
        if (!provider && typeof msg["provider"] === "string") provider = msg["provider"];
      }
    }
    if (type === "pi:turn_end") {
      const msg = event["message"] as Record<string, unknown> | undefined;
      const usage = msg?.["usage"] as Record<string, unknown> | undefined;
      if (usage) {
        tokensIn += asNumber(usage["input"]);
        tokensOut += asNumber(usage["output"]);
        const cost = usage["cost"] as Record<string, unknown> | undefined;
        costUSD += asNumber(cost?.["total"]);
      }
    }
    if (type === "pi:error") retries += 1;
  }

  const startedAt = start.timestamp;
  const endedAt = end.timestamp;
  const wallTimeSeconds = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  const startRec = start as unknown as Record<string, unknown>;
  const step =
    (typeof startRec["agentSlug"] === "string" && startRec["agentSlug"]) ||
    fallbackStep ||
    "run";
  const endRec = end as unknown as Record<string, unknown>;
  const reason = typeof endRec["reason"] === "string" ? endRec["reason"] : "unknown";

  return {
    step,
    cycle,
    model,
    provider,
    tokensIn,
    tokensOut,
    costUSD,
    wallTimeSeconds,
    retries,
    runStartedAt: startedAt,
    runEndedAt: endedAt,
    reason,
  };
}

function findRunEndAfter(events: TaskEvent[], from: number): TaskEvent | null {
  for (let i = from; i < events.length; i += 1) {
    if (events[i]?.type === "run-ended") return events[i]!;
  }
  return null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

