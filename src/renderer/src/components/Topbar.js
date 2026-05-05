import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Top chrome on the Dashboard surface. Markup matches the v2 design
 * canvas (NewUI/Mission Control Design System/ui_kits/mission-control):
 *
 *   .topbar
 *     .crumbs   Workspace / [project] / Board
 *     .actions  bridge-dot · attention pill · search · filter · + New task
 *
 * Per-page navigation (Library / Metrics / Settings) lives in the
 * sidebar Workspace + System sections — removed from here to avoid the
 * mockup's "two nav surfaces" smell.
 */
import { useEffect, useState } from "react";
import { useRoute } from "../router";
import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { CreateTaskForm } from "./CreateTaskForm";
import { openCommandPalette } from "./CommandPalette";
export function Topbar() {
    const { setView, selectedProjectId } = useRoute();
    const [createOpen, setCreateOpen] = useState(false);
    const [bridgeOk, setBridgeOk] = useState(Boolean(window.mc));
    const { tasks, isDemo: tasksDemo, loading: tasksLoading } = useTasks();
    const { projects, isDemo: projectsDemo, loading: projectsLoading } = useProjects();
    const isDemo = tasksDemo && projectsDemo;
    const settled = !tasksLoading && !projectsLoading;
    const [hasBeenReal, setHasBeenReal] = useState(false);
    useEffect(() => {
        if (settled && !isDemo)
            setHasBeenReal(true);
    }, [settled, isDemo]);
    const demoRegressed = settled && isDemo && hasBeenReal;
    const attentionTasks = tasks.filter((t) => !tasksDemo &&
        (t.boardStage === "Review" || t.boardStage === "Blocked") &&
        t.status !== "archived");
    const attentionCount = attentionTasks.length;
    useEffect(() => {
        setBridgeOk(Boolean(window.mc));
    }, []);
    // Crumbs: "Workspace / [project name when selected] / Board".
    const activeProject = selectedProjectId
        ? projects.find((p) => p.id === selectedProjectId)
        : null;
    return (_jsxs("div", { className: "topbar", children: [_jsxs("div", { className: "crumbs", children: [_jsx("span", { children: "Workspace" }), activeProject && (_jsxs(_Fragment, { children: [_jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: activeProject.name })] })), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { className: "now", children: "Board" })] }), _jsxs("div", { className: "actions", children: [_jsx("span", { title: bridgeOk ? "Connected to main process" : "Preload not loaded — check terminal", "aria-label": bridgeOk ? "Bridge connected" : "Bridge offline", style: {
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: bridgeOk ? "var(--good)" : "var(--bad)",
                            boxShadow: `0 0 0 2px ${bridgeOk ? "rgba(93, 191, 138,0.25)" : "rgba(232, 116, 116,0.25)"}`,
                            flex: "0 0 auto",
                        } }), attentionCount > 0 && (_jsxs("button", { className: "pill warn", onClick: () => setView("dashboard"), title: attentionCount === 1
                            ? `1 task awaiting input — ${attentionTasks[0].id}`
                            : `${attentionCount} tasks awaiting input`, style: { fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }, children: ["\u26A0 ", attentionCount, " awaiting input"] })), demoRegressed && (_jsx("span", { className: "pill bad", title: "The app was showing real data and just fell back to demo data \u2014 likely an IPC error.", style: { fontSize: 11, fontWeight: 600 }, children: "\u26A0 Demo fallback active" })), _jsxs("button", { className: "search", type: "button", title: "Search tasks, projects, and library \u2014 \u2318K", onClick: () => openCommandPalette(), children: [_jsx("span", { className: "glyph", children: "\u2315" }), _jsx("span", { children: "Search tasks, projects, library" }), _jsx("span", { className: "kbd", children: "\u2318K" })] }), _jsx("button", { className: "btn primary", onClick: () => setCreateOpen(true), children: "+ New task" }), _jsx(CreateTaskForm, { open: createOpen, onClose: () => setCreateOpen(false) })] })] }));
}
