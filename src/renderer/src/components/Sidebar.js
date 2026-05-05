import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Left rail — projects list, workspace nav, system nav, identity footer.
 *
 * Layout matches NewUI/Mission Control Design System/ui_kits/mission-control/
 * (sections labeled `Projects · N` / `Workspace` / `System`; nav-items with
 * mono-glyph + label + optional badge; user-identity footer pinned bottom).
 *
 * Project accent: `colorForKey(prefix)` is injected as `--proj-accent`
 * inline-style, picked up by the `.proj-row .dot` and active-row left bar.
 *
 * Workspace nav items wire to existing routes where they exist; "Run history"
 * and "Hand-offs" are stubbed disabled until those views land.
 */
import { useEffect, useState } from "react";
import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";
import { AddProjectForm } from "./AddProjectForm";
import { colorForKey } from "../lib/color-hash";
export function Sidebar() {
    const { view, setView, selectedProjectId, openProject } = useRoute();
    const { projects, isDemo } = useProjects();
    const { tasks } = useTasks();
    const [addProjectOpen, setAddProjectOpen] = useState(false);
    const [appVersion, setAppVersion] = useState("");
    useEffect(() => {
        void (async () => {
            try {
                if (!window.mc)
                    return;
                setAppVersion(await window.mc.appVersion());
            }
            catch {
                setAppVersion("");
            }
        })();
    }, []);
    // Open-task counts per project (anything not in the Done lane).
    const openByProject = new Map();
    for (const t of tasks) {
        if (t.lane === "Done")
            continue;
        openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
    }
    // Total open tasks for the Board badge.
    const totalOpen = [...openByProject.values()].reduce((a, b) => a + b, 0);
    const runningCount = tasks.filter((t) => t.runState === "running").length;
    return (_jsxs("aside", { className: "sidebar", children: [isDemo && (_jsxs("div", { className: "demo-banner", children: [_jsx("b", { children: "Demo data" }), _jsx("div", { className: "muted", style: { fontSize: 11, marginTop: 2 }, children: "Click + to add a project." })] })), _jsxs("div", { children: [_jsxs("div", { className: "sidebar-section-head", children: [_jsxs("div", { className: "section-label", children: ["Projects \u00B7 ", projects.length] }), _jsx("button", { className: "button ghost", onClick: () => setAddProjectOpen(true), title: "Add project", style: { padding: "2px 8px", fontSize: 14, lineHeight: 1, minWidth: 24 }, children: "+" })] }), _jsx(AddProjectForm, { open: addProjectOpen, onClose: () => setAddProjectOpen(false) }), _jsxs("div", { className: "proj-list", children: [projects.map((p) => {
                                const accent = colorForKey(p.prefix);
                                const isActive = view === "project" && selectedProjectId === p.id;
                                return (_jsxs("button", { className: isActive ? "proj-row active" : "proj-row", onClick: () => openProject(p.id), style: { ["--proj-accent"]: accent }, title: `${p.name} — ${p.sourceHint}`, children: [_jsx("span", { className: "dot" }), _jsx("span", { className: "name", children: p.name }), openByProject.get(p.id) ? (_jsx("span", { className: "count", children: openByProject.get(p.id) })) : (_jsx("span", { className: "count" }))] }, p.id));
                            }), projects.length === 0 && !isDemo && (_jsxs("div", { className: "muted", style: {
                                    fontSize: 12,
                                    padding: "10px",
                                    borderRadius: 8,
                                    background: "var(--raised)",
                                    boxShadow: "var(--lift)",
                                    display: "grid",
                                    gap: 6,
                                }, children: [_jsx("div", { children: "No projects yet." }), _jsx("button", { className: "button ghost", onClick: () => setAddProjectOpen(true), style: { fontSize: 12, padding: "4px 8px", justifySelf: "start" }, children: "+ Add your first project" })] }))] })] }), _jsxs("div", { children: [_jsx("div", { className: "section-label", children: "Workspace" }), _jsxs("div", { className: "nav-list", children: [_jsx(NavItem, { glyph: "\uD83D\uDCCB", label: "Board", badge: totalOpen, active: view === "dashboard", onClick: () => setView("dashboard") }), _jsx(NavItem, { glyph: "\uD83D\uDCDA", label: "Library", active: view === "library", onClick: () => setView("library") }), _jsx(NavItem, { glyph: "\u23F1\uFE0F", label: "Run history", active: view === "run-history", onClick: () => setView("run-history") }), _jsx(NavItem, { glyph: "\uD83E\uDD1D", label: "Hand-offs", badge: tasks.filter((t) => t.boardStage === "Review" || t.boardStage === "Blocked").length, active: view === "handoffs", onClick: () => setView("handoffs") })] })] }), _jsxs("div", { children: [_jsx("div", { className: "section-label", children: "System" }), _jsxs("div", { className: "nav-list", children: [_jsx(NavItem, { glyph: "\uD83E\uDDE0", label: "Models", active: view === "settings-models", onClick: () => setView("settings-models") }), _jsx(NavItem, { glyph: "\uD83E\uDD16", label: "Agents", active: view === "settings-agents", onClick: () => setView("settings-agents") }), _jsx(NavItem, { glyph: "\u2699\uFE0F", label: "Settings", active: view === "settings-global", onClick: () => setView("settings-global") }), _jsx(NavItem, { glyph: "\uD83D\uDCCA", label: "Metrics", active: view === "metrics", onClick: () => setView("metrics") })] })] }), _jsxs("div", { className: "sidebar-footer", children: [_jsx("div", { className: "avatar", children: "MT" }), _jsxs("div", { className: "who", children: [_jsx("div", { className: "name", children: "Michael Treml" }), _jsx("div", { className: "status", children: runningCount > 0
                                    ? `${runningCount} agent${runningCount === 1 ? "" : "s"} running`
                                    : appVersion
                                        ? `v${appVersion}`
                                        : "idle" })] })] })] }));
}
function NavItem({ glyph, label, badge, active, onClick, disabled, tooltip, }) {
    // Use a real <button> so keyboard nav + disabled state are free.
    return (_jsxs("button", { className: active ? "nav-item active" : "nav-item", onClick: onClick, disabled: disabled, title: tooltip ?? label, type: "button", children: [_jsx("span", { className: "glyph", children: glyph }), _jsx("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: label }), typeof badge === "number" && badge > 0 && _jsx("span", { className: "badge", children: badge })] }));
}
