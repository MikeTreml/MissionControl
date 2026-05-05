import { useEffect, useRef, useState } from "react";
const MAX_VISIBLE = 3;
const DEFAULT_MS = 5000;
const LONG_MS = 8000;
// ── ad-hoc toast bus ────────────────────────────────────────────────
// Components anywhere in the renderer can call `pushToast({...})` to
// surface an error / info / success without going through the
// task-event stream. Used by mutation error paths (saveTask, delete,
// archive, etc.) so the user actually sees when something failed.
const adhocSubscribers = new Set();
/**
 * Push a one-off toast from anywhere in the renderer. Returns the
 * generated id (component can dismiss via that id if it wants to).
 * Safe to call before the Toaster mounts — fires synchronously into
 * any current subscribers; if there are none, the toast is dropped.
 */
export function pushToast(input) {
    const id = input.id ?? `adhoc:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const toast = { ...input, id };
    adhocSubscribers.forEach((fn) => {
        try {
            fn(toast);
        }
        catch (err) {
            console.error("[useToasts] adhoc subscriber threw:", err);
        }
    });
    return id;
}
/**
 * Convenience: push a "bad" tone toast from a thrown error. Title is
 * the short label (component name); detail is the error message.
 */
export function pushErrorToast(title, err, taskId = "") {
    const detail = err instanceof Error ? err.message : String(err ?? "Unknown error");
    return pushToast({ taskId, title, detail, tone: "bad" });
}
export function useToasts() {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());
    useEffect(() => {
        // Helper: stage a toast + arm its dismiss timer.
        const stage = (next, ms) => {
            setToasts((prev) => [next, ...prev.filter((t) => t.id !== next.id)].slice(0, MAX_VISIBLE));
            const timer = window.setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== next.id));
                timers.current.delete(next.id);
            }, ms);
            const prior = timers.current.get(next.id);
            if (prior)
                window.clearTimeout(prior);
            timers.current.set(next.id, timer);
        };
        // Source 1: live task events from main → toast where appropriate.
        const unsubEvent = window.mc?.onTaskEvent
            ? window.mc.onTaskEvent(({ taskId, event }) => {
                const next = toToast(taskId, event);
                if (!next)
                    return;
                const ms = next.tone === "bad" || event.type === "pi:awaiting_input" ? LONG_MS : DEFAULT_MS;
                stage(next, ms);
            })
            : null;
        // Source 2: ad-hoc pushes from anywhere in the renderer.
        const adhoc = (toast) => {
            const ms = toast.tone === "bad" ? LONG_MS : DEFAULT_MS;
            stage(toast, ms);
        };
        adhocSubscribers.add(adhoc);
        return () => {
            if (unsubEvent)
                unsubEvent();
            adhocSubscribers.delete(adhoc);
            for (const timer of timers.current.values())
                window.clearTimeout(timer);
            timers.current.clear();
        };
    }, []);
    function dismiss(id) {
        const timer = timers.current.get(id);
        if (timer) {
            window.clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }
    return { toasts, dismiss };
}
function toToast(taskId, event) {
    const id = `${taskId}:${event.timestamp}:${event.type}`;
    if (event.type === "run-started") {
        return { id, taskId, title: taskId, detail: "Run started", tone: "info" };
    }
    if (event.type === "run-ended") {
        const reason = typeof event.reason === "string" ? event.reason : "completed";
        return {
            id,
            taskId,
            title: taskId,
            detail: `Run ended — ${reason}`,
            tone: reason === "failed" ? "bad" : reason === "completed" ? "good" : "warn",
        };
    }
    if (event.type === "lane-changed") {
        const to = typeof event.to === "string" ? event.to : "updated";
        return { id, taskId, title: taskId, detail: `Moved to ${to}`, tone: "info" };
    }
    if (event.type === "pi:awaiting_input") {
        return { id, taskId, title: taskId, detail: "Needs your input", tone: "warn" };
    }
    return null;
}
