import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Selected-task panel (below the board on Dashboard). Shows the top-of-list
 * task's meta + its linked files. All data pulled from hooks — no hardcoded
 * titles, roles, or file names.
 *
 * "Top of list" = the first running task, or the first task period, or the
 * sample task. Click through to Task Detail for the full view.
 */
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";
export function SelectedTaskPanel() {
    const { tasks } = useTasks();
    const { openTask } = useRoute();
    const active = tasks.find((t) => t.active) ?? tasks[0];
    if (!active) {
        return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Selected Task" }), _jsx("p", { className: "muted", style: { marginTop: 6 }, children: "No tasks yet. Click \"Create Task\" to add one." })] }));
    }
    const linkedFiles = [{ name: active.id, note: "base manifest" }];
    return (_jsxs("section", { className: "card", style: { display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }, children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Selected Task \u2014 ", active.id] }), _jsxs("p", { className: "muted", style: { marginTop: 4 }, children: ["Lane: ", active.boardStage, active.roleLabel ? ` · ${active.roleLabel}` : ""] }), _jsxs("div", { style: {
                            marginTop: 12,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }, children: [active.rolePill && (_jsx("span", { className: `pill ${active.rolePill}`, children: active.roleLabel })), active.active && active.roleLabel !== "running" && (_jsxs("span", { className: "pill info", children: [_jsx("span", { className: "dot" }), "running"] }))] }), _jsxs("div", { style: { marginTop: 16 }, children: [_jsxs("div", { className: "file", children: [_jsx("strong", { children: "Current step" }), _jsx("div", { className: "muted", children: active.stepLine })] }), active.sub && (_jsxs("div", { className: "file", children: [_jsx("strong", { children: "Sub" }), _jsx("div", { className: "muted", children: active.sub })] })), _jsxs("div", { className: "file", children: [_jsx("strong", { children: "Summary" }), _jsx("div", { className: "muted", children: active.summary })] })] }), _jsx("div", { style: { marginTop: 16 }, children: _jsx("button", { className: "button ghost", onClick: () => openTask(active.id), children: "Open task detail \u2192" }) })] }), _jsxs("div", { children: [_jsx("h2", { children: "Task-linked Files" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Open Task Detail for the full file listing produced during the run." }), _jsx("div", { style: { marginTop: 12 }, children: linkedFiles.map((f) => (_jsxs("div", { className: "file", children: [_jsx("strong", { children: f.name }), _jsx("div", { className: "muted", children: f.note })] }, f.name))) })] })] }));
}
