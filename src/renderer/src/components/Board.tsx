import { useTasks, type BoardStage, type UiTask } from "../hooks/useTasks";
import { TaskCard } from "./TaskCard";

const BOARD_STAGES: readonly BoardStage[] = ["Draft", "Active", "Attention", "Failed", "Complete"] as const;

function groupByStage(tasks: UiTask[]): Record<BoardStage, UiTask[]> {
  const out: Record<BoardStage, UiTask[]> = {
    Draft: [], Active: [], Attention: [], Failed: [], Complete: [],
  };
  for (const t of tasks) out[t.boardStage].push(t);
  return out;
}

export function Board(): JSX.Element {
  const { tasks, isDemo } = useTasks();
  const byStage = groupByStage(tasks);

  return (
    <section className="card">
      {isDemo && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <span className="pill warn">Demo</span>
        </div>
      )}

      <div className="lane-wrap">
        {BOARD_STAGES.map((stage) => (
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
