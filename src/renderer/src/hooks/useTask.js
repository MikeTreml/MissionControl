/**
 * useTask(id) — fetch one task + its event journal. Demo mode synthesizes
 * a single task from the mock set when window.mc is unavailable.
 *
 * Live updates: refetches whenever the data-bus publishes "tasks" (fired
 * by the main→renderer bridge on any task event or manifest save, see
 * `lib/live-events-bridge.ts`).
 */
import { useEffect, useState } from "react";
import { mockTasks } from "../mock-data";
import { useSubscribe } from "./data-bus";
function mockTaskToTask(id) {
    const m = mockTasks.find((t) => t.id === id) ?? mockTasks[0];
    if (!m)
        return null;
    const now = new Date().toISOString();
    return {
        id: m.id,
        title: m.summary,
        description: "",
        project: "dogapp",
        kind: "single",
        status: "active",
        runState: m.active ? "running" : "idle",
        cycle: 1,
        items: [],
        decisionScore: null,
        blocker: "",
        parentTaskId: "",
        babysitterMode: "plan",
        isSample: false,
        createdAt: now,
        updatedAt: now,
    };
}
function mockEvents(id) {
    const now = new Date();
    const t = (minsAgo) => new Date(now.getTime() - minsAgo * 60_000).toISOString();
    // Generic agent slugs for the demo timeline — the real workflow's
    // events use whatever the workflow.js declared at runtime, so this
    // mock intentionally doesn't carry a fixed roster.
    return [
        { timestamp: t(240), type: "created", by: "system" },
        { timestamp: t(235), type: "run-started", agentSlug: "agent-a", model: "claude-opus" },
        { timestamp: t(180), type: "run-ended", agentSlug: "agent-a", exit: "completed" },
        { timestamp: t(175), type: "lane-changed", from: "phase-1", to: "phase-2" },
        { timestamp: t(170), type: "run-started", agentSlug: "agent-b", model: "codex" },
        { timestamp: t(20), type: "run-ended", agentSlug: "agent-b", exit: "completed" },
        { timestamp: t(15), type: "lane-changed", from: "phase-2", to: "phase-3" },
    ];
}
export function useTask(id) {
    const [task, setTask] = useState(null);
    const [events, setEvents] = useState([]);
    const [prompt, setPrompt] = useState(null);
    const [status, setStatus] = useState(null);
    const [runConfig, setRunConfig] = useState(null);
    const [latestMetrics, setLatestMetrics] = useState(null);
    const [metricsFileName, setMetricsFileName] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);
    const [error, setError] = useState(null);
    async function load() {
        try {
            setLoading(true);
            if (!id) {
                setTask(null);
                setEvents([]);
                setPrompt(null);
                setStatus(null);
                setRunConfig(null);
                setLatestMetrics(null);
                setMetricsFileName(null);
                return;
            }
            if (!window.mc) {
                setTask(mockTaskToTask(id));
                setEvents(mockEvents(id));
                setPrompt(null);
                setStatus(null);
                setRunConfig(null);
                setLatestMetrics(null);
                setMetricsFileName(null);
                setIsDemo(true);
                return;
            }
            const real = await window.mc.getTask(id);
            if (!real) {
                // Use mock data so the page isn't blank while wireframing
                setTask(mockTaskToTask(id));
                setEvents(mockEvents(id));
                setPrompt(null);
                setStatus(null);
                setRunConfig(null);
                setLatestMetrics(null);
                setMetricsFileName(null);
                setIsDemo(true);
                return;
            }
            const [ev, pmt, sts, cfg, artifacts] = await Promise.all([
                window.mc.readTaskEvents(id),
                window.mc.readTaskPrompt(id),
                window.mc.readTaskStatus(id),
                window.mc.readTaskRunConfig(id),
                window.mc.listTaskArtifacts(id),
            ]);
            const latestMetricsFile = artifacts.find((a) => a.name.endsWith(".metrics.json")) ?? null;
            const latestMetricsJson = latestMetricsFile
                ? await window.mc.readTaskArtifactJson(id, latestMetricsFile.name)
                : null;
            setTask(real);
            setEvents(ev);
            setPrompt(pmt);
            setStatus(sts);
            setRunConfig(cfg);
            setLatestMetrics(latestMetricsJson);
            setMetricsFileName(latestMetricsFile?.name ?? null);
            setIsDemo(false);
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setTask(id ? mockTaskToTask(id) : null);
            setEvents(id ? mockEvents(id) : []);
            setPrompt(null);
            setStatus(null);
            setRunConfig(null);
            setLatestMetrics(null);
            setMetricsFileName(null);
            setIsDemo(true);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, [id]);
    // Live refetch on any task-related push from the main process.
    useSubscribe("tasks", () => { void load(); });
    return {
        task,
        events,
        prompt,
        status,
        runConfig,
        latestMetrics,
        metricsFileName,
        loading,
        isDemo,
        error,
        refresh: load,
    };
}
