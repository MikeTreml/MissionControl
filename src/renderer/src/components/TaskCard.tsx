/**
 * One task card on the board.
 * The pill color is stored on the task itself so each lane stays visually
 * consistent with the mock (e.g. Developer=warn yellow, Done=good green).
 *
 * Click the card → navigate to Task Detail.
 * Project icon (if any) floats in the upper-right as a visual fingerprint
 * so you can tell which project a card belongs to at a glance.
 */
import type { UiTask } from "../hooks/useTasks";
import { shortModelLabel } from "../lib/derive-runs";
import { useRoute } from "../router";

export function TaskCard({ task }: { task: UiTask }): JSX.Element {
  const { openTask } = useRoute();
  const modelLabel = shortModelLabel(task.currentModel);
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
    </div>
  );
}
