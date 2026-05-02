/**
 * useTasks — calls window.mc.listTasks(), maps real Task → UiTask.
 *
 * Same demo-default pattern as useProjects. The UI consumes UiTask which
 * matches the shape Board + TaskCard already render; transformation lives
 * here so components stay dumb.
 */
import { useEffect, useMemo, useState } from "react";

import { mockTasks, type MockLane, type MockPill, type MockRoleLabel, type MockTask } from "../mock-data";
import { useSubscribe } from "./data-bus";
import { useSettings } from "./useSettings";
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
export type BoardStage = "Drafting" | "Running" | "Review" | "Blocked" | "Failed" | "Done" | "Archived";

export type UiTask = MockTask & {
  projectId: string;
  projectIcon: string;     // empty if no icon set on the project
  cycle: number;           // Task.cycle — counts reviewer loopbacks
  updatedAt: string;       // ISO 8601 — needed for idle / stuck calculations
  currentModel: string;
  boardStage: BoardStage;
  status: TaskStatus;
  runState: RunState;
  /** Source task id when this is a re-run / clone / spin-off. "" = no parent. */
  parentTaskId: string;
  /** True if loaded from library/samples/ (read-only demo data). */
  isSample: boolean;
};

/**
 * Derive the pill label + tone for a task card from its boardStage.
 * Canvas (NewUI/.../index.html) uses one of:
 *   running (info, with dot) · paused (warning) · awaiting review (warning) ·
 *   blocked (danger) · merged (success) · failed (danger)
 * Drafting + Archived render no pill — return null. The lane title above
 * the cards already conveys those states.
 */
function deriveLaneStyle(t: Task): { lane: MockLane; role: MockRoleLabel; pill: MockPill } {
  const stage = deriveBoardStage(t);
  if (stage === "Done")    return { lane: "Done",    role: "merged",          pill: "good" };
  if (stage === "Failed")  return { lane: "Failed",  role: "failed",          pill: "bad"  };
  if (stage === "Review")  return { lane: "Waiting", role: "awaiting review", pill: "warn" };
  if (stage === "Blocked") return { lane: "Waiting", role: "blocked",         pill: "bad"  };
  if (stage === "Running") {
    if (t.runState === "paused") return { lane: "Waiting", role: "paused",  pill: "warn" };
    return { lane: "Running", role: "running", pill: "info" };
  }
  // Drafting + Archived — no pill. Empty rolePill suppresses render in TaskCard.
  return { lane: "Idle", role: "", pill: "" as MockPill };
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
    parentTaskId: t.parentTaskId,
    isSample: t.isSample === true,
  };
}

function deriveBoardStage(t: Task): BoardStage {
  // Archived takes precedence over any other status — once archived,
  // a task is hidden from default Board / ProjectDetail views.
  if (t.status === "archived") return "Archived";
  if (t.status === "done") return "Done";
  if (t.status === "failed") return "Failed";
  // Split former "Attention" into Review vs Blocked. Review = the task
  // is paused waiting for human review; Blocked = anything else that's
  // halted (waiting on a key, on another person, etc.).
  const blocker = t.blocker.trim().toLowerCase();
  const isReview = blocker.includes("review") || blocker.includes("approval");
  if (blocker || t.status === "waiting" || t.runState === "paused") {
    return isReview ? "Review" : "Blocked";
  }
  if (t.runState === "running") return "Running";
  return "Drafting";
}

function mockToBoardStage(lane: MockLane): BoardStage {
  if (lane === "Done") return "Done";
  if (lane === "Failed") return "Failed";
  if (lane === "Waiting") return "Blocked";
  if (lane === "Running") return "Running";
  return "Drafting";
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
      setTasks(mockTasks.map((t) => ({ ...t, projectId: "demo", projectIcon: "", cycle: 1, updatedAt: new Date().toISOString(), currentModel: "", boardStage: mockToBoardStage(t.lane), status: t.lane === "Done" ? "done" : t.lane === "Waiting" ? "waiting" : "active", runState: t.active ? "running" : "idle", parentTaskId: "", isSample: false })));
      setIsDemo(true);
    } finally {
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
  const visible = useMemo(
    () => (showSampleData ? tasks : tasks.filter((t) => !t.isSample)),
    [tasks, showSampleData],
  );

  return { tasks: visible, loading, isDemo, error, refresh: load };
}
