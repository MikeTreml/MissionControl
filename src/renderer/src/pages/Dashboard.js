import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Dashboard — the home view. Composes the same components we already built:
 * Topbar + Board + SelectedTaskPanel, in the content column.
 *
 * Sidebar and RightBar live in App.tsx because they're persistent across
 * every view, not dashboard-specific.
 */
import { Topbar } from "../components/Topbar";
import { Board } from "../components/Board";
import { KpiRow } from "../components/KpiRow";
import { SelectedTaskPanel } from "../components/SelectedTaskPanel";
export function Dashboard() {
    return (_jsxs(_Fragment, { children: [_jsx(Topbar, {}), _jsxs("div", { className: "content", children: [_jsx(KpiRow, {}), _jsx(Board, {}), _jsx(SelectedTaskPanel, {})] })] }));
}
