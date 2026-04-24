/**
 * Header — project title + primary actions + app-wide nav (Settings, Metrics).
 * Title will drive off the selected Project once state is wired.
 */
import { useEffect, useState } from "react";
import { useRoute } from "../router";
import { CreateTaskForm } from "./CreateTaskForm";

export function Topbar(): JSX.Element {
  const { setView } = useRoute();
  const [createOpen, setCreateOpen] = useState(false);

  // Diagnostic: is window.mc available (= did preload load)?
  // Shown as a small dot next to the title. Green = connected, red = not.
  const [bridgeOk, setBridgeOk] = useState<boolean>(Boolean(window.mc));
  useEffect(() => {
    setBridgeOk(Boolean(window.mc));
    console.log("[Topbar] window.mc present?", Boolean(window.mc));
  }, []);

  const title = "Mission Control";

  return (
    <div className="topbar">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1>{title}</h1>
          <span
            title={bridgeOk ? "Connected to main process" : "Preload not loaded — check terminal"}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: bridgeOk ? "var(--good)" : "var(--bad)",
              boxShadow: `0 0 0 2px ${bridgeOk ? "rgba(77,212,172,0.25)" : "rgba(255,123,123,0.25)"}`,
            }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {bridgeOk ? "bridge ok" : "bridge offline"}
          </span>
        </div>
        <p className="muted">
          Clean view of current work, current step, active agent, and
          task-linked files
        </p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="button ghost"
          onClick={() => setView("metrics")}
          title="Metrics"
        >
          Metrics
        </button>
        <button
          className="button ghost"
          onClick={() => setView("settings-agents")}
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
