import { useTasks, type BoardStage, type UiTask } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useRoute } from "../router";
import { TaskCard } from "./TaskCard";
import { SkeletonCard } from "./Skeleton";
import {
  buildRunningHistory,
  buildShippedHistory,
  DEMO_RUNNING_CHIPS,
  DEMO_SHIPPED_CHIPS,
  type LaneChip,
} from "../lib/lane-history";

// 6-lane Kanban (matches NewUI canvas): Drafting / Running / Review /
// Blocked / Done / Archived. Archived is always rendered — empty state
// reads "All older runs live here. Search to find one." per the canvas.
// "Failed" is a 7th lane that's only shown when there are failed tasks.
const DEFAULT_STAGES: readonly BoardStage[] = ["Drafting", "Running", "Review", "Blocked", "Done", "Archived"] as const;

function groupByStage(tasks: UiTask[]): Record<BoardStage, UiTask[]> {
  const out: Record<BoardStage, UiTask[]> = {
    Drafting: [], Running: [], Review: [], Blocked: [], Failed: [], Done: [], Archived: [],
  };
  for (const t of tasks) out[t.boardStage].push(t);
  return out;
}

export function Board(): JSX.Element {
  const { tasks, isDemo, loading } = useTasks();
  const byStage = groupByStage(tasks);
  const failedCount = byStage.Failed.length;

  return (
    <section data-surface-content="board">
      {isDemo && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <span className="pill warn">Demo</span>
        </div>
      )}
      <KanbanView
        byStage={byStage}
        tasks={tasks}
        isDemo={isDemo}
        showFailed={failedCount > 0}
        loadingCold={loading && tasks.length === 0}
      />
    </section>
  );
}

function KanbanView({
  byStage,
  tasks,
  isDemo,
  showFailed,
  loadingCold,
}: {
  byStage: Record<BoardStage, UiTask[]>;
  tasks: UiTask[];
  isDemo: boolean;
  showFailed: boolean;
  loadingCold: boolean;
}): JSX.Element {
  const { perTask } = useAllTaskEvents();
  const stages: BoardStage[] = [...DEFAULT_STAGES];
  if (showFailed) stages.splice(stages.indexOf("Done"), 0, "Failed");

  // Lane history strips: Running → recent runs · last 24h, Done → shipped · last 7d.
  // Demo mode shows the canvas's hardcoded chips so the strip isn't empty.
  const runningChips: LaneChip[] = isDemo ? DEMO_RUNNING_CHIPS : buildRunningHistory(perTask);
  const shippedChips: LaneChip[] = isDemo ? DEMO_SHIPPED_CHIPS : buildShippedHistory(tasks);

  return (
    <div className="lanes">
      {stages.map((stage) => (
        <div key={stage} className="lane">
          <div className="lane-head">
            <span className="title">{stage}</span>
            <span className="count">{loadingCold ? "" : byStage[stage].length}</span>
          </div>
          {loadingCold ? (
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <>
              {byStage[stage].length === 0 ? (
                stage === "Archived" ? (
                  <div className="empty-state" style={{ padding: "32px 12px" }}>
                    <div className="glyph">▤</div>
                    <div className="body" style={{ fontSize: 12 }}>
                      All older runs live here. Search to find one.
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
                    —
                  </div>
                )
              ) : null}
              {byStage[stage].map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
              {stage === "Running" && runningChips.length > 0 && (
                <LaneHistory label="Recent runs · last 24h" chips={runningChips} />
              )}
              {stage === "Done" && shippedChips.length > 0 && (
                <LaneHistory label="Shipped · last 7d" chips={shippedChips} />
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function LaneHistory({ label, chips }: { label: string; chips: LaneChip[] }): JSX.Element {
  const { openTask } = useRoute();
  return (
    <div className="lane-history">
      <div className="label">{label}</div>
      <div className="strip">
        {chips.map((c, i) => (
          <button
            key={`${c.taskId}-${i}`}
            className="chip"
            data-state={c.state}
            onClick={() => openTask(c.taskId)}
            title={`Open ${c.taskId}`}
          >
            <div className="top">
              <span className="dot" />
              {c.taskId}
            </div>
            <div className="when">{c.whenLabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
