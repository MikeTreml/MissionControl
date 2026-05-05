/**
 * Left rail — projects list, workspace nav, system nav, identity footer.
 *
 * Layout matches NewUI/Mission Control Design System/ui_kits/mission-control/
 * (sections labeled `Projects · N` / `Workspace` / `System`; nav-items with
 * mono-glyph + label + optional badge; user-identity footer pinned bottom).
 *
 * Project accent: `colorForKey(prefix)` is injected as `--proj-accent`
 * inline-style, picked up by the `.proj-row .dot` and active-row left bar.
 *
 * Workspace nav items wire to existing routes where they exist; "Run history"
 * and "Hand-offs" are stubbed disabled until those views land.
 */
import { useEffect, useState } from "react";

import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import { useRoute } from "../router";
import { AddProjectForm } from "./AddProjectForm";
import { colorForKey } from "../lib/color-hash";

export function Sidebar(): JSX.Element {
  const { view, setView, selectedProjectId, openProject } = useRoute();
  const { projects } = useProjects();
  const { tasks } = useTasks();
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        if (!window.mc) return;
        setAppVersion(await window.mc.appVersion());
      } catch {
        setAppVersion("");
      }
    })();
  }, []);

  // Open-task counts per project (anything not in the Done lane).
  const openByProject = new Map<string, number>();
  for (const t of tasks) {
    if (t.lane === "Done") continue;
    openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);
  }
  // Total open tasks for the Board badge.
  const totalOpen = [...openByProject.values()].reduce((a, b) => a + b, 0);
  const runningCount = tasks.filter((t) => t.runState === "running").length;

  return (
    <aside className="sidebar">
      {/* ── Projects ──────────────────────────────────────────────── */}
      <div>
        <div className="sidebar-section-head">
          <div className="section-label">Projects · {projects.length}</div>
          <button
            className="button ghost"
            onClick={() => setAddProjectOpen(true)}
            title="Add project"
            style={{ padding: "2px 8px", fontSize: 14, lineHeight: 1, minWidth: 24 }}
          >
            +
          </button>
        </div>

        <AddProjectForm open={addProjectOpen} onClose={() => setAddProjectOpen(false)} />

        <div className="proj-list">
          {projects.map((p) => {
            const accent = colorForKey(p.prefix);
            const isActive = view === "project" && selectedProjectId === p.id;
            return (
              <button
                key={p.id}
                className={isActive ? "proj-row active" : "proj-row"}
                onClick={() => openProject(p.id)}
                style={{ ["--proj-accent" as string]: accent }}
                title={`${p.name} — ${p.sourceHint}`}
              >
                <span className="dot" />
                <span className="name">{p.name}</span>
                {openByProject.get(p.id) ? (
                  <span className="count">{openByProject.get(p.id)}</span>
                ) : (
                  <span className="count" />
                )}
              </button>
            );
          })}
          {projects.length === 0 && (
            <div
              className="muted"
              style={{
                fontSize: 12,
                padding: "10px",
                borderRadius: 8,
                background: "var(--raised)",
                boxShadow: "var(--lift)",
                display: "grid",
                gap: 6,
              }}
            >
              <div>No projects yet.</div>
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
      </div>

      {/* ── Workspace nav ─────────────────────────────────────────── */}
      <div>
        <div className="section-label">Workspace</div>
        <div className="nav-list">
          <NavItem
            glyph="📋"
            label="Board"
            badge={totalOpen}
            active={view === "dashboard"}
            onClick={() => setView("dashboard")}
          />
          <NavItem
            glyph="📚"
            label="Library"
            active={view === "library"}
            onClick={() => setView("library")}
          />
          <NavItem
            glyph="⏱️"
            label="Run history"
            active={view === "run-history"}
            onClick={() => setView("run-history")}
          />
          <NavItem
            glyph="🤝"
            label="Hand-offs"
            badge={tasks.filter((t) => t.boardStage === "Review" || t.boardStage === "Blocked").length}
            active={view === "handoffs"}
            onClick={() => setView("handoffs")}
          />
        </div>
      </div>

      {/* ── System nav ───────────────────────────────────────────── */}
      <div>
        <div className="section-label">System</div>
        <div className="nav-list">
          <NavItem
            glyph="🧠"
            label="Models"
            active={view === "settings-models"}
            onClick={() => setView("settings-models")}
          />
          <NavItem
            glyph="🤖"
            label="Agents"
            active={view === "settings-agents"}
            onClick={() => setView("settings-agents")}
          />
          <NavItem
            glyph="⚙️"
            label="Settings"
            active={view === "settings-global"}
            onClick={() => setView("settings-global")}
          />
          <NavItem
            glyph="📊"
            label="Metrics"
            active={view === "metrics"}
            onClick={() => setView("metrics")}
          />
        </div>
      </div>

      {/* ── User identity ────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <div className="avatar">MT</div>
        <div className="who">
          <div className="name">Michael Treml</div>
          <div className="status">
            {runningCount > 0
              ? `${runningCount} agent${runningCount === 1 ? "" : "s"} running`
              : appVersion
              ? `v${appVersion}`
              : "idle"}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  glyph,
  label,
  badge,
  active,
  onClick,
  disabled,
  tooltip,
}: {
  glyph: string;
  label: string;
  badge?: number;
  active?: boolean;
  onClick?: (() => void) | undefined;
  disabled?: boolean;
  tooltip?: string;
}): JSX.Element {
  // Use a real <button> so keyboard nav + disabled state are free.
  return (
    <button
      className={active ? "nav-item active" : "nav-item"}
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
      type="button"
    >
      <span className="glyph">{glyph}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {typeof badge === "number" && badge > 0 && <span className="badge">{badge}</span>}
    </button>
  );
}

