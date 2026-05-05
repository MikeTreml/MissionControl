import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Project Detail — "how is this project doing over time?"
 *
 * KPIs are computed from the task list (filtered by selectedProjectId).
 * Throughput is a simple SVG bar chart derived from createdAt/updatedAt.
 * Stuck tasks = lane=approval OR idle > 24h.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoute } from "../router";
import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { useSubscribe } from "../hooks/data-bus";
import { PageStub } from "./PageStub";
import { AddProjectForm } from "../components/AddProjectForm";
import { SkeletonLine, SkeletonBlock } from "../components/Skeleton";
import { ProjectMemoryCard } from "../components/ProjectMemoryCard";
import { ProjectDecisionPolicySchema } from "../../../shared/models";
export function ProjectDetail() {
    const { selectedProjectId, setView } = useRoute();
    const { projects, isDemo: projectsDemo, loading: projectsLoading } = useProjects();
    const { tasks, isDemo: tasksDemo } = useTasks();
    const [editOpen, setEditOpen] = useState(false);
    const [runMetricsRollup, setRunMetricsRollup] = useState(null);
    const [rollupError, setRollupError] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const project = useMemo(() => selectedProjectId
        ? projects.find((p) => p.id === selectedProjectId)
        : projects[0], [projects, selectedProjectId]);
    const isDemo = projectsDemo || tasksDemo;
    // Close the edit modal + bounce back to the dashboard if the project was
    // deleted (project will no longer appear in the list).
    useEffect(() => {
        if (selectedProjectId && projects.length > 0 && !project) {
            // Deleted while we were on it; go home.
            setEditOpen(false);
            setView("dashboard");
        }
    }, [project, selectedProjectId, projects.length, setView]);
    // Load + reload run-metrics rollup. Hooks live up here (above any early
    // return) so the hook count is identical on every render — React enforces
    // this. The callback is still safe when `project` is null: it bails out
    // and clears the rollup state.
    const loadRunMetricsRollup = useCallback(async () => {
        if (!window.mc || isDemo || !project?.id) {
            setRunMetricsRollup(null);
            setRollupError("");
            return;
        }
        setRollupError("");
        try {
            const rollup = await window.mc.aggregateProjectRunMetrics(project.id);
            setRunMetricsRollup(rollup);
        }
        catch (e) {
            setRunMetricsRollup(null);
            setRollupError(e instanceof Error ? e.message : String(e));
        }
    }, [project?.id, isDemo]);
    useEffect(() => {
        void loadRunMetricsRollup();
    }, [loadRunMetricsRollup]);
    useSubscribe("tasks", () => {
        void loadRunMetricsRollup();
    });
    // Skeleton while projects are still loading and we don't have a hit yet.
    // Distinguishes "loading" from "really not found" — the former resolves
    // shortly; the latter is final.
    if (!project && projectsLoading) {
        return (_jsxs(_Fragment, { children: [_jsx("div", { className: "topbar", children: _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx(SkeletonLine, { width: "35%", height: "1.6em", marginBottom: 6 }), _jsx(SkeletonLine, { width: "20%", height: "0.85em" })] }) }), _jsxs("div", { className: "content", children: [_jsx("section", { className: "card-grid", children: Array.from({ length: 6 }, (_, i) => (_jsxs("div", { className: "card", children: [_jsx(SkeletonLine, { width: "50%", height: "0.8em", marginBottom: 6 }), _jsx(SkeletonLine, { width: "80%", height: "1.4em" })] }, i))) }), _jsx(SkeletonBlock, { height: 140 }), _jsx(SkeletonBlock, { height: 180 })] })] }));
    }
    if (!project) {
        return (_jsx(PageStub, { title: "Project not found", purpose: "Pick a project from the sidebar." }));
    }
    // CONFIRMED: ProjectDetail is scoped to a single project. Tasks carry their
    // project slug on UiTask.projectId (added in useTasks). Demo tasks all share
    // projectId === "demo" so they still show when we're in demo mode.
    const allProjectTasks = project
        ? tasks.filter((t) => t.projectId === project.id || (tasksDemo && t.projectId === "demo"))
        : [];
    const archivedCount = allProjectTasks.filter((t) => t.status === "archived").length;
    // Default: hide archived from stats and tables. Toggle includes them.
    const projectTasks = showArchived
        ? allProjectTasks
        : allProjectTasks.filter((t) => t.status !== "archived");
    const stats = computeStats(projectTasks);
    // UiProject doesn't carry gitInfo — fetch the full ProjectWithGit for the
    // edit form by finding the raw project in the real list if available,
    // otherwise synthesize a minimal one (edit form tolerates missing gitInfo).
    const editingSubject = project
        ? {
            id: project.id,
            name: project.name,
            prefix: project.prefix,
            path: project.path,
            icon: project.icon,
            notes: project.notes,
            policy: ProjectDecisionPolicySchema.parse({}),
            isSample: false,
            gitInfo: { kind: "none", label: "", remoteUrl: "" },
        }
        : undefined;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { children: [_jsxs("h1", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [project.icon && _jsx("span", { style: { fontSize: 22 }, children: project.icon }), _jsx("span", { children: project.name }), _jsx("span", { className: "pill info", style: { fontSize: 13, letterSpacing: 0.5 }, children: project.prefix })] }), _jsxs("p", { className: "muted", children: ["How is this project doing over time?", isDemo && " · demo data"] })] }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { className: "button ghost", onClick: () => {
                                    console.log("[ProjectDetail] Edit clicked", {
                                        project,
                                        projectsDemo,
                                        editingSubject,
                                    });
                                    setEditOpen(true);
                                }, 
                                // Disable only when the projects LIST is demo (nothing real to edit).
                                // `isDemo` also includes `tasksDemo` which would wrongly block
                                // editing a real project that simply has no tasks yet.
                                disabled: projectsDemo, title: projectsDemo ? "Can't edit demo projects — create a real one first" : "Edit this project", children: "\u270E Edit" }), _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" })] }), _jsx(AddProjectForm, { open: editOpen, onClose: () => setEditOpen(false), editing: editingSubject })] }), _jsxs("div", { className: "content", children: [_jsx(ProjectMemoryCard, { projectId: project.id, isDemo: isDemo }), projectTasks.length === 0 && !isDemo && (_jsxs("section", { className: "card", style: {
                            border: "1px dashed var(--border)",
                            background: "var(--panel-2)",
                            display: "grid",
                            gap: 6,
                        }, children: [_jsx("div", { style: { fontWeight: 500 }, children: "No tasks for this project yet." }), _jsxs("div", { className: "muted", style: { fontSize: 12 }, children: ["Use the ", _jsx("strong", { children: "+ Create Task" }), " button in the topbar to add one \u2014 pick this project from the picker so it lands here."] })] })), _jsxs("section", { className: "card-grid", children: [_jsx(Kpi, { label: "Tasks total", value: stats.total }), _jsx(Kpi, { label: "Active", value: stats.active }), _jsx(Kpi, { label: "Done", value: stats.done }), _jsx(Kpi, { label: "Avg cycles", value: stats.avgCycles.toFixed(1) }), _jsx(Kpi, { label: "Avg idle", value: fmtAvgIdle(stats.avgIdleHours) }), _jsx(Kpi, { label: "Stuck (>24h)", value: stats.stuck })] }), !isDemo && (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Run metrics (artifacts)" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["Totals from every task in this project with ", _jsx("code", { children: "artifacts/*.metrics.json" }), " (written when a run ends)."] }), rollupError && (_jsx("p", { className: "muted", style: { marginTop: 8, color: "var(--bad)", fontSize: 12 }, children: rollupError })), !rollupError && runMetricsRollup && runMetricsRollup.metricsArtifactCount === 0 && (_jsx("p", { className: "muted", style: { marginTop: 8, fontSize: 12 }, children: "No metrics artifacts yet. Complete a run to populate this rollup." })), !rollupError && runMetricsRollup && runMetricsRollup.metricsArtifactCount > 0 && (_jsxs("div", { className: "card-grid", style: { marginTop: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }, children: [_jsx(Kpi, { label: "Completed run snapshots", value: runMetricsRollup.metricsArtifactCount }), _jsx(Kpi, { label: "Tasks with metrics", value: runMetricsRollup.tasksWithArtifacts }), _jsx(Kpi, { label: "Tokens (in / out)", value: `${abbreviateTokens(runMetricsRollup.tokensIn)} / ${abbreviateTokens(runMetricsRollup.tokensOut)}` }), _jsx(Kpi, { label: "Wall time (sum)", value: formatDurationSeconds(runMetricsRollup.wallTimeSeconds) }), _jsx(Kpi, { label: "Spend (sum)", value: runMetricsRollup.costUSD > 0 ? `$${runMetricsRollup.costUSD.toFixed(4)}` : "—" })] }))] })), _jsxs("section", { className: "card", children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }, children: [_jsxs("div", { children: [_jsx("h3", { style: { margin: 0 }, children: "Tasks by lane" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Snapshot of where work is sitting right now." })] }), archivedCount > 0 && (_jsx("button", { className: "button ghost", onClick: () => setShowArchived((v) => !v), title: showArchived ? "Hide archived from stats and tables" : "Include archived in stats and tables", style: { fontSize: 12 }, children: showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})` }))] }), _jsx(LaneBars, { tasks: projectTasks })] }), _jsxs("section", { className: "card", children: [_jsx("h3", { children: "Stuck tasks" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "In Approval or idle more than 24 hours. Click to jump to Task Detail." }), _jsx(StuckTable, { tasks: projectTasks })] })] })] }));
}
function Kpi({ label, value }) {
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "muted", children: label }), _jsx("div", { className: "kpi", children: value })] }));
}
function abbreviateTokens(n) {
    if (n < 1_000)
        return n.toLocaleString();
    if (n < 1_000_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
function formatDurationSeconds(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60)
        return rem ? `${m}m ${rem}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}
function LaneBars({ tasks }) {
    // Match the post-Phase-10 UiTask.lane axis (run-state / status derived
    // in useTasks.deriveLaneStyle), not the old kanban-lane vocabulary.
    const lanes = ["Idle", "Running", "Waiting", "Done", "Failed"];
    const counts = lanes.map((lane) => ({
        lane,
        count: tasks.filter((t) => t.lane === lane).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return (_jsx("div", { style: { display: "grid", gap: 8, marginTop: 10 }, children: counts.map((c) => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "100px 1fr 40px", gap: 10, alignItems: "center" }, children: [_jsx("div", { className: "muted", children: c.lane }), _jsx("div", { style: {
                        height: 14,
                        background: "var(--panel)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        position: "relative",
                        overflow: "hidden",
                    }, children: _jsx("div", { style: {
                            width: `${(c.count / max) * 100}%`,
                            height: "100%",
                            background: "var(--accent)",
                            transition: "width 0.3s",
                        } }) }), _jsx("div", { style: { textAlign: "right", fontWeight: 600 }, children: c.count })] }, c.lane))) }));
}
function StuckTable({ tasks }) {
    const now = Date.now();
    const idleHours = (t) => Math.max(0, (now - new Date(t.updatedAt).getTime()) / 3_600_000);
    // Same definition as computeStats: lane=Waiting (paused / blocker /
    // status=waiting derived in useTasks) or idle > 24h while still live.
    const stuck = tasks.filter((t) => t.boardStage !== "Done" &&
        t.boardStage !== "Failed" &&
        t.boardStage !== "Archived" &&
        (t.boardStage === "Blocked" || t.boardStage === "Review" || idleHours(t) > 24));
    const { openTask } = useRoute();
    if (stuck.length === 0) {
        return _jsx("p", { className: "muted", style: { marginTop: 10 }, children: "No stuck tasks." });
    }
    const fmtIdle = (h) => h < 1 ? `${Math.round(h * 60)}m`
        : h < 24 ? `${h.toFixed(1)}h`
            : `${(h / 24).toFixed(1)}d`;
    return (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)", textAlign: "left" }, children: [_jsx("th", { style: { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }, children: "ID" }), _jsx("th", { style: { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }, children: "Title" }), _jsx("th", { style: { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }, children: "Lane" }), _jsx("th", { style: { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }, children: "Status" }), _jsx("th", { style: { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }, children: "Idle" })] }) }), _jsx("tbody", { children: stuck.map((t) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)", cursor: "pointer" }, onClick: () => openTask(t.id), children: [_jsx("td", { style: { padding: "8px 10px" }, children: _jsx("strong", { children: t.id }) }), _jsx("td", { style: { padding: "8px 10px" }, children: t.summary }), _jsx("td", { style: { padding: "8px 10px" }, children: t.boardStage }), _jsx("td", { style: { padding: "8px 10px" }, children: t.rolePill ? (_jsx("span", { className: `pill ${t.rolePill}`, children: t.roleLabel })) : (_jsx("span", { className: "muted", children: "\u2014" })) }), _jsx("td", { style: { padding: "8px 10px", color: "var(--muted)" }, children: fmtIdle(idleHours(t)) })] }, t.id))) })] }));
}
function computeStats(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.lane === "Done").length;
    const active = total - done;
    // Idle (hours since last write to manifest.json) — used by both the
    // "Avg idle" KPI and the time-based "stuck" check below. Done tasks
    // don't contribute; their idle clock isn't operationally useful.
    const now = Date.now();
    const idleHours = (t) => Math.max(0, (now - new Date(t.updatedAt).getTime()) / 3_600_000);
    const liveTasks = tasks.filter((t) => t.boardStage !== "Done" && t.boardStage !== "Failed" && t.boardStage !== "Archived");
    // "Stuck" = boardStage in {Blocked, Review} OR idle > 24h while still live.
    // Both are operationally useful; either alone misses real cases.
    const stuck = liveTasks.filter((t) => t.boardStage === "Blocked" || t.boardStage === "Review" || idleHours(t) > 24).length;
    const avgCycles = total === 0
        ? 0
        : tasks.reduce((sum, t) => sum + t.cycle, 0) / total;
    const avgIdleHours = liveTasks.length === 0
        ? 0
        : liveTasks.reduce((s, t) => s + idleHours(t), 0) / liveTasks.length;
    return { total, active, done, stuck, avgCycles, avgIdleHours };
}
/** Compact idle formatter: <1h shows minutes; <1d shows hours; ≥1d shows days. */
function fmtAvgIdle(hours) {
    if (hours <= 0)
        return "—";
    if (hours < 1)
        return `${Math.round(hours * 60)}m`;
    if (hours < 24)
        return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
}
// Re-exported for tests / future real-task stats path.
export { computeStats };
