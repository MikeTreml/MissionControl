import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * One task card on the board. Matches the v2 design-canvas markup
 * (NewUI/Mission Control Design System/ui_kits/mission-control/index.html):
 *
 *   .task[data-proj]
 *     .head
 *       .tid (.pfx + rest)
 *       .pill <state>
 *     .summary
 *     .step
 *     .row
 *       .agent
 *       .spacer
 *       <elapsed/idle>
 *
 * The project's hashed accent color is injected as `--task-accent` so the
 * left-edge bleed picks it up without any per-card CSS.
 */
import { useState } from "react";
import { shortModelLabel } from "../lib/derive-runs";
import { useRoute } from "../router";
import { publish } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
import { colorForKey } from "../lib/color-hash";
const TASK_ID_RE = /^([A-Z0-9]+)-(\d+[A-Z]?)$/;
function splitTaskId(id) {
    const m = TASK_ID_RE.exec(id);
    return m ? { pfx: m[1], rest: `-${m[2]}` } : { pfx: "", rest: id };
}
function formatIdleSince(updatedAt) {
    const ms = Date.now() - new Date(updatedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0)
        return null;
    const minutes = ms / 60_000;
    if (minutes < 1)
        return "just now";
    if (minutes < 60)
        return `${Math.round(minutes)}m ago`;
    const hours = minutes / 60;
    if (hours < 24)
        return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}
export function TaskCard({ task }) {
    const { openTask } = useRoute();
    const modelLabel = shortModelLabel(task.currentModel);
    const [archiveBusy, setArchiveBusy] = useState(false);
    const isArchived = task.status === "archived";
    const isRunning = task.runState === "running";
    const { pfx, rest } = splitTaskId(task.id);
    const accent = pfx ? colorForKey(pfx) : "transparent";
    const ago = formatIdleSince(task.updatedAt);
    async function toggleArchive(e) {
        e.stopPropagation();
        if (!window.mc)
            return;
        try {
            setArchiveBusy(true);
            const full = await window.mc.getTask(task.id);
            if (!full) {
                pushErrorToast("Archive failed", "task not found", task.id);
                return;
            }
            await window.mc.saveTask({
                ...full,
                status: isArchived ? "active" : "archived",
                updatedAt: new Date().toISOString(),
            });
            publish("tasks");
        }
        catch (err) {
            pushErrorToast(isArchived ? "Unarchive failed" : "Archive failed", err, task.id);
        }
        finally {
            setArchiveBusy(false);
        }
    }
    const cls = [
        "task",
        "bleed",
        isRunning ? "running" : "",
        task.active ? "active" : "",
    ].filter(Boolean).join(" ");
    return (_jsxs("div", { className: cls, "data-proj": true, style: { ["--task-accent"]: accent }, onClick: () => openTask(task.id), children: [_jsxs("div", { className: "hover-actions", onClick: (e) => e.stopPropagation(), children: [_jsx("button", { type: "button", onClick: (e) => void toggleArchive(e), disabled: archiveBusy, title: isArchived ? "Restore this task to the active board" : "Archive — hide from default board", children: archiveBusy ? "…" : isArchived ? "↩" : "📦" }), _jsx("button", { type: "button", onClick: (e) => { e.stopPropagation(); openTask(task.id); }, title: "Open Task Detail", children: "\u2197" })] }), _jsxs("div", { className: "head", children: [_jsxs("span", { className: "tid", children: [pfx && _jsx("span", { className: "pfx", children: pfx }), rest] }), task.rolePill && (_jsxs("span", { className: `pill ${task.rolePill}`, style: { marginLeft: "auto" }, children: [task.roleLabel === "running" && _jsx("span", { className: "dot" }), task.roleLabel] })), task.projectIcon && (_jsx("span", { style: { marginLeft: 4, fontSize: 14, lineHeight: 1 }, children: task.projectIcon }))] }), _jsx("div", { className: "summary", children: task.summary }), task.stepLine && _jsx("div", { className: "step", children: task.stepLine }), task.sub && _jsx("div", { className: "step", children: task.sub }), _jsxs("div", { className: "row", children: [modelLabel && (_jsx("div", { className: "agent", title: `Model: ${task.currentModel}`, children: modelLabel })), _jsx("span", { className: "spacer" }), ago && (_jsx("span", { title: `Last updated ${new Date(task.updatedAt).toLocaleString()}`, children: ago }))] })] }));
}
