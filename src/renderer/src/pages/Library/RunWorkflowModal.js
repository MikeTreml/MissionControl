import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { InputsForm } from "../../components/InputsForm";
import { useProjects } from "../../hooks/useProjects";
import { usePiModels } from "../../hooks/usePiModels";
import { useRoute } from "../../router";
import { publish } from "../../hooks/data-bus";
const DEFAULT_WORKFLOW_LETTER = "F";
export function RunWorkflowModal({ open, workflowItem, onClose, }) {
    const { projects } = useProjects();
    const { models } = usePiModels();
    const { openTask } = useRoute();
    const [projectId, setProjectId] = useState("");
    const [title, setTitle] = useState("");
    const [goal, setGoal] = useState("");
    const [model, setModel] = useState("");
    const [schema, setSchema] = useState(null);
    const [inputs, setInputs] = useState({});
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [templateName, setTemplateName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const selectedProject = projects.find((p) => p.id === projectId);
    useEffect(() => {
        if (!open)
            return;
        if (!workflowItem)
            return;
        setTitle(`Run ${workflowItem.name}`);
        setGoal(workflowItem.description ?? "");
        if (projects.length > 0)
            setProjectId((prev) => prev || projects[0].id);
        void loadSchema(workflowItem.inputsSchemaPath ?? null);
        void loadTemplates(workflowItem.logicalPath);
    }, [open, workflowItem, projects]);
    async function loadTemplates(logicalPath) {
        if (!window.mc)
            return;
        const all = await window.mc.listWorkflowRunTemplates();
        setTemplates(all.filter((t) => t.workflowLogicalPath === logicalPath));
    }
    async function loadSchema(schemaPath) {
        try {
            if (!window.mc)
                return;
            const loaded = await window.mc.readLibraryJsonSchema(schemaPath);
            setSchema(loaded);
            setInputs({});
        }
        catch (e) {
            setSchema(null);
            setError(e instanceof Error ? e.message : String(e));
        }
    }
    const canRun = Boolean(open && workflowItem && selectedProject && title.trim());
    const validationError = useMemo(() => validateInputsAgainstSchema(schema, inputs), [schema, inputs]);
    const runDescription = useMemo(() => {
        if (!workflowItem)
            return "";
        return [
            goal.trim() || "(no additional goal provided)",
            "",
            "Library workflow run. See RUN_CONFIG.json for structured settings.",
        ].join("\n");
    }, [goal, inputs, workflowItem]);
    async function onStart() {
        if (!canRun || !window.mc || !selectedProject || !workflowItem)
            return;
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        setError("");
        try {
            const task = await window.mc.createTask({
                title: title.trim(),
                description: runDescription,
                projectId: selectedProject.id,
                projectPrefix: selectedProject.prefix,
                workflow: DEFAULT_WORKFLOW_LETTER,
            });
            await window.mc.writeTaskRunConfig(task.id, {
                kind: "library-workflow-run",
                createdAt: new Date().toISOString(),
                libraryWorkflow: {
                    id: workflowItem.id,
                    name: workflowItem.name,
                    logicalPath: workflowItem.logicalPath,
                    diskPath: workflowItem.diskPath,
                    inputsSchemaPath: workflowItem.inputsSchemaPath ?? null,
                },
                taskContext: {
                    title: title.trim(),
                    goal: goal.trim(),
                    projectId: selectedProject.id,
                },
                runSettings: {
                    model: model || null,
                    inputs,
                },
            });
            await window.mc.startRun({
                taskId: task.id,
                model: model || undefined,
            });
            publish("tasks");
            openTask(task.id);
            onClose();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    }
    async function onSaveTemplate() {
        if (!window.mc || !workflowItem)
            return;
        const name = templateName.trim();
        if (!name) {
            setError("Template name is required");
            return;
        }
        const id = `${workflowItem.logicalPath}::${slugify(name)}`;
        await window.mc.saveWorkflowRunTemplate({
            id,
            name,
            workflowLogicalPath: workflowItem.logicalPath,
            workflowName: workflowItem.name,
            projectId: projectId || "",
            goal,
            model: model || null,
            inputs,
        });
        setTemplateName("");
        await loadTemplates(workflowItem.logicalPath);
        setSelectedTemplateId(id);
    }
    function onLoadTemplate(id) {
        setSelectedTemplateId(id);
        const template = templates.find((t) => t.id === id);
        if (!template)
            return;
        setProjectId(template.projectId || projectId);
        setGoal(template.goal || "");
        setModel(template.model ?? "");
        setInputs(template.inputs ?? {});
    }
    async function onDeleteTemplate() {
        if (!window.mc || !selectedTemplateId || !workflowItem)
            return;
        await window.mc.deleteWorkflowRunTemplate(selectedTemplateId);
        setSelectedTemplateId("");
        await loadTemplates(workflowItem.logicalPath);
    }
    return (_jsx(Modal, { open: open, title: `Run Workflow${workflowItem ? `: ${workflowItem.name}` : ""}`, onClose: onClose, children: !workflowItem ? (_jsx("p", { className: "muted", children: "Pick a workflow item first." })) : (_jsxs("div", { style: { display: "grid", gap: 12 }, children: [_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Title" }), _jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), style: inputStyle })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Goal / prompt context" }), _jsx("textarea", { rows: 3, value: goal, onChange: (e) => setGoal(e.target.value), style: inputStyle })] }), _jsxs("div", { className: "card", style: { padding: 10, borderRadius: 10 }, children: [_jsx("div", { className: "muted", style: { fontSize: 12, marginBottom: 6 }, children: "Templates" }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("select", { value: selectedTemplateId, onChange: (e) => onLoadTemplate(e.target.value), style: { ...inputStyle, minWidth: 240, width: "auto" }, children: [_jsx("option", { value: "", children: "(load template)" }), templates.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsx("input", { value: templateName, onChange: (e) => setTemplateName(e.target.value), placeholder: "Template name", style: { ...inputStyle, minWidth: 180, width: "auto" } }), _jsx("button", { className: "button ghost", onClick: () => void onSaveTemplate(), disabled: saving, children: "Save template" }), _jsx("button", { className: "button ghost", onClick: () => void onDeleteTemplate(), disabled: !selectedTemplateId || saving, children: "Delete selected" })] })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Project" }), _jsx("select", { value: projectId, onChange: (e) => setProjectId(e.target.value), style: inputStyle, children: projects.map((p) => (_jsxs("option", { value: p.id, children: [p.name, " (", p.prefix, ")"] }, p.id))) })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Model override (optional)" }), _jsxs("select", { value: model, onChange: (e) => setModel(e.target.value), style: inputStyle, children: [_jsx("option", { value: "", children: "(pi default)" }), models.map((m) => (_jsxs("option", { value: `${m.provider}:${m.id}`, children: [m.provider, ":", m.name] }, `${m.provider}:${m.id}`)))] })] }), _jsxs("div", { children: [_jsx("div", { className: "muted", style: { fontSize: 12, marginBottom: 4 }, children: "Inputs" }), _jsx(InputsForm, { schema: schema, value: inputs, onChange: setInputs })] }), _jsx("div", { className: "muted", style: { fontSize: 11 }, children: "Runtime note: this creates an MC task and starts the current run pipeline; selected library workflow metadata and inputs are embedded in the task prompt for the agent." }), validationError && (_jsxs("div", { className: "muted", style: { color: "var(--warn)", fontSize: 12 }, children: ["Validation: ", validationError] })), error && (_jsx("div", { style: { color: "var(--bad)", fontSize: 12, border: "1px solid var(--bad)", borderRadius: 8, padding: "8px 10px" }, children: error })), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [_jsx("button", { className: "button ghost", onClick: onClose, disabled: saving, children: "Cancel" }), _jsx("button", { className: "button", onClick: () => void onStart(), disabled: !canRun || saving, children: saving ? "Starting…" : "Start" })] })] })) }));
}
function validateInputsAgainstSchema(schema, inputs) {
    if (!schema)
        return "";
    const root = schema;
    if (root.type !== "object" || !root.properties)
        return "";
    const required = root.required ?? [];
    for (const key of required) {
        const value = inputs[key];
        if (value === undefined || value === null || value === "") {
            return `Missing required field "${key}"`;
        }
    }
    for (const [key, prop] of Object.entries(root.properties)) {
        const value = inputs[key];
        if (value === undefined || value === null || value === "")
            continue;
        if (prop.type === "number" || prop.type === "integer") {
            if (typeof value !== "number" || Number.isNaN(value))
                return `Field "${key}" must be a number`;
        }
        if (prop.type === "boolean" && typeof value !== "boolean") {
            return `Field "${key}" must be true/false`;
        }
        if (prop.type === "string" && typeof value !== "string") {
            return `Field "${key}" must be text`;
        }
    }
    return "";
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);
}
const inputStyle = {
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    fontFamily: "inherit",
    fontSize: 13,
    width: "100%",
};
