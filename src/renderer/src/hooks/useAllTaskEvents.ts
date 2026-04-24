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
import type { TaskEvent } from "../../../shared/models";

export interface AllTaskEventsState {
  /** Map of taskId → ordered events. Missing keys = no events yet. */
  perTask: Map<string, TaskEvent[]>;
  loading: boolean;
  /** True when useTasks is in demo mode — perTask will be empty. */
  isDemo: boolean;
}

export function useAllTaskEvents(): AllTaskEventsState {
  const { tasks, isDemo } = useTasks();
  const [perTask, setPerTask] = useState<Map<string, TaskEvent[]>>(new Map());
  const [loading, setLoading] = useState<boolean>(true);

  const taskIds = tasks.map((t) => t.id).join(",");

  async function load(): Promise<void> {
    if (!window.mc || isDemo) {
      setPerTask(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const entries: Array<[string, TaskEvent[]]> = await Promise.all(
      tasks.map(async (t) => {
        try {
          const ev = await window.mc.readTaskEvents(t.id);
          return [t.id, ev];
        } catch {
          return [t.id, [] as TaskEvent[]];
        }
      }),
    );
    setPerTask(new Map(entries));
    setLoading(false);
  }

  useEffect(() => { void load(); }, [taskIds, isDemo]);
  useSubscribe("tasks", () => { void load(); });

  return { perTask, loading, isDemo };
}
