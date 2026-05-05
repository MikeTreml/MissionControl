/**
 * useKpis — dashboard header numbers, derived from useTasks() + the
 * per-task event journals.
 *
 * Mockup KPIs (NewUI/Mission Control Design System/ui_kits/mission-control):
 *   In progress · Awaiting review · Avg. turnaround · Tokens · 24h
 *
 * Each KPI carries an optional `delta` string + direction so the UI can
 * paint up/down ticks (the mockup shows e.g. "+2 today", "−6m vs. last
 * week", "+18% vs. avg"). Direction is purely informational — `up` is
 * green, `down` is red, blank is neutral.
 */
import { useTasks } from "./useTasks";
import { useAllTaskEvents } from "./useAllTaskEvents";

export interface KpiItem {
  label: string;
  value: string | number;
  delta?: string;
  /** "up" = the green direction (positive), "down" = the red direction. */
  deltaTone?: "up" | "down";
}

export interface KpisState {
  kpis: KpiItem[];
  loading: boolean;
}

export function useKpis(): KpisState {
  const { tasks, loading } = useTasks();
  const { perTask } = useAllTaskEvents();

  const inProgress = tasks.filter((t) =>
    t.boardStage === "Drafting" || t.boardStage === "Running" || t.boardStage === "Blocked"
  ).length;
  const awaitingReview = tasks.filter((t) => t.boardStage === "Review").length;

  // Avg. turnaround = average wall-time across the last 10 completed runs
  // (run-started → run-ended). If we have <2 samples, show "—".
  const completed: number[] = [];
  for (const events of perTask.values()) {
    let lastStart: number | null = null;
    for (const e of events) {
      if (e.type === "run-started") {
        lastStart = new Date(e.timestamp).getTime();
      } else if (e.type === "run-ended" && lastStart !== null) {
        const ended = new Date(e.timestamp).getTime();
        if (Number.isFinite(ended - lastStart) && ended > lastStart) {
          completed.push(ended - lastStart);
        }
        lastStart = null;
      }
    }
  }
  completed.sort((a, b) => b - a);
  const recent = completed.slice(0, 10);
  const avgMs = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
  const avgTurnaround = avgMs === null ? "—" : formatDuration(avgMs);

  // Tokens · 24h — sum from `metrics:report` / `pi:turn_end` payloads in
  // the last 24h. Falls back to 0 when nothing cost-relevant streamed.
  const cutoff = Date.now() - 24 * 3600_000;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const events of perTask.values()) {
    for (const e of events) {
      if (new Date(e.timestamp).getTime() < cutoff) continue;
      const rec = e as unknown as Record<string, unknown>;
      const ti = pickNumber(rec, ["tokensIn", "promptTokens", "input_tokens"]);
      const to = pickNumber(rec, ["tokensOut", "completionTokens", "output_tokens"]);
      tokensIn += ti;
      tokensOut += to;
    }
  }
  const tokensTotal = tokensIn + tokensOut;
  const tokensLabel = tokensTotal === 0 ? "—" : compactNumber(tokensTotal);

  return {
    loading,
    kpis: [
      { label: "In progress",     value: inProgress },
      { label: "Awaiting review", value: awaitingReview },
      { label: "Avg. turnaround", value: avgTurnaround },
      { label: "Tokens · 24h",    value: tokensLabel },
    ],
  };
}

function pickNumber(rec: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = totalMin / 60;
  if (totalHr < 24) return `${totalHr.toFixed(1)}h`;
  return `${(totalHr / 24).toFixed(1)}d`;
}

function compactNumber(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}k`;
  if (n < 1_000_000_000) return `${Math.round(n / 100_000) / 10}M`;
  return `${Math.round(n / 100_000_000) / 10}B`;
}
