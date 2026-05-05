import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useTasks } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useRoute } from "../router";
import { TaskCard } from "./TaskCard";
import { SkeletonCard } from "./Skeleton";
import { buildRunningHistory, buildShippedHistory, DEMO_RUNNING_CHIPS, DEMO_SHIPPED_CHIPS, } from "../lib/lane-history";
// 6-lane Kanban (matches NewUI canvas): Drafting / Running / Review /
// Blocked / Done / Archived. Archived is always rendered — empty state
// reads "All older runs live here. Search to find one." per the canvas.
// "Failed" is a 7th lane that's only shown when there are failed tasks.
const DEFAULT_STAGES = ["Drafting", "Running", "Review", "Blocked", "Done", "Archived"];
function groupByStage(tasks) {
    const out = {
        Drafting: [], Running: [], Review: [], Blocked: [], Failed: [], Done: [], Archived: [],
    };
    for (const t of tasks)
        out[t.boardStage].push(t);
    return out;
}
export function Board() {
    const { tasks, isDemo, loading } = useTasks();
    const byStage = groupByStage(tasks);
    const failedCount = byStage.Failed.length;
    return (_jsxs("section", { "data-surface-content": "board", children: [isDemo && (_jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 12 }, children: _jsx("span", { className: "pill warn", children: "Demo" }) })), _jsx(KanbanView, { byStage: byStage, tasks: tasks, isDemo: isDemo, showFailed: failedCount > 0, loadingCold: loading && tasks.length === 0 })] }));
}
function KanbanView({ byStage, tasks, isDemo, showFailed, loadingCold, }) {
    const { perTask } = useAllTaskEvents();
    const stages = [...DEFAULT_STAGES];
    if (showFailed)
        stages.splice(stages.indexOf("Done"), 0, "Failed");
    // Lane history strips: Running → recent runs · last 24h, Done → shipped · last 7d.
    // Demo mode shows the canvas's hardcoded chips so the strip isn't empty.
    const runningChips = isDemo ? DEMO_RUNNING_CHIPS : buildRunningHistory(perTask);
    const shippedChips = isDemo ? DEMO_SHIPPED_CHIPS : buildShippedHistory(tasks);
    return (_jsx("div", { className: "lanes", children: stages.map((stage) => (_jsxs("div", { className: "lane", children: [_jsxs("div", { className: "lane-head", children: [_jsx("span", { className: "title", children: stage }), _jsx("span", { className: "count", children: loadingCold ? "" : byStage[stage].length })] }), loadingCold ? (_jsxs("div", { style: { display: "grid", gap: 10 }, children: [_jsx(SkeletonCard, {}), _jsx(SkeletonCard, {})] })) : (_jsxs(_Fragment, { children: [byStage[stage].length === 0 ? (stage === "Archived" ? (_jsxs("div", { className: "empty-state", style: { padding: "32px 12px" }, children: [_jsx("div", { className: "glyph", children: "\u25A4" }), _jsx("div", { className: "body", style: { fontSize: 12 }, children: "All older runs live here. Search to find one." })] })) : (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "6px 2px" }, children: "\u2014" }))) : null, byStage[stage].map((t) => (_jsx(TaskCard, { task: t }, t.id))), stage === "Running" && runningChips.length > 0 && (_jsx(LaneHistory, { label: "Recent runs \u00B7 last 24h", chips: runningChips })), stage === "Done" && shippedChips.length > 0 && (_jsx(LaneHistory, { label: "Shipped \u00B7 last 7d", chips: shippedChips }))] }))] }, stage))) }));
}
function LaneHistory({ label, chips }) {
    const { openTask } = useRoute();
    return (_jsxs("div", { className: "lane-history", children: [_jsx("div", { className: "label", children: label }), _jsx("div", { className: "strip", children: chips.map((c, i) => (_jsxs("button", { className: "chip", "data-state": c.state, onClick: () => openTask(c.taskId), title: `Open ${c.taskId}`, children: [_jsxs("div", { className: "top", children: [_jsx("span", { className: "dot" }), c.taskId] }), _jsx("div", { className: "when", children: c.whenLabel })] }, `${c.taskId}-${i}`))) })] }));
}
