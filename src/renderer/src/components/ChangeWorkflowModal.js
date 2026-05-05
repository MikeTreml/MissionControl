import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ChangeWorkflowModal — re-assigns (or clears) the curated library
 * workflow on an existing task. Same RUN_CONFIG.json shape Create Task
 * + RunWorkflowModal write; opening the modal preloads from whatever's
 * already in the sidecar.
 *
 * Save behavior:
 *   - "Auto-generate" sentinel + no existing config → no-op.
 *   - "Auto-generate" sentinel + existing config    → wipe the curated
 *     fields by writing a config with libraryWorkflow: null. RunManager
 *     reads only `libraryWorkflow.diskPath`; null means auto-gen on
 *     next Start.
 *   - A picked workflow → write the curated config (libraryWorkflow +
 *     runSettings.inputs).
 *
 * Doesn't auto-Start the task; the user clicks Start when ready.
 */
import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { InputsForm } from "./InputsForm";
import { useLibraryIndex } from "../hooks/useLibraryIndex";
import { publish } from "../hooks/data-bus";
const AUTO_GEN_VALUE = "__autogen__";
export function ChangeWorkflowModal({ open, task, onClose, }) {
    const { items: libraryItems } = useLibraryIndex();
    const [workflowLogicalPath, setWorkflowLogicalPath] = useState(AUTO_GEN_VALUE);
    const [inputs, setInputs] = useState({});
    const [schema, setSchema] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const workflows = useMemo(() => {
        return libraryItems
            .filter((item) => item.kind === "workflow")
            .sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
    }, [libraryItems]);
    const selectedWorkflow = workflows.find((w) => w.logicalPath === workflowLogicalPath) ?? null;
    // Preload from the task's current RUN_CONFIG.json when the modal opens.
    useEffect(() => {
        if (!open || !window.mc)
            return;
        let cancelled = false;
        void window.mc.readTaskRunConfig(task.id).then((cfg) => {
            if (cancelled)
                return;
            const lw = cfg?.libraryWorkflow ?? null;
            const startingPath = lw?.logicalPath ?? AUTO_GEN_VALUE;
            setWorkflowLogicalPath(startingPath);
            const startingInputs = (cfg?.runSettings?.inputs) ?? {};
            setInputs(startingInputs);
            setError("");
        }).catch(() => {
            if (cancelled)
                return;
            setWorkflowLogicalPath(AUTO_GEN_VALUE);
            setInputs({});
        });
        return () => { cancelled = true; };
    }, [open, task.id]);
    // Refresh the inputs schema when the workflow choice changes.
    useEffect(() => {
        if (!open || !window.mc || !selectedWorkflow) {
            setSchema(null);
            return;
        }
        const path = selectedWorkflow.inputsSchemaPath ?? null;
        void window.mc.readLibraryJsonSchema(path).then(setSchema).catch(() => setSchema(null));
    }, [open, selectedWorkflow]);
    const close = () => {
        setSaving(false);
        setError("");
        onClose();
    };
    async function onSave() {
        if (!window.mc) {
            setError("Not connected — run `npm run dev`");
            return;
        }
        setSaving(true);
        setError("");
        try {
            if (selectedWorkflow) {
                await window.mc.writeTaskRunConfig(task.id, {
                    kind: "library-workflow-run",
                    createdAt: new Date().toISOString(),
                    libraryWorkflow: {
                        id: selectedWorkflow.id,
                        name: selectedWorkflow.name,
                        logicalPath: selectedWorkflow.logicalPath,
                        diskPath: selectedWorkflow.diskPath,
                        inputsSchemaPath: selectedWorkflow.inputsSchemaPath ?? null,
                    },
                    taskContext: {
                        title: task.title,
                        goal: task.description,
                        projectId: task.project,
                    },
                    runSettings: { model: null, inputs },
                });
            }
            else {
                // Auto-gen: clear the curated fields. RunManager.curatedWorkflowPath
                // returns null when libraryWorkflow.diskPath is missing, so this
                // restores the auto-gen path on the next Start.
                await window.mc.writeTaskRunConfig(task.id, {
                    kind: "auto-gen",
                    createdAt: new Date().toISOString(),
                    libraryWorkflow: null,
                    runSettings: {},
                });
            }
            publish("tasks");
            close();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsx(Modal, { open: open, title: "Change workflow", onClose: close, children: _jsxs("div", { style: { display: "grid", gap: 12 }, children: [_jsx("div", { className: "muted", style: { fontSize: 12 }, children: "Re-assigns the curated workflow used on the next Start. The task itself, its history, and its journal are untouched." }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Workflow" }), _jsxs("select", { value: workflowLogicalPath, onChange: (e) => setWorkflowLogicalPath(e.target.value), style: inputStyle, children: [_jsx("option", { value: AUTO_GEN_VALUE, children: "Auto-generate (clears curated workflow)" }), workflows.map((w) => (_jsxs("option", { value: w.logicalPath, children: [w.logicalPath, " \u2014 ", w.name] }, w.logicalPath)))] })] }), selectedWorkflow && (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("label", { className: "muted", style: { fontSize: 12 }, children: ["Inputs ", schema ? "(schema-driven)" : "(JSON)"] }), _jsx(InputsForm, { schema: schema, value: inputs, onChange: setInputs })] })), error && (_jsx("div", { style: { color: "var(--bad)", fontSize: 12 }, children: error })), _jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [_jsx("button", { className: "button ghost", onClick: close, disabled: saving, children: "Cancel" }), _jsx("button", { className: "button", onClick: () => void onSave(), disabled: saving, children: saving ? "Saving…" : "Save" })] })] }) }));
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
