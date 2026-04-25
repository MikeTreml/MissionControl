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
import { useRoute } from "../router";
import type { TaskEvent } from "../../../shared/models";

const MAX_LIVE_EVENTS = 30;

// Event types too noisy to render row-by-row. They still land in
// events.jsonl and drive Task Detail's Run History / Metrics aggregation,
// we just don't want 50 of them per second pushing everything else off
// screen in the live feed.
const SUPPRESSED_TYPES = new Set([
  "pi:message_update", // streaming tokens
  "pi:tool_execution_update", // streaming tool output
]);

interface LiveEntry {
  taskId: string;
  event: TaskEvent;
}

export function RightBar(): JSX.Element {
  const [live, setLive] = useState<LiveEntry[]>([]);
  const hasBridge = Boolean(window.mc);
  const { openTask } = useRoute();

  useEffect(() => {
    if (!hasBridge) return;
    const unsubscribe = window.mc.onTaskEvent(({ taskId, event }) => {
      if (SUPPRESSED_TYPES.has(event.type)) return;
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
                <LiveRow
                  key={`${entry.taskId}-${entry.event.timestamp}-${idx}`}
                  entry={entry}
                  onOpen={() => openTask(entry.taskId)}
                />
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

function LiveRow({
  entry,
  onOpen,
}: {
  entry: LiveEntry;
  onOpen: () => void;
}): JSX.Element {
  const { taskId, event } = entry;
  const time = new Date(event.timestamp).toLocaleTimeString();
  return (
    <div
      className="task"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      style={{ cursor: "pointer" }}
      title={`Open task ${taskId}`}
    >
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
 *
 * Event shapes (observed):
 *   lane-changed            → { from, to }
 *   run-started             → { agentSlug }
 *   run-ended               → { reason }
 *   pi:message_start (user) → { message: { role, content } }
 *   pi:message_start (ast)  → { message: { role, model, provider } }
 *   pi:turn_end             → { message: { usage: { input, output, cost } } }
 *   pi:tool_execution_start → { toolName, toolInput? }
 *   pi:tool_execution_end   → { toolName, exitCode?, durationMs? }
 *   pi:agent_end            → { messages }
 */
function summarizePayload(event: TaskEvent): string {
  const record = event as unknown as Record<string, unknown>;

  // Structural: lane + run events
  if (typeof record.from === "string" && typeof record.to === "string") {
    return `${record.from} → ${record.to}`;
  }
  if (typeof record.reason === "string") return `reason: ${record.reason}`;

  // Tool-execution events (babysitter drives a lot of these)
  if (typeof record.toolName === "string") {
    const inputSummary = typeof record.toolInput === "object" && record.toolInput
      ? ` ${summarizeToolInput(record.toolInput as Record<string, unknown>)}`
      : "";
    return `${record.toolName}${inputSummary}`;
  }

  // Pi message events — pull model + role from the nested message.
  const msg = record.message as Record<string, unknown> | undefined;
  if (msg && typeof msg === "object") {
    const role = typeof msg.role === "string" ? msg.role : "";
    const model = typeof msg.model === "string" ? ` · ${msg.model}` : "";
    const usage = msg.usage as Record<string, unknown> | undefined;
    if (usage && typeof usage.input === "number") {
      const cost = usage.cost as Record<string, unknown> | undefined;
      const total = typeof cost?.total === "number" ? ` · $${cost.total.toFixed(4)}` : "";
      return `${role}${model} · ${usage.input} in / ${usage.output} out${total}`;
    }
    if (role || model) return `${role}${model}`.trim();
  }

  if (typeof record.agentSlug === "string") return `agent: ${record.agentSlug}`;
  return "";
}

/** Short one-liner for a tool_execution_start's toolInput blob. */
function summarizeToolInput(input: Record<string, unknown>): string {
  // Prefer a path/command/name field when present.
  for (const key of ["path", "file_path", "command", "query", "name"]) {
    const v = input[key];
    if (typeof v === "string") {
      return v.length > 40 ? `${key}=${v.slice(0, 37)}…` : `${key}=${v}`;
    }
  }
  return "";
}
