import React from "react";

import { useRunPendingEffects, type PendingRunEffect } from "../hooks/useRunPendingEffects";
import { useRunStatus, extractRunPath } from "../hooks/useRunStatus";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function getContext(effect: PendingRunEffect): Record<string, unknown> | null {
  return asRecord(effect.context) ?? asRecord(asRecord(effect.value)?.context) ?? asRecord(asRecord(effect.data)?.context);
}

function getTags(effect: PendingRunEffect): string[] {
  const tags = effect.tags ?? asRecord(effect.value)?.tags ?? asRecord(effect.data)?.tags;
  return Array.isArray(tags) ? tags.filter((x): x is string => typeof x === "string") : [];
}

function getQuestion(effect: PendingRunEffect): string | null {
  const direct = effect.question ?? asRecord(effect.value)?.question ?? asRecord(effect.data)?.question;
  return typeof direct === "string" && direct.length > 0 ? direct : null;
}

function classifyEffect(effect: PendingRunEffect): "confidence" | "test" | "generic" {
  const tags = getTags(effect);
  const label = `${effect.label ?? ""} ${effect.kind ?? ""}`.toLowerCase();

  if (tags.includes("confidence-gate") || label.includes("confidence")) return "confidence";
  if (tags.includes("test-gate") || label.includes("test")) return "test";
  return "generic";
}

function effectTitle(effect: PendingRunEffect): string {
  const cls = classifyEffect(effect);
  if (cls === "confidence") return "Confidence review required";
  if (cls === "test") return "Test review required";
  return effect.label ?? effect.kind;
}

function effectDetails(effect: PendingRunEffect): string | null {
  const context = getContext(effect);
  const question = getQuestion(effect);
  if (question) return question;

  const cls = classifyEffect(effect);
  if (cls === "confidence") {
    const confidence = context?.confidence;
    const threshold = context?.threshold;
    if (typeof confidence === "number" && typeof threshold === "number") {
      return `Confidence ${confidence}% is below required ${threshold}%.`;
    }
    return "The task needs confidence review before continuing.";
  }

  if (cls === "test") {
    const reasons = context?.reasons;
    if (Array.isArray(reasons) && reasons.length > 0) {
      return reasons.filter((x): x is string => typeof x === "string").join(" ");
    }
    return "The task needs test review before continuing.";
  }

  return null;
}

function badgeText(effect: PendingRunEffect): string {
  const cls = classifyEffect(effect);
  if (cls === "confidence") return "confidence";
  if (cls === "test") return "tests";
  return effect.kind;
}

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
      {effects.map((e) => {
        const details = effectDetails(e);
        return (
          <div key={e.effectId} className="card" style={{ padding: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{effectTitle(e)}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {e.effectId}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="pill neutral">{badgeText(e)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{e.status ?? "pending"}</span>
              </div>
            </div>

            {details && <div style={{ fontSize: 13 }}>{details}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn ghost" onClick={() => void answer(e.effectId, false)}>
                Reject
              </button>
              <button className="btn primary" onClick={() => void answer(e.effectId, true)}>
                Approve
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
