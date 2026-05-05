/**
 * Metrics — cross-project rollups. Reads every task's events.jsonl via
 * useAllTaskEvents, derives per-run data with deriveRuns, and aggregates
 * into KPIs + a per-agent table.
 */
import React from "react";

import { useTasks } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useRoute } from "../router";
import { deriveRuns, runDurationMs, type DerivedRun } from "../lib/derive-runs";

export function Metrics(): JSX.Element {
  const { setView } = useRoute();
  const { tasks } = useTasks();
  const { perTask } = useAllTaskEvents();

  const tasksDone = tasks.filter((t) => t.lane === "Done").length;
  const tasksActive = tasks.filter((t) => t.lane !== "Done").length;

  // Collect every run across every task so we can aggregate.
  const allRuns: DerivedRun[] = [...perTask.values()].flatMap(deriveRuns);

  const totals = allRuns.reduce(
    (acc, r) => ({
      tokensIn:  acc.tokensIn  + (r.tokensIn  ?? 0),
      tokensOut: acc.tokensOut + (r.tokensOut ?? 0),
      costUSD:   acc.costUSD   + (r.costUSD   ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0, costUSD: 0 },
  );

  // Per-agent rollup (runs, avg duration, avg tokens, top model).
  const perAgent = aggregatePerAgent(allRuns);

  const kpis = [
    { label: "Tasks done", value: tasksDone },
    { label: "Tasks active", value: tasksActive },
    { label: "Runs total", value: allRuns.length },
    {
      label: "Total tokens (in / out)",
      value: `${abbreviate(totals.tokensIn)} / ${abbreviate(totals.tokensOut)}`,
    },
    {
      label: "Spend",
      value: totals.costUSD > 0 ? `$${totals.costUSD.toFixed(4)}` : "—",
    },
    {
      label: "Avg cycles / task",
      value:
        tasks.length === 0
          ? "—"
          : (tasks.reduce((s, t) => s + t.cycle, 0) / tasks.length).toFixed(1),
    },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Metrics</h1>
          <p className="muted">
            What are my agents good at? What's slow?
          </p>
        </div>
        <button className="button ghost" onClick={() => setView("dashboard")}>
          ← Dashboard
        </button>
      </div>

      <div className="content">
        <section className="card-grid" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
          {kpis.map((k) => (
            <div key={k.label} className="card" style={{ padding: 12 }}>
              <div className="muted">{k.label}</div>
              <div className="kpi" style={{ fontSize: 22 }}>{k.value}</div>
            </div>
          ))}
        </section>

        <section className="card">
          <h3>Per-agent performance</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            {perAgent.length === 0
              ? "No runs yet. Start a task to populate this table."
              : "Aggregated from each task's events.jsonl (pi:turn_end events)."}
          </p>
          {perAgent.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={th}>Agent</th>
                  <th style={th}>Runs</th>
                  <th style={th}>Avg duration</th>
                  <th style={th}>Avg tokens (in / out)</th>
                  <th style={th}>Spend</th>
                  <th style={th}>Top model</th>
                </tr>
              </thead>
              <tbody>
                {perAgent.map((r) => (
                  <tr key={r.agentSlug} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={cell}>{r.agentSlug}</td>
                    <td style={cell}>{r.runs}</td>
                    <td style={cell}>{r.avgDuration ?? "—"}</td>
                    <td style={cell}>
                      {abbreviate(r.avgTokensIn)} / {abbreviate(r.avgTokensOut)}
                    </td>
                    <td style={cell}>${r.costUSD.toFixed(4)}</td>
                    <td style={cell}>{r.topModel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h3>Subagent savings</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Populates once subagents actually spawn. Placeholder for now.
          </p>
        </section>
      </div>
    </>
  );
}

// ── aggregation ──────────────────────────────────────────────────────────

interface AgentRollup {
  agentSlug: string;
  runs: number;
  avgDuration?: string;
  avgTokensIn: number;
  avgTokensOut: number;
  costUSD: number;
  topModel?: string;
}

function aggregatePerAgent(runs: DerivedRun[]): AgentRollup[] {
  const buckets = new Map<string, {
    count: number;
    totalDurationMs: number;
    durationSamples: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCost: number;
    modelCounts: Map<string, number>;
  }>();

  for (const r of runs) {
    const slug = r.agentSlug ?? "(unknown)";
    const b = buckets.get(slug) ?? {
      count: 0,
      totalDurationMs: 0,
      durationSamples: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCost: 0,
      modelCounts: new Map<string, number>(),
    };
    b.count += 1;
    const d = runDurationMs(r);
    if (d !== undefined) { b.totalDurationMs += d; b.durationSamples += 1; }
    b.totalTokensIn  += r.tokensIn  ?? 0;
    b.totalTokensOut += r.tokensOut ?? 0;
    b.totalCost      += r.costUSD   ?? 0;
    if (r.model) b.modelCounts.set(r.model, (b.modelCounts.get(r.model) ?? 0) + 1);
    buckets.set(slug, b);
  }

  return [...buckets.entries()]
    .map(([slug, b]) => ({
      agentSlug: slug,
      runs: b.count,
      avgDuration:
        b.durationSamples > 0
          ? formatDurationMs(Math.round(b.totalDurationMs / b.durationSamples))
          : undefined,
      avgTokensIn:  Math.round(b.totalTokensIn  / b.count),
      avgTokensOut: Math.round(b.totalTokensOut / b.count),
      costUSD: b.totalCost,
      topModel: pickTopModel(b.modelCounts),
    }))
    .sort((a, b) => b.runs - a.runs);
}

function pickTopModel(counts: Map<string, number>): string | undefined {
  let best: { model: string; count: number } | null = null;
  for (const [model, count] of counts) {
    if (!best || count > best.count) best = { model, count };
  }
  return best?.model;
}

// ── formatting helpers ───────────────────────────────────────────────────

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function abbreviate(n: number): string {
  if (n < 1_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell: React.CSSProperties = { padding: "8px 10px" };
