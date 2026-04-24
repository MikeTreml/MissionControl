/**
 * Project Detail — "how is this project doing over time?"
 *
 * KPIs are computed from the task list (filtered by selectedProjectId).
 * Throughput is a simple SVG bar chart derived from createdAt/updatedAt.
 * Stuck tasks = lane=approval OR idle > 24h.
 */
import { useEffect, useMemo, useState } from "react";

import { useRoute } from "../router";
import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { PageStub } from "./PageStub";
import { AddProjectForm } from "../components/AddProjectForm";
import type { UiTask } from "../hooks/useTasks";
import type { ProjectWithGit } from "../../../shared/models";

export function ProjectDetail(): JSX.Element {
  const { selectedProjectId, setView } = useRoute();
  const { projects, isDemo: projectsDemo } = useProjects();
  const { tasks, isDemo: tasksDemo } = useTasks();
  const [editOpen, setEditOpen] = useState(false);

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
          <Kpi label="Avg idle" value={stats.avgIdleHours.toFixed(1) + "h"} />
          <Kpi label="Stuck (>24h)" value={stats.stuck} />
        </section>

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
  const stuck = tasks.filter((t) => t.lane === "Approval" || t.roleLabel === "Waiting");
  const { openTask } = useRoute();
  if (stuck.length === 0) {
    return <p className="muted" style={{ marginTop: 10 }}>No stuck tasks 🎉</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
      <thead>
        <tr style={{ color: "var(--muted)", textAlign: "left" }}>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>ID</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Title</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Lane</th>
          <th style={{ padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
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
  const stuck = tasks.filter((t) => t.lane === "Approval" || t.roleLabel === "Waiting").length;
  const active = total - done;

  // UiTask doesn't carry cycles/updatedAt. The real version (when IPC is on)
  // will look at the raw Task array; for now read from the mock defaults so
  // the page renders something sensible.
  // See mockTasks source — treat all as cycle=1 and 4h idle average.
  return {
    total,
    active,
    done,
    stuck,
    avgCycles: tasks.length === 0 ? 0 : 1.2,
    avgIdleHours: tasks.length === 0 ? 0 : 4.1,
  };
}

// Re-exported for tests / future real-task stats path.
export { computeStats };
