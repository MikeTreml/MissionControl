/**
 * useAllTaskEvents — fetches events.jsonl for every real task so the
 * Metrics page (and any future cross-task rollup) can aggregate runs
 * across the whole project set.
 *
 * Live-updates via the data-bus: any push from main → "tasks" triggers a
 * refetch. Scales fine at dashboard size (dozens of tasks × a few KB of
 * events). If event volumes grow, we'll move aggregation into the main
 * process and expose a summary IPC instead.
 */
import { useEffect, useState } from "react";
import { useTasks } from "./useTasks";
import { useSubscribe } from "./data-bus";
export function useAllTaskEvents() {
    const { tasks, isDemo } = useTasks();
    const [perTask, setPerTask] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const taskIds = tasks.map((t) => t.id).join(",");
    async function load() {
        if (!window.mc || isDemo) {
            setPerTask(new Map());
            setLoading(false);
            return;
        }
        setLoading(true);
        const entries = await Promise.all(tasks.map(async (t) => {
            try {
                const ev = await window.mc.readTaskEvents(t.id);
                return [t.id, ev];
            }
            catch {
                return [t.id, []];
            }
        }));
        setPerTask(new Map(entries));
        setLoading(false);
    }
    useEffect(() => { void load(); }, [taskIds, isDemo]);
    useSubscribe("tasks", () => { void load(); });
    return { perTask, loading, isDemo };
}
