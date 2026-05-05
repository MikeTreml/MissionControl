import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * AskUserCard — renders one pending mc_ask_user question on Task Detail.
 *
 * The agent fired mc_ask_user; the tool's execute() is awaiting our answer
 * before pi can continue. Until the user answers (or cancels), the run is
 * effectively paused — pi's session is stuck on this tool call.
 *
 * Visual: amber-bordered card at the top of Task Detail, above Mission /
 * Status. Shows category badge, question, "What I tried" expander,
 * options as buttons (if provided), and a free-text textarea + Send.
 *
 * Cancel returns to the agent as ERROR: cancelled, which lets the run
 * continue or terminate based on how the agent reacts.
 */
import { useEffect, useRef, useState } from "react";
import { publish } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
const CATEGORY_LABEL = {
    scope: "Scope decision",
    ambiguity: "Ambiguity in PROMPT.md",
    destructive: "About to do something irreversible",
    credential: "Needs a value only you have",
};
export function AskUserCard({ taskId, ask, }) {
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [whyOpen, setWhyOpen] = useState(false);
    const [error, setError] = useState("");
    const textareaRef = useRef(null);
    // Auto-focus the textarea on mount so Enter-to-send Just Works.
    useEffect(() => { textareaRef.current?.focus(); }, [ask.toolCallId]);
    async function send(value) {
        const trimmed = value.trim();
        if (!trimmed) {
            setError("Answer can't be empty.");
            return;
        }
        if (!window.mc)
            return;
        try {
            setBusy(true);
            setError("");
            const ok = await window.mc.answerAsk(taskId, ask.toolCallId, trimmed);
            if (!ok) {
                setError("Answer wasn't routed — the run may have already ended.");
            }
            // Refresh the task event stream so the answered ask drops off.
            publish("tasks");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    async function cancel() {
        if (!window.mc)
            return;
        try {
            setBusy(true);
            await window.mc.cancelAsk(taskId, ask.toolCallId);
            publish("tasks");
        }
        catch (err) {
            console.error("[AskUserCard] cancelAsk failed:", err);
            pushErrorToast("Cancel failed", err, taskId);
        }
        finally {
            setBusy(false);
        }
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - ask.postedAt) / 1000));
    const elapsedLabel = elapsed < 60 ? `${elapsed}s ago`
        : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m ago`
            : `${Math.floor(elapsed / 3600)}h ago`;
    return (_jsxs("section", { className: "card", style: {
            borderLeft: "3px solid var(--warn)",
            paddingLeft: 14,
            background: "rgba(232, 177, 76, 0.04)",
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }, children: [_jsx("span", { className: "pill warn", children: "Agent is asking" }), _jsxs("span", { className: "muted", style: { fontSize: 12 }, children: [CATEGORY_LABEL[ask.params.category], " \u00B7 ", elapsedLabel] })] }), _jsx("p", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 }, children: ask.params.question }), _jsxs("button", { type: "button", className: "button ghost", onClick: () => setWhyOpen((v) => !v), style: { fontSize: 12, padding: "4px 10px", marginBottom: 10 }, children: [whyOpen ? "▾" : "▸", " What I tried"] }), whyOpen && (_jsx("p", { className: "muted", style: {
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    marginBottom: 10,
                    paddingLeft: 8,
                    borderLeft: "2px solid var(--border)",
                }, children: ask.params.why_blocked })), ask.params.options && ask.params.options.length > 0 && (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }, children: ask.params.options.map((opt) => (_jsx("button", { type: "button", className: "button", onClick: () => { void send(opt); }, disabled: busy, style: { fontSize: 13 }, children: opt }, opt))) })), _jsx("textarea", { ref: textareaRef, value: answer, onChange: (e) => setAnswer(e.target.value), onKeyDown: (e) => {
                    // Cmd/Ctrl+Enter sends; plain Enter inserts a newline (multi-line answers).
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        void send(answer);
                    }
                }, placeholder: "Your answer (Ctrl+Enter to send)", rows: 3, disabled: busy, style: {
                    width: "100%",
                    background: "var(--panel-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "vertical",
                } }), error && (_jsx("div", { className: "muted", style: { color: "var(--bad)", fontSize: 12, marginTop: 6 }, children: error })), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }, children: [_jsx("button", { type: "button", className: "button ghost", onClick: () => { void cancel(); }, disabled: busy, title: "Cancel \u2014 the agent will see ERROR: cancelled and decide whether to continue or stop.", children: "Cancel" }), _jsx("button", { type: "button", className: "button", onClick: () => { void send(answer); }, disabled: busy || answer.trim().length === 0, children: busy ? "Sending…" : "Send" })] })] }));
}
