/**
 * useTasks — calls window.mc.listTasks(), maps real Task → UiTask.
 *
 * The UI consumes UiTask which matches the shape Board + TaskCard already
 * render; transformation lives here so components stay dumb.
 */
import { useEffect, useMemo, useState } from "react";

import { useSubscribe } from "./data-bus";
import { useSettings } from "./useSettings";
import { latestModelForEvents } from "../lib/derive-runs";
import type { Task, TaskEvent, TaskStatus, RunState } from "../../../shared/models";

/** 5-way lane the kanban groups tasks into. */
export type LaneId =
  | "Idle"
  | "Running"
  | "Waiting"
  | "Done"
  | "Failed";

/**
 * Pill text on each card. Aligned to the design canvas
 * (NewUI/.../index.html) so cards read "running" / "paused" /
 * "awaiting review" / "blocked" / "merged" / "failed" — not the lane name.
 * Empty string suppresses the pill (Drafting + Archived).
 */
export type RoleLabel =
  | ""
  | "running"
  | "paused"
  | "awaiting review"
  | "blocked"
  | "merged"
  | "failed";

/** Empty string suppresses the pill render in TaskCard. */
export type RolePill = "" | "good" | "warn" | "bad" | "info";

/**
 * 7-way kanban stage (broader than LaneId — adds Drafting / Review /
 * Blocked / Archived for board grouping).
 *
 * CONFIRMED: `projectId` on UiTask is the Project.id slug, not the prefix.
 * Tasks reference projects by slug; the prefix is encoded in the task id.
 */
export type BoardStage = "Drafting" | "Running" | "Review" | "Blocked" | "Failed" | "Done" | "Archived";

export interface UiTask {
  id: string;                 // "DA-015F"
  summary: string;            // task title
  lane: LaneId;
  roleLabel: RoleLabel;
  rolePill: RolePill;
  stepLine: string;           // "Cycle 1"
  sub?: string;
  active?: boolean;
  projectId: string;
  projectIcon: string;        // empty if no icon set on the project
  cycle: number;              // counts reviewer loopbacks
  updatedAt: string;          // ISO 8601 — needed for idle / stuck calculations
  currentModel: string;
  boardStage: BoardStage;
  status: TaskStatus;
  runState: RunState;
  /** Source task id when this is a re-run / clone / spin-off. "" = no parent. */
  parentTaskId: string;
  /** True if loaded from library/samples/ (read-only sample data). */
  isSample: boolean;
}

/**
 * Derive the pill label + tone for a task card from its boardStage.
 * Canvas (NewUI/.../index.html) uses one of:
 *   running (info, with dot) · paused (warning) · awaiting review (warning) ·
 *   blocked (danger) · merged (success) · failed (danger)
 * Drafting + Archived render no pill — return "" for both label and pill.
 * The lane title above the cards already conveys those states.
 */
function deriveLaneStyle(t: Task): { lane: LaneId; role: RoleLabel; pill: RolePill } {
  const stage = deriveBoardStage(t);
  if (stage === "Done")    return { lane: "Done",    role: "merged",          pill: "good" };
  if (stage === "Failed")  return { lane: "Failed",  role: "failed",          pill: "bad"  };
  if (stage === "Review")  return { lane: "Waiting", role: "awaiting review", pill: "warn" };
  if (stage === "Blocked") return { lane: "Waiting", role: "blocked",         pill: "bad"  };
  if (stage === "Running") {
    if (t.runState === "paused") return { lane: "Waiting", role: "paused",  pill: "warn" };
    return { lane: "Running", role: "running", pill: "info" };
  }
  // Drafting + Archived — no pill.
  return { lane: "Idle", role: "", pill: "" };
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

export interface TasksState {
  tasks: UiTask[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTasks(): TasksState {
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    if (!window.mc) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [real, projects] = await Promise.all([
        window.mc.listTasks(),
        window.mc.listProjects(),
      ]);
      const iconByProject = new Map(projects.map((p) => [p.id, p.icon]));
      const eventRows = await Promise.all(real.map(async (t) => {
        try {
          return [t.id, await window.mc.readTaskEvents(t.id)] as const;
        } catch {
          return [t.id, [] as TaskEvent[]] as const;
        }
      }));
      const modelByTask = new Map(eventRows.map(([id, events]) => [id, latestModelForEvents(events)]));
      setTasks(real.map((t) => toUiTask(t, iconByProject.get(t.project) ?? "", modelByTask.get(t.id) ?? "")));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTasks([]);
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

  return { tasks: visible, loading, error, refresh: load };
}
