/**
 * useTasks — calls window.mc.listTasks(), maps real Task → UiTask.
 *
 * Same demo-default pattern as useProjects. The UI consumes UiTask which
 * matches the shape Board + TaskCard already render; transformation lives
 * here so components stay dumb.
 */
import { useEffect, useState } from "react";

import { mockTasks, type MockLane, type MockPill, type MockRoleLabel, type MockTask } from "../mock-data";
import { useSubscribe } from "./data-bus";
import { latestModelForEvents } from "../lib/derive-runs";
import type { Task, TaskEvent, TaskStatus, RunState } from "../../../shared/models";

/**
 * Board-shaped task. Extends MockTask with:
 *   - projectId: slug so callers can filter (e.g. Project Detail page)
 *   - projectIcon: derived from the owning project for display
 *
 * CONFIRMED: `projectId` is the Project.id slug, not the prefix. Tasks
 * reference projects by slug; the prefix is encoded in the task id itself.
 */
export type BoardStage = "Draft" | "Active" | "Attention" | "Failed" | "Complete" | "Archived";

export type UiTask = MockTask & {
  projectId: string;
  projectIcon: string;     // empty if no icon set on the project
  cycle: number;           // Task.cycle — counts reviewer loopbacks
  updatedAt: string;       // ISO 8601 — needed for idle / stuck calculations
  currentModel: string;
  boardStage: BoardStage;
  status: TaskStatus;
  runState: RunState;
};

/**
 * Derive the UI lane label + role/pill style from runState + status. The
 * legacy task.lane field used to drive this; now phase chips on Task
 * Detail (lib/derive-phases.ts) carry the workflow-driven view, and the
 * board collapses to the run state axis.
 *
 *   status=done           → "Done" (good)
 *   status=failed         → "Failed" (bad)
 *   status=waiting OR
 *     runState=paused     → "Waiting" (warn)
 *   runState=running      → "Running" (warn)
 *   else                  → "Idle" (info)
 */
function deriveLaneStyle(t: Task): { lane: MockLane; role: MockRoleLabel; pill: MockPill } {
  if (t.status === "done")    return { lane: "Done",     role: "Done",     pill: "good" };
  if (t.status === "failed")  return { lane: "Failed",   role: "Failed",   pill: "bad"  };
  if (t.runState === "paused" || t.status === "waiting" || t.blocker.trim()) {
    return { lane: "Waiting", role: "Waiting", pill: "warn" };
  }
  if (t.runState === "running") return { lane: "Running", role: "Running", pill: "warn" };
  return { lane: "Idle", role: "Idle", pill: "info" };
}

function toUiTask(t: Task, projectIcon: string, currentModel: string): UiTask {
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
  };
}

function deriveBoardStage(t: Task): BoardStage {
  // Archived takes precedence over any other status — once archived,
  // a task is hidden from default Board / ProjectDetail views.
  if (t.status === "archived") return "Archived";
  if (t.status === "done") return "Complete";
  if (t.status === "failed") return "Failed";
  if (t.blocker.trim() || t.status === "waiting" || t.runState === "paused") return "Attention";
  if (t.runState === "running") return "Active";
  return "Draft";
}

function mockToBoardStage(lane: MockLane): BoardStage {
  if (lane === "Done") return "Complete";
  if (lane === "Failed") return "Failed";
  if (lane === "Waiting") return "Attention";
  if (lane === "Running") return "Active";
  return "Draft";
}

export interface TasksState {
  tasks: UiTask[];
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTasks(): TasksState {
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    try {
      setLoading(true);
      if (!window.mc) {
        // Mock tasks don't have a real project id; stamp a synthetic one so
        // filters don't collapse them.
        setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
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
        setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
        setIsDemo(true);
      } else {
        const eventRows = await Promise.all(real.map(async (t) => {
          try {
            return [t.id, await window.mc.readTaskEvents(t.id)] as const;
          } catch {
            return [t.id, [] as TaskEvent[]] as const;
          }
        }));
        const modelByTask = new Map(eventRows.map(([id, events]) => [id, latestModelForEvents(events)]));
        setTasks(real.map((t) => toUiTask(t, iconByProject.get(t.project) ?? "", modelByTask.get(t.id) ?? "")));
        setIsDemo(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useSubscribe("tasks", () => { void load(); });

  return { tasks, loading, isDemo, error, refresh: load };
}
