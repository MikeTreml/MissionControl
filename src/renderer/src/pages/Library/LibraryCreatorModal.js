import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { publish } from "../../hooks/data-bus";
const WORKFLOW_CATEGORIES = [
    "business/knowledge-management",
    "business/operations",
    "business/project-management",
    "methodologies/atdd-tdd",
    "methodologies/process-hardening",
    "methodologies/shared",
    "methodologies/spec-kit",
    "reference/babysitter",
    "specializations/devops-sre-platform",
    "specializations/software-architecture",
];
const ITEM_ROOTS = [
    "business/knowledge-management",
    "specializations/ai-agents-conversational",
    "specializations/gpu-programming",
    "specializations/software-architecture",
];
export function LibraryCreatorModal({ open, initialKind, onClose, }) {
    const [kind, setKind] = useState(initialKind);
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [workflowCategory, setWorkflowCategory] = useState("methodologies/atdd-tdd");
    const [targetRoot, setTargetRoot] = useState("business/knowledge-management");
    const [agentName, setAgentName] = useState("general-purpose");
    const [phaseTitle, setPhaseTitle] = useState("Draft and validate output");
    const [role, setRole] = useState("");
    const [philosophy, setPhilosophy] = useState("");
    const [capabilities, setCapabilities] = useState("");
    const [tags, setTags] = useState("");
    const [tools, setTools] = useState("Read, Write, Edit, Glob, Grep, Bash(*)");
    const [prerequisites, setPrerequisites] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!open)
            return;
        setKind(initialKind);
    }, [initialKind, open]);
    const slugValid = /^[a-z][a-z0-9-]*$/.test(slug);
    const hasDescription = description.trim().length > 0;
    const canSubmit = slugValid && hasDescription && !submitting;
    function reset() {
        setSlug("");
        setName("");
        setDescription("");
        setWorkflowCategory("methodologies/atdd-tdd");
        setTargetRoot("business/knowledge-management");
        setAgentName("general-purpose");
        setPhaseTitle("Draft and validate output");
        setRole("");
        setPhilosophy("");
        setCapabilities("");
        setTags("");
        setTools("Read, Write, Edit, Glob, Grep, Bash(*)");
        setPrerequisites("");
        setError(null);
        setSubmitting(false);
    }
    async function handleCreate() {
        setSubmitting(true);
        setError(null);
        try {
            const result = kind === "workflow"
                ? await window.mc.createLibraryWorkflow({
                    category: workflowCategory,
                    slug,
                    spec: buildWorkflowSpec({
                        category: workflowCategory,
                        slug,
                        description,
                        agentName,
                        phaseTitle,
                    }),
                })
                : await window.mc.createLibraryItem({
                    kind,
                    targetRoot,
                    slug,
                    name: name.trim() || titleFromSlug(slug),
                    description: description.trim(),
                    role: role.trim() || undefined,
                    philosophy: philosophy.trim() || undefined,
                    tags: splitList(tags),
                    capabilities: splitList(capabilities),
                    tools: splitList(tools),
                    prerequisites: splitList(prerequisites),
                });
            publish("workflows");
            void window.mc.openPath(result.diskPath);
            reset();
            onClose();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSubmitting(false);
        }
    }
    return (_jsxs(Modal, { open: open, title: "Create library item", onClose: () => { reset(); onClose(); }, children: [_jsxs("div", { className: "library-creator-tabs", role: "tablist", "aria-label": "Library item type", children: [_jsx(CreatorTab, { label: "Workflow", active: kind === "workflow", onClick: () => setKind("workflow") }), _jsx(CreatorTab, { label: "Agent", active: kind === "agent", onClick: () => setKind("agent") }), _jsx(CreatorTab, { label: "Skill", active: kind === "skill", onClick: () => setKind("skill") })] }), _jsxs("div", { style: { display: "grid", gap: 12 }, children: [_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Slug" }), _jsx("input", { className: "input", type: "text", value: slug, onChange: (e) => setSlug(e.target.value), placeholder: kind === "workflow" ? "repo-migration-review" : `${kind}-name`, disabled: submitting }), slug.length > 0 && !slugValid && (_jsx("span", { style: { color: "var(--bad)", fontSize: 11 }, children: "Use kebab-case: lowercase letters, digits, and hyphens." }))] }), kind !== "workflow" && (_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Display name" }), _jsx("input", { className: "input", type: "text", value: name, onChange: (e) => setName(e.target.value), placeholder: slug ? titleFromSlug(slug) : "Library Item Name", disabled: submitting })] })), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Description" }), _jsx("textarea", { className: "input", rows: 3, value: description, onChange: (e) => setDescription(e.target.value), placeholder: "One-line summary of what this item does", disabled: submitting })] }), kind === "workflow" ? (_jsx(WorkflowFields, { category: workflowCategory, agentName: agentName, phaseTitle: phaseTitle, onCategory: setWorkflowCategory, onAgentName: setAgentName, onPhaseTitle: setPhaseTitle, disabled: submitting, slug: slug })) : (_jsx(MarkdownItemFields, { kind: kind, targetRoot: targetRoot, role: role, philosophy: philosophy, capabilities: capabilities, tags: tags, tools: tools, prerequisites: prerequisites, onTargetRoot: setTargetRoot, onRole: setRole, onPhilosophy: setPhilosophy, onCapabilities: setCapabilities, onTags: setTags, onTools: setTools, onPrerequisites: setPrerequisites, disabled: submitting, slug: slug }))] }), error && (_jsx("div", { className: "card", style: { marginTop: 12, color: "var(--bad)", fontSize: 12 }, children: error })), _jsxs("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }, children: [_jsx("button", { className: "button ghost", onClick: () => { reset(); onClose(); }, disabled: submitting, children: "Cancel" }), _jsx("button", { className: "button", onClick: () => void handleCreate(), disabled: !canSubmit, children: submitting ? "Creating..." : `Create ${kind}` })] })] }));
}
function CreatorTab({ label, active, onClick }) {
    return (_jsx("button", { className: active ? "tab active" : "tab", role: "tab", "aria-selected": active, onClick: onClick, children: label }));
}
function WorkflowFields({ category, agentName, phaseTitle, onCategory, onAgentName, onPhaseTitle, disabled, slug, }) {
    return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Workflow category" }), _jsx("select", { className: "input", value: category, onChange: (e) => onCategory(e.target.value), disabled: disabled, children: WORKFLOW_CATEGORIES.map((c) => (_jsx("option", { value: c, children: c }, c))) })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "First phase" }), _jsx("input", { className: "input", value: phaseTitle, onChange: (e) => onPhaseTitle(e.target.value), disabled: disabled })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Agent name" }), _jsx("input", { className: "input", value: agentName, onChange: (e) => onAgentName(e.target.value), disabled: disabled })] }), _jsx("div", { className: "muted", style: { fontSize: 11 }, children: slug ? (_jsxs(_Fragment, { children: ["Writes ", _jsxs("code", { children: ["library/", category, "/workflows/", slug, ".js"] })] })) : (_jsx(_Fragment, { children: "Pick a slug to preview the target path." })) })] }));
}
function MarkdownItemFields({ kind, targetRoot, role, philosophy, capabilities, tags, tools, prerequisites, onTargetRoot, onRole, onPhilosophy, onCapabilities, onTags, onTools, onPrerequisites, disabled, slug, }) {
    return (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Target root" }), _jsx("select", { className: "input", value: targetRoot, onChange: (e) => onTargetRoot(e.target.value), disabled: disabled, children: ITEM_ROOTS.map((root) => (_jsx("option", { value: root, children: root }, root))) })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: kind === "agent" ? "Role" : "Operator role" }), _jsx("input", { className: "input", value: role, onChange: (e) => onRole(e.target.value), placeholder: kind === "agent" ? "Library Knowledge Architect" : "Skill operator", disabled: disabled })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Philosophy" }), _jsx("input", { className: "input", value: philosophy, onChange: (e) => onPhilosophy(e.target.value), placeholder: "Make the reusable path clear and easy to validate.", disabled: disabled })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Capabilities" }), _jsx("textarea", { className: "input", rows: 3, value: capabilities, onChange: (e) => onCapabilities(e.target.value), placeholder: "One per line or comma-separated", disabled: disabled })] }), kind === "skill" && (_jsxs(_Fragment, { children: [_jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Allowed tools" }), _jsx("input", { className: "input", value: tools, onChange: (e) => onTools(e.target.value), disabled: disabled })] }), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Prerequisites" }), _jsx("textarea", { className: "input", rows: 3, value: prerequisites, onChange: (e) => onPrerequisites(e.target.value), placeholder: "One per line or comma-separated", disabled: disabled })] })] })), _jsxs("label", { style: { display: "grid", gap: 4 }, children: [_jsx("span", { className: "muted", style: { fontSize: 11 }, children: "Tags" }), _jsx("input", { className: "input", value: tags, onChange: (e) => onTags(e.target.value), placeholder: "knowledge-management, templates", disabled: disabled })] }), _jsx("div", { className: "muted", style: { fontSize: 11 }, children: slug ? (_jsxs(_Fragment, { children: ["Writes ", _jsxs("code", { children: [targetRoot, "/", kind === "agent" ? "agents" : "skills", "/", slug, "/", kind === "agent" ? "AGENT.md" : "SKILL.md"] })] })) : (_jsx(_Fragment, { children: "Pick a slug to preview the target path." })) })] }));
}
function buildWorkflowSpec({ category, slug, description, agentName, phaseTitle, }) {
    const taskName = `${camel(slug)}Task`;
    return {
        processId: `${category}/${slug}`,
        description: description.trim(),
        inputs: [{ name: "request", jsDocType: "string", defaultLiteral: "''" }],
        outputs: [
            { name: "summary", jsDocType: "string", expression: "draft.summary" },
            { name: "missingInfo", jsDocType: "string[]", expression: "draft.missingInfo ?? []" },
        ],
        successExpression: "draft.success === true",
        phases: [
            {
                kind: "sequential",
                title: phaseTitle.trim() || "Draft and validate output",
                resultVar: "draft",
                taskRef: taskName,
                args: { request: "request" },
            },
        ],
        tasks: [
            {
                kind: "agent",
                factoryName: taskName,
                taskKey: slug,
                title: titleFromSlug(slug),
                agentName: agentName.trim() || "general-purpose",
                role: "Mission Control workflow agent",
                taskDescription: description.trim(),
                contextKeys: ["request"],
                instructions: [
                    "Read the request and identify the concrete output needed.",
                    "Use local library conventions before inventing new structure.",
                    "Return a summary, missingInfo array, and success boolean.",
                ],
                outputFormat: "JSON with { success: boolean, summary: string, missingInfo: string[] }",
                outputSchema: {
                    type: "object",
                    required: ["success", "summary"],
                    properties: {
                        success: { type: "boolean" },
                        summary: { type: "string" },
                        missingInfo: { type: "array", items: { type: "string" } },
                    },
                },
                labels: ["agent", "library-generated"],
            },
        ],
    };
}
function splitList(value) {
    return value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}
function titleFromSlug(slug) {
    return slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(" ");
}
function camel(slug) {
    const titled = titleFromSlug(slug).replace(/\s+/g, "");
    return `${titled.slice(0, 1).toLowerCase()}${titled.slice(1)}`;
}
