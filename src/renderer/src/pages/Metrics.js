import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useTasks } from "../hooks/useTasks";
import { useAllTaskEvents } from "../hooks/useAllTaskEvents";
import { useRoute } from "../router";
import { deriveRuns, runDurationMs } from "../lib/derive-runs";
export function Metrics() {
    const { setView } = useRoute();
    const { tasks, isDemo } = useTasks();
    const { perTask } = useAllTaskEvents();
    const tasksDone = tasks.filter((t) => t.lane === "Done").length;
    const tasksActive = tasks.filter((t) => t.lane !== "Done").length;
    // Collect every run across every task so we can aggregate.
    const allRuns = isDemo
        ? []
        : [...perTask.values()].flatMap(deriveRuns);
    const totals = allRuns.reduce((acc, r) => ({
        tokensIn: acc.tokensIn + (r.tokensIn ?? 0),
        tokensOut: acc.tokensOut + (r.tokensOut ?? 0),
        costUSD: acc.costUSD + (r.costUSD ?? 0),
    }), { tokensIn: 0, tokensOut: 0, costUSD: 0 });
    // Per-agent rollup (runs, avg duration, avg tokens, top model).
    const perAgent = aggregatePerAgent(allRuns);
    const kpis = isDemo
        ? [
            { label: "Tasks done (30d)", value: 47 },
            { label: "Avg cycles / task", value: "2.8" },
            { label: "First-pass rate", value: "62%" },
            { label: "Total tokens (30d)", value: "4.1M" },
            { label: "Spend (30d)", value: "$62" },
            { label: "Local runs (free)", value: 134 },
        ]
        : [
            { label: "Tasks done", value: tasksDone },
            { label: "Tasks active", value: tasksActive },
            { label: "Runs total", value: allRuns.length },
            {
                label: "Total tokens (in / out)",
                value: `${abbreviate(totals.tokensIn)} / ${abbreviate(totals.tokensOut)}`,
            },
            {
                label: "Spend",
                value: totals.costUSD > 0 ? `$${totals.costUSD.toFixed(4)}` : "—",
            },
            {
                label: "Avg cycles / task",
                value: tasks.length === 0
                    ? "—"
                    : (tasks.reduce((s, t) => s + t.cycle, 0) / tasks.length).toFixed(1),
            },
        ];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { children: [_jsx("h1", { children: "Metrics" }), _jsxs("p", { className: "muted", children: ["What are my agents good at? What's slow?", isDemo && " · demo data"] })] }), _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" })] }), _jsxs("div", { className: "content", children: [_jsx("section", { className: "card-grid", style: { gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }, children: kpis.map((k) => (_jsxs("div", { className: "card", style: { padding: 12 }, children: [_jsx("div", { className: "muted", children: k.label }), _jsx("div", { className: "kpi", style: { fontSize: 22 }, children: k.value })] }, k.label))) }), _jsxs("section", { className: "card", children: [_jsx("h3", { children: "Per-agent performance" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: isDemo
                                    ? "Demo data. Real numbers appear once tasks have run."
                                    : perAgent.length === 0
                                        ? "No runs yet. Start a task to populate this table."
                                        : "Aggregated from each task's events.jsonl (pi:turn_end events)." }), isDemo ? (_jsx(DemoPerRoleTable, {})) : perAgent.length > 0 ? (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)", textAlign: "left" }, children: [_jsx("th", { style: th, children: "Agent" }), _jsx("th", { style: th, children: "Runs" }), _jsx("th", { style: th, children: "Avg duration" }), _jsx("th", { style: th, children: "Avg tokens (in / out)" }), _jsx("th", { style: th, children: "Spend" }), _jsx("th", { style: th, children: "Top model" })] }) }), _jsx("tbody", { children: perAgent.map((r) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: cell, children: r.agentSlug }), _jsx("td", { style: cell, children: r.runs }), _jsx("td", { style: cell, children: r.avgDuration ?? "—" }), _jsxs("td", { style: cell, children: [abbreviate(r.avgTokensIn), " / ", abbreviate(r.avgTokensOut)] }), _jsxs("td", { style: cell, children: ["$", r.costUSD.toFixed(4)] }), _jsx("td", { style: cell, children: r.topModel ?? "—" })] }, r.agentSlug))) })] })) : null] }), _jsxs("section", { className: "card", children: [_jsx("h3", { children: "Subagent savings" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Populates once subagents actually spawn. Placeholder for now." })] })] })] }));
}
function aggregatePerAgent(runs) {
    const buckets = new Map();
    for (const r of runs) {
        const slug = r.agentSlug ?? "(unknown)";
        const b = buckets.get(slug) ?? {
            count: 0,
            totalDurationMs: 0,
            durationSamples: 0,
            totalTokensIn: 0,
            totalTokensOut: 0,
            totalCost: 0,
            modelCounts: new Map(),
        };
        b.count += 1;
        const d = runDurationMs(r);
        if (d !== undefined) {
            b.totalDurationMs += d;
            b.durationSamples += 1;
        }
        b.totalTokensIn += r.tokensIn ?? 0;
        b.totalTokensOut += r.tokensOut ?? 0;
        b.totalCost += r.costUSD ?? 0;
        if (r.model)
            b.modelCounts.set(r.model, (b.modelCounts.get(r.model) ?? 0) + 1);
        buckets.set(slug, b);
    }
    return [...buckets.entries()]
        .map(([slug, b]) => ({
        agentSlug: slug,
        runs: b.count,
        avgDuration: b.durationSamples > 0
            ? formatDurationMs(Math.round(b.totalDurationMs / b.durationSamples))
            : undefined,
        avgTokensIn: Math.round(b.totalTokensIn / b.count),
        avgTokensOut: Math.round(b.totalTokensOut / b.count),
        costUSD: b.totalCost,
        topModel: pickTopModel(b.modelCounts),
    }))
        .sort((a, b) => b.runs - a.runs);
}
function pickTopModel(counts) {
    let best = null;
    for (const [model, count] of counts) {
        if (!best || count > best.count)
            best = { model, count };
    }
    return best?.model;
}
// ── formatting helpers ───────────────────────────────────────────────────
function formatDurationMs(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60)
        return rem ? `${m}m ${rem}s` : `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}
function abbreviate(n) {
    if (n < 1_000)
        return n.toLocaleString();
    if (n < 1_000_000)
        return `${(n / 1_000).toFixed(1)}K`;
    return `${(n / 1_000_000).toFixed(2)}M`;
}
const th = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell = { padding: "8px 10px" };
// ── demo-mode table ──────────────────────────────────────────────────────
// Kept as a separate helper so the main return stays focused. Numbers are
// the same canned values the wireframe always shipped.
function DemoPerRoleTable() {
    // Demo wireframe rows. The real per-role rollup, once built, will
    // group on whatever agentSlugs the workflows declared at runtime —
    // there is no fixed roster of roles in MC. These rows are
    // illustrative only; treat them as a layout placeholder, not as
    // a list of agents the system supports.
    const rows = [
        { role: "Agent A", runs: 58, avgDuration: "14m", avgTokens: "11,200", loopBack: "—", topModel: "Claude Opus 4.6" },
        { role: "Agent B", runs: 52, avgDuration: "3h 18m", avgTokens: "38,400", loopBack: "12%", topModel: "GPT-5 Codex" },
        { role: "Agent C", runs: 52, avgDuration: "22m", avgTokens: "7,900", loopBack: "38% loop-back", topModel: "Claude Opus 4.6" },
        { role: "Agent D", runs: 47, avgDuration: "9m", avgTokens: "4,100", loopBack: "—", topModel: "Qwen 2.5 Coder" },
    ];
    return (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)", textAlign: "left" }, children: [_jsx("th", { style: th, children: "Role" }), _jsx("th", { style: th, children: "Runs" }), _jsx("th", { style: th, children: "Avg duration" }), _jsx("th", { style: th, children: "Avg tokens" }), _jsx("th", { style: th, children: "Loop-back %" }), _jsx("th", { style: th, children: "Top model" })] }) }), _jsx("tbody", { children: rows.map((r) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: cell, children: r.role }), _jsx("td", { style: cell, children: r.runs }), _jsx("td", { style: cell, children: r.avgDuration }), _jsx("td", { style: cell, children: r.avgTokens }), _jsx("td", { style: cell, children: r.loopBack }), _jsx("td", { style: cell, children: r.topModel })] }, r.role))) })] }));
}
