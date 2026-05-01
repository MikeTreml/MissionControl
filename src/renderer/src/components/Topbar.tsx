/**
 * Top chrome on the Dashboard surface. Markup matches the v2 design
 * canvas (NewUI/Mission Control Design System/ui_kits/mission-control):
 *
 *   .topbar
 *     .crumbs   Workspace / [project] / Board
 *     .actions  bridge-dot · attention pill · search · filter · + New task
 *
 * Per-page navigation (Library / Metrics / Settings) lives in the
 * sidebar Workspace + System sections — removed from here to avoid the
 * mockup's "two nav surfaces" smell.
 */
import { useEffect, useState } from "react";
import { useRoute } from "../router";
import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { CreateTaskForm } from "./CreateTaskForm";
import { openCommandPalette } from "./CommandPalette";

export function Topbar(): JSX.Element {
  const { setView, selectedProjectId } = useRoute();
  const [createOpen, setCreateOpen] = useState(false);
  const [bridgeOk, setBridgeOk] = useState<boolean>(Boolean(window.mc));

  const { tasks, isDemo: tasksDemo, loading: tasksLoading } = useTasks();
  const { projects, isDemo: projectsDemo, loading: projectsLoading } = useProjects();
  const isDemo = tasksDemo && projectsDemo;
  const settled = !tasksLoading && !projectsLoading;
  const [hasBeenReal, setHasBeenReal] = useState(false);
  useEffect(() => {
    if (settled && !isDemo) setHasBeenReal(true);
  }, [settled, isDemo]);
  const demoRegressed = settled && isDemo && hasBeenReal;

  const attentionTasks = tasks.filter(
    (t) =>
      !tasksDemo &&
      (t.boardStage === "Review" || t.boardStage === "Blocked") &&
      t.status !== "archived",
  );
  const attentionCount = attentionTasks.length;

  useEffect(() => {
    setBridgeOk(Boolean(window.mc));
  }, []);

  // Crumbs: "Workspace / [project name when selected] / Board".
  const activeProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  return (
    <div className="topbar">
      <div className="crumbs">
        <span>Workspace</span>
        {activeProject && (
          <>
            <span className="sep">/</span>
            <span>{activeProject.name}</span>
          </>
        )}
        <span className="sep">/</span>
        <span className="now">Board</span>
      </div>

      <div className="actions">
        <span
          title={bridgeOk ? "Connected to main process" : "Preload not loaded — check terminal"}
          aria-label={bridgeOk ? "Bridge connected" : "Bridge offline"}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: bridgeOk ? "var(--good)" : "var(--bad)",
            boxShadow: `0 0 0 2px ${bridgeOk ? "rgba(93, 191, 138,0.25)" : "rgba(232, 116, 116,0.25)"}`,
            flex: "0 0 auto",
          }}
        />
        {attentionCount > 0 && (
          <button
            className="pill warn"
            onClick={() => setView("dashboard")}
            title={
              attentionCount === 1
                ? `1 task awaiting input — ${attentionTasks[0]!.id}`
                : `${attentionCount} tasks awaiting input`
            }
            style={{ fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            ⚠ {attentionCount} awaiting input
          </button>
        )}
        {demoRegressed && (
          <span
            className="pill bad"
            title="The app was showing real data and just fell back to demo data — likely an IPC error."
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            ⚠ Demo fallback active
          </span>
        )}

        <button
          className="search"
          type="button"
          title="Search tasks, projects, and library — ⌘K"
          onClick={() => openCommandPalette()}
        >
          <span className="glyph">⌕</span>
          <span>Search tasks, projects, library</span>
          <span className="kbd">⌘K</span>
        </button>
        <button className="button ghost" title="Filter (pending)" disabled>
          ⚲
        </button>
        <button className="button" onClick={() => setCreateOpen(true)}>
          + New task
        </button>
        <CreateTaskForm open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </div>
  );
}
