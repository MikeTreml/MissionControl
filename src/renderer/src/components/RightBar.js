import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Right rail — live Run Activity + a Queue placeholder.
 *
 * Run Activity subscribes directly to `window.mc.onTaskEvent` and keeps
 * the most-recent N events in local state. Each incoming event renders
 * as one row: taskId · type · (subtle detail).
 *
 * When window.mc is unavailable (e.g. static preview without preload)
 * we use canned mockRunActivity data so the wireframe still renders
 * something meaningful.
 */
import { useEffect, useState } from "react";
import { useSubscribe } from "../hooks/data-bus";
import { mockRunActivity, mockQueue } from "../mock-data";
import { useRoute } from "../router";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { deriveSubagents } from "../lib/derive-subagents";
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
    "pi:message_update", // streaming tokens
    "pi:tool_execution_update", // streaming tool output
    "pi:message_start", // each tool call wraps in start/end of a "toolResult" message — noise
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
    "bs:journal:effect_requested",
    "bs:journal:effect_resolved_ok",
    "bs:journal:effect_resolved_error",
    "item-started",
    "item-ended",
    "run-started",
    "run-ended",
    "step:start",
    "step:agent-end",
    "step:end",
    "lane-changed",
    "interrupted",
    "blocker-changed",
]);
export function RightBar() {
    const [live, setLive] = useState([]);
    const hasBridge = Boolean(window.mc);
    const { openTask } = useRoute();
    useEffect(() => {
        if (!hasBridge)
            return;
        const unsubscribe = window.mc.onTaskEvent(({ taskId, event }) => {
            if (SUPPRESSED_TYPES.has(event.type))
                return;
            setLive((prev) => [{ taskId, event }, ...prev].slice(0, MAX_LIVE_EVENTS));
        });
        return unsubscribe;
    }, [hasBridge]);
    return (_jsxs("aside", { className: "rightbar", children: [_jsxs("div", { className: "group", children: [_jsx("h3", { children: "Run Activity" }), _jsx("div", { className: "task-list", style: { marginTop: 10 }, children: hasBridge
                            ? live.length === 0
                                ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "6px 2px" }, children: "No activity yet. Start a task to see events here." }))
                                : live.map((entry, idx) => (_jsx(LiveRow, { entry: entry, onOpen: () => openTask(entry.taskId) }, `${entry.taskId}-${entry.event.timestamp}-${idx}`)))
                            : mockRunActivity.map((r) => (_jsxs("div", { className: "task", children: [_jsx("strong", { children: r.label }), _jsx("div", { className: "sub", children: r.detail })] }, r.label))) })] }), _jsx(SubagentsPanel, { hasBridge: hasBridge, onOpen: openTask }), _jsx(NeedsAttentionPanel, { hasBridge: hasBridge, onOpen: openTask })] }));
}
/**
 * Subagents — flat list of in-flight + recently-completed subagent
 * effects across all tasks. Sources both SDK journal effects
 * (bs:journal:effect_requested → resolved_ok/error) and pi spawn/complete
 * events. Sorted running-first, then most-recent.
 *
 * Rendered as compact rows with a status icon, label, parent task id,
 * and elapsed/duration. Hidden when there's nothing to show — keeps
 * the rail tight when no agent has spawned a subagent yet.
 */
