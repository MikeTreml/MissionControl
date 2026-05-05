import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { evaluateFeatureDecision, scoreBand, } from "../../../shared/feature-decision";
function bandLabel(value) {
    return scoreBand(value).replace("-", " ");
}
function decisionLabel(decision) {
    switch (decision) {
        case "no": return "No";
        case "defer": return "Defer";
        case "guard": return "Proceed with guardrails";
        case "proceed": return "Proceed";
        default: return decision;
    }
}
export function FeatureDecisionSummary({ score, policy, }) {
    if (!score)
        return null;
    const result = evaluateFeatureDecision(score, policy ?? {});
    return (_jsxs("section", { className: "card", style: { display: "grid", gap: 10 }, children: [_jsx("h3", { children: "Decision summary" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }, children: [_jsx(ScoreCell, { label: "Scope", value: result.score.scope, required: result.thresholds.scope }), _jsx(ScoreCell, { label: "Impact", value: result.score.impact, required: result.thresholds.impact }), _jsx(ScoreCell, { label: "Risk", value: result.score.risk, required: result.thresholds.risk, reverse: true })] }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700 }, children: decisionLabel(result.decision) }), _jsx("div", { className: "muted", style: { fontSize: 12 }, children: result.reason })] }), _jsx("span", { className: "pill neutral", children: result.decision })] })] }));
}
function ScoreCell({ label, value, required, reverse = false, }) {
    const comparison = reverse ? `max ${required}%` : `min ${required}%`;
    return (_jsxs("div", { className: "card", style: { padding: 10 }, children: [_jsx("div", { className: "muted", style: { fontSize: 12 }, children: label }), _jsxs("div", { style: { fontSize: 22, fontWeight: 700 }, children: [value, "%"] }), _jsxs("div", { className: "muted", style: { fontSize: 11 }, children: [bandLabel(value), " \u00B7 ", comparison] })] }));
}
