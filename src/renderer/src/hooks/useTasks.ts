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
import type { Lane, Task, TaskEvent, TaskStatus, RunState } from "../../../shared/models";

/**
 * Board-shaped task. Extends MockTask with:
 *   - projectId: slug so callers can filter (e.g. Project Detail page)
 *   - projectIcon: derived from the owning project for display
 *
 * CONFIRMED: `projectId` is the Project.id slug, not the prefix. Tasks
 * reference projects by slug; the prefix is encoded in the task id itself.
 */
export type BoardStage = "Draft" | "Plan" | "Active" | "Attention" | "Failed" | "Complete";

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

/** Map real lane code → display label. */
const LANE_LABEL: Record<Lane, MockLane> = {
  plan:     "Plan",
  develop:  "Develop",
  review:   "Review",
  surgery:  "Surgery",
  approval: "Approval",
  done:     "Done",
};

/** Each lane gets a consistent pill color + role label. */
const LANE_STYLE: Record<Lane, { role: MockRoleLabel; pill: MockPill }> = {
  plan:     { role: "Planner",   pill: "info" },
  develop:  { role: "Developer", pill: "warn" },
  review:   { role: "Reviewer",  pill: "info" },
  surgery:  { role: "Surgeon",   pill: "good" },
  approval: { role: "Waiting",   pill: "warn" },
  done:     { role: "Done",      pill: "good" },
};

function toUiTask(t: Task, projectIcon: string, currentModel: string): UiTask {
  const style = LANE_STYLE[t.lane];
  return {
    id: t.id,
    summary: t.title,
    lane: LANE_LABEL[t.lane],
    roleLabel: style.role,
    rolePill: style.pill,
    stepLine: t.currentStep || t.lastEvent || `Cycle ${t.cycle}`,
    sub: t.lastEvent && t.currentStep ? t.lastEvent : undefined,
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
  if (t.status === "done" || t.lane === "done") return "Complete";
  if (t.status === "failed") return "Failed";
  if (t.blocker.trim() || t.status === "waiting" || t.runState === "paused" || t.lane === "approval") return "Attention";
  if (t.runState === "running") return "Active";
  if (t.lane === "plan") return t.currentStep || t.lastEvent ? "Plan" : "Draft";
  return "Active";
}

function mockToBoardStage(lane: MockLane): BoardStage {
  if (lane === "Done") return "Complete";
  if (lane === "Approval") return "Attention";
  if (lane === "Plan") return "Plan";
  return "Active";
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
        setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Approval" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
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
        setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Approval" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
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
      setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Approval" ? "waiting" : "active", runState: t.active ? "running" : "idle" })));
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
