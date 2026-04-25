/**
 * Settings — shell with sub-tabs for Models / Agents / Workflows / Global.
 *
 * Models (editable)      → the LLM roster (<userData>/models.json).
 * Agents (read-only)     → list of every agent discovered in agents/, grouped
 *                          by `title`. Add an agent by dropping a folder.
 * Workflows (read-only)  → list from workflows/. Add by dropping a folder.
 * Global                 → paths, integration stubs, pi config deep-link.
 *
 * No hardcoded role names / titles / workflow names in this file — all
 * labels come from loaded data.
 */
import React, { useEffect, useState } from "react";

import { useAgents, modelLabel } from "../hooks/useAgents";
import { useWorkflows } from "../hooks/useWorkflows";
import { publish } from "../hooks/data-bus";
import { useRoute, type ViewId } from "../router";
import { effectiveLanes } from "../../../shared/models";
import type { ModelDefinition, MCSettings } from "../../../shared/models";

const SUBTABS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "settings-agents",    label: "Agents" },
  { id: "settings-models",    label: "Models" },
  { id: "settings-workflows", label: "Workflows" },
  { id: "settings-global",    label: "Global" },
];

function Header(): JSX.Element {
  const { setView } = useRoute();
  return (
    <div className="topbar">
      <div>
        <h1>Settings</h1>
      </div>
      <button className="button ghost" onClick={() => setView("dashboard")}>
        ← Dashboard
      </button>
    </div>
  );
}

