/**
 * useTask(id) — fetch one task + its event journal. Demo fallback synthesizes
 * a single task from the mock set when window.mc is unavailable.
 *
 * Live updates: refetches whenever the data-bus publishes "tasks" (fired
 * by the main→renderer bridge on any task event or manifest save, see
 * `lib/live-events-bridge.ts`).
 */
import { useEffect, useState } from "react";

import { mockTasks } from "../mock-data";
import { useSubscribe } from "./data-bus";
import type { Task, TaskEvent } from "../../../shared/models";

function mockTaskToTask(id: string): Task | null {
  const m = mockTasks.find((t) => t.id === id) ?? mockTasks[0];
  if (!m) return null;
  const now = new Date().toISOString();
  return {
    id: m.id,
    title: m.summary,
    description: "",
    project: "dogapp",
    workflow: "F",
    kind: "single",
    lane: "plan",
    status: "active",
    runState: m.active ? "running" : "idle",
    currentAgentSlug: "planner",
    cycle: 1,
    currentStep: m.stepLine,
    lastEvent: m.sub ?? "",
    laneHistory: [{ lane: "plan", enteredAt: now }],
    items: [],
    blocker: "",
    createdAt: now,
    updatedAt: now,
  };
}

function mockEvents(id: string): TaskEvent[] {
  const now = new Date();
  const t = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();
  return [
    { timestamp: t(240), type: "created", by: "system" },
    { timestamp: t(235), type: "run-started", role: "planner", model: "claude-opus" },
    { timestamp: t(180), type: "run-ended", role: "planner", exit: "completed" },
    { timestamp: t(175), type: "lane-changed", from: "plan", to: "develop" },
    { timestamp: t(170), type: "run-started", role: "developer", model: "codex" },
    { timestamp: t(20),  type: "run-ended", role: "developer", exit: "completed" },
    { timestamp: t(15),  type: "lane-changed", from: "develop", to: "review" },
  ] satisfies TaskEvent[];
}

export interface TaskState {
  task: Task | null;
  events: TaskEvent[];
  /** PROMPT.md content; null when file missing. */
  prompt: string | null;
  /** STATUS.md content; null when file missing. */
  status: string | null;
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTask(id: string | null): TaskState {
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    try {
      setLoading(true);
      if (!id) {
        setTask(null);
        setEvents([]);
        setPrompt(null);
        setStatus(null);
        return;
      }
      if (!window.mc) {
        setTask(mockTaskToTask(id));
        setEvents(mockEvents(id));
        setPrompt(null);
        setStatus(null);
        setIsDemo(true);
        return;
      }
      const real = await window.mc.getTask(id);
      if (!real) {
        // Fall back to mock so the page isn't blank while wireframing
        setTask(mockTaskToTask(id));
        setEvents(mockEvents(id));
        setPrompt(null);
        setStatus(null);
        setIsDemo(true);
        return;
      }
      const [ev, pmt, sts] = await Promise.all([
        window.mc.readTaskEvents(id),
        window.mc.readTaskPrompt(id),
        window.mc.readTaskStatus(id),
      ]);
      setTask(real);
      setEvents(ev);
      setPrompt(pmt);
      setStatus(sts);
      setIsDemo(false);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTask(id ? mockTaskToTask(id) : null);
      setEvents(id ? mockEvents(id) : []);
      setPrompt(null);
      setStatus(null);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  // Live refetch on any task-related push from the main process.
  useSubscribe("tasks", () => { void load(); });

  return { task, events, prompt, status, loading, isDemo, error, refresh: load };
}
