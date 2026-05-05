import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Hand-offs — every task currently waiting on a human (review,
 * blocker, paused). One stop for "what wants me?". The point: scroll
 * the queue without click-through to each Task Detail.
 *
 * Sources today:
 *   - boardStage === "Review"  — task paused with blocker matching review/approval
 *   - boardStage === "Blocked" — task paused/waiting with any other blocker
 *
 * Future: pull from journal `BREAKPOINT_OPENED` once plannotator wires
 * up an invocation surface. The page shape stays the same.
 */
import { useMemo } from "react";
import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { useRoute } from "../router";
import { colorForKey } from "../lib/color-hash";
export function Handoffs() {
    const { tasks } = useTasks();
    const { projects } = useProjects();
    const { setView, openTask } = useRoute();
    const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
    const review = tasks.filter((t) => t.boardStage === "Review");
    const blocked = tasks.filter((t) => t.boardStage === "Blocked");
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { className: "crumbs", children: [_jsx("span", { children: "Workspace" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { className: "now", children: "Hand-offs" }), _jsx("span", { className: "sep", children: "\u00B7" }), _jsxs("span", { className: "muted", style: { fontSize: 12 }, children: [review.length, " awaiting review \u00B7 ", blocked.length, " blocked"] })] }), _jsx("div", { className: "actions", children: _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" }) })] }), _jsxs("div", { className: "content", children: [_jsx(Section, { title: "Awaiting review", tone: "warn", empty: "Nothing waiting on your review.", tasks: review, projectName: projectName, onOpen: openTask }), _jsx(Section, { title: "Blocked", tone: "bad", empty: "No blocked tasks.", tasks: blocked, projectName: projectName, onOpen: openTask })] })] }));
}
function Section({ title, tone, empty, tasks, projectName, onOpen, }) {
    return (_jsxs("section", { className: "card", style: { marginBottom: 14 }, children: [_jsxs("h3", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }, children: [_jsx("span", { children: title }), _jsx("span", { className: `pill ${tone}`, style: { fontSize: 11 }, children: tasks.length })] }), tasks.length === 0 ? (_jsx("div", { className: "muted", style: { padding: "8px 0", fontSize: 13 }, children: empty })) : (_jsx("div", { style: { display: "grid", gap: 8 }, children: tasks.map((t) => {
                    const pfx = t.id.split("-")[0] ?? "";
                    const accent = pfx ? colorForKey(pfx) : "transparent";
                    return (_jsxs("button", { className: "task", "data-proj": true, style: { ["--task-accent"]: accent, textAlign: "left", cursor: "pointer" }, onClick: () => onOpen(t.id), children: [_jsxs("div", { className: "head", children: [_jsxs("span", { className: "tid", children: [_jsx("span", { className: "pfx", children: pfx }), t.id.slice(pfx.length)] }), t.rolePill && (_jsx("span", { className: `pill ${t.rolePill}`, style: { marginLeft: "auto" }, children: t.roleLabel }))] }), _jsx("div", { className: "summary", children: t.summary }), _jsxs("div", { className: "row", children: [_jsx("span", { className: "muted", children: projectName.get(t.projectId) ?? t.projectId }), _jsx("span", { className: "spacer" }), _jsx("span", { className: "muted", children: t.stepLine })] })] }, t.id));
                }) }))] }));
}
