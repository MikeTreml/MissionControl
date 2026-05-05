import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Pinned banner above the app shell showing the highest-priority
 * currently-running task. Persistent across all surfaces — gives the
 * operator a constant cue that "this task is alive" no matter what
 * page they're on. Hidden when nothing is running.
 *
 * Priority: most recently updated `runState === "running"` task.
 * Tie-break by updatedAt descending. The strip's accent color tracks
 * the project (colorForKey(prefix)) so the gradient feels owned by
 * the right project.
 *
 * Markup matches the v2 design canvas (NewUI/.../index.html):
 *   .context-strip
 *     .pulse        — pulsing dot in project color
 *     .tid          — task id (mono, accent-colored)
 *     .summary      — title (truncates)
 *     .step         — current step / model
 *     .elapsed      — running duration since startedAt
 *     .open-btn     — jumps to Task Detail
 */
import { useEffect, useState } from "react";
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";
import { colorForKey } from "../lib/color-hash";
export function ContextStrip() {
    const { tasks } = useTasks();
    const { openTask } = useRoute();
    const [now, setNow] = useState(Date.now());
    // Tick the elapsed counter every second while we have a running task.
    const running = tasks
        .filter((t) => t.runState === "running")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    useEffect(() => {
        if (!running)
            return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [running?.id]);
    if (!running)
        return null;
    const pfx = running.id.split("-")[0] ?? "";
    const accent = pfx ? colorForKey(pfx) : "var(--info)";
    const elapsedMs = Math.max(0, now - new Date(running.updatedAt).getTime());
    return (_jsxs("div", { className: "context-strip", style: { ["--ctx-accent"]: accent }, children: [_jsx("span", { className: "pulse" }), _jsx("span", { className: "tid", children: running.id }), _jsx("span", { className: "summary", children: running.summary }), running.currentModel && _jsx("span", { className: "step", children: running.currentModel }), _jsx("span", { className: "elapsed", children: formatElapsed(elapsedMs) }), _jsx("button", { className: "open-btn", onClick: () => openTask(running.id), children: "Open \u2192" })] }));
}
function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}
