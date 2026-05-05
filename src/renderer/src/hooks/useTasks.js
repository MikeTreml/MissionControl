/**
 * useTasks — calls window.mc.listTasks(), maps real Task → UiTask.
 *
 * Same demo-default pattern as useProjects. The UI consumes UiTask which
 * matches the shape Board + TaskCard already render; transformation lives
 * here so components stay dumb.
 */
import { useEffect, useMemo, useState } from "react";
import { mockTasks } from "../mock-data";
import { useSubscribe } from "./data-bus";
import { useSettings } from "./useSettings";
import { latestModelForEvents } from "../lib/derive-runs";
/**
 * Derive the pill label + tone for a task card from its boardStage.
 * Canvas (NewUI/.../index.html) uses one of:
 *   running (info, with dot) · paused (warning) · awaiting review (warning) ·
 *   blocked (danger) · merged (success) · failed (danger)
 * Drafting + Archived render no pill — return null. The lane title above
 * the cards already conveys those states.
 */
function deriveLaneStyle(t) {
    const stage = deriveBoardStage(t);
    if (stage === "Done")
        return { lane: "Done", role: "merged", pill: "good" };
    if (stage === "Failed")
        return { lane: "Failed", role: "failed", pill: "bad" };
    if (stage === "Review")
        return { lane: "Waiting", role: "awaiting review", pill: "warn" };
    if (stage === "Blocked")
        return { lane: "Waiting", role: "blocked", pill: "bad" };
    if (stage === "Running") {
        if (t.runState === "paused")
            return { lane: "Waiting", role: "paused", pill: "warn" };
        return { lane: "Running", role: "running", pill: "info" };
    }
    // Drafting + Archived — no pill. Empty rolePill suppresses render in TaskCard.
    return { lane: "Idle", role: "", pill: "" };
}
function toUiTask(t, projectIcon, currentModel) {
    const style = deriveLaneStyle(t);
    return {
        id: t.id,
        summary: t.title,
        lane: style.lane,
        roleLabel: style.role,
        rolePill: style.pill,
        stepLine: `Cycle ${t.cycle}`,
        sub: undefined,
        active: t.runState === "running",
        projectId: t.project,
        projectIcon,
        cycle: t.cycle,
        updatedAt: t.updatedAt,
        currentModel,
        boardStage: deriveBoardStage(t),
        status: t.status,
        runState: t.runState,
        parentTaskId: t.parentTaskId,
        isSample: t.isSample === true,
    };
}
function deriveBoardStage(t) {
    // Archived takes precedence over any other status — once archived,
    // a task is hidden from default Board / ProjectDetail views.
    if (t.status === "archived")
        return "Archived";
    if (t.status === "done")
        return "Done";
    if (t.status === "failed")
        return "Failed";
    // Split former "Attention" into Review vs Blocked. Review = the task
    // is paused waiting for human review; Blocked = anything else that's
    // halted (waiting on a key, on another person, etc.).
    const blocker = t.blocker.trim().toLowerCase();
    const isReview = blocker.includes("review") || blocker.includes("approval");
    if (blocker || t.status === "waiting" || t.runState === "paused") {
        return isReview ? "Review" : "Blocked";
    }
    if (t.runState === "running")
        return "Running";
    return "Drafting";
}
function mockToBoardStage(lane) {
    if (lane === "Done")
        return "Done";
    if (lane === "Failed")
        return "Failed";
    if (lane === "Waiting")
        return "Blocked";
    if (lane === "Running")
        return "Running";
    return "Drafting";
}
export function useTasks() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);
    const [error, setError] = useState(null);
    async function load() {
        try {
            setLoading(true);
            if (!window.mc) {
                // Mock tasks don't have a real project id; stamp a synthetic one so
                // filters don't collapse them.
                setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle", parentTaskId: "", isSample: false })));
                setIsDemo(true);
                return;
            }
            const [real, projects] = await Promise.all([
                window.mc.listTasks(),
                window.mc.listProjects(),
            ]);
            // Map project id → icon so each task can carry its project's icon.
            const iconByProject = new Map(projects.map((p) => [p.id, p.icon]));
            if (real.length === 0) {
                setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle", parentTaskId: "", isSample: false })));
                setIsDemo(true);
            }
            else {
                const eventRows = await Promise.all(real.map(async (t) => {
                    try {
                        return [t.id, await window.mc.readTaskEvents(t.id)];
                    }
                    catch {
                        return [t.id, []];
                    }
                }));
                const modelByTask = new Map(eventRows.map(([id, events]) => [id, latestModelForEvents(events)]));
                setTasks(real.map((t) => toUiTask(t, iconByProject.get(t.project) ?? "", modelByTask.get(t.id) ?? "")));
                setIsDemo(false);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle", parentTaskId: "", isSample: false })));
            setIsDemo(true);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, []);
    useSubscribe("tasks", () => { void load(); });
    // Filter sample tasks out when the user has hidden them in Settings.
    // Live (non-sample) tasks are always returned.
    const { showSampleData } = useSettings();
    const visible = useMemo(() => (showSampleData ? tasks : tasks.filter((t) => !t.isSample)), [tasks, showSampleData]);
    return { tasks: visible, loading, isDemo, error, refresh: load };
}
