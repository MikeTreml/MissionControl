/**
 * Minimal "New Workflow" modal — generates a stub workflow.js scaffold and
 * writes it under library/workflows/<category>/<slug>/. The user opens the
 * resulting file and fills in prompts/instructions by hand.
 *
 * Intentional scope: this modal does NOT try to be a visual workflow builder.
 * It produces correct boilerplate (header, imports, process function, return
 * statement, defineTask shape) so the author starts with a working file.
 */
import { useState } from "react";

import { Modal } from "../../components/Modal";
import { publish } from "../../hooks/data-bus";

const CATEGORIES = ["cradle", "contrib", "core", "processes", "methodologies"] as const;
type Category = (typeof CATEGORIES)[number];

export function NewWorkflowModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState<Category>("cradle");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugValid = /^[a-z][a-z0-9-]*$/.test(slug);
  const canSubmit = slugValid && description.trim().length > 0 && !submitting;

  function reset(): void {
    setSlug("");
    setCategory("cradle");
    setDescription("");
    setError(null);
    setSubmitting(false);
  }

  async function handleCreate(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const spec = buildStubSpec(category, slug, description);
      const result = await window.mc.createLibraryWorkflow({ spec, category, slug });
      publish("workflows");
      // Open the generated file so the user can fill in the placeholders.
      void window.mc.openPath(result.diskPath);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="New workflow (stub)" onClose={() => { reset(); onClose(); }}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Generates a scaffold <code>workflow.js</code> with one placeholder
        sequential phase + one placeholder agent task. Open the file to fill
        in prompts and add more phases.
      </p>

      <label style={{ display: "block", marginTop: 14 }}>
        <div style={{ marginBottom: 4 }}>Category</div>
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          disabled={submitting}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        <div style={{ marginBottom: 4 }}>Slug (kebab-case)</div>
        <input
          className="input"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-new-workflow"
          disabled={submitting}
        />
        {slug.length > 0 && !slugValid && (
          <div className="muted" style={{ fontSize: 11, marginTop: 4, color: "var(--bad)" }}>
            Must start with a lowercase letter; only lowercase letters, digits,
            and hyphens after that.
          </div>
        )}
        {slugValid && (
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Will be written to <code>library/workflows/{category}/{slug}/workflow.js</code>
          </div>
        )}
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        <div style={{ marginBottom: 4 }}>Description</div>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line summary of what this workflow does"
          disabled={submitting}
        />
      </label>

      {error && (
        <div
          className="card"
          style={{ marginTop: 12, borderColor: "var(--bad)", color: "var(--bad)", fontSize: 12 }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="button ghost" onClick={() => { reset(); onClose(); }} disabled={submitting}>
          Cancel
        </button>
        <button className="button" onClick={() => void handleCreate()} disabled={!canSubmit}>
          {submitting ? "Creating…" : "Create + open file"}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Build a minimal but valid WorkflowSpec the generator will accept.
 * The shape is opaque to the renderer (`Record<string, unknown>` at the
 * IPC boundary) — we construct it as a plain object literal here so we
 * don't duplicate the spec types into the renderer bundle.
 */
function buildStubSpec(category: string, slug: string, description: string): Record<string, unknown> {
  return {
    processId: `${category}/${slug}`,
    description,
    inputs: [{ name: "input1", jsDocType: "string", defaultLiteral: "''" }],
    outputs: [{ name: "result", jsDocType: "string", expression: "doneTask.result" }],
    successExpression: "true",
    phases: [
      {
        kind: "sequential",
        title: "TODO: rename me",
        resultVar: "doneTask",
        taskRef: "doThingTask",
        args: { input1: "input1" },
      },
    ],
    tasks: [
      {
        kind: "agent",
        factoryName: "doThingTask",
        taskKey: "do-thing",
        title: "TODO: rename",
        agentName: "general-purpose",
        role: "TODO: agent role",
        taskDescription: "TODO: what this task does",
        contextKeys: ["input1"],
        instructions: ["TODO: step-by-step instructions for the agent"],
        outputFormat: "JSON with result",
        outputSchema: {
          type: "object",
          required: ["result"],
          properties: { result: { type: "string" } },
        },
        labels: ["agent", "todo"],
      },
    ],
  };
}
