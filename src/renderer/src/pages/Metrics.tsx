/**
 * Metrics — cross-project rollups. Early version: derived from the task list
 * (useTasks). Per-role performance + subagent savings will fill in once pi
 * writes richer run-ended events with tokens + durations.
 *
 * ── PI-WIRE: DATA SOURCE ───────────────────────────────────────────────
 *
 * PROPOSED: when pi emits "run-ended" events with tokens/cost/duration
 * (see src/main/store.ts PI-WIRE block), the Metrics page reads from
 * aggregated events across all tasks:
 *
 *   for each task: readTaskEvents(task.id)
 *   filter for run-ended
 *   group by agent-slug, sum tokens + durations
 *   → per-role performance table
 *
 * Until then, the Metrics page shows either empty state (real, sparse)
 * or the mockup's canned numbers (demo). CONFIRMED: canned numbers are
 * fine for the wireframe — we made them obviously "demo" with the flag.
 *
 * OPEN: where does cross-project rollup happen — main-side pre-aggregation
 * or renderer-side? If task counts get big, main-side is the move.
 */
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";

export function Metrics(): JSX.Element {
  const { setView } = useRoute();
  const { tasks, isDemo } = useTasks();

  // Derived counts
  const tasksDone = tasks.filter((t) => t.lane === "Done").length;
  const tasksActive = tasks.filter((t) => t.lane !== "Done").length;

  // Canned values when demo — real values come from events.jsonl + RunRecord
  // aggregation after pi is wired.
  const kpis = isDemo
    ? [
        { label: "Tasks done (30d)", value: 47 },
        { label: "Avg cycles / task", value: "2.8" },
        { label: "First-pass rate", value: "62%" },
        { label: "Total tokens (30d)", value: "4.1M" },
        { label: "Spend (30d)", value: "$62" },
        { label: "Local runs (free)", value: 134 },
      ]
    : [
        { label: "Tasks done", value: tasksDone },
        { label: "Tasks active", value: tasksActive },
        { label: "Avg cycles / task", value: "—" },
        { label: "First-pass rate", value: "—" },
        { label: "Total tokens", value: "—" },
        { label: "Spend", value: "—" },
      ];

  const perRole = isDemo
    ? [
        { role: "Planner",   runs: 58, avgDuration: "14m",   avgTokens: "11,200", loopBack: "—",          topModel: "Claude Opus 4.6" },
        { role: "Developer", runs: 52, avgDuration: "3h 18m", avgTokens: "38,400", loopBack: "12%",        topModel: "GPT-5 Codex" },
        { role: "Reviewer",  runs: 52, avgDuration: "22m",   avgTokens: "7,900",  loopBack: "38% loop-back", topModel: "Claude Opus 4.6" },
        { role: "Surgeon",   runs: 47, avgDuration: "9m",    avgTokens: "4,100",  loopBack: "—",          topModel: "Qwen 2.5 Coder" },
      ]
    : [];

  const subagents = isDemo
    ? [
        { name: "RepoMapper (rmp)",   spawns: 31, avgTokens: "5,400", cyclesSaved: "~18" },
        { name: "DocRefresher (drf)", spawns: 22, avgTokens: "2,100", cyclesSaved: "~8" },
      ]
    : [];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Metrics</h1>
          <p className="muted">
            What are my agents good at? What's slow?
            {isDemo && " · demo data"}
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
          <h3>Per-role performance</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            {isDemo
              ? "Demo data — real numbers will come from events.jsonl + RunRecord aggregation once pi is wired."
              : "Not enough runs yet to populate this table."}
          </p>
          {perRole.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={th}>Role</th>
                  <th style={th}>Runs</th>
                  <th style={th}>Avg duration</th>
                  <th style={th}>Avg tokens</th>
                  <th style={th}>Loop-back %</th>
                  <th style={th}>Top model</th>
                </tr>
              </thead>
              <tbody>
                {perRole.map((r) => (
                  <tr key={r.role} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={cell}>{r.role}</td>
                    <td style={cell}>{r.runs}</td>
                    <td style={cell}>{r.avgDuration}</td>
                    <td style={cell}>{r.avgTokens}</td>
                    <td style={cell}>{r.loopBack}</td>
                    <td style={cell}>{r.topModel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h3>Subagent savings</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Estimated cycles saved by pre-loading context. Cheap subagents pay
            for themselves by pruning what the primary role has to read.
          </p>
          {subagents.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={th}>Subagent</th>
                  <th style={th}>Spawns</th>
                  <th style={th}>Avg tokens</th>
                  <th style={th}>Estimated cycles saved</th>
                </tr>
              </thead>
              <tbody>
                {subagents.map((s) => (
                  <tr key={s.name} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={cell}>{s.name}</td>
                    <td style={cell}>{s.spawns}</td>
                    <td style={cell}>{s.avgTokens}</td>
                    <td style={cell}>{s.cyclesSaved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell: React.CSSProperties = { padding: "8px 10px" };

import React from "react";
