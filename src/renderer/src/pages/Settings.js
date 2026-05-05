import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Settings — shell. The Agents and Workflows sub-tabs were removed; the
 * library catalog at `library/_index.json` is the source of truth for
 * agents, skills, and workflows. Browse it from the Library page.
 */
import { useEffect, useState } from "react";
import { useRoute } from "../router";
import { publish } from "../hooks/data-bus";
const SUBTABS = [
    { id: "settings-global", label: "Global" },
    { id: "settings-models", label: "Models" },
    { id: "settings-agents", label: "Agents" },
];
function Header() {
    const { setView } = useRoute();
    return (_jsxs("div", { className: "topbar", children: [_jsx("div", { children: _jsx("h1", { children: "Settings" }) }), _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" })] }));
}
function SubTabs() {
    const { view, setView } = useRoute();
    return (_jsx("div", { style: {
            display: "flex",
            gap: 4,
            borderBottom: "1px solid var(--border)",
            marginBottom: 18,
        }, children: SUBTABS.map((tab) => (_jsx("button", { onClick: () => setView(tab.id), className: "button ghost", style: {
                borderRadius: 0,
                borderWidth: 0,
                borderBottom: view === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                color: view === tab.id ? "var(--text)" : "var(--muted)",
                padding: "8px 14px",
            }, children: tab.label }, tab.id))) }));
}
// ═══════════════ GLOBAL ═══════════════
export function SettingsGlobal() {
    return (_jsxs(_Fragment, { children: [_jsx(Header, {}), _jsxs("div", { className: "content", children: [_jsx(SubTabs, {}), _jsx(RunQueueSettings, {}), _jsx(DisplaySettings, {}), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Paths" }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx(PathRow, { label: "Tasks", value: "(userData)/tasks" }), _jsx(PathRow, { label: "Projects", value: "(userData)/projects" }), _jsx(PathRow, { label: "App settings", value: "(userData)/settings.json" }), _jsx(PathRow, { label: "Library", value: "(bundled)/library" })] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Integrations" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["Projects auto-detect their source from their path's ", _jsx("code", { children: ".git/config" }), ". These settings are only for app-wide defaults."] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "API keys" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Pi owns these. This screen will deep-link into pi's config once wired." }), _jsx("button", { className: "button ghost", style: { marginTop: 10 }, disabled: true, children: "Open pi config (pending pi wire-up)" })] })] })] }));
}
function RunQueueSettings() {
    const [settings, setSettings] = useState(null);
    const [draftCap, setDraftCap] = useState("10");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!window.mc)
            return;
        void window.mc.getSettings().then((next) => {
            setSettings(next);
            setDraftCap(String(next.runConcurrencyCap ?? 10));
        }).catch((e) => setError(String(e)));
    }, []);
    async function saveCap() {
        if (!window.mc)
            return;
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
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Run queue" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Caps how many tasks can run simultaneously. Additional starts are queued and launch automatically as slots free up." }), _jsxs("div", { style: { display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }, children: [_jsx("label", { className: "muted", style: { fontSize: 12 }, children: "Concurrency cap" }), _jsx("input", { type: "number", min: 1, max: 50, step: 1, value: draftCap, onChange: (e) => setDraftCap(e.target.value), style: { width: 110 } }), _jsx("button", { className: "button", onClick: () => void saveCap(), disabled: saving, children: saving ? "Saving…" : "Save" }), _jsxs("span", { className: "muted", style: { fontSize: 12 }, children: ["Current: ", settings?.runConcurrencyCap ?? 10] })] }), error && (_jsx("div", { className: "muted", style: { color: "var(--bad)", marginTop: 10, fontSize: 12 }, children: error }))] }));
}
// ── small helpers ─────────────────────────────────────────────────────────
function PathRow({ label, value }) {
    return (_jsxs("div", { style: {
            padding: "10px 0",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
        }, children: [_jsx("span", { children: label }), _jsx("span", { className: "muted", children: _jsx("code", { children: value }) })] }));
}
/**
 * Display section — renderer-side filters that don't change persisted
 * data. Today: a toggle for sample (read-only demo) tasks/projects.
 */
function DisplaySettings() {
    const [show, setShow] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!window.mc)
            return;
        void window.mc.getSettings()
            .then((next) => setShow(next.showSampleData ?? true))
            .catch((e) => setError(String(e)));
    }, []);
    async function toggle() {
        if (!window.mc)
            return;
        const next = !show;
        setSaving(true);
        setError("");
        try {
            await window.mc.saveSettings({ showSampleData: next });
            setShow(next);
            publish("settings");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Display" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["Toggle the read-only sample tasks + projects shipped under", _jsx("code", { children: " library/samples/" }), ". Hide them once you have your own work going. Sample records are tagged at read time and never written back to your data."] }), _jsxs("label", { style: {
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: saving ? "wait" : "pointer",
                }, children: [_jsx("input", { type: "checkbox", checked: show, disabled: saving, onChange: () => void toggle() }), _jsx("span", { children: "Show sample data" })] }), error && (_jsx("div", { style: { marginTop: 8, color: "var(--bad)", fontSize: 12 }, children: error }))] }));
}
// ═══════════════ MODELS ═══════════════
/**
 * Models sub-tab — read-only roster of models pi knows about. Source
 * is `pi:listModels` IPC (PiSessionManager → pi-mono ModelRegistry).
 * Per-model toggles (cost cap, default reasoning, etc.) wait on a
 * pi-side write IPC; for now this is just the visible roster + the
 * cost / context-window numbers from pi's catalog.
 */
