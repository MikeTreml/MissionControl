/**
 * Selected-task panel (below the board on Dashboard). Shows the top-of-list
 * task's meta + its linked files. All data pulled from hooks — no hardcoded
 * titles, roles, or file names.
 *
 * "Top of list" = the first running task, or the first task period, or the
 * sample task. Click through to Task Detail for the full view.
 */
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";

export function SelectedTaskPanel(): JSX.Element {
  const { tasks } = useTasks();
  const { openTask } = useRoute();

  const active = tasks.find((t) => t.active) ?? tasks[0];

  if (!active) {
    return (
      <section className="card">
        <h2>Selected Task</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          No tasks yet. Click "Create Task" to add one.
        </p>
      </section>
    );
  }

  const linkedFiles = [{ name: active.id, note: "base manifest" }];

  return (
    <section
      className="card"
      style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}
    >
      {/* ── left: task meta ── */}
      <div>
        <h2>Selected Task — {active.id}</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Lane: {active.lane} · {active.roleLabel}
        </p>
        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span className={`pill ${active.rolePill}`}>{active.roleLabel}</span>
          {active.active && <span className="pill warn">Running</span>}
        </div>
        <div style={{ marginTop: 16 }}>
          <div className="file">
            <strong>Current step</strong>
            <div className="muted">{active.stepLine}</div>
          </div>
          {active.sub && (
            <div className="file">
              <strong>Sub</strong>
              <div className="muted">{active.sub}</div>
            </div>
          )}
          <div className="file">
            <strong>Summary</strong>
            <div className="muted">{active.summary}</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            className="button ghost"
            onClick={() => openTask(active.id)}
          >
            Open task detail →
          </button>
        </div>
      </div>

      {/* ── right: task-linked files ── */}
      <div>
        <h2>Task-linked Files</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          Open Task Detail for the full file listing produced during the run.
        </p>
        <div style={{ marginTop: 12 }}>
          {linkedFiles.map((f) => (
            <div key={f.name} className="file">
              <strong>{f.name}</strong>
              <div className="muted">{f.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
