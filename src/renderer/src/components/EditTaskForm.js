import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Edit-task modal. Mirrors the Edit-project pattern but is edit-only —
 * task creation has its own form (CreateTaskForm) with workflow/kind/
 * items pickers that don't make sense post-create.
 *
 * Editable fields:
 *   - title         (re-rendered on next /yolo or /plan PROMPT.md)
 *   - description   (same)
 *
 * NOT editable:
 *   - id, project, workflow, kind — id-bearing or shape-bearing fields
 *     are immutable post-create. Re-create the task if you need them
 *     different.
 *   - blocker        — has its own inline editor on Task Detail.
 *   - lane / runState — lifecycle, driven by RunManager, not user-edit.
 *
 * On save: window.mc.saveTask(...) bumps updatedAt and emits a
 * task-saved event so other panels refetch via the data-bus.
 */
import { useEffect, useState } from "react";
import { publish } from "../hooks/data-bus";
import { Modal } from "./Modal";
export function EditTaskForm({ open, onClose, task, }) {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    // Re-sync when the subject task changes or the modal re-opens.
    useEffect(() => {
        setTitle(task.title);
        setDescription(task.description);
        setError("");
        setSaving(false);
    }, [task.id, open]);
    function close() {
        setError("");
        setSaving(false);
        onClose();
    }
    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        const cleanTitle = title.trim();
        if (!cleanTitle) {
            setError("Title can't be empty.");
            return;
        }
        if (!window.mc) {
            setError("Bridge unavailable. Reopen the app.");
            return;
        }
        try {
            setSaving(true);
            await window.mc.saveTask({
                ...task,
                title: cleanTitle,
                description: description.trim(),
            });
            publish("tasks");
            close();
        }
        catch (err) {
            console.error("[EditTaskForm] saveTask threw:", err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setSaving(false);
        }
    }
    const dirty = title.trim() !== task.title || description.trim() !== task.description;
    return (_jsx(Modal, { open: open, title: `Edit — ${task.id}`, onClose: close, children: _jsxs("form", { onSubmit: (e) => { void onSubmit(e); }, style: { display: "grid", gap: 12 }, children: [_jsx(Field, { label: "Title", children: _jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Short, imperative \u2014 what should the agent accomplish?", autoFocus: true, required: true, style: inputStyle }) }), _jsx(Field, { label: "Description", children: _jsx("textarea", { value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Optional \u2014 context, constraints, links. Becomes part of the next PROMPT.md.", rows: 6, style: { ...inputStyle, fontFamily: "inherit", resize: "vertical" } }) }), _jsx("p", { className: "muted", style: { fontSize: 11, margin: 0 }, children: "Saved changes show up in the Mission card on the next Start (PROMPT.md is regenerated from title + description each run). Past runs in Run History are unaffected." }), error && (_jsx("div", { className: "card", style: {
                        borderColor: "var(--bad)",
                        background: "rgba(232, 116, 116,0.08)",
                        fontSize: 13,
                    }, children: error })), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [_jsx("button", { type: "button", className: "button ghost", onClick: close, disabled: saving, children: "Cancel" }), _jsx("button", { type: "submit", className: "button", disabled: saving || !dirty, children: saving ? "Saving…" : "Save changes" })] })] }) }));
}
function Field({ label, children }) {
    return (_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 12 }, children: label }), children] }));
}
const inputStyle = {
    background: "var(--panel-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    width: "100%",
};
