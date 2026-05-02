/**
 * Settings — shell. The Agents and Workflows sub-tabs were removed; the
 * library catalog at `library/_index.json` is the source of truth for
 * agents, skills, and workflows. Browse it from the Library page.
 */
import { useEffect, useState } from "react";

import { useRoute, type ViewId } from "../router";
import { publish } from "../hooks/data-bus";
import type { MCSettings } from "../../../shared/models";
import type { PiModelInfo } from "../global";

const SUBTABS: ReadonlyArray<{ id: ViewId; label: string }> = [
  { id: "settings-global", label: "Global" },
  { id: "settings-models", label: "Models" },
  { id: "settings-agents", label: "Agents" },
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

// ═══════════════ MODELS ═══════════════
/**
 * Models sub-tab — read-only roster of models pi knows about. Source
 * is `pi:listModels` IPC (PiSessionManager → pi-mono ModelRegistry).
 * Per-model toggles (cost cap, default reasoning, etc.) wait on a
 * pi-side write IPC; for now this is just the visible roster + the
 * cost / context-window numbers from pi's catalog.
 */
export function SettingsModels(): JSX.Element {
  const [models, setModels] = useState<PiModelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!window.mc?.listPiModels) {
      setLoading(false);
      return;
    }
    void window.mc.listPiModels()
      .then((next) => {
        setModels(next);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />
        <div className="card">
          <h3>Models</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Read-only roster. Pi owns the live ModelRegistry; MC asks
            for the list at boot via the <code>pi:listModels</code> IPC.
            Per-task model selection lives on the Task Detail picker —
            this screen is for awareness of what's available. Auth via
            env vars in the shell that launched <code>npm run dev</code>
            (<code>OPENAI_API_KEY</code> / <code>ANTHROPIC_API_KEY</code> / etc).
          </p>
          {loading && (
            <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              Loading…
            </div>
          )}
          {error && (
            <div className="muted" style={{ marginTop: 12, color: "var(--bad)", fontSize: 12 }}>
              Failed to load model roster: {error}
            </div>
          )}
          {!loading && !error && models.length === 0 && (
            <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              No models reported by pi. Confirm pi is installed and the
              relevant API keys are set in the shell.
            </div>
          )}
          {models.length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gap: 1 }} role="table">
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 100px 110px 90px 90px 70px",
                  gap: 12,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  padding: "6px 10px",
                }}
              >
                <span>Model</span>
                <span>Provider</span>
                <span>Context</span>
                <span style={{ textAlign: "right" }}>$/Mtok in</span>
                <span style={{ textAlign: "right" }}>$/Mtok out</span>
                <span>Reasoning</span>
              </div>
              {models.map((m) => (
                <div
                  key={m.id}
                  role="row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 100px 110px 90px 90px 70px",
                    gap: 12,
                    alignItems: "center",
                    padding: "8px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    background: "var(--raised)",
                    boxShadow: "var(--lift)",
                  }}
                  title={m.id}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{m.name || m.id}</span>
                  </span>
                  <span className="muted">{m.provider}</span>
                  <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {m.contextWindow > 0 ? `${(m.contextWindow / 1000).toFixed(0)}k` : "—"}
                  </span>
                  <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {m.costInputPerMTok ? `$${m.costInputPerMTok.toFixed(2)}` : "—"}
                  </span>
                  <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {m.costOutputPerMTok ? `$${m.costOutputPerMTok.toFixed(2)}` : "—"}
                  </span>
                  <span className={m.reasoning ? "pill info" : "muted"} style={{ fontSize: 10, marginRight: 0 }}>
                    {m.reasoning ? "yes" : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════ AGENTS ═══════════════
/**
 * Agents sub-tab. Library page is the catalog source-of-truth, so
 * this surface is a sign-post + a deep-link rather than its own
 * editor. Future slices can layer runtime knobs on top (default agent
 * per workflow, skill allow-lists) without duplicating the catalog
 * browser.
 */
export function SettingsAgents(): JSX.Element {
  const { setView } = useRoute();
  return (
    <>
      <Header />
      <div className="content">
        <SubTabs />
        <div className="card">
          <h3>Agents</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            The agent / skill catalog is managed by the{" "}
            <strong>Library</strong> page. Each kind has its own tab
            there; per-item details are edited via the inspector (the
            Edit toggle writes to a sidecar <code>INFO.json</code> next
            to the source file). This sub-tab is reserved for runtime
            knobs (default agent per workflow, skill allow-lists) that
            don't belong on the per-item editor.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button className="button" onClick={() => setView("library")}>
              Browse the catalog →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
