/**
 * Right rail — Run Activity (live agent runs) + Queue (tasks waiting on events).
 *
 * Run Activity shows both primary agents (Planner) and their spawned subagents
 * (RepoMapper) as first-class citizens.
 *
 * ── PI-WIRE: LIVE EVENT FEED ───────────────────────────────────────────
 *
 * PROPOSED: this panel subscribes to a main-process event broadcast that
 * fires whenever any task's events.jsonl appends. Shape:
 *   window.mc.onTaskEvent((taskId, event) => ...)
 *
 * OPEN: is this ipcRenderer.on or a MessageChannel? Probably the former;
 * simpler. Add in preload alongside the invoke() wrappers.
 *
 * Alternative evaluated in docs/PI-EXTENSIONS-SURVEY.md: pi-messenger-swarm
 * channel feeds — would replace our broadcast with a file-backed mesh.
 * Good story, but adds a dep; start with the direct IPC broadcast.
 *
 * Today this component shows canned mock events. CONFIRMED intentional
 * while pi isn't wired.
 */
import { mockRunActivity, mockQueue } from "../mock-data";

export function RightBar(): JSX.Element {
  return (
    <aside className="rightbar">
      <div className="group">
        <h3>Run Activity</h3>
        <div className="task-list" style={{ marginTop: 10 }}>
          {mockRunActivity.map((r) => (
            <div key={r.label} className="task">
              <strong>{r.label}</strong>
              <div className="sub">{r.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>Queue</h3>
        <div className="task-list" style={{ marginTop: 10 }}>
          {mockQueue.map((q) => (
            <div key={q.taskId} className="task">
              <strong>{q.taskId}</strong>
              <div className="sub">{q.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
