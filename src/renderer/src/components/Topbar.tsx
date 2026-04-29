import { useState } from "react";
import { useRoute } from "../router";
import { CreateTaskForm } from "./CreateTaskForm";

export function Topbar(): JSX.Element {
  const { setView } = useRoute();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="topbar" style={{ justifyContent: "flex-end" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
