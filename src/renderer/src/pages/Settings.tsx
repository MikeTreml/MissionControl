/**
 * Settings — shell with sub-tabs for Agents / Workflows / Global.
 *
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
import { effectiveLanes, isPrimaryAgent } from "../../../shared/models";
import type { Agent, MCSettings } from "../../../shared/models";

const SUBTABS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "settings-agents",    label: "Agents" },
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

// ═══════════════ AGENTS (editable overlays on bundled manifests) ═══════════════
export function SettingsAgents(): JSX.Element {
  const { agents, models, refresh, isDemo } = useAgents();
  const [draft, setDraft] = useState<Agent[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const source = draft ?? agents;
  const enabledPrimaries = source.filter((a) => isPrimaryAgent(a) && a.enabled !== false);
  const duplicateCodes = findDuplicateCodes(source);

  useEffect(() => {
    setDraft(null);
    setError("");
  }, [agents]);

  function patchAgent(slug: string, patch: Partial<Agent>): void {
    setDraft(source.map((a) => (a.slug === slug ? { ...a, ...patch } : a)));
  }

  async function save(): Promise<void> {
    if (!window.mc) { setError("Not connected — run `npm run dev`"); return; }
    if (duplicateCodes.length > 0) {
      setError(`Duplicate agent code(s): ${duplicateCodes.join(", ")}`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await window.mc.saveAgents(source);
      setDraft(null);
      publish("agents");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />
        {isDemo && <DemoBanner />}
        {error && <ErrorBanner msg={error} />}

        <div className="card" style={{ borderStyle: "dashed" }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Bundled agent manifests remain the base definition. Edits here are saved as Mission Control overrides,
            so you can activate/deactivate agents, rename them, change suffix codes, and pick pi-discovered models without
            hardcoding Planner/Developer/Reviewer/Surgeon conventions in the UI.
          </p>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3>Agent roster</h3>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                Enabled 1-char agents are the active primary roles used by task-linked file expectations and runtime pickers.
              </p>
            </div>
            <button className="button" onClick={() => void save()} disabled={saving || agents.length === 0}>
              {saving ? "Saving…" : "Save agents"}
            </button>
          </div>

          {agents.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>
              No agents found. The <code>agents/</code> folder may be missing or contain no <code>agent.json</code> files.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                  <th style={th}>On</th>
                  <th style={th}>Slug</th>
                  <th style={th}>Name</th>
                  <th style={th}>Title</th>
                  <th style={th}>Code</th>
                  <th style={th}>Primary model</th>
                </tr>
              </thead>
              <tbody>
                {source.map((a) => (
                  <tr key={a.slug} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={cell}>
                      <input type="checkbox" checked={a.enabled !== false} onChange={(e) => patchAgent(a.slug, { enabled: e.target.checked })} />
                    </td>
                    <td style={cell}><code>{a.slug}</code></td>
                    <td style={cell}><TextInput value={a.name} onChange={(v) => patchAgent(a.slug, { name: v })} placeholder="Display name" /></td>
                    <td style={cell}><TextInput value={a.title} onChange={(v) => patchAgent(a.slug, { title: v })} placeholder="Developer / Reviewer / …" /></td>
                    <td style={cell}><TextInput value={a.code} onChange={(v) => patchAgent(a.slug, { code: v.toLowerCase() })} placeholder="p" /></td>
                    <td style={cell}>
                      <select
                        value={a.primaryModel}
                        onChange={(e) => patchAgent(a.slug, { primaryModel: e.target.value })}
                        style={selectStyle}
                      >
                        <option value="">(caller chooses)</option>
                        {models.map((m) => {
                          const value = `${m.provider}:${m.id}`;
                          return <option key={value} value={value}>{m.provider}:{m.name}</option>;
                        })}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>Active primary agent suffixes</h3>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {enabledPrimaries.length === 0 ? (
              <div className="muted" style={{ fontSize: 12 }}>No enabled primary agents.</div>
            ) : enabledPrimaries.map((a) => (
              <div key={a.slug} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{a.name}</strong>
                <span className="muted"><code>&lt;task-id&gt;-{a.code}.md</code></span>
              </div>
            ))}
          </div>
          {duplicateCodes.length > 0 && (
            <p className="muted" style={{ marginTop: 10, color: "var(--bad)" }}>
              Duplicate codes must be resolved before saving: {duplicateCodes.join(", ")}
            </p>
          )}
        </div>
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
        Controls how MC drives pi when you click Start.{" "}
        <strong>Plan only</strong> sends <code>/plan</code> — author a
        <code>process.js</code> + run scaffold, don't execute.{" "}
        <strong>Plan + execute</strong> sends <code>/yolo</code> — author
        and run end-to-end without breakpoints.{" "}
        <strong>Direct</strong> skips babysitter entirely and prompts pi
        as a single agent — cheapest, fastest, no multi-agent loop. Use
        for trivial tasks where babysitter's investigation overhead
        isn't worth ~$0.30 + 90s.
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="radio"
            name="babysitter-mode"
            checked={settings?.babysitterMode === "plan"}
            onChange={() => void setMode("plan")}
            disabled={saving}
          />
          <span>Plan only — <code>/plan</code></span>
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
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input
            type="radio"
            name="babysitter-mode"
            checked={settings?.babysitterMode === "direct"}
            onChange={() => void setMode("direct")}
            disabled={saving}
          />
          <span>Direct — single-agent (no babysitter)</span>
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
const selectStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontFamily: "inherit",
  fontSize: 13,
  width: "100%",
};

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
        No real data on disk yet. Anything you save here writes to Mission Control's app data.
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

function findDuplicateCodes(agents: Agent[]): string[] {
  const counts = new Map<string, number>();
  for (const agent of agents) counts.set(agent.code, (counts.get(agent.code) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > 1).map(([code]) => code).sort();
}
