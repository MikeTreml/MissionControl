import { useEffect, useState } from "react";
import { useRoute } from "../router";
import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { CreateTaskForm } from "./CreateTaskForm";

/**
 * Bridge-status indicator + leading slot. Mirrors the dot already in
 * the Sidebar (Sidebar.tsx L124–143) so the user has a consistent
 * "is preload alive" cue at the top and the bottom of the chrome.
 *
 * Color mapping (per AUDIT Appendix A3):
 *   - green: preload bridge connected (window.mc available)
 *   - red:   preload missing — IPC won't work, real data won't load
 */
export function Topbar(): JSX.Element {
  const { setView } = useRoute();
  const [createOpen, setCreateOpen] = useState(false);
  const [bridgeOk, setBridgeOk] = useState<boolean>(Boolean(window.mc));

  // Demo-mode regression detector (#44 / AUDIT C3). useTasks +
  // useProjects each fall back to mockTasks/mockProjects silently
  // when their fetch fails. If the user starts with real data and
  // later an IPC error knocks them into demo mode, we want a sticky
  // red signal — not the muted yellow "Demo" pill that's normal for
  // a fresh empty state.
  const { tasks, isDemo: tasksDemo, loading: tasksLoading } = useTasks();
  const { isDemo: projectsDemo, loading: projectsLoading } = useProjects();
  const isDemo = tasksDemo && projectsDemo;
  const settled = !tasksLoading && !projectsLoading;
  const [hasBeenReal, setHasBeenReal] = useState(false);
  useEffect(() => {
    if (settled && !isDemo) setHasBeenReal(true);
  }, [settled, isDemo]);
  const demoRegressed = settled && isDemo && hasBeenReal;

  // Input-needed pill (#38). Counts tasks the user needs to attend
  // to: paused / waiting status / blocker set. boardStage="Attention"
  // already encapsulates this in deriveBoardStage. v1 doesn't try to
  // distinguish breakpoint vs mc_ask_user vs blocker — they all
  // collapse into "this task wants you." Click navigates to the
  // Board (Attention column is visible there).
  const attentionTasks = tasks.filter(
    (t) => !tasksDemo && t.boardStage === "Attention" && t.status !== "archived",
  );
  const attentionCount = attentionTasks.length;

  useEffect(() => {
    setBridgeOk(Boolean(window.mc));
  }, []);

  return (
    <div className="topbar" style={{ justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span
          title={bridgeOk ? "Connected to main process" : "Preload not loaded — check terminal"}
          aria-label={bridgeOk ? "Bridge connected" : "Bridge offline"}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: bridgeOk ? "var(--good)" : "var(--bad)",
            boxShadow: `0 0 0 2px ${bridgeOk ? "rgba(93, 191, 138,0.25)" : "rgba(232, 116, 116,0.25)"}`,
          }}
        />
        <span className="muted" style={{ fontSize: 11 }}>
          {bridgeOk ? "bridge ok" : "bridge offline"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {attentionCount > 0 && (
          <button
            className="pill warn"
            onClick={() => setView("dashboard")}
            title={
              attentionCount === 1
                ? `1 task awaiting input — ${attentionTasks[0]!.id}`
                : `${attentionCount} tasks awaiting input`
            }
            style={{
              fontSize: 11,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            ⚠ {attentionCount} awaiting input
          </button>
        )}
        {demoRegressed && (
          <span
            className="pill bad"
            title="The app was showing real data and just fell back to demo data — likely an IPC error. Restart the app to recover."
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            ⚠ Demo fallback active
          </span>
        )}
        <button
          className="button ghost"
          onClick={() => setView("library")}
          title="Library Browser"
        >
          Library
        </button>
        <button
          className="button ghost"
          onClick={() => setView("metrics")}
          title="Metrics"
        >
          Metrics
        </button>
        <button
          className="button ghost"
          onClick={() => setView("settings-global")}
          title="Settings"
        >
          Settings
        </button>
        <button className="button ghost">Archive</button>
        <button className="button" onClick={() => setCreateOpen(true)}>
          Create Task
        </button>
        <CreateTaskForm open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </div>
  );
}
