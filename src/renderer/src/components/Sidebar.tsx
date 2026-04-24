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
import { useState } from "react";

import { useProjects } from "../hooks/useProjects";
import { useRoute } from "../router";
import { AddProjectForm } from "./AddProjectForm";
import { colorForKey, colorForKeyBorder } from "../lib/color-hash";

export function Sidebar(): JSX.Element {
  const { setView, openProject } = useRoute();
  const { projects, isDemo } = useProjects();
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  return (
    <aside className="sidebar">
      <div
        className="group"
        style={{ cursor: "pointer", marginBottom: 12 }}
        onClick={() => setView("dashboard")}
      >
        <h2>Mission Control</h2>
        <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Projects • Tasks • Runs
        </p>
      </div>

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
            onClick={() => openProject(p.id)}
          />
        ))}
        {projects.length === 0 && !isDemo && (
          <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
            No projects yet.
          </div>
        )}
      </div>
    </aside>
  );
}

function ProjectRow({
  project,
  onClick,
}: {
  project: ReturnType<typeof useProjects>["projects"][number];
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
        padding: "6px 8px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        position: "relative",
      }}
      title={`${project.name} — ${project.sourceHint}`}
    >
      {/* Prefix chip (main visual anchor — colored by prefix) */}
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
          lineHeight: 1.3,
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {project.prefix}
      </div>

      <div style={{ minWidth: 0, flex: 1, paddingRight: project.icon ? 22 : 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.name}
        </div>
        <div
          className="muted"
          style={{
            fontSize: 11,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {project.sourceHint}
        </div>
      </div>

      {/* Optional icon — accent in the upper-right */}
      {project.icon && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 6,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {project.icon}
        </div>
      )}
    </div>
  );
}
