/**
 * Settings — shell. The Agents and Workflows sub-tabs were removed; the
 * library catalog at `library/_index.json` is the source of truth for
 * agents, skills, and workflows. Browse it from the Library page.
 */
import { useEffect, useState } from "react";

import { useRoute, type ViewId } from "../router";
import { publish } from "../hooks/data-bus";
import type { MCSettings } from "../../../shared/models";

const SUBTABS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "settings-global", label: "Global" },
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

// ═══════════════ GLOBAL ═══════════════
export function SettingsGlobal(): JSX.Element {
  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />

        <BabysitterMode />
        <RunQueueSettings />
        <DisplaySettings />

        <div className="card">
          <h3>Paths</h3>
          <div style={{ marginTop: 10 }}>
            <PathRow label="Tasks"           value="(userData)/tasks" />
            <PathRow label="Projects"        value="(userData)/projects" />
            <PathRow label="App settings"    value="(userData)/settings.json" />
            <PathRow label="Library"         value="(bundled)/library" />
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

function RunQueueSettings(): JSX.Element {
  const [settings, setSettings] = useState<MCSettings | null>(null);
  const [draftCap, setDraftCap] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.mc) return;
    void window.mc.getSettings().then((next) => {
      setSettings(next);
      setDraftCap(String(next.runConcurrencyCap ?? 10));
    }).catch((e) => setError(String(e)));
  }, []);

  async function saveCap(): Promise<void> {
    if (!window.mc) return;
    const parsed = Number(draftCap);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
      setError("Concurrency cap must be an integer between 1 and 50.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const next = await window.mc.saveSettings({ runConcurrencyCap: Math.floor(parsed) });
      setSettings(next);
      setDraftCap(String(next.runConcurrencyCap ?? 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Run queue</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Caps how many tasks can run simultaneously. Additional starts are queued and launch automatically as slots free up.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <label className="muted" style={{ fontSize: 12 }}>Concurrency cap</label>
        <input
          type="number"
          min={1}
          max={50}
          step={1}
          value={draftCap}
          onChange={(e) => setDraftCap(e.target.value)}
          style={{ width: 110 }}
        />
        <button className="button" onClick={() => void saveCap()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Current: {settings?.runConcurrencyCap ?? 10}
        </span>
      </div>
      {error && (
        <div className="muted" style={{ color: "var(--bad)", marginTop: 10, fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
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
            background: "rgba(232, 116, 116,0.08)",
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

/**
 * Display section — renderer-side filters that don't change persisted
 * data. Today: a toggle for sample (read-only demo) tasks/projects.
 */
function DisplaySettings(): JSX.Element {
  const [show, setShow] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.mc) return;
    void window.mc.getSettings()
      .then((next) => setShow(next.showSampleData ?? true))
      .catch((e) => setError(String(e)));
  }, []);

  async function toggle(): Promise<void> {
    if (!window.mc) return;
    const next = !show;
    setSaving(true);
    setError("");
    try {
      await window.mc.saveSettings({ showSampleData: next });
      setShow(next);
      publish("settings");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Display</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Toggle the read-only sample tasks + projects shipped under
        <code> library/samples/</code>. Hide them once you have your own
        work going. Sample records are tagged at read time and never
        written back to your data.
      </p>
      <label
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={show}
          disabled={saving}
          onChange={() => void toggle()}
        />
        <span>Show sample data</span>
      </label>
      {error && (
        <div style={{ marginTop: 8, color: "var(--bad)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
