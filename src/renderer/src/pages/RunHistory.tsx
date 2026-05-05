/**
 * Run history — flat cross-task list of every run-started → run-ended
 * pair, derived from the per-task event journals. Newest first.
 *
 * Today: read-only table with task id, project, started/ended, wall
 * time, reason. Click a row to open the task. Filter by project / by
 * reason is deferred to a later slice.
 */
import { useMemo } from "react";

import { useTasks } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useProjects } from "../hooks/useProjects";
import { useRoute } from "../router";
import type { TaskEvent } from "../../../shared/models";

interface RunRow {
  taskId: string;
  taskTitle: string;
  projectId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  reason: string;
}

function deriveRuns(perTask: Map<string, TaskEvent[]>, taskTitle: Map<string, string>, taskProject: Map<string, string>): RunRow[] {
  const rows: RunRow[] = [];
  for (const [taskId, events] of perTask.entries()) {
    let lastStart: { ts: string; ms: number } | null = null;
    for (const e of events) {
      if (e.type === "run-started") {
        lastStart = { ts: e.timestamp, ms: new Date(e.timestamp).getTime() };
      } else if (e.type === "run-ended" && lastStart !== null) {
        const ended = e.timestamp;
        const endedMs = new Date(ended).getTime();
        const rec = e as unknown as Record<string, unknown>;
        const reason = typeof rec.reason === "string" ? rec.reason : "completed";
        rows.push({
          taskId,
          taskTitle: taskTitle.get(taskId) ?? "(unknown)",
          projectId: taskProject.get(taskId) ?? "",
          startedAt: lastStart.ts,
          endedAt: ended,
          durationMs: Math.max(0, endedMs - lastStart.ms),
          reason,
        });
        lastStart = null;
      }
    }
  }
  rows.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  return rows;
}

export function RunHistory(): JSX.Element {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { perTask } = useAllTaskEvents();
  const { setView, openTask } = useRoute();

  const taskTitle = useMemo(() => new Map(tasks.map((t) => [t.id, t.summary])), [tasks]);
  const taskProject = useMemo(() => new Map(tasks.map((t) => [t.id, t.projectId])), [tasks]);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const rows = useMemo(() => deriveRuns(perTask, taskTitle, taskProject), [perTask, taskTitle, taskProject]);

  return (
    <>
      <div className="topbar">
        <div className="crumbs">
          <span>Workspace</span>
          <span className="sep">/</span>
          <span className="now">Run history</span>
        </div>
        <div className="actions">
          <button className="button ghost" onClick={() => setView("dashboard")}>
            ← Dashboard
          </button>
        </div>
      </div>
      <div className="content">
        <section className="card">
          <h3 style={{ marginBottom: 8 }}>
            Run history{rows.length > 0 && <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>({rows.length})</span>}
          </h3>
          {rows.length === 0 ? (
            <div className="muted" style={{ padding: "24px 4px", fontSize: 13 }}>
              No completed runs yet.
            </div>
          ) : (
            <div role="table" style={{ display: "grid", gap: 4 }}>
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(110px, auto) 1fr 110px 90px 90px",
                  gap: 12,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  padding: "0 8px",
                }}
              >
                <span>Task</span>
                <span>Title</span>
                <span>Project</span>
                <span>Wall time</span>
                <span>Reason</span>
              </div>
              {rows.map((r, i) => (
                <button
                  key={`${r.taskId}-${i}`}
                  role="row"
                  className="task"
                  data-proj
                  onClick={() => openTask(r.taskId)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(110px, auto) 1fr 110px 90px 90px",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 13,
                    padding: "8px 8px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.taskId}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.taskTitle}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {projectName.get(r.projectId) ?? r.projectId}
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {formatDuration(r.durationMs)}
                  </span>
                  <span className={`pill ${reasonPill(r.reason)}`} style={{ fontSize: 11 }}>
                    {r.reason}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function reasonPill(reason: string): "good" | "warn" | "bad" | "info" {
  if (reason === "completed" || reason === "done") return "good";
  if (reason === "failed") return "bad";
  if (reason === "interrupted" || reason === "user") return "warn";
  return "info";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = min / 60;
  return `${hr.toFixed(1)}h`;
}
