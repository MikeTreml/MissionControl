/**
 * Left rail — Projects list only. Compact enough to fit ~20 projects.
 *
 * Design decisions:
 *   - No "Agent Runtime" section here. Agents live in Settings → Agents.
 *   - Each project = a colored prefix chip + name + single-line source hint.
 *   - The chip color is deterministic from the prefix (hash → hue) so every
 *     project has a consistent visual fingerprint. Users can override with
 *     the `icon` field on a project (emoji or short string).
 *   - Add Project is a single "+" icon button on the "Projects" header row.
 */
import { useEffect, useState } from "react";

import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";
import { AddProjectForm } from "./AddProjectForm";
import { colorForKey, colorForKeyBorder } from "../lib/color-hash";

export function Sidebar(): JSX.Element {
  const { setView, openProject } = useRoute();
  const { projects, isDemo } = useProjects();
  const { tasks } = useTasks();
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [bridgeOk, setBridgeOk] = useState<boolean>(Boolean(window.mc));
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    setBridgeOk(Boolean(window.mc));
    void (async () => {
      try {
        if (!window.mc) return;
        setAppVersion(await window.mc.appVersion());
      } catch {
        setAppVersion("");
      }
    })();
  }, []);

  // Open-task count per project: anything not in the Done lane. Cheaper than
  // walking events; UiTask already carries the resolved lane label.
  const openByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.lane === "Done") continue;
    openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
  }

  return (
    <aside className="sidebar">
      <div
        className="group"
        style={{ cursor: "pointer", marginBottom: 12 }}
        onClick={() => setView("dashboard")}
      />

      {isDemo && (
        <div
          style={{
            background: "rgba(244, 201, 93, 0.08)",
            border: "1px dashed var(--warn)",
            borderRadius: 8,
            padding: 8,
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          <strong style={{ color: "var(--warn)" }}>Demo data</strong>
          <div className="muted" style={{ marginTop: 2 }}>
            Click + to add your first project.
          </div>
        </div>
      )}

      {/* ── Projects header + add button ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Projects ({projects.length})
        </h3>
        <button
          className="button ghost"
          onClick={() => setAddProjectOpen(true)}
          title="Add Project"
          style={{
            padding: "2px 8px",
            fontSize: 16,
            lineHeight: 1,
            minWidth: 28,
          }}
        >
          +
        </button>
      </div>

      <AddProjectForm
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
      />

      {/* ── Compact project rows ── */}
      <div style={{ display: "grid", gap: 4 }}>
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            openCount={openByProject.get(p.id) ?? 0}
            onClick={() => openProject(p.id)}
          />
        ))}
        {projects.length === 0 && !isDemo && (
          <div
            style={{
              fontSize: 12,
              padding: "10px",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              background: "var(--panel-2)",
              display: "grid",
              gap: 6,
            }}
          >
            <div className="muted">No projects yet.</div>
            <button
              className="button ghost"
              onClick={() => setAddProjectOpen(true)}
              style={{ fontSize: 12, padding: "4px 8px", justifySelf: "start" }}
            >
              + Add your first project
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            title={bridgeOk ? "Connected to main process" : "Preload not loaded — check terminal"}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: bridgeOk ? "var(--good)" : "var(--bad)",
              boxShadow: `0 0 0 2px ${bridgeOk ? "rgba(77,212,172,0.25)" : "rgba(255,123,123,0.25)"}`,
            }}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            {bridgeOk ? "bridge ok" : "bridge offline"}
          </span>
          {appVersion && (
            <span className="muted" style={{ fontSize: 11 }}>
              v{appVersion}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

function ProjectRow({
  project,
  openCount,
  onClick,
}: {
  project: ReturnType<typeof useProjects>["projects"][number];
  openCount: number;
  onClick: () => void;
}): JSX.Element {
  const bg = colorForKey(project.prefix);
  const border = colorForKeyBorder(project.prefix);

  return (
    <div
      onClick={onClick}
      className={project.active ? "project active" : "project"}
      style={{
        cursor: "pointer",
        padding: "7px 9px",
        borderRadius: 8,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
      }}
      title={`${project.name} — ${project.sourceHint}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          style={{
            flex: "0 0 auto",
            background: bg,
            color: "#0b0d12",
            border: `1px solid ${border}`,
            borderRadius: 6,
            padding: "2px 6px",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.25,
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {project.prefix}
        </div>

        <div
          style={{
            minWidth: 0,
            flex: 1,
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.name}
        </div>

        {openCount > 0 && (
          <div
            aria-label={`${openCount} open task${openCount === 1 ? "" : "s"}`}
            title={`${openCount} open task${openCount === 1 ? "" : "s"}`}
            style={{
              flex: "0 0 auto",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              background: "rgba(110, 168, 254, 0.12)",
              borderRadius: 999,
              padding: "1px 6px",
              lineHeight: 1.25,
            }}
          >
            {openCount}
          </div>
        )}

        {project.icon && (
          <div style={{ flex: "0 0 auto", fontSize: 13, lineHeight: 1 }}>
            {project.icon}
          </div>
        )}
      </div>

      <div
        className="muted"
        style={{
          marginTop: 4,
          marginLeft: 36,
          fontSize: 11,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {project.sourceHint}
      </div>
    </div>
  );
}
