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
import type { LibraryIndexItem } from "../types/library";
import type { Task } from "../../../shared/models";

const AUTO_GEN_VALUE = "__autogen__";

export function ChangeWorkflowModal({
  open,
  task,
  onClose,
}: {
  open: boolean;
  task: Task;
  onClose: () => void;
}): JSX.Element {
  const { items: libraryItems } = useLibraryIndex();

  const [workflowLogicalPath, setWorkflowLogicalPath] = useState<string>(AUTO_GEN_VALUE);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const workflows = useMemo<LibraryIndexItem[]>(() => {
    return libraryItems
      .filter((item) => item.kind === "workflow")
      .sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  }, [libraryItems]);

  const selectedWorkflow = workflows.find((w) => w.logicalPath === workflowLogicalPath) ?? null;

  // Preload from the task's current RUN_CONFIG.json when the modal opens.
  useEffect(() => {
    if (!open || !window.mc) return;
    let cancelled = false;
    void window.mc.readTaskRunConfig(task.id).then((cfg) => {
      if (cancelled) return;
      const lw = (cfg as { libraryWorkflow?: { logicalPath?: string } } | null)?.libraryWorkflow ?? null;
      const startingPath = lw?.logicalPath ?? AUTO_GEN_VALUE;
      setWorkflowLogicalPath(startingPath);
      const startingInputs =
        ((cfg as { runSettings?: { inputs?: Record<string, unknown> } } | null)?.runSettings?.inputs) ?? {};
      setInputs(startingInputs);
      setError("");
    }).catch(() => {
      if (cancelled) return;
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

  const close = (): void => {
    setSaving(false);
    setError("");
    onClose();
  };

  async function onSave(): Promise<void> {
    if (!window.mc) { setError("Not connected — run `npm run dev`"); return; }
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
      } else {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Change workflow" onClose={close}>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Re-assigns the curated workflow used on the next Start. The task itself,
          its history, and its journal are untouched.
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <label className="muted" style={{ fontSize: 12 }}>Workflow</label>
          <select
            value={workflowLogicalPath}
            onChange={(e) => setWorkflowLogicalPath(e.target.value)}
            style={inputStyle}
          >
            <option value={AUTO_GEN_VALUE}>
              Auto-generate (clears curated workflow)
            </option>
            {workflows.map((w) => (
              <option key={w.logicalPath} value={w.logicalPath}>
                {w.logicalPath} — {w.name}
              </option>
            ))}
          </select>
        </div>

        {selectedWorkflow && (
          <div style={{ display: "grid", gap: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              Inputs {schema ? "(schema-driven)" : "(JSON)"}
            </label>
            <InputsForm schema={schema} value={inputs} onChange={setInputs} />
          </div>
        )}

        {error && (
          <div style={{ color: "var(--bad)", fontSize: 12 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="button ghost" onClick={close} disabled={saving}>Cancel</button>
          <button className="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  width: "100%",
};
