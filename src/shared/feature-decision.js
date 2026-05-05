export const DEFAULT_PROJECT_DECISION_POLICY = {
    scope: "balanced",
    impact: "medium",
    risk: "medium",
    autoProceedMode: "suggest",
};
const SCOPE_THRESHOLDS = {
    strict: 85,
    balanced: 70,
    flexible: 55,
    experimental: 40,
};
const IMPACT_THRESHOLDS = {
    low: 50,
    medium: 70,
    high: 85,
};
const RISK_THRESHOLDS = {
    low: 40,
    medium: 60,
    high: 85,
};
export function clampPercent(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}
export function scoreBand(value) {
    const v = clampPercent(value);
    if (v < 40)
        return "very-low";
    if (v < 60)
        return "low";
    if (v < 75)
        return "medium";
    if (v < 90)
        return "high";
    return "very-high";
}
export function evaluateFeatureDecision(score, policy = {}) {
    const resolvedPolicy = {
        ...DEFAULT_PROJECT_DECISION_POLICY,
        ...policy,
    };
    const normalizedScore = {
        scope: clampPercent(score.scope),
        impact: clampPercent(score.impact),
        risk: clampPercent(score.risk),
    };
    const thresholds = {
        scope: SCOPE_THRESHOLDS[resolvedPolicy.scope],
        impact: IMPACT_THRESHOLDS[resolvedPolicy.impact],
        risk: RISK_THRESHOLDS[resolvedPolicy.risk],
    };
    // Scope is a hard gate. High impact or accepted risk does not override low scope fit.
    if (normalizedScore.scope < thresholds.scope) {
        return {
            decision: "no",
            reason: `Scope fit ${normalizedScore.scope}% is below required ${thresholds.scope}%.`,
            score: normalizedScore,
            policy: resolvedPolicy,
            thresholds,
        };
    }
    if (normalizedScore.impact < thresholds.impact) {
        return {
            decision: "defer",
            reason: `Impact ${normalizedScore.impact}% is below required ${thresholds.impact}%.`,
            score: normalizedScore,
            policy: resolvedPolicy,
            thresholds,
        };
    }
    if (normalizedScore.risk > thresholds.risk) {
        return {
            decision: "guard",
            reason: `Risk ${normalizedScore.risk}% is above allowed ${thresholds.risk}%.`,
            score: normalizedScore,
            policy: resolvedPolicy,
            thresholds,
        };
    }
    return {
        decision: "proceed",
        reason: "Scope, impact, and risk are within policy thresholds.",
        score: normalizedScore,
        policy: resolvedPolicy,
        thresholds,
    };
}
