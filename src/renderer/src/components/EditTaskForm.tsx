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
import type { Task } from "../../../shared/models";

export function EditTaskForm({
  open,
  onClose,
  task,
}: {
  open: boolean;
  onClose: () => void;
  task: Task;
}): JSX.Element {
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

  function close(): void {
    setError("");
    setSaving(false);
    onClose();
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
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
    } catch (err) {
      console.error("[EditTaskForm] saveTask threw:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const dirty = title.trim() !== task.title || description.trim() !== task.description;

  return (
    <Modal open={open} title={`Edit — ${task.id}`} onClose={close}>
      <form onSubmit={(e) => { void onSubmit(e); }} style={{ display: "grid", gap: 12 }}>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short, imperative — what should the agent accomplish?"
            autoFocus
            required
            style={inputStyle}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — context, constraints, links. Becomes part of the next PROMPT.md."
            rows={6}
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>

        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          Saved changes show up in the Mission card on the next Start
          (PROMPT.md is regenerated from title + description each run).
          Past runs in Run History are unaffected.
        </p>

        {error && (
          <div
            className="card"
            style={{
              borderColor: "var(--bad)",
              background: "rgba(232, 116, 116,0.08)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="button ghost" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
};
