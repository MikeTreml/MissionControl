import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Modal } from "../../components/Modal";
import { InputsForm } from "../../components/InputsForm";
import { useProjects } from "../../hooks/useProjects";
import { usePiModels } from "../../hooks/usePiModels";
import { useRoute } from "../../router";
import { publish } from "../../hooks/data-bus";
import type { LibraryIndexItem } from "../../types/library";
import type { WorkflowRunTemplate } from "../../global";

const DEFAULT_WORKFLOW_LETTER = "F";

export function RunWorkflowModal({
  open,
  workflowItem,
  onClose,
}: {
  open: boolean;
  workflowItem: LibraryIndexItem | null;
  onClose: () => void;
}): JSX.Element {
  const { projects } = useProjects();
  const { models } = usePiModels();
  const { openTask } = useRoute();

  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [templates, setTemplates] = useState<WorkflowRunTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (!open) return;
    if (!workflowItem) return;
    setTitle(`Run ${workflowItem.name}`);
    setGoal(workflowItem.description ?? "");
    if (projects.length > 0) setProjectId((prev) => prev || projects[0]!.id);
    void loadSchema(workflowItem.inputsSchemaPath ?? null);
    void loadTemplates(workflowItem.logicalPath);
  }, [open, workflowItem, projects]);

  async function loadTemplates(logicalPath: string): Promise<void> {
    if (!window.mc) return;
    const all = await window.mc.listWorkflowRunTemplates();
    setTemplates(all.filter((t) => t.workflowLogicalPath === logicalPath));
  }

  async function loadSchema(schemaPath: string | null): Promise<void> {
    try {
      if (!window.mc) return;
      const loaded = await window.mc.readLibraryJsonSchema(schemaPath);
      setSchema(loaded);
      setInputs({});
    } catch (e) {
      setSchema(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const canRun = Boolean(open && workflowItem && selectedProject && title.trim());
  const validationError = useMemo(
    () => validateInputsAgainstSchema(schema, inputs),
    [schema, inputs],
  );
  const runDescription = useMemo(() => {
    if (!workflowItem) return "";
    return [
      goal.trim() || "(no additional goal provided)",
      "",
      "Library workflow run. See RUN_CONFIG.json for structured settings.",
    ].join("\n");
  }, [goal, inputs, workflowItem]);

  async function onStart(): Promise<void> {
    if (!canRun || !window.mc || !selectedProject || !workflowItem) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTemplate(): Promise<void> {
    if (!window.mc || !workflowItem) return;
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

  function onLoadTemplate(id: string): void {
    setSelectedTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setProjectId(template.projectId || projectId);
    setGoal(template.goal || "");
    setModel(template.model ?? "");
    setInputs(template.inputs ?? {});
  }

  async function onDeleteTemplate(): Promise<void> {
    if (!window.mc || !selectedTemplateId || !workflowItem) return;
    await window.mc.deleteWorkflowRunTemplate(selectedTemplateId);
    setSelectedTemplateId("");
    await loadTemplates(workflowItem.logicalPath);
  }

  return (
    <Modal
      open={open}
      title={`Run Workflow${workflowItem ? `: ${workflowItem.name}` : ""}`}
      onClose={onClose}
    >
      {!workflowItem ? (
        <p className="muted">Pick a workflow item first.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>Goal / prompt context</label>
            <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} style={inputStyle} />
          </div>
          <div className="card" style={{ padding: 10, borderRadius: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Templates</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={selectedTemplateId}
                onChange={(e) => onLoadTemplate(e.target.value)}
                style={{ ...inputStyle, minWidth: 240, width: "auto" }}
              >
                <option value="">(load template)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                style={{ ...inputStyle, minWidth: 180, width: "auto" }}
              />
              <button className="button ghost" onClick={() => void onSaveTemplate()} disabled={saving}>
                Save template
              </button>
              <button className="button ghost" onClick={() => void onDeleteTemplate()} disabled={!selectedTemplateId || saving}>
                Delete selected
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.prefix})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label className="muted" style={{ fontSize: 12 }}>Model override (optional)</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={inputStyle}>
              <option value="">(pi default)</option>
              {models.map((m) => (
                <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                  {m.provider}:{m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="card" style={{ padding: 10, borderRadius: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quality (optional)</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4, minWidth: 150 }}>
                <label className="muted" style={{ fontSize: 11 }}>Target score (0-100)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={typeof inputs.targetQuality === "number" ? inputs.targetQuality : ""}
                  placeholder="(workflow default)"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setInputs((prev) => {
                      const next = { ...prev };
                      if (raw === "") delete next.targetQuality;
                      else next.targetQuality = Number(raw);
                      return next;
                    });
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 4, minWidth: 150 }}>
                <label className="muted" style={{ fontSize: 11 }}>Max attempts</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={typeof inputs.maxIterations === "number" ? inputs.maxIterations : ""}
                  placeholder="(workflow default)"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setInputs((prev) => {
                      const next = { ...prev };
                      if (raw === "") delete next.maxIterations;
                      else next.maxIterations = Number(raw);
                      return next;
                    });
                  }}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Applies to quality-gated workflows that read targetQuality / maxIterations from inputs.
              Empty = the workflow's own destructured defaults win.
            </div>
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Inputs</div>
            <InputsForm schema={schema} value={inputs} onChange={setInputs} />
          </div>

          <div className="muted" style={{ fontSize: 11 }}>
            Runtime note: this creates an MC task and starts the current run pipeline; selected library workflow metadata and inputs are embedded in the task prompt for the agent.
          </div>
          {validationError && (
            <div className="muted" style={{ color: "var(--warn)", fontSize: 12 }}>
              Validation: {validationError}
            </div>
          )}

          {error && (
            <div style={{ color: "var(--bad)", fontSize: 12, border: "1px solid var(--bad)", borderRadius: 8, padding: "8px 10px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="button ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button" onClick={() => void onStart()} disabled={!canRun || saving}>
              {saving ? "Starting…" : "Start"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function validateInputsAgainstSchema(
  schema: Record<string, unknown> | null,
  inputs: Record<string, unknown>,
): string {
  if (!schema) return "";
  const root = schema as { type?: string; properties?: Record<string, { type?: string }>; required?: string[] };
  if (root.type !== "object" || !root.properties) return "";
  const required = root.required ?? [];
  for (const key of required) {
    const value = inputs[key];
    if (value === undefined || value === null || value === "") {
      return `Missing required field "${key}"`;
    }
  }
  for (const [key, prop] of Object.entries(root.properties)) {
    const value = inputs[key];
    if (value === undefined || value === null || value === "") continue;
    if (prop.type === "number" || prop.type === "integer") {
      if (typeof value !== "number" || Number.isNaN(value)) return `Field "${key}" must be a number`;
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const inputStyle: CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  width: "100%",
};

