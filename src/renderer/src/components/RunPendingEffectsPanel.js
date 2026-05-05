import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRunPendingEffects } from "../hooks/useRunPendingEffects";
import { useRunStatus, extractRunPath } from "../hooks/useRunStatus";
function asRecord(value) {
    return value && typeof value === "object" ? value : null;
}
function getContext(effect) {
    return asRecord(effect.context) ?? asRecord(asRecord(effect.value)?.context) ?? asRecord(asRecord(effect.data)?.context);
}
function getTags(effect) {
    const tags = effect.tags ?? asRecord(effect.value)?.tags ?? asRecord(effect.data)?.tags;
    return Array.isArray(tags) ? tags.filter((x) => typeof x === "string") : [];
}
function getQuestion(effect) {
    const direct = effect.question ?? asRecord(effect.value)?.question ?? asRecord(effect.data)?.question;
    return typeof direct === "string" && direct.length > 0 ? direct : null;
}
function classifyEffect(effect) {
    const tags = getTags(effect);
    const label = `${effect.label ?? ""} ${effect.kind ?? ""}`.toLowerCase();
    if (tags.includes("confidence-gate") || label.includes("confidence"))
        return "confidence";
    if (tags.includes("test-gate") || label.includes("test"))
        return "test";
    return "generic";
}
function effectTitle(effect) {
    const cls = classifyEffect(effect);
    if (cls === "confidence")
        return "Confidence review required";
    if (cls === "test")
        return "Test review required";
    return effect.label ?? effect.kind;
}
function effectDetails(effect) {
    const context = getContext(effect);
    const question = getQuestion(effect);
    if (question)
        return question;
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
            return reasons.filter((x) => typeof x === "string").join(" ");
        }
        return "The task needs test review before continuing.";
    }
    return null;
}
function badgeText(effect) {
    const cls = classifyEffect(effect);
    if (cls === "confidence")
        return "confidence";
    if (cls === "test")
        return "tests";
    return effect.kind;
}
export function RunPendingEffectsPanel({ taskId }) {
    const { effects, loading, error, refresh } = useRunPendingEffects(taskId);
    const { status } = useRunStatus(taskId);
    const runPathFromStatus = extractRunPath(status);
    async function answer(effectId, approved) {
        const effect = effects.find((e) => e.effectId === effectId);
        const runPath = (typeof effect?.runPath === "string" ? effect.runPath : null) ?? runPathFromStatus;
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
        }
        catch (err) {
            console.error("respondBreakpoint failed", err);
        }
    }
    if (loading && effects.length === 0) {
        return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Pending actions" }), _jsx("div", { className: "muted", children: "Loading\u2026" })] }));
    }
    if (error) {
        return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Pending actions" }), _jsxs("div", { className: "muted", children: ["Error: ", error] }), _jsx("button", { className: "btn ghost", onClick: () => void refresh(), children: "Retry" })] }));
    }
    if (!effects || effects.length === 0) {
        return null;
    }
    return (_jsxs("section", { className: "card", style: { display: "grid", gap: 10 }, children: [_jsxs("h3", { children: ["Pending actions \u00B7 ", effects.length] }), effects.map((e) => {
                const details = effectDetails(e);
                return (_jsxs("div", { className: "card", style: { padding: 10, display: "grid", gap: 8 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600 }, children: effectTitle(e) }), _jsx("div", { className: "muted", style: { fontSize: 12 }, children: e.effectId })] }), _jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsx("span", { className: "pill neutral", children: badgeText(e) }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: e.status ?? "pending" })] })] }), details && _jsx("div", { style: { fontSize: 13 }, children: details }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { className: "btn ghost", onClick: () => void answer(e.effectId, false), children: "Reject" }), _jsx("button", { className: "btn primary", onClick: () => void answer(e.effectId, true), children: "Approve" })] })] }, e.effectId));
            })] }));
}
