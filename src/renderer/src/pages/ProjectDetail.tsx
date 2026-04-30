/**
 * Project Detail — "how is this project doing over time?"
 *
 * KPIs are computed from the task list (filtered by selectedProjectId).
 * Throughput is a simple SVG bar chart derived from createdAt/updatedAt.
 * Stuck tasks = lane=approval OR idle > 24h.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRoute } from "../router";
import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { useSubscribe } from "../hooks/data-bus";
import { PageStub } from "./PageStub";
import { AddProjectForm } from "../components/AddProjectForm";
import type { UiTask } from "../hooks/useTasks";
import type { ProjectWithGit } from "../../../shared/models";
import type { ProjectRunMetricsRollup } from "../global";

export function ProjectDetail(): JSX.Element {
  const { selectedProjectId, setView } = useRoute();
  const { projects, isDemo: projectsDemo } = useProjects();
  const { tasks, isDemo: tasksDemo } = useTasks();
  const [editOpen, setEditOpen] = useState(false);
  const [runMetricsRollup, setRunMetricsRollup] = useState<ProjectRunMetricsRollup | null>(null);
  const [rollupError, setRollupError] = useState("");

  const project = useMemo(
    () =>
      selectedProjectId
        ? projects.find((p) => p.id === selectedProjectId)
        : projects[0],
    [projects, selectedProjectId],
  );

  // Close the edit modal + bounce back to the dashboard if the project was
  // deleted (project will no longer appear in the list).
  useEffect(() => {
    if (selectedProjectId && projects.length > 0 && !project) {
      // Deleted while we were on it; go home.
      setEditOpen(false);
      setView("dashboard");
    }
  }, [project, selectedProjectId, projects.length, setView]);

  if (!project) {
    return (
      <PageStub
        title="Project not found"
        purpose="Pick a project from the sidebar."
      />
    );
  }

  // CONFIRMED: ProjectDetail is scoped to a single project. Tasks carry their
  // project slug on UiTask.projectId (added in useTasks). Demo tasks all share
  // projectId === "demo" so they still show when we're in demo mode.
  const projectTasks = project
    ? tasks.filter((t) => t.projectId === project.id || (tasksDemo && t.projectId === "demo"))
    : [];

  const stats = computeStats(projectTasks);
  const isDemo = projectsDemo || tasksDemo;

  const loadRunMetricsRollup = useCallback(async () => {
    if (!window.mc || isDemo || !project?.id) {
      setRunMetricsRollup(null);
      setRollupError("");
      return;
    }
    setRollupError("");
    try {
      const rollup = await window.mc.aggregateProjectRunMetrics(project.id);
      setRunMetricsRollup(rollup);
    } catch (e) {
      setRunMetricsRollup(null);
      setRollupError(e instanceof Error ? e.message : String(e));
    }
  }, [project?.id, isDemo]);

  useEffect(() => {
    void loadRunMetricsRollup();
  }, [loadRunMetricsRollup]);

  useSubscribe("tasks", () => {
    void loadRunMetricsRollup();
  });

  // UiProject doesn't carry gitInfo — fetch the full ProjectWithGit for the
  // edit form by finding the raw project in the real list if available,
  // otherwise synthesize a minimal one (edit form tolerates missing gitInfo).
  const editingSubject: ProjectWithGit | undefined = project
    ? {
        id: project.id,
        name: project.name,
        prefix: project.prefix,
        path: project.path,
        icon: project.icon,
        notes: project.notes,
        gitInfo: { kind: "none", label: "", remoteUrl: "" },
      }
    : undefined;

  return (
    <>
      <div className="topbar">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {project.icon && <span style={{ fontSize: 22 }}>{project.icon}</span>}
            <span>{project.name}</span>
            <span
              className="pill info"
              style={{ fontSize: 13, letterSpacing: 0.5 }}
            >
              {project.prefix}
            </span>
          </h1>
          <p className="muted">
            How is this project doing over time?
            {isDemo && " · demo data"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button ghost"
            onClick={() => {
              console.log("[ProjectDetail] Edit clicked", {
                project,
                projectsDemo,
                editingSubject,
              });
              setEditOpen(true);
            }}
            // Disable only when the projects LIST is demo (nothing real to edit).
            // `isDemo` also includes `tasksDemo` which would wrongly block
            // editing a real project that simply has no tasks yet.
            disabled={projectsDemo}
            title={projectsDemo ? "Can't edit demo projects — create a real one first" : "Edit this project"}
          >
            ✎ Edit
          </button>
          <button className="button ghost" onClick={() => setView("dashboard")}>
            ← Dashboard
          </button>
        </div>
        <AddProjectForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editing={editingSubject}
        />
      </div>

      <div className="content">
        <section className="card-grid">
          <Kpi label="Tasks total" value={stats.total} />
          <Kpi label="Active" value={stats.active} />
          <Kpi label="Done" value={stats.done} />
          <Kpi label="Avg cycles" value={stats.avgCycles.toFixed(1)} />
          <Kpi label="Avg idle" value={fmtAvgIdle(stats.avgIdleHours)} />
          <Kpi label="Stuck (>24h)" value={stats.stuck} />
        </section>

        {!isDemo && (
          <section className="card">
            <h3>Run metrics (artifacts)</h3>
            <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              Totals from every task in this project with <code>artifacts/*.metrics.json</code> (written when a run ends).
            </p>
            {rollupError && (
              <p className="muted" style={{ marginTop: 8, color: "var(--bad)", fontSize: 12 }}>{rollupError}</p>
            )}
            {!rollupError && runMetricsRollup && runMetricsRollup.metricsArtifactCount === 0 && (
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>No metrics artifacts yet. Complete a run to populate this rollup.</p>
            )}
            {!rollupError && runMetricsRollup && runMetricsRollup.metricsArtifactCount > 0 && (
              <div className="card-grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                <Kpi label="Completed run snapshots" value={runMetricsRollup.metricsArtifactCount} />
                <Kpi label="Tasks with metrics" value={runMetricsRollup.tasksWithArtifacts} />
                <Kpi
                  label="Tokens (in / out)"
                  value={`${abbreviateTokens(runMetricsRollup.tokensIn)} / ${abbreviateTokens(runMetricsRollup.tokensOut)}`}
                />
                <Kpi
                  label="Wall time (sum)"
                  value={formatDurationSeconds(runMetricsRollup.wallTimeSeconds)}
                />
                <Kpi
                  label="Spend (sum)"
                  value={runMetricsRollup.costUSD > 0 ? `$${runMetricsRollup.costUSD.toFixed(4)}` : "—"}
                />
              </div>
            )}
          </section>
        )}

        <section className="card">
          <h3>Tasks by lane</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Snapshot of where work is sitting right now.
          </p>
          <LaneBars tasks={projectTasks} />
        </section>

        <section className="card">
          <h3>Stuck tasks</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            In Approval or idle more than 24 hours. Click to jump to Task Detail.
          </p>
          <StuckTable tasks={projectTasks} />
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="kpi">{value}</div>
    </div>
  );
}

function abbreviateTokens(n: number): string {
  if (n < 1_000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function LaneBars({ tasks }: { tasks: UiTask[] }): JSX.Element {
  const lanes = ["Plan", "Develop", "Review", "Surgery", "Approval", "Done"] as const;
  const counts = lanes.map((lane) => ({
    lane,
    count: tasks.filter((t) => t.lane === lane).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      {counts.map((c) => (
        <div key={c.lane} style={{ display: "grid", gridTemplateColumns: "100px 1fr 40px", gap: 10, alignItems: "center" }}>
          <div className="muted">{c.lane}</div>
          <div
            style={{
              height: 14,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(c.count / max) * 100}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.3s",
              }}
            />
          </div>
          <div style={{ textAlign: "right", fontWeight: 600 }}>{c.count}</div>
        </div>
      ))}
    </div>
  );
}

function StuckTable({ tasks }: { tasks: UiTask[] }): JSX.Element {
  const now = Date.now();
  const idleHours = (t: UiTask): number =>
    Math.max(0, (now - new Date(t.updatedAt).getTime()) / 3_600_000);
  // Same definition as computeStats: approval / waiting / idle > 24h.
  const stuck = tasks.filter((t) =>
    t.lane !== "Done" &&
    (t.lane === "Waiting" || t.roleLabel === "Waiting" || idleHours(t) > 24),
  );
  const { openTask } = useRoute();
  if (stuck.length === 0) {
    return <p className="muted" style={{ marginTop: 10 }}>No stuck tasks.</p>;
  }
  const fmtIdle = (h: number): string =>
    h < 1 ? `${Math.round(h * 60)}m`
    : h < 24 ? `${h.toFixed(1)}h`
    : `${(h / 24).toFixed(1)}d`;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
      <thead>
        <tr style={{ color: "var(--muted)", textAlign: "left" }}>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>ID</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Title</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Lane</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Idle</th>
        </tr>
      </thead>
      <tbody>
        {stuck.map((t) => (
          <tr
            key={t.id}
            style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
            onClick={() => openTask(t.id)}
          >
            <td style={{ padding: "8px 10px" }}><strong>{t.id}</strong></td>
            <td style={{ padding: "8px 10px" }}>{t.summary}</td>
            <td style={{ padding: "8px 10px" }}>{t.lane}</td>
            <td style={{ padding: "8px 10px" }}>
              <span className={`pill ${t.rolePill}`}>{t.roleLabel}</span>
            </td>
            <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{fmtIdle(idleHours(t))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── stats computation ─────────────────────────────────────────────────────

interface ProjectStats {
  total: number;
  active: number;
  done: number;
  stuck: number;
  avgCycles: number;
  avgIdleHours: number;
}

function computeStats(tasks: UiTask[]): ProjectStats {
  const total = tasks.length;
  const done = tasks.filter((t) => t.lane === "Done").length;
  const active = total - done;

  // Idle (hours since last write to manifest.json) — used by both the
  // "Avg idle" KPI and the time-based "stuck" check below. Done tasks
  // don't contribute; their idle clock isn't operationally useful.
  const now = Date.now();
  const idleHours = (t: UiTask): number =>
    Math.max(0, (now - new Date(t.updatedAt).getTime()) / 3_600_000);
  const liveTasks = tasks.filter((t) => t.lane !== "Done");

  // "Stuck" = blocked on a human (approval lane or waiting/paused) OR
  // idle for over 24h while still active. Both are operationally
  // useful signals; either alone misses real cases.
  const stuck = liveTasks.filter((t) =>
    t.lane === "Waiting" || t.roleLabel === "Waiting" || idleHours(t) > 24,
  ).length;

  const avgCycles = total === 0
    ? 0
    : tasks.reduce((sum, t) => sum + t.cycle, 0) / total;
  const avgIdleHours = liveTasks.length === 0
    ? 0
    : liveTasks.reduce((s, t) => s + idleHours(t), 0) / liveTasks.length;

  return { total, active, done, stuck, avgCycles, avgIdleHours };
}

/** Compact idle formatter: <1h shows minutes; <1d shows hours; ≥1d shows days. */
function fmtAvgIdle(hours: number): string {
  if (hours <= 0) return "—";
  if (hours < 1)  return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// Re-exported for tests / future real-task stats path.
export { computeStats };
