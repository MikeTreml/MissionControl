import React from "react";

import { useRunPendingEffects } from "../hooks/useRunPendingEffects";
import { useRunStatus, extractRunPath } from "../hooks/useRunStatus";

export function RunPendingEffectsPanel({ taskId }: { taskId: string }): JSX.Element | null {
  const { effects, loading, error, refresh } = useRunPendingEffects(taskId);
  const { status } = useRunStatus(taskId);

  const runPathFromStatus = extractRunPath(status);

  async function answer(effectId: string, approved: boolean): Promise<void> {
    const effect = effects.find((e) => e.effectId === effectId);
    const runPath =
      (typeof effect?.runPath === "string" ? effect.runPath : null) ?? runPathFromStatus;

    if (!runPath || !window.mc?.respondBreakpoint) {
      console.warn("No runPath available for respondBreakpoint", { effectId, runPath });
      return;
    }

    try {
      await window.mc.respondBreakpoint({
        taskId,
        runPath,
        effectId,
        approved,
      });
      await refresh();
    } catch (err) {
      console.error("respondBreakpoint failed", err);
    }
  }

  if (loading && effects.length === 0) {
    return (
      <section className="card">
        <h3>Pending actions</h3>
        <div className="muted">Loading…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card">
        <h3>Pending actions</h3>
        <div className="muted">Error: {error}</div>
        <button className="btn ghost" onClick={() => void refresh()}>Retry</button>
      </section>
    );
  }

  if (!effects || effects.length === 0) {
    return null;
  }

  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <h3>Pending actions · {effects.length}</h3>
      {effects.map((e) => (
        <div key={e.effectId} className="card" style={{ padding: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{e.label ?? e.kind}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {e.effectId}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {e.status ?? "pending"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" onClick={() => void answer(e.effectId, false)}>
              Reject
            </button>
            <button className="btn primary" onClick={() => void answer(e.effectId, true)}>
              Approve
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
