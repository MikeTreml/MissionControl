import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Per-project memory file editor. Reads/writes
 * `~/.pi/memory-md/<projectId>/MEMORY.md` via the memory:read/write
 * IPC, scoped to the project shown on Project Detail.
 *
 * Pi will consume this file directly on its next session boot (per
 * CLAUDE.md "pi-memory-md wire-up" item). This card just gives the
 * operator a place to edit it without leaving MC. Saves are explicit;
 * unsaved edits are kept in local state.
 *
 * Hidden in demo mode (sample projects can't have a real memory file
 * — pi wouldn't see it anyway).
 */
import { useEffect, useState } from "react";
import { pushErrorToast, pushToast } from "../hooks/useToasts";
export function ProjectMemoryCard({ projectId, isDemo, }) {
    const [original, setOriginal] = useState(null);
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    async function load() {
        if (!window.mc?.readProjectMemory)
            return;
        try {
            setLoading(true);
            setError("");
            const text = await window.mc.readProjectMemory(projectId);
            setOriginal(text ?? "");
            setDraft(text ?? "");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => { void load(); }, [projectId]);
    async function save() {
        if (!window.mc?.writeProjectMemory)
            return;
        setSaving(true);
        setError("");
        try {
            await window.mc.writeProjectMemory(projectId, draft);
            setOriginal(draft);
            pushToast({ taskId: "", tone: "good", title: "Memory saved", detail: `${projectId}/MEMORY.md` });
        }
        catch (e) {
            pushErrorToast("Failed to save memory", e, projectId);
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    }
    if (isDemo)
        return null;
    const dirty = original !== null && draft !== original;
    const placeholder = "Notes pi should remember about this project across sessions.\n\n" +
        "Examples:\n" +
        "- conventions: prefer X over Y\n" +
        "- known traps: don't touch <file>\n" +
        "- people: @michael owns the data layer\n";
    return (_jsxs("section", { className: "card", style: { marginBottom: 14 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Project memory" }), _jsx("div", { className: "muted", style: { fontSize: 11 }, children: _jsxs("code", { children: ["~/.pi/memory-md/", projectId, "/MEMORY.md"] }) })] }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Free-form notes pi loads at the start of every session for this project. Edit here; pi picks up changes on its next run." }), _jsx("textarea", { className: "input", value: loading ? "" : draft, onChange: (e) => setDraft(e.target.value), placeholder: loading ? "Loading…" : placeholder, rows: 10, disabled: loading || saving, style: {
                    marginTop: 10,
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    lineHeight: 1.5,
                } }), _jsxs("div", { style: { marginTop: 10, display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("button", { className: "button", onClick: () => void save(), disabled: !dirty || saving, children: saving ? "Saving…" : "Save" }), dirty && !saving && (_jsx("button", { className: "button ghost", onClick: () => setDraft(original ?? ""), children: "Discard" })), dirty && (_jsx("span", { className: "muted", style: { fontSize: 12 }, children: "Unsaved changes" })), !dirty && original !== null && original.length > 0 && !saving && (_jsxs("span", { className: "muted", style: { fontSize: 12 }, children: [original.length.toLocaleString(), " chars"] })), error && (_jsx("span", { className: "muted", style: { color: "var(--bad)", fontSize: 12 }, children: error }))] })] }));
}
