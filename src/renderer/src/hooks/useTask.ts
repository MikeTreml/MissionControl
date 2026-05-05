/**
 * useTask(id) — fetch one task + its event journal.
 *
 * Live updates: refetches whenever the data-bus publishes "tasks" (fired
 * by the main→renderer bridge on any task event or manifest save, see
 * `lib/live-events-bridge.ts`).
 */
import { useEffect, useState } from "react";

import { useSubscribe } from "./data-bus";
import type { Task, TaskEvent } from "../../../shared/models";

export interface TaskState {
  task: Task | null;
  events: TaskEvent[];
  /** PROMPT.md content; null when file missing. */
  prompt: string | null;
  /** STATUS.md content; null when file missing. */
  status: string | null;
  /** RUN_CONFIG.json content; null when missing. */
  runConfig: Record<string, unknown> | null;
  /** Latest metrics artifact from artifacts/*.metrics.json */
  latestMetrics: Record<string, unknown> | null;
  metricsFileName: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTask(id: string | null): TaskState {
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [runConfig, setRunConfig] = useState<Record<string, unknown> | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, unknown> | null>(null);
  const [metricsFileName, setMetricsFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  function clear(): void {
    setTask(null);
    setEvents([]);
    setPrompt(null);
    setStatus(null);
    setRunConfig(null);
    setLatestMetrics(null);
    setMetricsFileName(null);
  }

  async function load(): Promise<void> {
    if (!id || !window.mc) {
      clear();
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const real = await window.mc.getTask(id);
      if (!real) {
        clear();
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
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      clear();
    } finally {
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
    error,
    refresh: load,
  };
}
