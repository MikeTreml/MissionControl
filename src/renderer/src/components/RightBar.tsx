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

const MAX_LIVE_EVENTS = 50;

// Event types too noisy to render row-by-row. They still land in
// events.jsonl and drive Task Detail's Run History / Metrics aggregation,
// we just don't want them pushing structural events off screen in the
// live feed. Real-task numbers from a 3-minute run: 4806 message_update,
// 108 message_start/end pairs (one per tool wrap) — keeping all of them
// blew through the rail every ~25s. We keep turn_*, tool_execution_*,
// and the lifecycle wrappers; toss the streaming-token + tool-stdout
// + per-toolcall message wrappers.
const SUPPRESSED_TYPES = new Set([
  "pi:message_update",        // streaming tokens
  "pi:tool_execution_update", // streaming tool output
  "pi:message_start",         // each tool call wraps in start/end of a "toolResult" message — noise
  "pi:message_end",
]);

// Event-type prefixes that warrant a visual badge — first-class signals
// for the human watching the rail. Tool calls are babysitter doing real
// work; subagent events are pi-subagents spawning specialized helpers
// (RepoMapper, DocRefresher, etc.).
const HIGHLIGHT_TYPES = new Set([
  "pi:tool_execution_start",
  "pi:tool_execution_end",
  "pi:subagent_spawn",
  "pi:subagent_complete",
  "item-started",
  "item-ended",
  "run-started",
  "run-ended",
  "lane-changed",
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
  const highlighted = HIGHLIGHT_TYPES.has(event.type);
  const icon = iconForEvent(event.type);
  return (
    <div
      className="task"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      style={{
        cursor: "pointer",
        ...(highlighted
          ? { borderLeft: "2px solid var(--accent)", paddingLeft: 12 }
          : {}),
      }}
      title={`Open task ${taskId}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
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

/** One-glyph icon hint for high-signal event types. */
function iconForEvent(type: string): string {
  if (type === "run-started"  || type === "item-started")  return "▶";
  if (type === "run-ended"    || type === "item-ended")    return "■";
  if (type === "run-paused")                                return "⏸";
  if (type === "run-resumed")                               return "▷";
  if (type === "lane-changed")                              return "→";
  if (type === "pi:subagent_spawn")                         return "⤴";
  if (type === "pi:subagent_complete")                      return "⤵";
  if (type === "pi:tool_execution_start")                   return "⚙";
  if (type === "pi:tool_execution_end")                     return "✓";
  return "";
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

  // Subagent spawn / complete events (pi-subagents — RepoMapper, etc.)
  if (typeof record.agentName === "string") {
    const dur = typeof record.durationMs === "number"
      ? ` · ${(record.durationMs / 1000).toFixed(1)}s`
      : "";
    return `${record.agentName}${dur}`;
  }
  if (typeof record.subagent === "string") {
    return String(record.subagent);
  }

  // Campaign item events
  if (typeof record.itemId === "string") {
    return String(record.itemId);
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
