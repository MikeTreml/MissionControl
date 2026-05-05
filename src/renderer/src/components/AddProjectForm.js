import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Project form — creates OR edits a project depending on the `editing` prop.
 *
 * Create mode (`editing` is undefined):
 *   - All fields editable. Prefix required.
 *   - Submit button = "Create Project"
 *
 * Edit mode (`editing: ProjectWithGit`):
 *   - id + prefix displayed as read-only (immutable — task IDs reference them)
 *   - Name / path / icon / notes editable
 *   - Submit button = "Save changes"
 *   - "Delete project" button at bottom with inline two-step confirm
 *
 * Modal only closes via Esc, the ✕ button, Cancel, successful submit,
 * or a confirmed delete — NOT on backdrop click.
 */
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useProjects } from "../hooks/useProjects";
import { publish } from "../hooks/data-bus";
function slugify(s) {
    return s
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-|-$/g, "");
}
export function AddProjectForm({ open, onClose, editing, }) {
    const isEdit = Boolean(editing);
    const { refresh } = useProjects();
    const [name, setName] = useState(editing?.name ?? "");
    const [prefix, setPrefix] = useState(editing?.prefix ?? "");
    const [path, setPath] = useState(editing?.path ?? "");
    const [icon, setIcon] = useState(editing?.icon ?? "");
    const [notes, setNotes] = useState(editing?.notes ?? "");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    // Re-sync form fields whenever the subject changes (e.g. switching from
    // one project's edit modal to another's).
    useEffect(() => {
        setName(editing?.name ?? "");
        setPrefix(editing?.prefix ?? "");
        setPath(editing?.path ?? "");
        setIcon(editing?.icon ?? "");
        setNotes(editing?.notes ?? "");
        setError("");
        setSaving(false);
        setConfirmDelete(false);
    }, [editing?.id, open]);
    const close = () => {
        setError("");
        setSaving(false);
        setConfirmDelete(false);
        onClose();
    };
    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        const trimmedName = name.trim();
        const cleanPrefix = prefix.trim().toUpperCase();
        const cleanPath = path.trim();
        console.log(`[ProjectForm] submit (${isEdit ? "edit" : "create"})`, {
            id: editing?.id,
            name: trimmedName,
            prefix: cleanPrefix,
            path: cleanPath,
            icon,
            notesLength: notes.length,
            windowMcAvailable: Boolean(window.mc),
        });
        if (!trimmedName)
            return setError("Name is required");
        if (!isEdit) {
            if (!/^[A-Z0-9]{1,8}$/.test(cleanPrefix)) {
                return setError("Prefix must be 1–8 alphanumeric characters");
            }
        }
        if (!window.mc) {
            console.error("[ProjectForm] window.mc missing — preload failed to load");
            return setError("Not connected to main process — preload didn't load. See DevTools console.");
        }
        try {
            setSaving(true);
            if (isEdit && editing) {
                const updated = await window.mc.updateProject(editing.id, {
                    name: trimmedName,
                    path: cleanPath,
                    icon: icon.trim(),
                    notes,
                });
                console.log("[ProjectForm] updateProject returned:", updated);
            }
            else {
                const id = slugify(trimmedName);
                if (!id)
                    return setError("Name must contain at least one letter or digit");
                const created = await window.mc.createProject({
                    id,
                    name: trimmedName,
                    prefix: cleanPrefix,
                    path: cleanPath,
                    icon: icon.trim(),
                    notes,
                });
                console.log("[ProjectForm] createProject returned:", created);
            }
            publish("projects");
            await refresh();
            close();
        }
        catch (err) {
            console.error("[ProjectForm] submit threw:", err);
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function onDelete() {
        if (!editing)
            return;
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        if (!window.mc) {
            return setError("Not connected to main process");
        }
        try {
            setSaving(true);
            console.log("[ProjectForm] deleting", editing.id);
            await window.mc.deleteProject(editing.id);
            publish("projects");
            await refresh();
            close();
        }
        catch (err) {
            console.error("[ProjectForm] delete threw:", err);
            setError(err instanceof Error ? err.message : String(err));
            setConfirmDelete(false);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Modal, { open: open, title: isEdit ? `Edit — ${editing?.name ?? ""}` : "+ Add Project", onClose: close, children: _jsxs("form", { onSubmit: onSubmit, children: [_jsx(Field, { label: "Name", children: _jsx("input", { autoFocus: true, type: "text", value: name, onChange: (e) => setName(e.target.value), placeholder: "DogApp" }) }), _jsx(Field, { label: "Prefix", hint: isEdit
                        ? "Immutable — task IDs already reference this."
                        : "1–8 alphanumeric chars. Used in task IDs (e.g. DA-001F). Auto-uppercased, must be unique.", children: _jsx("input", { type: "text", value: prefix, onChange: (e) => !isEdit && setPrefix(e.target.value.toUpperCase()), maxLength: 8, readOnly: isEdit, style: {
                            textTransform: "uppercase",
                            opacity: isEdit ? 0.6 : 1,
                        }, placeholder: "DA" }) }), _jsx(Field, { label: "Local path (optional)", hint: "Point to a folder on disk. If it contains a .git/config we'll surface the remote (GitHub / Azure DevOps) automatically. Leave empty for track-only.", children: _jsx("input", { type: "text", value: path, onChange: (e) => setPath(e.target.value), placeholder: "C:\\Users\\you\\source\\repos\\myproject" }) }), _jsx(Field, { label: "Icon (optional)", hint: "Pick one below, or type your own (emoji or 1\u20134 chars). Leave empty to use the prefix.", children: _jsx("input", { type: "text", value: icon, onChange: (e) => setIcon(e.target.value), maxLength: 4, placeholder: "(empty = prefix)" }) }), _jsx(IconPicker, { value: icon, onChange: setIcon }), _jsx(Field, { label: "Notes (optional)", children: _jsx("textarea", { rows: 3, value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "Anything future-you will want to remember\u2026" }) }), error && (_jsx("div", { className: "muted", style: {
                        color: "var(--bad)",
                        background: "rgba(232, 116, 116,0.1)",
                        border: "1px solid var(--bad)",
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginTop: 8,
                        fontSize: 13,
                    }, children: error })), _jsxs("div", { style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 14,
                    }, children: [_jsx("div", { children: isEdit && (_jsx("button", { type: "button", onClick: onDelete, disabled: saving, className: confirmDelete ? "button bad" : "button ghost", style: {
                                    color: confirmDelete ? undefined : "var(--bad)",
                                    borderColor: confirmDelete ? undefined : "var(--bad)",
                                }, children: confirmDelete ? "Click again to confirm delete" : "Delete project" })) }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { type: "button", className: "button ghost", onClick: close, children: "Cancel" }), _jsx("button", { type: "submit", className: "button", disabled: saving, children: saving
                                        ? (isEdit ? "Saving…" : "Creating…")
                                        : (isEdit ? "Save changes" : "Create Project") })] })] })] }) }));
}
/** Curated starter set of project-flavored icons. User can still type custom. */
const ICON_CHOICES = [
    { icon: "🐕", label: "Pet / consumer app" },
    { icon: "💼", label: "Business / enterprise" },
    { icon: "📊", label: "Analytics / reporting" },
    { icon: "🏭", label: "Manufacturing / FO" },
    { icon: "💰", label: "Finance" },
    { icon: "📦", label: "Inventory / package" },
    { icon: "🛒", label: "Commerce / sales" },
    { icon: "⚙️", label: "Core / utilities" },
    { icon: "🔧", label: "Tools / devops" },
    { icon: "🧪", label: "Testing / experiments" },
    { icon: "🚀", label: "Launch / deploy" },
    { icon: "🤖", label: "AI / automation" },
    { icon: "🌐", label: "Web" },
    { icon: "📱", label: "Mobile" },
    { icon: "🔒", label: "Security" },
    { icon: "📝", label: "Docs / content" },
    { icon: "🎨", label: "Design" },
    { icon: "🗂️", label: "Files / archive" },
    { icon: "⚡", label: "Automation / pipeline" },
    { icon: "📈", label: "Growth / metrics" },
];
function IconPicker({ value, onChange, }) {
    return (_jsxs("div", { style: {
            display: "grid",
            gridTemplateColumns: "repeat(10, 1fr)",
            gap: 4,
            marginTop: 6,
        }, children: [_jsx("button", { type: "button", onClick: () => onChange(""), title: "Clear \u2014 use prefix", style: pickBtnStyle(value === ""), children: "\u2014" }), ICON_CHOICES.map((c) => (_jsx("button", { type: "button", onClick: () => onChange(c.icon), title: c.label, style: pickBtnStyle(value === c.icon), children: c.icon }, c.icon)))] }));
}
function pickBtnStyle(selected) {
    return {
        padding: "6px 0",
        fontSize: 18,
        lineHeight: 1,
        background: selected ? "rgba(107, 164, 232,0.15)" : "var(--bg)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        color: "var(--text)",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "center",
    };
}
function Field({ label, hint, children, }) {
    return (_jsxs("div", { className: "field", style: { display: "grid", gap: 4, marginBottom: 14 }, children: [_jsx("label", { style: { fontSize: 12, color: "var(--muted)" }, children: label }), _jsx(FieldInput, { children: children }), hint && (_jsx("div", { style: { fontSize: 11, color: "var(--muted)", marginTop: 2 }, children: hint }))] }));
}
function FieldInput({ children }) {
    return (_jsxs("div", { style: { display: "contents" }, className: "field-input-wrap", children: [_jsx("style", { children: `
        .field-input-wrap input,
        .field-input-wrap select,
        .field-input-wrap textarea {
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 11px;
          font-family: inherit;
          font-size: 14px;
        }
      ` }), children] }));
}
