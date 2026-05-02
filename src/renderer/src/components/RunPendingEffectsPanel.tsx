import React from "react";

import { useRunPendingEffects } from "../hooks/useRunPendingEffects";

export function RunPendingEffectsPanel({ taskId }: { taskId: string }): JSX.Element | null {
  const { effects, loading, error, refresh } = useRunPendingEffects(taskId);

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
        <div key={e.effectId} className="card" style={{ padding: 10 }}>
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
        </div>
      ))}
    </section>
  );
}