function SubagentsPanel({ hasBridge, onOpen, }) {
    const { perTask } = useAllTaskEvents();
    const cutoff = Date.now() - 6 * 3600_000; // last 6h
    const rows = [];
    for (const [taskId, events] of perTask.entries()) {
        for (const s of deriveSubagents(events)) {
            const ts = s.endedAt ?? s.startedAt;
            if (ts && new Date(ts).getTime() < cutoff)
                continue;
            rows.push({ ...s, taskId });
        }
    }
    rows.sort((a, b) => {
        if (a.status === "running" && b.status !== "running")
            return -1;
        if (b.status === "running" && a.status !== "running")
            return 1;
        const aT = a.endedAt ?? a.startedAt ?? "";
        const bT = b.endedAt ?? b.startedAt ?? "";
        return bT.localeCompare(aT);
    });
    if (!hasBridge || rows.length === 0)
        return null;
    return (_jsxs("div", { className: "group", style: { marginTop: 14 }, children: [_jsx("h3", { children: "Subagents" }), _jsx("div", { className: "task-list", style: { marginTop: 10, display: "grid", gap: 6 }, children: rows.slice(0, 8).map((r) => (_jsxs("button", { onClick: () => onOpen(r.taskId), className: "task", style: {
                        display: "grid",
                        gridTemplateColumns: "16px 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "8px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                    }, title: `${r.label} — open ${r.taskId}`, children: [_jsx("span", { style: { color: subagentColor(r.status) }, children: subagentIcon(r.status) }), _jsxs("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: [r.label, r.subtitle && (_jsx("span", { className: "muted", style: { fontSize: 11, marginLeft: 6 }, children: r.subtitle }))] }), _jsx("span", { className: "muted", style: { fontSize: 11, fontVariantNumeric: "tabular-nums" }, children: formatRowTiming(r) })] }, `${r.taskId}-${r.id}`))) })] }));
}
function subagentIcon(status) {
    if (status === "running")
        return "⤴";
    if (status === "failed")
        return "✕";
    return "✓";
}
function subagentColor(status) {
    if (status === "running")
        return "var(--info)";
    if (status === "failed")
        return "var(--bad)";
    return "var(--good)";
}
function formatRowTiming(r) {
    if (r.status === "running" && r.startedAt) {
        const ms = Date.now() - new Date(r.startedAt).getTime();
        return formatShortMs(ms);
    }
    if (r.durationMs !== null)
        return formatShortMs(r.durationMs);
    return "";
}
function formatShortMs(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60)
        return `${sec}s`;
    const min = sec / 60;
    if (min < 60)
        return `${min.toFixed(min < 10 ? 1 : 0)}m`;
    return `${(min / 60).toFixed(1)}h`;
}
/**
 * "Needs attention" — replaces the old static Queue rail with a real list
 * derived from window.mc.listTasks(). Surfaces tasks that block on humans
 * or have failed, in priority order:
 *   1. lane === "approval"   (waiting for review-then-ship sign-off)
 *   2. status === "failed"
 *   3. runState === "paused" (someone hit Pause and walked away)
 * Hidden when there are no real tasks; uses the canned mockQueue so the
 * wireframe still reads the same in static-preview mode.
 */
function NeedsAttentionPanel({ hasBridge, onOpen, }) {
    const [tasks, setTasks] = useState(null);
    async function load() {
        if (!hasBridge)
            return;
        try {
            setTasks(await window.mc.listTasks());
        }
        catch {
            setTasks([]);
        }
    }
    useEffect(() => { void load(); }, [hasBridge]);
    useSubscribe("tasks", () => { void load(); });
    // Static-preview default — keeps the mock for the wireframe.
    if (!hasBridge) {
        return (_jsxs("div", { className: "group", children: [_jsx("h3", { children: "Queue" }), _jsx("div", { className: "task-list", style: { marginTop: 10 }, children: mockQueue.map((q) => (_jsxs("div", { className: "task", children: [_jsx("strong", { children: q.taskId }), _jsx("div", { className: "sub", children: q.detail })] }, q.taskId))) })] }));
    }
    // Reason precedence:
    //   1. user-set blocker — most specific, shown verbatim
    //   2. status === "failed"
    //   3. lane === "approval"
    //   4. runState === "paused"
    // A task with a blocker but no other state still surfaces here so the
    // operator sees what they're tracking even when the task is technically
    // "running" but waiting on something external.
    const flagged = [];
    for (const t of tasks ?? []) {
        const blocker = (t.blocker ?? "").trim();
        if (t.status === "failed") {
            flagged.push({ task: t, reason: blocker || "failed", pill: "bad" });
        }
        else if (t.status === "waiting") {
            flagged.push({ task: t, reason: blocker || "awaiting input", pill: "warn" });
        }
        else if (t.runState === "paused") {
            flagged.push({ task: t, reason: blocker || "paused", pill: "warn" });
        }
        else if (blocker) {
            flagged.push({ task: t, reason: blocker, pill: "warn" });
        }
    }
    // Most recently updated first — fresh blockers > stale ones.
    flagged.sort((a, b) => b.task.updatedAt.localeCompare(a.task.updatedAt));
    return (_jsxs("div", { className: "group", children: [_jsx("h3", { children: "Needs attention" }), _jsx("div", { className: "task-list", style: { marginTop: 10 }, children: flagged.length === 0 ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "6px 2px" }, children: "Nothing waiting on you." })) : (flagged.map(({ task, reason, pill }) => (_jsxs("div", { className: "task", role: "button", tabIndex: 0, onClick: () => onOpen(task.id), onKeyDown: (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpen(task.id);
                        }
                    }, style: { cursor: "pointer" }, title: `Open task ${task.id}`, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("strong", { style: { fontSize: 12 }, children: task.id }), _jsx("span", { className: `pill ${pill}`, style: { marginLeft: "auto", marginRight: 0 }, children: reason })] }), _jsx("div", { className: "sub", style: { fontSize: 12 }, children: task.title })] }, task.id)))) })] }));
}
function LiveRow({ entry, onOpen, }) {
    const { taskId, event } = entry;
    const time = new Date(event.timestamp).toLocaleTimeString();
    const highlighted = HIGHLIGHT_TYPES.has(event.type);
    const icon = iconForEvent(event.type);
    return (_jsxs("div", { className: "task", role: "button", tabIndex: 0, onClick: onOpen, onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
            }
        }, style: {
            cursor: "pointer",
            ...(highlighted
                ? { borderLeft: "2px solid var(--accent)", paddingLeft: 12 }
                : {}),
        }, title: `Open task ${taskId}`, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [icon && _jsx("span", { style: { fontSize: 12 }, children: icon }), _jsx("strong", { style: { fontSize: 12 }, children: taskId }), _jsx("span", { className: "muted", style: { fontSize: 11, marginLeft: "auto" }, children: time })] }), _jsx("div", { className: "sub", style: { fontSize: 12 }, children: event.type }), summarizePayload(event) && (_jsx("div", { className: "muted", style: { fontSize: 11, marginTop: 2 }, children: summarizePayload(event) }))] }));
}
/** One-glyph icon hint for high-signal event types. */
function iconForEvent(type) {
    if (type === "run-started" || type === "item-started" || type === "step:start")
        return "▶";
    if (type === "run-ended" || type === "item-ended" || type === "step:end")
        return "■";
    if (type === "step:agent-end")
        return "⋯";
    if (type === "run-paused")
        return "⏸";
    if (type === "run-resumed")
        return "▷";
    if (type === "lane-changed")
        return "→";
    if (type === "pi:subagent_spawn")
        return "⤴";
    if (type === "pi:subagent_complete")
        return "⤵";
    if (type === "pi:tool_execution_start")
        return "⚙";
    if (type === "pi:tool_execution_end")
        return "✓";
    if (type === "interrupted")
        return "⚠";
    if (type === "blocker-changed")
        return "🚧";
    // Curated-workflow CLI signals (spawned babysitter harness:create-run)
    if (type === "bs:phase")
        return "◇";
    if (type === "bs:error")
        return "✕";
    if (type === "bs:log" || type === "bs:stdout" || type === "bs:stderr")
        return "·";
    // SDK journal events from `<runPath>/journal/*.jsonl` (subagents,
    // breakpoints, process-level messages — see journal-reader.ts).
    if (type === "bs:journal:effect_requested")
        return "⚙";
    if (type === "bs:journal:effect_resolved_ok")
        return "✓";
    if (type === "bs:journal:effect_resolved_error")
        return "✕";
    if (type === "bs:journal:breakpoint_opened")
        return "⏸";
    if (type === "bs:journal:breakpoint_responded")
        return "▷";
    if (type === "bs:journal:process_completed")
        return "■";
    if (type === "bs:journal:process_failed")
        return "✕";
    if (type === "bs:journal:process_log")
        return "·";
    if (type.startsWith("bs:journal:"))
        return "◆";
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
function summarizePayload(event) {
    const record = event;
    // Curated-workflow CLI events from RunManager.startCuratedWorkflow.
    if (event.type === "bs:phase" || event.type === "bs:error") {
        const phase = typeof record.phase === "string" ? `phase ${record.phase}` : "";
        const status = typeof record.status === "string" ? ` · ${record.status}` : "";
        const harness = typeof record.harness === "string" ? ` · ${record.harness}` : "";
        const err = typeof record.error === "string" ? ` · ${record.error}` : "";
        return `${phase}${status}${harness}${err}`.trim() || "(no detail)";
    }
    if (event.type === "bs:log" || event.type === "bs:stdout" || event.type === "bs:stderr") {
        if (typeof record.line === "string") {
            return record.line.length > 80 ? `${record.line.slice(0, 77)}…` : record.line;
        }
        if (typeof record.message === "string")
            return record.message;
    }
    // SDK journal events — payload lives under `data` (see journal-reader.ts).
    if (event.type.startsWith("bs:journal:")) {
        const data = record.data ?? {};
        const effectId = typeof data.effectId === "string" ? data.effectId : null;
        if (event.type === "bs:journal:effect_requested") {
            const kind = typeof data.kind === "string" ? data.kind : "effect";
            const taskDef = data.taskDef;
            const title = taskDef?.title ?? taskDef?.name ?? effectId ?? "(unnamed)";
            return `${kind}: ${title}`;
        }
        if (event.type === "bs:journal:effect_resolved_ok" && effectId) {
            return `done: ${effectId}`;
        }
        if (event.type === "bs:journal:effect_resolved_error") {
            const err = data.error;
            return err?.message ?? err?.name ?? `failed: ${effectId ?? "?"}`;
        }
        if (event.type === "bs:journal:breakpoint_opened") {
            const expert = typeof data.expert === "string" ? ` · ${data.expert}` : "";
            const payload = data.payload;
            return `awaiting${expert}${payload?.title ? ` · ${payload.title}` : ""}`;
        }
        if (event.type === "bs:journal:breakpoint_responded") {
            const approved = data.approved === true ? "approved" : "rejected";
            const respondedBy = typeof data.respondedBy === "string" ? ` by ${data.respondedBy}` : "";
            return `${approved}${respondedBy}`;
        }
        if (event.type === "bs:journal:process_log") {
            const label = typeof data.label === "string" ? `[${data.label}] ` : "";
            const message = typeof data.message === "string" ? data.message : "";
            const text = `${label}${message}`;
            return text.length > 80 ? `${text.slice(0, 77)}…` : text;
        }
        if (event.type === "bs:journal:process_failed") {
            const err = data.error;
            return err?.message ?? "process failed";
        }
        return effectId ?? "";
    }
    // Structural: lane + run events
    if (typeof record.from === "string" && typeof record.to === "string") {
        return `${record.from} → ${record.to}`;
    }
    if (typeof record.reason === "string")
        return `reason: ${record.reason}`;
    // Tool-execution events (babysitter drives a lot of these)
    if (typeof record.toolName === "string") {
        const inputSummary = typeof record.toolInput === "object" && record.toolInput
            ? ` ${summarizeToolInput(record.toolInput)}`
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
    // Parallel step coordination events
    if (typeof record.stepId === "string") {
        const step = String(record.stepId);
        if (event.type === "step:start") {
            const expected = typeof record.expected === "number" ? ` · 0/${record.expected}` : "";
            return `${step}${expected}`;
        }
        if (event.type === "step:agent-end") {
            const agent = typeof record.agent === "string" ? ` · ${record.agent}` : "";
            const progress = typeof record.completed === "number" && typeof record.failed === "number" && typeof record.expected === "number"
                ? ` · ${record.completed + record.failed}/${record.expected}`
                : "";
            const status = typeof record.status === "string" ? ` · ${record.status}` : "";
            return `${step}${agent}${progress}${status}`;
        }
        if (event.type === "step:end") {
            const summary = typeof record.completed === "number" && typeof record.failed === "number" && typeof record.expected === "number"
                ? ` · ${record.completed} ok / ${record.failed} failed / ${record.expected} total`
                : "";
            const status = typeof record.status === "string" ? ` · ${record.status}` : "";
            return `${step}${status}${summary}`;
        }
    }
    // Pi message events — pull model + role from the nested message.
    const msg = record.message;
    if (msg && typeof msg === "object") {
        const role = typeof msg.role === "string" ? msg.role : "";
        const model = typeof msg.model === "string" ? ` · ${msg.model}` : "";
        const usage = msg.usage;
        if (usage && typeof usage.input === "number") {
            const cost = usage.cost;
            const total = typeof cost?.total === "number" ? ` · $${cost.total.toFixed(4)}` : "";
            return `${role}${model} · ${usage.input} in / ${usage.output} out${total}`;
        }
        if (role || model)
            return `${role}${model}`.trim();
    }
    if (typeof record.agentSlug === "string")
        return `agent: ${record.agentSlug}`;
    return "";
}
/** Short one-liner for a tool_execution_start's toolInput blob. */
function summarizeToolInput(input) {
    // Prefer a path/command/name field when present.
    for (const key of ["path", "file_path", "command", "query", "name"]) {
        const v = input[key];
        if (typeof v === "string") {
            return v.length > 40 ? `${key}=${v.slice(0, 37)}…` : `${key}=${v}`;
        }
    }
    return "";
}
