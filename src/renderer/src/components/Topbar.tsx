import { useState } from "react";
import { useRoute } from "../router";
import { CreateTaskForm } from "./CreateTaskForm";

// TODO: bridge-status indicator dot — green/amber/red mapped to
// preload connection + run state. CLAUDE.md and docs/UI-DESIGN.md
// already reference this dot, but the component below renders only
// buttons. Implement it in the leading slot of the topbar before
// removing this TODO. See AUDIT-2026-04.md Appendix A3.
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
