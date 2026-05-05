import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Run history — flat cross-task list of every run-started → run-ended
 * pair, derived from the per-task event journals. Newest first.
 *
 * Today: read-only table with task id, project, started/ended, wall
 * time, reason. Click a row to open the task. Filter by project / by
 * reason is deferred to a later slice.
 */
import { useMemo } from "react";
import { useTasks } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useProjects } from "../hooks/useProjects";
import { useRoute } from "../router";
function deriveRuns(perTask, taskTitle, taskProject) {
    const rows = [];
    for (const [taskId, events] of perTask.entries()) {
        let lastStart = null;
        for (const e of events) {
            if (e.type === "run-started") {
                lastStart = { ts: e.timestamp, ms: new Date(e.timestamp).getTime() };
            }
            else if (e.type === "run-ended" && lastStart !== null) {
                const ended = e.timestamp;
                const endedMs = new Date(ended).getTime();
                const rec = e;
                const reason = typeof rec.reason === "string" ? rec.reason : "completed";
                rows.push({
                    taskId,
                    taskTitle: taskTitle.get(taskId) ?? "(unknown)",
                    projectId: taskProject.get(taskId) ?? "",
                    startedAt: lastStart.ts,
                    endedAt: ended,
                    durationMs: Math.max(0, endedMs - lastStart.ms),
                    reason,
                });
                lastStart = null;
            }
        }
    }
    rows.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    return rows;
}
export function RunHistory() {
    const { tasks, isDemo } = useTasks();
    const { projects } = useProjects();
    const { perTask } = useAllTaskEvents();
    const { setView, openTask } = useRoute();
    const taskTitle = useMemo(() => new Map(tasks.map((t) => [t.id, t.summary])), [tasks]);
    const taskProject = useMemo(() => new Map(tasks.map((t) => [t.id, t.projectId])), [tasks]);
    const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
    const rows = useMemo(() => deriveRuns(perTask, taskTitle, taskProject), [perTask, taskTitle, taskProject]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { className: "crumbs", children: [_jsx("span", { children: "Workspace" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { className: "now", children: "Run history" })] }), _jsx("div", { className: "actions", children: _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" }) })] }), _jsx("div", { className: "content", children: _jsxs("section", { className: "card", children: [_jsxs("h3", { style: { marginBottom: 8 }, children: ["Run history", rows.length > 0 && _jsxs("span", { className: "muted", style: { fontWeight: 400, marginLeft: 8 }, children: ["(", rows.length, ")"] })] }), isDemo && (_jsx("p", { className: "muted", style: { fontSize: 12, marginBottom: 12 }, children: "Sample data shown \u2014 real runs will appear here as tasks complete." })), rows.length === 0 ? (_jsx("div", { className: "muted", style: { padding: "24px 4px", fontSize: 13 }, children: "No completed runs yet." })) : (_jsxs("div", { role: "table", style: { display: "grid", gap: 4 }, children: [_jsxs("div", { role: "row", style: {
                                        display: "grid",
                                        gridTemplateColumns: "minmax(110px, auto) 1fr 110px 90px 90px",
                                        gap: 12,
                                        fontSize: 11,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                        color: "var(--muted)",
                                        padding: "0 8px",
                                    }, children: [_jsx("span", { children: "Task" }), _jsx("span", { children: "Title" }), _jsx("span", { children: "Project" }), _jsx("span", { children: "Wall time" }), _jsx("span", { children: "Reason" })] }), rows.map((r, i) => (_jsxs("button", { role: "row", className: "task", "data-proj": true, onClick: () => openTask(r.taskId), style: {
                                        display: "grid",
                                        gridTemplateColumns: "minmax(110px, auto) 1fr 110px 90px 90px",
                                        alignItems: "center",
                                        gap: 12,
                                        fontSize: 13,
                                        padding: "8px 8px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                    }, children: [_jsx("span", { style: { fontFamily: "var(--font-mono)", fontSize: 12 }, children: r.taskId }), _jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: r.taskTitle }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: projectName.get(r.projectId) ?? r.projectId }), _jsx("span", { className: "muted", style: { fontSize: 12, fontVariantNumeric: "tabular-nums" }, children: formatDuration(r.durationMs) }), _jsx("span", { className: `pill ${reasonPill(r.reason)}`, style: { fontSize: 11 }, children: r.reason })] }, `${r.taskId}-${i}`)))] }))] }) })] }));
}
function reasonPill(reason) {
    if (reason === "completed" || reason === "done")
        return "good";
    if (reason === "failed")
        return "bad";
    if (reason === "interrupted" || reason === "user")
        return "warn";
    return "info";
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60)
        return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60)
        return `${min}m`;
    const hr = min / 60;
    return `${hr.toFixed(1)}h`;
}
