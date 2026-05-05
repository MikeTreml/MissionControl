import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { deviconSvgUrl, languageToDeviconSlug } from "../../lib/devicon-languages";
import { publish } from "../../hooks/data-bus";
import { pushToast, pushErrorToast } from "../../hooks/useToasts";
const KIND_OPTIONS = ["agent", "skill", "workflow", "example"];
const CONTAINER_KIND_OPTIONS = [
    "",
    "methodology",
    "specialization",
    "cradle",
    "contrib",
    "core",
    "domain",
];
const DOMAIN_GROUP_OPTIONS = ["", "business", "science", "social-sciences-humanities"];
export function DetailPanel({ item }) {
    const [editMode, setEditMode] = useState(false);
    const [draft, setDraft] = useState(null);
    const [original, setOriginal] = useState(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!item) {
            setDraft(null);
            setOriginal(null);
            setEditMode(false);
            return;
        }
        const d = itemToDraft(item);
        setDraft(d);
        setOriginal(d);
        setEditMode(false);
    }, [item?.id]);
    const display = useMemo(() => {
        if (!item || !draft)
            return null;
        return mergeDraft(item, draft);
    }, [item, draft]);
    const dirty = useMemo(() => {
        if (!draft || !original)
            return false;
        return JSON.stringify(draft) !== JSON.stringify(original);
    }, [draft, original]);
    /**
     * Persist edits to the item's sidecar (`INFO.json` next to AGENT.md/
     * SKILL.md, or `<stem>.info.json` next to flat workflow/example
     * sources). Only the SIDECAR_OVERRIDE_FIELDS subset reaches disk —
     * the IPC drops anything else. Computed fields (id / diskPath /
     * sizeBytes / modifiedAt) are recomputed by the walker on rebuild.
     */
    async function handleSave() {
        if (!item || !draft || !window.mc?.saveItemInfo)
            return;
        setSaving(true);
        try {
            // Build a patch of only the editable fields. Empty strings → null
            // so the sidecar reverts to source-derived values for that field.
            const patch = {
                name: draft.name.trim() || null,
                description: draft.description.trim() || null,
                role: draft.role.trim() || null,
                version: draft.version.trim() || null,
                container: draft.container.trim() || null,
                containerKind: draft.containerKind.trim() || null,
                domainGroup: draft.domainGroup.trim() || null,
                tags: parseList(draft.tagsText),
                languages: parseList(draft.languagesText),
                expertise: parseList(draft.expertiseText),
            };
            if (item.kind === "workflow") {
                patch.hasParallel = draft.hasParallel === "yes";
                patch.hasBreakpoints = draft.hasBreakpoints === "yes";
                const steps = Number(draft.estimatedStepsText);
                patch.estimatedSteps = Number.isFinite(steps) && steps > 0 ? Math.floor(steps) : null;
                patch.usesAgents = parseList(draft.usesAgentsText);
                patch.usesSkills = parseList(draft.usesSkillsText);
            }
            await window.mc.saveItemInfo({
                kind: item.kind,
                diskPath: item.diskPath,
                patch,
            });
            pushToast({ taskId: "", tone: "good", title: "Item saved", detail: item.name });
            setOriginal(draft);
            setEditMode(false);
            // Refresh the library index so the new fields show up everywhere
            // (tree, Run Workflow modal, etc.).
            publish("workflows");
        }
        catch (e) {
            pushErrorToast("Failed to save item", e, item.id);
        }
        finally {
            setSaving(false);
        }
    }
    function handleDiscard() {
        if (original)
            setDraft(original);
        setEditMode(false);
    }
    return (_jsxs("div", { className: "card", style: { minHeight: 480 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Detail" }), item && (_jsxs("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: editMode, onChange: (e) => {
                                    const on = e.target.checked;
                                    setEditMode(on);
                                    // Reset draft from the original (which mirrors disk) on
                                    // toggle. Same effect as Discard — keeps the toggle
                                    // explicit + non-destructive of saved work.
                                    if (item && original)
                                        setDraft(original);
                                } }), "Edit"] }))] }), !item && (_jsx("p", { className: "muted", style: { fontSize: 13 }, children: "Select an item to inspect metadata." })), item && display && (_jsxs("div", { style: { display: "grid", gap: 12 }, children: [editMode && (_jsxs("div", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: 8,
                            background: "var(--panel)",
                            borderRadius: 6,
                            fontSize: 12,
                        }, children: [_jsxs("span", { className: "muted", style: { flex: 1 }, children: ["Edits write to a sidecar (", _jsx("code", { children: "INFO.json" }), " or", " ", _jsx("code", { children: "<stem>.info.json" }), ") next to the source file. Source files are not modified. Empty a field to clear the override."] }), _jsx("button", { className: "button ghost", onClick: () => handleDiscard(), disabled: saving || !dirty, style: { padding: "4px 10px", fontSize: 12 }, children: "Discard" }), _jsx("button", { className: "button", onClick: () => void handleSave(), disabled: saving || !dirty, style: { padding: "4px 10px", fontSize: 12 }, children: saving ? "Saving…" : "Save" })] })), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { className: "button ghost", onClick: () => void navigator.clipboard?.writeText(item.logicalPath), children: "Copy logical path" }), _jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.diskPath), children: "Open file" }), item.inputsSchemaPath && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.inputsSchemaPath), children: "Open schema" })), item.companionDoc && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.companionDoc), children: "Open companion doc" })), item.examplesDir && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.examplesDir), children: "Open examples folder" })), item.readmeMdPath && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.readmeMdPath), children: "Open README" })), item.descriptionMdPath && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.descriptionMdPath), children: "Open description" })), item.containerReadmePath && (_jsx("button", { className: "button ghost", onClick: () => void window.mc?.openPath(item.containerReadmePath), children: "Open container README" }))] }), _jsx(Section, { title: "Overview", children: editMode ? (_jsxs(_Fragment, { children: [_jsx(EnumRow, { label: "Kind", value: draft.kind, options: KIND_OPTIONS, onChange: (v) => setDraft((d) => (d ? { ...d, kind: v } : d)) }), _jsx(InputRow, { label: "Name", value: draft.name, onChange: (v) => setDraft((d) => (d ? { ...d, name: v } : d)) }), _jsx(InputRow, { label: "Logical path", value: draft.logicalPath, mono: true, onChange: (v) => setDraft((d) => (d ? { ...d, logicalPath: v } : d)) }), _jsx(InputRow, { label: "Version", value: draft.version, onChange: (v) => setDraft((d) => (d ? { ...d, version: v } : d)) }), _jsx(InputRow, { label: "Container", value: draft.container, onChange: (v) => setDraft((d) => (d ? { ...d, container: v } : d)) }), _jsx(EnumRow, { label: "Container kind", value: draft.containerKind, options: [...CONTAINER_KIND_OPTIONS], onChange: (v) => setDraft((d) => (d ? { ...d, containerKind: v } : d)) }), _jsx(EnumRow, { label: "Domain group", value: draft.domainGroup, options: [...DOMAIN_GROUP_OPTIONS], onChange: (v) => setDraft((d) => (d ? { ...d, domainGroup: v } : d)) }), _jsx(TextAreaRow, { label: "Description", value: draft.description, onChange: (v) => setDraft((d) => (d ? { ...d, description: v } : d)) }), _jsx(InputRow, { label: "Role", value: draft.role, onChange: (v) => setDraft((d) => (d ? { ...d, role: v } : d)) })] })) : (_jsxs(_Fragment, { children: [_jsx(ReadRow, { label: "Kind", value: display.kind, mono: true }), _jsx(ReadRow, { label: "Name", value: display.name }), _jsx(ReadRow, { label: "Logical path", value: display.logicalPath, mono: true }), _jsx(ReadRow, { label: "Version", value: display.version || "(none)" }), _jsx(ReadRow, { label: "Container", value: display.container ?? "(none)" }), _jsx(ReadRow, { label: "Container kind", value: display.containerKind ?? "(none)" }), _jsx(ReadRow, { label: "Domain group", value: display.domainGroup ?? "(none)" }), _jsx(ReadRow, { label: "Description", value: display.description ?? "(none)" }), _jsx(ReadRow, { label: "Role", value: display.role ?? "(none)" })] })) }), _jsx(Section, { title: "Languages", children: editMode ? (_jsx(TextAreaRow, { label: "Languages (comma or newline separated)", value: draft.languagesText, onChange: (v) => setDraft((d) => (d ? { ...d, languagesText: v } : d)) })) : (_jsx(LanguageDisplay, { languages: display.languages })) }), _jsx(Section, { title: "Tags & expertise", children: editMode ? (_jsxs(_Fragment, { children: [_jsx(TextAreaRow, { label: "Tags", value: draft.tagsText, onChange: (v) => setDraft((d) => (d ? { ...d, tagsText: v } : d)) }), _jsx(TextAreaRow, { label: "Expertise", value: draft.expertiseText, onChange: (v) => setDraft((d) => (d ? { ...d, expertiseText: v } : d)) })] })) : (_jsxs(_Fragment, { children: [_jsx(ReadRow, { label: "Tags", value: display.tags.length ? display.tags.join(", ") : "(none)" }), _jsx(ReadRow, { label: "Expertise", value: display.expertise.length ? display.expertise.join(", ") : "(none)" })] })) }), _jsx(Section, { title: "Source (originalSource)", children: display.originalSource && Object.keys(display.originalSource).length > 0 ? (_jsx("div", { style: { display: "grid", gap: 6, fontSize: 13 }, children: Object.entries(display.originalSource).map(([k, v]) => (_jsx(ReadRow, { label: k, value: v === undefined || v === null || v === "" ? "(none)" : String(v), mono: typeof v === "string" && v.includes("/") }, k))) })) : (_jsx("p", { className: "muted", style: { fontSize: 12, margin: 0 }, children: "(none)" })) }), display.kind === "workflow" && (_jsx(Section, { title: "Workflow", children: editMode ? (_jsxs(_Fragment, { children: [_jsx(InputRow, { label: "Estimated steps", value: draft.estimatedStepsText, onChange: (v) => setDraft((d) => (d ? { ...d, estimatedStepsText: v } : d)) }), _jsx(EnumRow, { label: "Has parallel", value: draft.hasParallel, options: ["yes", "no"], onChange: (v) => setDraft((d) => (d ? { ...d, hasParallel: v } : d)) }), _jsx(EnumRow, { label: "Has breakpoints", value: draft.hasBreakpoints, options: ["yes", "no"], onChange: (v) => setDraft((d) => (d ? { ...d, hasBreakpoints: v } : d)) }), _jsx(TextAreaRow, { label: "Uses agents (one path per line)", value: draft.usesAgentsText, onChange: (v) => setDraft((d) => (d ? { ...d, usesAgentsText: v } : d)) }), _jsx(TextAreaRow, { label: "Uses skills (one path per line)", value: draft.usesSkillsText, onChange: (v) => setDraft((d) => (d ? { ...d, usesSkillsText: v } : d)) }), _jsx(ReadRow, { label: "Inputs schema path", value: display.inputsSchemaPath ?? "(none)", mono: true }), _jsx(ReadRow, { label: "Examples dir", value: display.examplesDir ?? "(none)", mono: true }), _jsx(ReadRow, { label: "Companion doc", value: display.companionDoc ?? "(none)", mono: true })] })) : (_jsxs(_Fragment, { children: [_jsx(ReadRow, { label: "Estimated steps", value: String(display.estimatedSteps ?? 0) }), _jsx(ReadRow, { label: "Has parallel", value: display.hasParallel ? "yes" : "no" }), _jsx(ReadRow, { label: "Has breakpoints", value: display.hasBreakpoints ? "yes" : "no" }), _jsx(ReadRow, { label: "Inputs schema path", value: display.inputsSchemaPath ?? "(none)", mono: true }), _jsx(ReadRow, { label: "Examples dir", value: display.examplesDir ?? "(none)", mono: true }), _jsx(ReadRow, { label: "Companion doc", value: display.companionDoc ?? "(none)", mono: true }), _jsx(ListBlock, { label: "Uses agents", items: display.usesAgents }), _jsx(ListBlock, { label: "Uses skills", items: display.usesSkills })] })) }))] }))] }));
}
function itemToDraft(item) {
    return {
        kind: item.kind,
        name: item.name,
        logicalPath: item.logicalPath,
        version: item.version ?? "",
        container: item.container ?? "",
        containerKind: item.containerKind ?? "",
        domainGroup: item.domainGroup ?? "",
        description: item.description ?? "",
        role: item.role ?? "",
        languagesText: (item.languages ?? []).join(", "),
        tagsText: (item.tags ?? []).join(", "),
        expertiseText: (item.expertise ?? []).join(", "),
        estimatedStepsText: String(item.estimatedSteps ?? 0),
        hasParallel: item.hasParallel ? "yes" : "no",
        hasBreakpoints: item.hasBreakpoints ? "yes" : "no",
        usesAgentsText: (item.usesAgents ?? []).join("\n"),
        usesSkillsText: (item.usesSkills ?? []).join("\n"),
    };
}
function parseList(text) {
    return text
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
function mergeDraft(item, draft) {
    const base = {
        ...item,
        kind: draft.kind,
        name: draft.name,
        logicalPath: draft.logicalPath,
        version: draft.version || null,
        container: draft.container || null,
        containerKind: draft.containerKind || null,
        domainGroup: draft.domainGroup || null,
        description: draft.description || null,
        role: draft.role || null,
        languages: parseList(draft.languagesText),
        tags: parseList(draft.tagsText),
        expertise: parseList(draft.expertiseText),
    };
    if (draft.kind !== "workflow") {
        return {
            ...base,
            inputsSchemaPath: undefined,
            examplesDir: undefined,
            companionDoc: undefined,
            usesAgents: undefined,
            usesSkills: undefined,
            estimatedSteps: undefined,
            hasParallel: undefined,
            hasBreakpoints: undefined,
        };
    }
    const est = Number.parseInt(draft.estimatedStepsText, 10);
    return {
        ...base,
        estimatedSteps: Number.isFinite(est) ? est : item.estimatedSteps,
        hasParallel: draft.hasParallel === "yes",
        hasBreakpoints: draft.hasBreakpoints === "yes",
        usesAgents: parseList(draft.usesAgentsText),
        usesSkills: parseList(draft.usesSkillsText),
        readmeMdPath: null,
    };
}
function Section({ title, children }) {
    return (_jsxs("div", { style: { borderTop: "1px solid var(--border)", paddingTop: 10 }, children: [_jsx("div", { className: "muted", style: { fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }, children: title }), _jsx("div", { style: { display: "grid", gap: 8 }, children: children })] }));
}
function ReadRow({ label, value, mono = false }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "muted", style: { fontSize: 11, marginBottom: 2 }, children: label }), _jsx("div", { style: { fontSize: 13, fontFamily: mono ? "Consolas, monospace" : "inherit", wordBreak: "break-word" }, children: value })] }));
}
function InputRow({ label, value, mono = false, onChange, }) {
    return (_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: label }), _jsx("input", { value: value, onChange: (e) => onChange(e.target.value), style: {
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontFamily: mono ? "Consolas, monospace" : "inherit",
                    fontSize: 13,
                } })] }));
}
function TextAreaRow({ label, value, onChange, }) {
    return (_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: label }), _jsx("textarea", { value: value, onChange: (e) => onChange(e.target.value), rows: 4, style: {
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    resize: "vertical",
                } })] }));
}
function EnumRow({ label, value, options, onChange, }) {
    return (_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: label }), _jsx("select", { value: value, onChange: (e) => onChange(e.target.value), style: {
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13,
                    maxWidth: "100%",
                }, children: options.map((opt) => (_jsx("option", { value: opt, children: opt === "" ? "(none)" : opt }, opt || "__empty"))) })] }));
}
function ListBlock({ label, items }) {
    const list = items ?? [];
    if (list.length === 0) {
        return _jsx(ReadRow, { label: label, value: "(none)" });
    }
    return (_jsxs("div", { children: [_jsx("div", { className: "muted", style: { fontSize: 11, marginBottom: 4 }, children: label }), _jsx("ul", { style: { margin: 0, paddingLeft: 18, fontSize: 12, fontFamily: "Consolas, monospace" }, children: list.map((line) => (_jsx("li", { style: { wordBreak: "break-all" }, children: line }, line))) })] }));
}
function LanguageDisplay({ languages }) {
    if (!languages.length) {
        return _jsx(ReadRow, { label: "Languages", value: "(none)" });
    }
    return (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }, children: languages.map((lang) => (_jsx(LanguageChip, { lang: lang }, lang))) }));
}
function LanguageChip({ lang }) {
    const slug = useMemo(() => languageToDeviconSlug(lang), [lang]);
    const [iconFailed, setIconFailed] = useState(false);
    if (!slug || iconFailed) {
        return (_jsx("span", { style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                fontSize: 12,
            }, children: lang }));
    }
    return (_jsxs("span", { style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--panel)",
            fontSize: 12,
        }, children: [_jsx("img", { src: deviconSvgUrl(slug, "original"), alt: "", width: 20, height: 20, style: { flexShrink: 0 }, onError: (e) => {
                    const el = e.currentTarget;
                    if (el.dataset["triedPlain"] === "1") {
                        setIconFailed(true);
                        return;
                    }
                    el.dataset["triedPlain"] = "1";
                    el.src = deviconSvgUrl(slug, "plain");
                } }), _jsx("span", { children: lang })] }));
}
