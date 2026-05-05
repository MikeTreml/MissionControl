import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * App shell — 3 columns (Sidebar | Main | RightBar). Main content swaps
 * based on the current view id. Sidebar + RightBar persist across views.
 *
 * Router: see ./router.ts. Just a React context with {view, setView}.
 * Simple enough that we don't need React Router or history API.
 */
import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { RightBar } from "./components/RightBar";
import { Toaster } from "./components/Toaster";
import { ContextStrip } from "./components/ContextStrip";
import { CommandBar } from "./components/CommandBar";
import { CommandPalette } from "./components/CommandPalette";
import { Dashboard } from "./pages/Dashboard";
import { LibraryBrowser } from "./pages/Library";
import { ProjectDetail } from "./pages/ProjectDetail";
import { TaskDetail } from "./pages/TaskDetail";
import { Metrics } from "./pages/Metrics";
import { SettingsGlobal, SettingsModels, SettingsAgents } from "./pages/Settings";
import { RunHistory } from "./pages/RunHistory";
import { Handoffs } from "./pages/Handoffs";
import { RouteContext } from "./router";
// `window.mc` type is declared in ./global.d.ts — preload exposes it.
function CurrentView({ view }) {
    switch (view) {
        case "dashboard": return _jsx(Dashboard, {});
        case "library": return _jsx(LibraryBrowser, {});
        case "project": return _jsx(ProjectDetail, {});
        case "task": return _jsx(TaskDetail, {});
        case "metrics": return _jsx(Metrics, {});
        case "settings-global": return _jsx(SettingsGlobal, {});
        case "settings-models": return _jsx(SettingsModels, {});
        case "settings-agents": return _jsx(SettingsAgents, {});
        case "run-history": return _jsx(RunHistory, {});
        case "handoffs": return _jsx(Handoffs, {});
    }
}
export function App() {
    const [view, setView] = useState("dashboard");
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const openTask = (id) => {
        setSelectedTaskId(id);
        setView("task");
    };
    const openProject = (id) => {
        setSelectedProjectId(id);
        setView("project");
    };
    return (_jsx(RouteContext.Provider, { value: {
            view,
            selectedTaskId,
            selectedProjectId,
            setView,
            openTask,
            openProject,
        }, children: _jsxs(_Fragment, { children: [_jsx(ContextStrip, {}), _jsxs("div", { className: "app-shell", children: [_jsx(Sidebar, {}), _jsx("main", { className: "main", children: _jsx(CurrentView, { view: view }) }), _jsx(RightBar, {})] }), _jsx(CommandBar, {}), _jsx(CommandPalette, {}), _jsx(Toaster, {})] }) }));
}