export function SettingsModels() {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
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
    return (_jsxs(_Fragment, { children: [_jsx(Header, {}), _jsxs("div", { className: "content", children: [_jsx(SubTabs, {}), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Models" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["Read-only roster. Pi owns the live ModelRegistry; MC asks for the list at boot via the ", _jsx("code", { children: "pi:listModels" }), " IPC. Per-task model selection lives on the Task Detail picker \u2014 this screen is for awareness of what's available. Auth via env vars in the shell that launched ", _jsx("code", { children: "npm run dev" }), "(", _jsx("code", { children: "OPENAI_API_KEY" }), " / ", _jsx("code", { children: "ANTHROPIC_API_KEY" }), " / etc)."] }), loading && (_jsx("div", { className: "muted", style: { marginTop: 12, fontSize: 12 }, children: "Loading\u2026" })), error && (_jsxs("div", { className: "muted", style: { marginTop: 12, color: "var(--bad)", fontSize: 12 }, children: ["Failed to load model roster: ", error] })), !loading && !error && models.length === 0 && (_jsx("div", { className: "muted", style: { marginTop: 12, fontSize: 12 }, children: "No models reported by pi. Confirm pi is installed and the relevant API keys are set in the shell." })), models.length > 0 && (_jsxs("div", { style: { marginTop: 12, display: "grid", gap: 1 }, role: "table", children: [_jsxs("div", { role: "row", style: {
                                            display: "grid",
                                            gridTemplateColumns: "1.4fr 100px 110px 90px 90px 70px",
                                            gap: 12,
                                            fontSize: 11,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            color: "var(--muted)",
                                            padding: "6px 10px",
                                        }, children: [_jsx("span", { children: "Model" }), _jsx("span", { children: "Provider" }), _jsx("span", { children: "Context" }), _jsx("span", { style: { textAlign: "right" }, children: "$/Mtok in" }), _jsx("span", { style: { textAlign: "right" }, children: "$/Mtok out" }), _jsx("span", { children: "Reasoning" })] }), models.map((m) => (_jsxs("div", { role: "row", style: {
                                            display: "grid",
                                            gridTemplateColumns: "1.4fr 100px 110px 90px 90px 70px",
                                            gap: 12,
                                            alignItems: "center",
                                            padding: "8px 10px",
                                            fontSize: 12,
                                            borderRadius: 6,
                                            background: "var(--raised)",
                                            boxShadow: "var(--lift)",
                                        }, title: m.id, children: [_jsx("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: _jsx("span", { style: { fontFamily: "var(--font-mono)" }, children: m.name || m.id }) }), _jsx("span", { className: "muted", children: m.provider }), _jsx("span", { className: "muted", style: { fontVariantNumeric: "tabular-nums" }, children: m.contextWindow > 0 ? `${(m.contextWindow / 1000).toFixed(0)}k` : "—" }), _jsx("span", { className: "muted", style: { textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: m.costInputPerMTok ? `$${m.costInputPerMTok.toFixed(2)}` : "—" }), _jsx("span", { className: "muted", style: { textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: m.costOutputPerMTok ? `$${m.costOutputPerMTok.toFixed(2)}` : "—" }), _jsx("span", { className: m.reasoning ? "pill info" : "muted", style: { fontSize: 10, marginRight: 0 }, children: m.reasoning ? "yes" : "—" })] }, m.id)))] }))] })] })] }));
}
// ═══════════════ AGENTS ═══════════════
/**
 * Agents sub-tab. Library page is the catalog source-of-truth, so
 * this surface is a sign-post + a deep-link rather than its own
 * editor. Future slices can layer runtime knobs on top (default agent
 * per workflow, skill allow-lists) without duplicating the catalog
 * browser.
 */
export function SettingsAgents() {
    const { setView } = useRoute();
    return (_jsxs(_Fragment, { children: [_jsx(Header, {}), _jsxs("div", { className: "content", children: [_jsx(SubTabs, {}), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Agents" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["The agent / skill catalog is managed by the", " ", _jsx("strong", { children: "Library" }), " page. Each kind has its own tab there; per-item details are edited via the inspector (the Edit toggle writes to a sidecar ", _jsx("code", { children: "INFO.json" }), " next to the source file). This sub-tab is reserved for runtime knobs (default agent per workflow, skill allow-lists) that don't belong on the per-item editor."] }), _jsx("div", { style: { marginTop: 12, display: "flex", gap: 8 }, children: _jsx("button", { className: "button", onClick: () => setView("library"), children: "Browse the catalog \u2192" }) })] })] })] }));
}
