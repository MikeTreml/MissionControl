import React from "react";

import {
  evaluateFeatureDecision,
  scoreBand,
  type FeatureDecisionScore,
  type ProjectDecisionPolicy,
} from "../../../shared/feature-decision";

function bandLabel(value: number): string {
  return scoreBand(value).replace("-", " ");
}

function decisionLabel(decision: string): string {
  switch (decision) {
    case "no": return "No";
    case "defer": return "Defer";
    case "guard": return "Proceed with guardrails";
    case "proceed": return "Proceed";
    default: return decision;
  }
}

export function FeatureDecisionSummary({
  score,
  policy,
}: {
  score: FeatureDecisionScore | null | undefined;
  policy: Partial<ProjectDecisionPolicy> | null | undefined;
}): JSX.Element | null {
  if (!score) return null;

  const result = evaluateFeatureDecision(score, policy ?? {});

  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <h3>Decision summary</h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <ScoreCell label="Scope" value={result.score.scope} required={result.thresholds.scope} />
        <ScoreCell label="Impact" value={result.score.impact} required={result.thresholds.impact} />
        <ScoreCell label="Risk" value={result.score.risk} required={result.thresholds.risk} reverse />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{decisionLabel(result.decision)}</div>
          <div className="muted" style={{ fontSize: 12 }}>{result.reason}</div>
        </div>
        <span className="pill neutral">{result.decision}</span>
      </div>
    </section>
  );
}

function ScoreCell({
  label,
  value,
  required,
  reverse = false,
}: {
  label: string;
  value: number;
  required: number;
  reverse?: boolean;
}): JSX.Element {
  const comparison = reverse ? `max ${required}%` : `min ${required}%`;

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}%</div>
      <div className="muted" style={{ fontSize: 11 }}>
        {bandLabel(value)} · {comparison}
      </div>
    </div>
  );
}
