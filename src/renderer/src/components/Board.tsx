import { useState } from "react";

import { useTasks, type BoardStage, type UiTask } from "../hooks/useTasks";
import { TaskCard } from "./TaskCard";

const DEFAULT_STAGES: readonly BoardStage[] = ["Draft", "Active", "Attention", "Failed", "Complete"] as const;

function groupByStage(tasks: UiTask[]): Record<BoardStage, UiTask[]> {
  const out: Record<BoardStage, UiTask[]> = {
    Draft: [], Active: [], Attention: [], Failed: [], Complete: [], Archived: [],
  };
  for (const t of tasks) out[t.boardStage].push(t);
  return out;
}

export function Board(): JSX.Element {
  const { tasks, isDemo } = useTasks();
  const byStage = groupByStage(tasks);
  const archivedCount = byStage.Archived.length;
  const [showArchived, setShowArchived] = useState(false);
  // Always render the default 5; tack Archived on the end when toggled.
  const stages: readonly BoardStage[] = showArchived
    ? [...DEFAULT_STAGES, "Archived"]
    : DEFAULT_STAGES;

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        {archivedCount > 0 ? (
          <button
            className="button ghost"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Hide the Archived lane" : "Reveal archived tasks in a 6th lane"}
            style={{ fontSize: 12 }}
          >
            {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
          </button>
        ) : (
          <span />
        )}
        {isDemo && <span className="pill warn">Demo</span>}
      </div>

      <div className="lane-wrap">
        {stages.map((stage) => (
          <div key={stage} className="lane">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{stage}</h3>
              <span className="muted" style={{ fontSize: 12 }}>{byStage[stage].length}</span>
            </div>
            {byStage[stage].length === 0 && (
              <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
                —
              </div>
            )}
            {byStage[stage].map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
