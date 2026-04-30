/**
 * One task card on the board.
 * The pill color is stored on the task itself so each lane stays visually
 * consistent (e.g. running=warn yellow, done=good green) — the color
 * is derived from runState/status in useTasks.deriveLaneStyle, not
 * from any specific agent name.
 *
 * Click the card → navigate to Task Detail.
 * Project icon (if any) floats in the upper-right as a visual fingerprint
 * so you can tell which project a card belongs to at a glance.
 */
import type { UiTask } from "../hooks/useTasks";
import { shortModelLabel } from "../lib/derive-runs";
import { useRoute } from "../router";

/**
 * "idle 3h" / "idle 2d" muted line shown for tasks that haven't been
 * touched recently and aren't actively running. Hidden when idle < 1h
 * (too noisy) and for tasks in terminal stages (Complete / Failed) or
 * archived. Anything < 1d shows hours; anything ≥ 1d shows days.
 */
function formatIdleSince(updatedAt: string): string | null {
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hours = ms / 3_600_000;
  if (hours < 1) return null;
  if (hours < 24) return `idle ${Math.round(hours)}h`;
  return `idle ${Math.round(hours / 24)}d`;
}

export function TaskCard({ task }: { task: UiTask }): JSX.Element {
  const { openTask } = useRoute();
  const modelLabel = shortModelLabel(task.currentModel);
  // Only show the idle indicator for tasks where it's actionable —
  // running tasks have their own "active" affordance, terminal stages
  // don't need an idle clock, and archived tasks are out of view.
  const showIdle =
    task.boardStage !== "Complete" &&
    task.boardStage !== "Failed" &&
    task.boardStage !== "Archived" &&
    task.runState !== "running";
  const idleLabel = showIdle ? formatIdleSince(task.updatedAt) : null;
  return (
    <div
      className={task.active ? "task active" : "task"}
      style={{ cursor: "pointer", position: "relative" }}
      onClick={() => openTask(task.id)}
    >
      {task.projectIcon && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {task.projectIcon}
        </div>
      )}
      <div className="task-title" style={{ paddingRight: task.projectIcon ? 22 : 0 }}>
        {task.id}
      </div>
      <div>{task.summary}</div>
      <div className="step-line">
        <span className={`pill ${task.rolePill}`}>{task.roleLabel}</span>
        {task.stepLine}
      </div>
      {task.sub && <div className="sub">{task.sub}</div>}
      {modelLabel && (
        <div
          className="muted"
          style={{ fontSize: 11, marginTop: 6 }}
          title={`Model: ${task.currentModel}`}
        >
          Model: {modelLabel}
        </div>
      )}
      {idleLabel && (
        <div
          className="muted"
          style={{ fontSize: 11, marginTop: 2 }}
          title={`Last updated ${new Date(task.updatedAt).toLocaleString()}`}
        >
          {idleLabel}
        </div>
      )}
    </div>
  );
}