function SubTabs(): JSX.Element {
  const { view, setView } = useRoute();
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--border)",
        marginBottom: 18,
      }}
    >
      {SUBTABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setView(tab.id)}
          className="button ghost"
          style={{
            borderRadius: 0,
            borderWidth: 0,
            borderBottom: view === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
            color: view === tab.id ? "var(--text)" : "var(--muted)",
            padding: "8px 14px",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ═══════════════ MODELS (editable — the LLM roster) ═══════════════
export function SettingsModels(): JSX.Element {
  const { models, refresh, isDemo } = useAgents();
  const [draft, setDraft] = useState<ModelDefinition[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const source = draft ?? models;

  async function save(): Promise<void> {
    if (!window.mc) { setError("Not connected — run `npm run dev`"); return; }
    setError("");
    setSaving(true);
    try {
      await window.mc.saveModels(source);
      setDraft(null);
      publish("models");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function addModel(): void {
    setDraft([
      ...source,
      { id: "", label: "", kind: "anthropic", model: "", endpoint: "", notes: "" },
    ]);
  }
  function removeModel(idx: number): void {
    setDraft(source.filter((_, i) => i !== idx));
  }
  function patchModel(idx: number, patch: Partial<ModelDefinition>): void {
    setDraft(source.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />

        {isDemo && <DemoBanner />}

        {error && <ErrorBanner msg={error} />}

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3>Model roster</h3>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                Each agent references one of these by <code>id</code> as its primary or
                fallback. Pi will auto-discover most once wired — add custom endpoints
                (local LLMs, OpenAI-compat servers) here.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="button ghost"
                onClick={async () => {
                  // CONFIRMED: populates draft from models-suggested.json
                  // shipped in the repo root. User must still hit "Save roster"
                  // to persist.
                  if (!window.mc) return;
                  const suggested = await window.mc.suggestedModels();
                  console.log("[Settings/Models] loaded defaults:", suggested);
                  // If there's already a draft/roster, append; otherwise replace.
                  if (source.length === 0) {
                    setDraft(suggested);
                  } else {
                    const existingIds = new Set(source.map((m) => m.id));
                    const additions = suggested.filter((m) => !existingIds.has(m.id));
                    setDraft([...source, ...additions]);
                  }
                }}
                title="Load Codex + Ollama suggested defaults (you still need to Save)"
              >
                Load defaults
              </button>
              <button className="button ghost" onClick={addModel}>+ Add model</button>
              <button className="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save roster"}
              </button>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={th}>ID</th>
                <th style={th}>Label</th>
                <th style={th}>Kind</th>
                <th style={th}>Model</th>
                <th style={th}>Endpoint</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {source.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: "12px 10px" }}>
                    No models yet. Click "+ Add model" to start.
                  </td>
                </tr>
              )}
              {source.map((m, idx) => (
                <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={cell}><TextInput value={m.id}       onChange={(v) => patchModel(idx, { id: v })}       placeholder="claude-opus" /></td>
                  <td style={cell}><TextInput value={m.label}    onChange={(v) => patchModel(idx, { label: v })}    placeholder="Claude Opus 4.6" /></td>
                  <td style={cell}><TextInput value={m.kind}     onChange={(v) => patchModel(idx, { kind: v })}     placeholder="anthropic" /></td>
                  <td style={cell}><TextInput value={m.model}    onChange={(v) => patchModel(idx, { model: v })}    placeholder="claude-opus-4-6" /></td>
                  <td style={cell}><TextInput value={m.endpoint} onChange={(v) => patchModel(idx, { endpoint: v })} placeholder="(optional)" /></td>
                  <td style={cell}>
                    <button className="button ghost" onClick={() => removeModel(idx)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ═══════════════ AGENTS (read-only, unified primary + subagents) ═══════════════
export function SettingsAgents(): JSX.Element {
  const { agents, models } = useAgents();

  // Group agents by title. Empty title ends up in "Other".
  const grouped = new Map<string, typeof agents>();
  for (const a of agents) {
    const key = a.title || "Other";
    const bucket = grouped.get(key) ?? [];
    bucket.push(a);
    grouped.set(key, bucket);
  }

  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />
        <div className="card" style={{ borderStyle: "dashed" }}>
          <p className="muted" style={{ fontSize: 12 }}>
            View-only. Add an agent by dropping a folder in{" "}
            <code>agents/&lt;slug&gt;/</code>. See <code>agents/README.md</code>.
            Primary roles have 1-char codes; subagents have 2-4 char codes.
          </p>
        </div>

        {agents.length === 0 && (
          <div className="card">
            <p className="muted">
              No agents found. The <code>agents/</code> folder may be missing or
              contain no <code>agent.json</code> files.
            </p>
          </div>
        )}

        {[...grouped.entries()].map(([title, list]) => (
          <div key={title}>
            <h3 style={{ marginBottom: 10, color: "var(--muted)" }}>{title}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {list.map((a) => (
                <div key={a.slug} className="card">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 16 }}>{a.name}</strong>
                    <span className="pill info" style={{ marginLeft: "auto" }}>{a.code}</span>
                  </div>
                  {a.description && (
                    <p className="muted" style={{ marginTop: 8 }}>{a.description}</p>
                  )}
                  <div style={{ marginTop: 10, fontSize: 13 }}>
                    <div>
                      <strong>Primary model:</strong>{" "}
                      {modelLabel(a.primaryModel, models) || "(caller chooses)"}
                    </div>
                    {a.fallbackModels.length > 0 && (
                      <div>
                        <strong>Fallbacks:</strong>{" "}
                        {a.fallbackModels.map((id) => modelLabel(id, models)).join(", ")}
                      </div>
                    )}
                    <div>
                      <strong>Permissions:</strong>{" "}
                      {permissionSummary(a.permissions)}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12 }} className="muted">
                      File suffix example: <code>&lt;task-id&gt;-{a.code}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════ WORKFLOWS (read-only) ═══════════════
export function SettingsWorkflows(): JSX.Element {
  const { workflows } = useWorkflows();
  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />
        <div className="card" style={{ borderStyle: "dashed" }}>
          <p className="muted" style={{ fontSize: 12 }}>
            View-only. Add a workflow by dropping a folder in{" "}
            <code>workflows/&lt;CODE&gt;-&lt;slug&gt;/</code>. See{" "}
            <code>workflows/README.md</code>.
          </p>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          {workflows.length === 0 && (
            <div className="card">
              <p className="muted">
                No workflows found. The <code>workflows/</code> folder may be missing.
              </p>
            </div>
          )}
          {workflows.map((w) => {
            const lanes = effectiveLanes(w);
            const customLanes = Boolean(w.lanes && w.lanes.length > 0);
            return (
              <div key={w.code} className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="pill info" style={{ fontSize: 14 }}>{w.code}</span>
                  <strong style={{ fontSize: 18 }}>{w.name}</strong>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  {w.description || "(no description)"}
                </p>
                <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Lanes {customLanes ? "(custom)" : "(default)"}:
                  </span>
                  {lanes.map((lane, idx) => (
                    <span key={lane} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          background: "var(--panel-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "2px 8px",
                          fontSize: 12,
                        }}
                      >
                        {lane}
                      </span>
                      {idx < lanes.length - 1 && (
                        <span className="muted" style={{ fontSize: 11 }}>→</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═══════════════ GLOBAL ═══════════════
export function SettingsGlobal(): JSX.Element {
  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />

        <BabysitterMode />

        <div className="card">
          <h3>Paths</h3>
          <div style={{ marginTop: 10 }}>
            <PathRow label="Tasks"           value="(userData)/tasks" />
            <PathRow label="Projects"        value="(userData)/projects" />
            <PathRow label="Model roster"    value="(userData)/models.json" />
            <PathRow label="App settings"    value="(userData)/settings.json" />
            <PathRow label="Agents"          value="(bundled)/agents" />
            <PathRow label="Workflows"       value="(bundled)/workflows" />
          </div>
        </div>

        <div className="card">
          <h3>Integrations</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Projects auto-detect their source from their path's <code>.git/config</code>.
            These settings are only for app-wide defaults.
          </p>
        </div>

        <div className="card">
          <h3>API keys</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Pi owns these. This screen will deep-link into pi's config once wired.
          </p>
          <button className="button ghost" style={{ marginTop: 10 }} disabled>
            Open pi config (pending pi wire-up)
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Babysitter mode card on Settings → Global. Lets the user pick which
 * slash command MC sends when Start is clicked: /babysit (plan only,
 * default — author a process.js but don't execute) vs /yolo (plan +
 * execute). Both run inside a pi session driven by RunManager;
 * babysitter-pi's skill resolves the slash command.
 */
function BabysitterMode(): JSX.Element {
  const [settings, setSettings] = useState<MCSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.mc) return;
    void window.mc.getSettings().then(setSettings).catch((e) => setError(String(e)));
  }, []);

  async function setMode(mode: MCSettings["babysitterMode"]): Promise<void> {
    if (!window.mc) return;
    setSaving(true);
    setError("");
    try {
      const next = await window.mc.saveSettings({ babysitterMode: mode });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Babysitter mode</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Controls which slash command MC sends to babysitter-pi when you
        click Start. <strong>Plan only</strong> is verified to author a
        process.js but doesn't execute it. <strong>Plan + execute</strong>{" "}
        sends <code>/yolo</code> which (per babysitter-pi docs) plans
        and runs the workflow including breakpoints — try it on a small
        scratch task first.
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="radio"
            name="babysitter-mode"
            checked={settings?.babysitterMode === "plan"}
            onChange={() => void setMode("plan")}
            disabled={saving}
          />
          <span>Plan only — <code>/babysit</code></span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="radio"
            name="babysitter-mode"
            checked={settings?.babysitterMode === "execute"}
            onChange={() => void setMode("execute")}
            disabled={saving}
          />
          <span>Plan + execute — <code>/yolo</code></span>
        </label>
        {saving && <span className="muted" style={{ fontSize: 12 }}>Saving…</span>}
      </div>
      {error && (
        <div
          className="muted"
          style={{
            color: "var(--bad)",
            background: "rgba(255,123,123,0.08)",
            border: "1px solid var(--bad)",
            borderRadius: 8,
            padding: "8px 10px",
            marginTop: 10,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell: React.CSSProperties = { padding: "6px 8px", verticalAlign: "top" };

function TextInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "6px 8px",
        fontFamily: "inherit",
        fontSize: 13,
        width: "100%",
      }}
    />
  );
}

function PathRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span>{label}</span>
      <span className="muted"><code>{value}</code></span>
    </div>
  );
}

function DemoBanner(): JSX.Element {
  return (
    <div
      className="card"
      style={{ borderStyle: "dashed", background: "rgba(244,201,93,0.05)" }}
    >
      <strong style={{ color: "var(--warn)" }}>Demo config</strong>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        No real data on disk yet. Anything you save here writes to{" "}
        <code>(userData)/models.json</code>.
      </p>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }): JSX.Element {
  return (
    <div
      className="card"
      style={{
        color: "var(--bad)",
        borderColor: "var(--bad)",
        background: "rgba(255,123,123,0.08)",
      }}
    >
      {msg}
    </div>
  );
}

function permissionSummary(p: { inherit?: boolean; readonly?: boolean; allowedPaths?: string[] }): string {
  const parts: string[] = [];
  if (p.readonly) parts.push("read-only");
  if (p.inherit) parts.push("inherits from parent");
  if (p.allowedPaths && p.allowedPaths.length > 0) parts.push(`scoped to ${p.allowedPaths.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "default";
}
