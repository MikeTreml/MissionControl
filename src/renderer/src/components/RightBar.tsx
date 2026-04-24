/**
 * Right rail — live Run Activity + a Queue placeholder.
 *
 * Run Activity subscribes directly to `window.mc.onTaskEvent` and keeps
 * the most-recent N events in local state. Each incoming event renders
 * as one row: taskId · type · (subtle detail).
 *
 * When window.mc is unavailable (e.g. static preview without preload)
 * we fall back to the canned mockRunActivity so the wireframe still
 * renders something meaningful.
 */
import { useEffect, useState } from "react";

import { mockRunActivity, mockQueue } from "../mock-data";
import type { TaskEvent } from "../../../shared/models";

const MAX_LIVE_EVENTS = 20;

interface LiveEntry {
  taskId: string;
  event: TaskEvent;
}

export function RightBar(): JSX.Element {
  const [live, setLive] = useState<LiveEntry[]>([]);
  const hasBridge = Boolean(window.mc);

  useEffect(() => {
    if (!hasBridge) return;
    const unsubscribe = window.mc.onTaskEvent(({ taskId, event }) => {
      setLive((prev) => [{ taskId, event }, ...prev].slice(0, MAX_LIVE_EVENTS));
    });
    return unsubscribe;
  }, [hasBridge]);

  return (
    <aside className="rightbar">
      <div className="group">
        <h3>Run Activity</h3>
        <div className="task-list" style={{ marginTop: 10 }}>
          {hasBridge
            ? live.length === 0
              ? (
                <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
                  No activity yet. Start a task to see events here.
                </div>
              )
              : live.map((entry, idx) => (
                <LiveRow key={`${entry.taskId}-${entry.event.timestamp}-${idx}`} entry={entry} />
              ))
            : mockRunActivity.map((r) => (
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

function LiveRow({ entry }: { entry: LiveEntry }): JSX.Element {
  const { taskId, event } = entry;
  const time = new Date(event.timestamp).toLocaleTimeString();
  return (
    <div className="task">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 12 }}>{taskId}</strong>
        <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>{time}</span>
      </div>
      <div className="sub" style={{ fontSize: 12 }}>{event.type}</div>
      {summarizePayload(event) && (
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {summarizePayload(event)}
        </div>
      )}
    </div>
  );
}

/**
 * Pick the most interesting field from an event payload for the one-line
 * summary. Keeps the row compact; full payload is visible in Task Detail.
 */
function summarizePayload(event: TaskEvent): string {
  const record = event as unknown as Record<string, unknown>;
  // Common shapes: {from, to} for lane-changed; {reason} for run-ended;
  // {agentSlug} for run-started; {message}/{text} for pi:* messages.
  if (typeof record.from === "string" && typeof record.to === "string") {
    return `${record.from} → ${record.to}`;
  }
  if (typeof record.reason === "string") return `reason: ${record.reason}`;
  if (typeof record.agentSlug === "string") return `agent: ${record.agentSlug}`;
  if (typeof record.message === "string") return String(record.message);
  return "";
}
