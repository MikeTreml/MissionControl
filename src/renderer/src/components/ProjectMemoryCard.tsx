/**
 * Per-project memory file editor. Reads/writes
 * `~/.pi/memory-md/<projectId>/MEMORY.md` via the memory:read/write
 * IPC, scoped to the project shown on Project Detail.
 *
 * Pi will consume this file directly on its next session boot (per
 * CLAUDE.md "pi-memory-md wire-up" item). This card just gives the
 * operator a place to edit it without leaving MC. Saves are explicit;
 * unsaved edits are kept in local state.
 *
 * Hidden in demo mode (sample projects can't have a real memory file
 * — pi wouldn't see it anyway).
 */
import { useEffect, useState } from "react";

import { pushErrorToast, pushToast } from "../hooks/useToasts";

export function ProjectMemoryCard({
  projectId,
  isDemo,
}: {
  projectId: string;
  isDemo: boolean;
}): JSX.Element | null {
  const [original, setOriginal] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function load(): Promise<void> {
    if (!window.mc?.readProjectMemory) return;
    try {
      setLoading(true);
      setError("");
      const text = await window.mc.readProjectMemory(projectId);
      setOriginal(text ?? "");
      setDraft(text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [projectId]);

  async function save(): Promise<void> {
    if (!window.mc?.writeProjectMemory) return;
    setSaving(true);
    setError("");
    try {
      await window.mc.writeProjectMemory(projectId, draft);
      setOriginal(draft);
      pushToast({ tone: "good", title: "Memory saved", detail: `${projectId}/MEMORY.md` });
    } catch (e) {
      pushErrorToast("Failed to save memory", e, projectId);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (isDemo) return null;

  const dirty = original !== null && draft !== original;
  const placeholder =
    "Notes pi should remember about this project across sessions.\n\n" +
    "Examples:\n" +
    "- conventions: prefer X over Y\n" +
    "- known traps: don't touch <file>\n" +
    "- people: @michael owns the data layer\n";

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Project memory</h3>
        <div className="muted" style={{ fontSize: 11 }}>
          <code>~/.pi/memory-md/{projectId}/MEMORY.md</code>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Free-form notes pi loads at the start of every session for this
        project. Edit here; pi picks up changes on its next run.
      </p>
      <textarea
        className="input"
        value={loading ? "" : draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={loading ? "Loading…" : placeholder}
        rows={10}
        disabled={loading || saving}
        style={{
          marginTop: 10,
          width: "100%",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      />
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {dirty && !saving && (
          <button className="button ghost" onClick={() => setDraft(original ?? "")}>
            Discard
          </button>
        )}
        {dirty && (
          <span className="muted" style={{ fontSize: 12 }}>Unsaved changes</span>
        )}
        {!dirty && original !== null && original.length > 0 && !saving && (
          <span className="muted" style={{ fontSize: 12 }}>{original.length.toLocaleString()} chars</span>
        )}
        {error && (
          <span className="muted" style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>
        )}
      </div>
    </section>
  );
}
