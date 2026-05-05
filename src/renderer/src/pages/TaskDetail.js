import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Task Detail — one dense page. Reads task meta + event journal and renders:
 *   - controls row (Start / Pause / Stop stubbed, "Set active role" disabled)
 *   - lane timeline + task meta (two columns)
 *   - run history table (derived from events)
 *   - linked files panel + per-role notes
 *
 * Controls are UI-only today. When pi is wired (baby step 14+), onClick
 * handlers call window.mc.startRun() etc.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { useRoute } from "../router";
import { useTask } from "../hooks/useTask";
import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { usePiModels } from "../hooks/usePiModels";
import { usePendingAsks } from "../hooks/usePendingAsks";
import { publish, useSubscribe } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
import { deriveRuns } from "../lib/derive-runs";
import { derivePhases } from "../lib/derive-phases";
import { derivePendingBreakpoint } from "../lib/derive-pending-breakpoint";
import { deriveSubagents } from "../lib/derive-subagents";
import { deriveToolCalls, previewCmd } from "../lib/derive-tool-calls";
import { colorForKey } from "../lib/color-hash";
import { AskUserCard } from "../components/AskUserCard";
import { EditTaskForm } from "../components/EditTaskForm";
import { ChangeWorkflowModal } from "../components/ChangeWorkflowModal";
import { SkeletonLine, SkeletonBlock, SkeletonRows } from "../components/Skeleton";
import { CreateTaskForm } from "../components/CreateTaskForm";
import { PageStub } from "./PageStub";
export function TaskDetail() {
    const { selectedTaskId } = useRoute();
    const { task, events, prompt, status, runConfig, latestMetrics, metricsFileName, isDemo, loading } = useTask(selectedTaskId);
    const pendingAsks = usePendingAsks(selectedTaskId);
    const [editOpen, setEditOpen] = useState(false);
    const [workflowOpen, setWorkflowOpen] = useState(false);
    const [rerunOpen, setRerunOpen] = useState(false);
    const [doctorOpen, setDoctorOpen] = useState(false);
    // Distinguish "task is loading" from "no task selected" — useTask
    // resolves both into `task: null` initially. If we have a selected
    // id and we're still fetching, render a skeleton instead of the
    // "pick a task" stub.
    if (!task && selectedTaskId && loading) {
        return _jsx(TaskDetailSkeleton, {});
    }
    if (!task) {
        return (_jsx(PageStub, { title: "Task not selected", purpose: "Pick a task from the board to see its detail." }));
    }
    // Layout follows the design canvas (NewUI/.../index.html lines 482-727):
    //   .topbar         — crumbs (project / Board / TASK-ID) + actions
    //   .task-hero      — id-line + title + meta + plan-progress
    //   .workshop       — 3-col: plan-rail | workshop-main | workshop-side
    //
    // REMOVED 2026-05-02: standalone PhaseChipStrip card. Phase data now
    // renders twice in the new layout: as horizontal nodes inside the
    // hero (.plan-progress) and as a vertical sticky list on the left
    // (.plan-rail). The legacy chip strip duplicated both.
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsx(Crumbs, { task: task }), _jsxs("div", { className: "actions", style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx(CostTicker, { events: events }), !isDemo && (_jsx("button", { className: "btn ghost", title: "Edit title and description", onClick: () => setEditOpen(true), children: "Edit" })), !isDemo && (_jsx("button", { className: "btn ghost", title: "Re-assign or clear the curated library workflow used on the next Start", onClick: () => setWorkflowOpen(true), children: "Workflow\u2026" })), !isDemo && (_jsx("button", { className: "btn ghost", title: "Create a new task pre-filled from this one \u2014 edit anything before saving", onClick: () => setRerunOpen(true), children: "\u21BB Re-run\u2026" })), !isDemo && (_jsx("button", { className: "btn ghost", title: "Open the task's folder in your OS file explorer", onClick: () => { void window.mc?.openTaskFolder(task.id); }, children: "\uD83D\uDCC1 Open folder" })), !isDemo && (_jsxs(TaskActionsMenu, { children: [_jsx("button", { className: "btn ghost", title: "Spin off a doctor task \u2014 diagnose why this task is stuck without modifying it", onClick: () => setDoctorOpen(true), children: "\u21B3 Spin off doctor" }), _jsx(ArchiveTaskButton, { task: task }), _jsx(DeleteTaskButton, { taskId: task.id })] })), _jsx(BackToDashboard, {})] })] }), !isDemo && (_jsx(EditTaskForm, { open: editOpen, onClose: () => setEditOpen(false), task: task })), !isDemo && (_jsx(ChangeWorkflowModal, { open: workflowOpen, onClose: () => setWorkflowOpen(false), task: task })), !isDemo && (_jsx(CreateTaskForm, { open: rerunOpen, onClose: () => setRerunOpen(false), preload: buildRerunPreload(task, runConfig) })), !isDemo && (_jsx(CreateTaskForm, { open: doctorOpen, onClose: () => setDoctorOpen(false), preload: buildDoctorPreload(task, runConfig) })), _jsxs("div", { className: "content", children: [_jsx(TaskHero, { task: task, events: events, isDemo: isDemo }), _jsxs("div", { className: "workshop", children: [_jsx(PlanRail, { task: task, events: events }), _jsxs("div", { className: "workshop-main", children: [_jsx(Controls, { task: task }), !isDemo && _jsx(PendingEffectsPanel, { task: task, events: events }), !isDemo && _jsx(RunStatusCard, { task: task, events: events, runConfig: runConfig }), !isDemo && pendingAsks.map((ask) => (_jsx(AskUserCard, { taskId: task.id, ask: ask }, ask.toolCallId))), !isDemo && _jsx(BlockerField, { task: task }), _jsxs("section", { className: "card", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }, children: [_jsx(Mission, { prompt: prompt }), _jsx(StatusLog, { status: status })] }), _jsx(LaneTimeline, { task: task, events: events }), task.kind === "campaign" && _jsx(CampaignItems, { task: task }), _jsx(SubagentsPanel, { events: events }), !isDemo && _jsx(ToolCalls, { events: events }), _jsx(RunHistory, { events: events })] }), _jsxs("aside", { className: "workshop-side", children: [_jsx(CostMeter, { events: events }), _jsx(TaskMeta, { task: task, events: events }), !isDemo && _jsx(RunMetadataChips, { task: task, events: events }), !isDemo && _jsx(SpawnedFromPanel, { task: task }), _jsx(LinkedFiles, { task: task }), !isDemo && _jsx(RunConfigCard, { runConfig: runConfig }), !isDemo && _jsx(RunMetricsCard, { metrics: latestMetrics, fileName: metricsFileName })] })] }), !isDemo && _jsx(ApprovalBar, { task: task, events: events })] })] }));
}
// ─── Hero + plan rail (canvas: NewUI/.../index.html lines 484-575) ──
function Crumbs({ task }) {
    const { projects } = useProjects();
    const proj = projects.find((p) => p.id === task.project);
    const projName = proj?.name ?? task.project;
    const accent = task.id.includes("-") ? colorForKey(task.id.split("-")[0]) : "var(--info)";
    return (_jsxs("div", { className: "crumbs", children: [_jsx("span", { children: projName }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { children: "Board" }), _jsx("span", { className: "sep", children: "/" }), _jsx("span", { className: "now", children: _jsx("code", { style: { fontFamily: "var(--font-mono)", color: accent }, children: task.id }) })] }));
}
function TaskHero({ task, events, isDemo }) {
    const { phases, current } = derivePhases(task, events);
    const pfx = task.id.includes("-") ? task.id.split("-")[0] : "";
    const rest = pfx ? task.id.slice(pfx.length) : task.id;
    const accent = pfx ? colorForKey(pfx) : "var(--info)";
    const elapsed = elapsedSinceLatestEvent(events) ?? "—";
    const created = new Date(task.createdAt).toLocaleString();
    // Status pill — "running" / "paused" / "idle" / "done" — matches
    // canvas tone mapping (info for running, warning for paused).
    const stateTone = task.runState === "running" ? "info" :
        task.runState === "paused" ? "warning" :
            task.status === "done" ? "success" :
                task.status === "failed" ? "danger" :
                    "neutral";
    return (_jsxs("div", { className: "task-hero", style: { ["--task-accent"]: accent }, children: [_jsxs("div", { className: "lhs", children: [_jsxs("div", { className: "id-line", children: [_jsxs("div", { className: "id", children: [_jsx("span", { className: "pfx", children: pfx }), rest] }), _jsxs("span", { className: `pill ${stateTone}`, children: [task.runState === "running" && _jsx("span", { className: "dot" }), task.runState === "running" ? "running" :
                                        task.runState === "paused" ? "paused" :
                                            task.status === "done" ? "merged" :
                                                task.status === "failed" ? "failed" :
                                                    task.status === "waiting" ? "waiting" :
                                                        "idle"] }), !isDemo && task.kind === "campaign" && (_jsxs("span", { className: "pill neutral", children: [task.items.length, " items"] }))] }), _jsx("h1", { children: task.title }), _jsxs("div", { className: "meta-line", children: [_jsx("span", { children: task.project }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: created }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: [elapsed, " elapsed"] }), _jsx("span", { children: "\u00B7" }), _jsxs("span", { children: ["cycle ", task.cycle] })] }), phases.length > 0 && (_jsx(PlanProgress, { phases: phases, current: current }))] }), _jsxs("div", { className: "who-stack", children: [_jsx("div", { className: "avatar bot", title: "Agent", children: "\u03B1" }), _jsx("div", { className: "avatar", title: "You", children: "MT" })] })] }));
}
function PlanProgress({ phases, current, }) {
    return (_jsx("div", { className: "plan-progress", role: "tablist", "aria-label": "Plan steps", children: phases.map((p, i) => {
            const isCurrent = p.id === current;
            const cls = isCurrent ? "step active" :
                p.status === "done" ? "step done" :
                    p.status === "failed" ? "step done" :
                        "step";
            const node = p.status === "done" ? "✓" :
                p.status === "failed" ? "×" :
                    isCurrent ? String(i + 1) :
                        String(i + 1);
            return (_jsxs("div", { className: cls, role: "tab", title: p.label, children: [_jsx("div", { className: "node", children: node }), _jsx("div", { className: "label", children: p.label })] }, p.id));
        }) }));
}
function PlanRail({ task, events }) {
    const { phases, current } = derivePhases(task, events);
    if (phases.length === 0)
        return null;
    const doneCount = phases.filter((p) => p.status === "done").length;
    return (_jsxs("aside", { className: "plan-rail", "aria-label": "Plan steps", children: [_jsxs("h4", { children: ["Plan \u00B7 ", doneCount, "/", phases.length] }), phases.map((p, i) => {
                const isCurrent = p.id === current;
                const cls = isCurrent ? "rail-step active" :
                    p.status === "done" ? "rail-step done" :
                        p.status === "failed" ? "rail-step done" :
                            "rail-step";
                const numText = p.status === "done" ? "✓" :
                    p.status === "failed" ? "×" :
                        String(i + 1);
                const meta = p.enteredAt ? new Date(p.enteredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) :
                    isCurrent ? "running" :
                        p.status === "done" ? "" :
                            "queued";
                return (_jsxs("div", { className: cls, children: [_jsx("div", { className: "num", children: numText }), _jsxs("div", { children: [_jsx("div", { className: "text", children: p.label }), meta && _jsx("div", { className: "meta", children: meta })] })] }, p.id));
            })] }));
}
/**
 * Cost meter (canvas: NewUI/.../index.html lines 1650-1697).
 *
 * Renders a radial conic-gradient dial showing % of the task's token
 * budget consumed, plus a num/of secondary line. Budget defaults to
 * 500k tokens — matches the magnitude on the Dashboard's Tokens · 24h
 * KPI; promotable to a per-task setting later. Returns null when no
 * runs have produced any tokens (don't render an empty 0% dial).
 */
const COST_BUDGET_TOKENS = 500_000;
function CostMeter({ events }) {
    const runs = deriveRuns(events);
    if (runs.length === 0)
        return null;
    const totals = runs.reduce((a, r) => ({
        tokensIn: a.tokensIn + (r.tokensIn ?? 0),
        tokensOut: a.tokensOut + (r.tokensOut ?? 0),
        cost: a.cost + (r.costUSD ?? 0),
    }), { tokensIn: 0, tokensOut: 0, cost: 0 });
    const totalTokens = totals.tokensIn + totals.tokensOut;
    if (totalTokens === 0 && totals.cost === 0)
        return null;
    const pct = Math.min(100, Math.round((totalTokens / COST_BUDGET_TOKENS) * 100));
    const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
        n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` :
            String(n);
    return (_jsxs("div", { className: "side-block", children: [_jsx("h4", { children: "Cost" }), _jsxs("div", { className: "cost-meter", children: [_jsx("div", { className: "cost-dial", style: { ["--pct"]: pct }, children: _jsxs("span", { className: "pct", children: [pct, "%"] }) }), _jsxs("div", { className: "info", children: [_jsxs("div", { className: "num", children: [fmt(totalTokens), " tokens"] }), _jsxs("div", { className: "of", children: ["of ", fmt(COST_BUDGET_TOKENS), " budget \u00B7 $", totals.cost.toFixed(4)] })] })] })] }));
}
/**
 * Sticky approval footer (canvas: NewUI/.../index.html lines 1700-1722).
 *
 * Only renders when a `breakpoint_opened` event is pending — i.e. the
 * SDK has paused for human input. Approve resumes the run; Reject
 * stops it with a "rejected" reason. Hand off opens a placeholder
 * toast for now (real handoff routing is a follow-up slice).
 */
function ApprovalBar({ task, events }) {
    const pending = derivePendingBreakpoint(events);
    if (!pending)
        return null;
    const question = (pending.payload && typeof pending.payload["question"] === "string"
        ? pending.payload["question"]
        : null) ?? "Awaiting your decision";
    async function approve() {
        if (!window.mc?.resumeRun)
            return;
        try {
            await window.mc.resumeRun({ taskId: task.id });
            publish("tasks");
        }
        catch (err) {
            pushErrorToast("Approve failed", err, task.id);
        }
    }
    async function reject() {
        if (!window.mc?.stopRun)
            return;
        // "user" is the closest existing reason in the IPC contract; the
        // approval-bar's "Reject" semantically maps to a user-driven stop.
        try {
            await window.mc.stopRun({ taskId: task.id, reason: "user" });
            publish("tasks");
        }
        catch (err) {
            pushErrorToast("Reject failed", err, task.id);
        }
    }
    return (_jsxs("div", { className: "approval-bar", children: [_jsxs("div", { className: "label", children: [_jsx("b", { children: question }), pending.expert && (_jsxs("div", { className: "muted2", style: { fontSize: "var(--fs-xs)" }, children: ["expert: ", pending.expert, pending.tags.length > 0 && ` · ${pending.tags.join(", ")}`] }))] }), _jsxs("div", { className: "actions", children: [_jsx("button", { className: "btn ghost", onClick: () => void reject(), children: "Reject" }), _jsx("button", { className: "btn primary", onClick: () => void approve(), children: "Approve \u2192" })] })] }));
}
/**
 * Terminal-style tool-call panes (canvas: NewUI/.../index.html lines
 * 593-630). Renders one .tool-pane per pi:tool_execution_start/end pair
 * — the head shows tool name + start time + exit-code chip; the body
 * shows the toolInput preview as a single `$` cmd row. Newest pane
 * first so a fresh tool call surfaces at the top instead of getting
 * buried by an hour of history.
 *
 * Returns null when no tool calls exist — most tasks during their
 * draft phase don't have any, and an empty pane stack reads as a
 * broken card.
 */
function ToolCalls({ events }) {
    const calls = deriveToolCalls(events);
    if (calls.length === 0)
        return null;
    // Newest first; cap at 25 so a long-running task doesn't blow up the page.
    const visible = calls.slice(-25).reverse();
    return (_jsxs("section", { style: { display: "grid", gap: 10 }, children: [_jsxs("h4", { style: { margin: "4px 0 0" }, children: ["Tool calls \u00B7 ", calls.length] }), visible.map((c, i) => (_jsx(ToolPane, { call: c }, `${c.toolName}-${c.startedAt}-${i}`)))] }));
}
function ToolPane({ call }) {
    const when = new Date(call.startedAt).toLocaleTimeString();
    const exitClass = call.exitCode === null ? "" :
        call.exitCode === 0 ? "ok" :
            "fail";
    const exitText = call.exitCode === null ? "running" :
        `exit ${call.exitCode}`;
    return (_jsxs("div", { className: "tool-pane", children: [_jsxs("div", { className: "pane-head", children: [_jsx("span", { className: "tool", children: call.toolName }), _jsxs("span", { className: "when", children: ["\u00B7 ", when] }), call.durationMs !== null && (_jsxs("span", { className: "when", children: ["\u00B7 ", formatToolDuration(call.durationMs)] })), _jsx("span", { className: `exit ${exitClass}`, children: exitText })] }), _jsxs("div", { className: "pane-body", children: [_jsx("span", { className: "ln", children: "1" }), _jsxs("span", { className: "row cmd", children: ["$ ", previewCmd(call)] })] })] }));
}
function formatToolDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60_000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
}
/**
 * Build a CreateTaskForm preload from the source task + its
 * RUN_CONFIG.json. Used by the "↻ Re-run…" button to clone a task
 * into a new one with editable fields. The new task records its
 * lineage via parentTaskId.
 *
 * The shape of RUN_CONFIG (when present) follows what RunWorkflowModal
 * and ChangeWorkflowModal write:
 *   { kind: "library-workflow-run",
 *     libraryWorkflow: { logicalPath, ... } | null,
 *     runSettings: { model, inputs: {...} } }
 *
 * If runConfig is missing or shaped differently, we just preload the
 * basics (title/description/projectId/kind) and let the user pick a
 * workflow.
 */
function buildRerunPreload(task, runConfig) {
    const preload = {
        title: task.title,
        description: task.description,
        projectId: task.project,
        kind: task.kind,
        parentTaskId: task.id,
    };
    // For campaigns, copy item descriptions back into the textarea
    // format the form expects (one per line).
    if (task.kind === "campaign" && task.items.length > 0) {
        preload.itemsText = task.items.map((it) => it.description).join("\n");
    }
    // Curated workflow + inputs from RUN_CONFIG.
    if (runConfig) {
        const lw = runConfig["libraryWorkflow"];
        if (lw && typeof lw.logicalPath === "string") {
            preload.workflowLogicalPath = lw.logicalPath;
        }
        const rs = runConfig["runSettings"];
        if (rs && rs.inputs && typeof rs.inputs === "object") {
            preload.inputs = rs.inputs;
        }
    }
    return preload;
}
/**
 * Build a CreateTaskForm preload for the "↳ Spin off doctor" flow
 * (#37). Like buildRerunPreload but with a different intent: the new
 * task's job is to *diagnose* the source, not redo it. We seed a
 * starter prompt that points the doctor task at the source's
 * STATUS.md / events.jsonl, force kind=single (campaigns don't
 * doctor sensibly), and copy the workflow if any.
 *
 * Inputs from RUN_CONFIG are NOT carried — a doctor task is a fresh
 * investigation, not a parameter sweep. The user can fill or change
 * them in the form.
 */
function buildDoctorPreload(task, runConfig) {
    const lastPhase = task.runState !== "idle" ? `still ${task.runState}` : task.status;
    const starter = `Diagnose why ${task.id} is stuck (${lastPhase}). Read the source ` +
        `task's STATUS.md and events.jsonl to identify the failure mode, ` +
        `then propose a fix or a follow-up task. Do not modify the source ` +
        `task's files.\n\n` +
        `Source description:\n${task.description || "(no description)"}\n`;
    const preload = {
        title: `Doctor: ${task.title}`,
        description: starter,
        projectId: task.project,
        kind: "single",
        parentTaskId: task.id,
    };
    // Carry the workflow if the source had one curated. For auto-gen
    // sources, leave the doctor task on auto-gen too — same path.
    if (runConfig) {
        const lw = runConfig["libraryWorkflow"];
        if (lw && typeof lw.logicalPath === "string") {
            preload.workflowLogicalPath = lw.logicalPath;
        }
    }
    return preload;
}
/**
 * Run-metadata chips — surfaces SDK-authoritative facts about the
 * latest run: iteration count (#21) and completionProof token (#19).
 *
 * - Iteration count comes from the SDK state cache via
 *   `babysitter run:status --json` (parsed into `runStatus` IPC).
 *   We accept either `iterationCount` or `stateVersion` as the field
 *   name since the SDK shape isn't fully nailed down (and either
 *   gives us the same monotonically-increasing number).
 * - completionProof is the unforgeable "this run finished" token the
 *   SDK generates per run. When present, we render a "✓ verified
 *   done" chip — distinct from the journal's `bs:phase finished`
 *   signal because the proof can't be forged by hand-editing the
 *   journal.
 *
 * Both are best-effort: if the SDK CLI is unreachable or the run
 * hasn't started yet, we render nothing. The component re-fetches
 * when the events stream length changes (live-events bridge tick),
 * so values update as the run progresses.
 */
function RunMetadataChips({ task, events }) {
    const [iteration, setIteration] = useState(null);
    const [completionProof, setCompletionProof] = useState(null);
    useEffect(() => {
        if (!window.mc?.runStatus)
            return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await window.mc.runStatus(task.id);
                if (cancelled || !res || typeof res !== "object")
                    return;
                const obj = res;
                const iter = typeof obj["iterationCount"] === "number" ? obj["iterationCount"]
                    : typeof obj["stateVersion"] === "number" ? obj["stateVersion"]
                        : null;
                const proof = typeof obj["completionProof"] === "string"
                    ? obj["completionProof"]
                    : null;
                setIteration(iter);
                setCompletionProof(proof);
            }
            catch {
                // CLI unreachable / no run yet — leave both null and render nothing
            }
        })();
        return () => { cancelled = true; };
    }, [task.id, events.length]);
    if (iteration === null && !completionProof)
        return null;
    return (_jsxs("div", { className: "muted", style: {
            display: "flex",
            gap: 12,
            marginTop: -4,
            fontSize: 11,
            alignItems: "center",
        }, children: [iteration !== null && (_jsxs("span", { title: "SDK state cache reports this many iterations have completed", children: ["Iteration ", iteration] })), completionProof && (_jsx("span", { title: `completionProof: ${completionProof}`, style: {
                    color: "var(--good)",
                    fontWeight: 500,
                }, children: "\u2713 verified done" }))] }));
}
/**
 * Lineage panel — shows where this task came from and what it spawned.
 *
 *   - Parent: rendered when task.parentTaskId !== "". Click → openTask.
 *   - Children: any task whose parentTaskId equals THIS task's id.
 *     Cheap O(N) scan over the full task list (no inverse index;
 *     real-world counts are small enough).
 *
 * Returns null when neither side has anything — keeps Task Detail
 * uncluttered for tasks that are root + childless.
 *
 * Same `parentTaskId` infrastructure feeds re-run/clone (#5),
 * doctor / spin-off tasks (#37), and planning tasks that spawn
 * children (#40). When those land, they each populate parent/child
 * relationships that this panel surfaces.
 */
function SpawnedFromPanel({ task }) {
    const { tasks, isDemo: tasksDemo } = useTasks();
    const { openTask } = useRoute();
    // Don't try to render lineage from demo data — the IDs are
    // synthetic and won't link to anything meaningful.
    if (tasksDemo)
        return null;
    const parent = task.parentTaskId
        ? tasks.find((t) => t.id === task.parentTaskId)
        : null;
    const children = tasks.filter((t) => t.parentTaskId === task.id);
    if (!parent && children.length === 0)
        return null;
    return (_jsxs("section", { className: "card", style: { display: "grid", gap: 10 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Lineage" }), parent && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 }, children: [_jsx("span", { className: "muted", style: { minWidth: 100 }, children: "Spawned from" }), _jsxs("button", { className: "button ghost", onClick: () => openTask(parent.id), style: { fontSize: 12, padding: "3px 8px" }, title: parent.summary, children: ["\u2190 ", parent.id] }), _jsx("span", { className: "muted", style: { fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: parent.summary })] })), task.parentTaskId && !parent && (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 }, children: [_jsx("span", { className: "muted", style: { minWidth: 100 }, children: "Spawned from" }), _jsxs("span", { className: "muted", style: { fontSize: 12, fontStyle: "italic" }, children: [task.parentTaskId, " (deleted or not loaded)"] })] })), children.length > 0 && (_jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }, children: [_jsxs("span", { className: "muted", style: { minWidth: 100, paddingTop: 4 }, children: ["Spawns (", children.length, ")"] }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: children.map((c) => (_jsxs("button", { className: "button ghost", onClick: () => openTask(c.id), style: { fontSize: 12, padding: "3px 8px" }, title: c.summary, children: [c.id, " \u2192"] }, c.id))) })] }))] }));
}
/**
 * Loading shell shown while `useTask` is resolving a real task. Mirrors
 * the live page's structure (header + chip strip + cards row + meta) so
 * the layout doesn't shift when content swaps in. Pure presentation —
 * no data dependencies.
 */
function TaskDetailSkeleton() {
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "topbar", children: _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx(SkeletonLine, { width: "40%", height: "1.6em", marginBottom: 6 }), _jsx(SkeletonLine, { width: "20%", height: "0.85em" })] }) }), _jsxs("div", { className: "content", children: [_jsx(SkeletonBlock, { height: 48 }), _jsx(SkeletonBlock, { height: 56 }), _jsxs("section", { className: "card", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }, children: [_jsx(SkeletonRows, { rows: 6 }), _jsx(SkeletonRows, { rows: 6 })] }), _jsxs("section", { className: "card", style: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }, children: [_jsx(SkeletonRows, { rows: 4 }), _jsx(SkeletonRows, { rows: 4 })] })] })] }));
}
/**
 * Overflow / kebab menu — wraps less-frequent or destructive actions
 * so the Task Detail header stays readable. Click ⋯ to open; click
 * any item or anywhere else to close. Children render as menu items
 * via the `.task-actions-menu` rules in styles.css (auto-styled
 * full-width left-aligned rows).
 */
function TaskActionsMenu({ children }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        const onDocClick = (e) => {
            if (!wrapRef.current?.contains(e.target))
                setOpen(false);
        };
        const onEsc = (e) => {
            if (e.key === "Escape")
                setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onEsc);
        };
    }, [open]);
    return (_jsxs("div", { ref: wrapRef, style: { position: "relative" }, children: [_jsx("button", { className: "button ghost", onClick: () => setOpen((v) => !v), title: "More actions", "aria-label": "More actions", "aria-haspopup": "menu", "aria-expanded": open, children: "\u22EF" }), open && (_jsx("div", { className: "task-actions-menu", role: "menu", 
                // Click-anywhere-inside collapses the menu after the action
                // fires; the action itself runs first because button onClick
                // happens at the target before bubbling here.
                onClick: () => setOpen(false), children: children }))] }));
}
function BackToDashboard() {
    const { setView } = useRoute();
    return (_jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" }));
}
/**
 * Archive button — toggles `task.status` between "archived" and a sane
 * non-archived value. No confirm dialog: archive is fully reversible
 * (Unarchive button shows up when the task IS archived).
 *
 * Unarchive behavior: we don't try to remember what status the task
 * had before archiving. Instead we drop it back to "active" and let
 * the user / next run advance it from there. The previous status is
 * recoverable from the events.jsonl trail if it really matters.
 */
function ArchiveTaskButton({ task }) {
    const [busy, setBusy] = useState(false);
    const archived = task.status === "archived";
    async function onClick() {
        if (!window.mc)
            return;
        try {
            setBusy(true);
            const next = {
                ...task,
                status: archived ? "active" : "archived",
                updatedAt: new Date().toISOString(),
            };
            await window.mc.saveTask(next);
            publish("tasks");
        }
        catch (err) {
            console.error("[TaskDetail] saveTask (archive toggle) threw:", err);
            pushErrorToast(archived ? "Unarchive failed" : "Archive failed", err, task.id);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("button", { className: "button ghost", onClick: onClick, disabled: busy, title: archived ? "Restore this task to the active board" : "Archive this task — hides it from the default board", children: busy ? "…" : archived ? "↩ Unarchive" : "📦 Archive" }));
}
/**
 * Delete button with two-click confirm (mirrors the project delete pattern).
 * CONFIRMED: we don't keep a central log, so deleting a task is total —
 * manifest + events.jsonl + per-role notes all go. No undo.
 */
function DeleteTaskButton({ taskId }) {
    const { setView } = useRoute();
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    async function onClick() {
        if (!confirm) {
            setConfirm(true);
            return;
        }
        if (!window.mc)
            return;
        try {
            setBusy(true);
            await window.mc.deleteTask(taskId);
            publish("tasks");
            setView("dashboard");
        }
        catch (err) {
            console.error("[TaskDetail] deleteTask threw:", err);
            pushErrorToast("Delete failed", err, taskId);
            setConfirm(false);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsx("button", { className: confirm ? "button bad" : "button ghost", onClick: onClick, disabled: busy, style: {
            color: confirm ? undefined : "var(--bad)",
            borderColor: confirm ? undefined : "var(--bad)",
        }, children: busy ? "Deleting…" : confirm ? "Click again to confirm delete" : "Delete" }));
}
/**
 * Top row of action buttons. Only applicable buttons are rendered — no
 * disabled phantoms. State-driven:
 *
 *   idle     → Start              (+ Set active agent dropdown)
 *   running  → Pause · Stop
 *   paused   → Resume · Stop
 *
 * Click handlers call window.mc.startRun / pauseRun / resumeRun / stopRun
 * which route through RunManager → PiSessionManager. CONFIRMED wired:
 * Start opens a real pi session and prompts babysitter; Stop ends it.
 */
function Controls({ task }) {
    const { models: piModels, refresh: refreshPiModels } = usePiModels();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Empty string = use pi's default (no model override).
    const [modelId, setModelId] = useState("");
    // Resync local selection when navigating to a different task — useState's
    // initial value is only honored on first mount; without this, a re-used
    // Controls instance would keep the previous task's model selection.
    useEffect(() => {
        setModelId("");
        setError("");
    }, [task.id]);
    const canStart = task.runState === "idle";
    const canPause = task.runState === "running";
    const canResume = task.runState === "paused";
    const canStop = task.runState !== "idle";
    async function callRun(op) {
        if (!window.mc) {
            setError("Not connected — run `npm run dev`");
            return;
        }
        setError("");
        setBusy(true);
        try {
            switch (op) {
                case "start":
                    await window.mc.startRun({
                        taskId: task.id,
                        model: modelId || undefined,
                    });
                    break;
                case "pause":
                    await window.mc.pauseRun({ taskId: task.id });
                    break;
                case "resume":
                    await window.mc.resumeRun({ taskId: task.id });
                    break;
                case "stop":
                    await window.mc.stopRun({ taskId: task.id, reason: "user" });
                    break;
            }
            publish("tasks");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [canStart && (_jsxs(_Fragment, { children: [_jsx("button", { className: "button", title: "Start this task", onClick: () => void callRun("start"), disabled: busy, children: "Start" }), _jsx(ModelPicker, { value: modelId, onChange: setModelId, disabled: busy, models: piModels, onRefresh: refreshPiModels })] })), canPause && (_jsx("button", { className: "button warn", title: "Pause current agent's session", onClick: () => void callRun("pause"), disabled: busy, children: "Pause" })), canResume && (_jsx("button", { className: "button", title: "Resume paused session", onClick: () => void callRun("resume"), disabled: busy, children: "Resume" })), canStop && (_jsx("button", { className: "button bad", title: "Stop current session", onClick: () => void callRun("stop"), disabled: busy, children: "Stop" })), _jsxs("div", { style: { marginLeft: "auto" }, children: [_jsx("span", { className: `pill ${task.runState === "running" ? "warn" : task.runState === "paused" ? "info" : "good"}`, children: task.runState }), _jsxs("span", { className: "muted", style: { fontSize: 12, marginLeft: 8 }, children: ["Cycle ", task.cycle] })] })] }), error && (_jsx("div", { className: "card", style: {
                    color: "var(--bad)",
                    borderColor: "var(--bad)",
                    background: "rgba(232, 116, 116,0.08)",
                }, children: error }))] }));
}
/**
 * Inline editable "Blocker" field — free text for the reason a task is
 * waiting on something external (a build callback, a customer, a plannotator
 * review, etc). Decoupled from runState/lane so it works in every wait
 * scenario. Empty by default; saves on blur. The Needs Attention rail picks
 * this up to show "why" instead of just "paused" / "awaiting approval".
 */
function BlockerField({ task }) {
    const [value, setValue] = useState(task.blocker ?? "");
    const [busy, setBusy] = useState(false);
    // Keep local state aligned when the task changes (navigation, store push).
    useEffect(() => {
        setValue(task.blocker ?? "");
    }, [task.id, task.blocker]);
    async function commit() {
        const next = value.trim();
        if (next === (task.blocker ?? ""))
            return;
        if (!window.mc)
            return;
        try {
            setBusy(true);
            await window.mc.saveTask({ ...task, blocker: next });
            publish("tasks");
        }
        catch (err) {
            console.error("[TaskDetail] saveTask blocker failed:", err);
            pushErrorToast("Couldn't save blocker", err, task.id);
            // Roll back local state so the UI doesn't lie about persisted value.
            setValue(task.blocker ?? "");
        }
        finally {
            setBusy(false);
        }
    }
    function clear() {
        setValue("");
        if (!window.mc)
            return;
        void (async () => {
            try {
                setBusy(true);
                await window.mc.saveTask({ ...task, blocker: "" });
                publish("tasks");
            }
            finally {
                setBusy(false);
            }
        })();
    }
    const hasBlocker = (task.blocker ?? "").length > 0;
    return (_jsxs("section", { className: "card", style: {
            borderLeft: hasBlocker ? "3px solid var(--warn)" : undefined,
            paddingLeft: hasBlocker ? 12 : undefined,
            display: "flex",
            alignItems: "center",
            gap: 10,
        }, children: [_jsx("strong", { style: { fontSize: 13, color: hasBlocker ? "var(--warn)" : "var(--muted)", flex: "0 0 auto" }, children: "Waiting on:" }), _jsx("input", { type: "text", value: value, placeholder: "What's this waiting on? (optional \u2014 empty means not blocked)", onChange: (e) => setValue(e.target.value), onBlur: () => { void commit(); }, onKeyDown: (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        void commit();
                        e.target.blur();
                    }
                    if (e.key === "Escape") {
                        setValue(task.blocker ?? "");
                        e.target.blur();
                    }
                }, disabled: busy, style: {
                    flex: 1,
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    background: "var(--panel-2)",
                    color: "var(--text)",
                    borderRadius: 6,
                    fontSize: 13,
                } }), hasBlocker && (_jsx("button", { className: "button ghost", onClick: clear, disabled: busy, title: "Clear waiting reason", style: { flex: "0 0 auto" }, children: "Clear" }))] }));
}
function PendingEffectsPanel({ task, events }) {
    const derivedBreakpoint = derivePendingBreakpoint(events);
    // null = not yet fetched / CLI unreachable. Otherwise a (possibly
    // empty) array drives the panel.
    const [sdkRows, setSdkRows] = useState(null);
    const [cliUnreachable, setCliUnreachable] = useState(false);
    // Refetch on mount, when events change (live-events bridge ticks),
    // and when the task id flips. Cheap subprocess spawn; the bridge's
    // debounce keeps it bounded.
    useEffect(() => {
        if (!window.mc?.runListPending) {
            setSdkRows(null);
            setCliUnreachable(true);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const result = await window.mc.runListPending(task.id);
                if (cancelled)
                    return;
                const rows = (result?.tasks ?? []).filter((r) => !r.status || r.status === "requested");
                setSdkRows(rows);
                setCliUnreachable(false);
            }
            catch {
                if (!cancelled) {
                    setSdkRows(null);
                    setCliUnreachable(true);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [task.id, events.length]);
    // Offline fallback path — render derive helper's breakpoint only.
    if (cliUnreachable) {
        if (!derivedBreakpoint)
            return null;
        return (_jsxs("section", { className: "card", style: { display: "grid", gap: 10 }, children: [_jsx(BreakpointRow, { taskId: task.id, row: { effectId: derivedBreakpoint.effectId, kind: "breakpoint" }, derived: derivedBreakpoint }), _jsx("div", { className: "muted", style: { fontSize: 11 }, children: "\u26A0 SDK CLI unreachable \u2014 sleep / custom effects hidden." })] }));
    }
    // SDK list resolved (possibly empty). Empty → no panel at all.
    if (!sdkRows || sdkRows.length === 0)
        return null;
    // Sort: breakpoints first (need user action), others below in SDK order.
    const sorted = [...sdkRows].sort((a, b) => {
        const ap = a.kind === "breakpoint" ? 0 : 1;
        const bp = b.kind === "breakpoint" ? 0 : 1;
        return ap - bp;
    });
    const needsUserCount = sorted.filter((r) => r.kind === "breakpoint").length;
    const totalCount = sorted.length;
    return (_jsxs("section", { className: "card", style: { display: "grid", gap: 12 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsxs("strong", { children: ["Pending effects \u00B7 ", totalCount] }), totalCount > 1 && needsUserCount > 0 && (_jsxs("span", { className: "muted", style: { fontSize: 12 }, children: ["(", needsUserCount, " need", needsUserCount === 1 ? "s" : "", " you)"] }))] }), sorted.map((row, idx) => {
                // Visual separator between rows when there's more than one.
                const dividerStyle = idx === 0 ? {} : { borderTop: "1px solid var(--border)", paddingTop: 12 };
                if (row.kind === "breakpoint") {
                    // Match the derive helper to this row by effectId so we can
                    // render the rich payload. If derive has nothing, the row
                    // still works with SDK label only.
                    const derived = derivedBreakpoint && derivedBreakpoint.effectId === row.effectId
                        ? derivedBreakpoint
                        : null;
                    return (_jsx("div", { style: dividerStyle, children: _jsx(BreakpointRow, { taskId: task.id, row: row, derived: derived }) }, row.effectId));
                }
                if (row.kind === "sleep") {
                    return (_jsx("div", { style: dividerStyle, children: _jsx(SleepRow, { row: row }) }, row.effectId));
                }
                return (_jsx("div", { style: dividerStyle, children: _jsx(CustomEffectRow, { row: row }) }, row.effectId));
            })] }));
}
/**
 * Breakpoint row — preserves the v0 BreakpointApprovalCard UI byte-for-byte
 * (yellow tint, ⏸ icon, title/question, textarea, Approve / Request changes
 * buttons, effect-id footer). Now joins the derive helper's rich payload
 * with the SDK row by effectId. When derive has nothing for this row
 * (rare: SDK ahead of journal), falls back to the SDK label.
 *
 * runPath comes from the derive helper. If derive is missing (race
 * window), buttons disable and a hint explains why; the row still
 * renders for visibility.
 */
function BreakpointRow({ taskId, row, derived, }) {
    const [feedback, setFeedback] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const payload = derived?.payload ?? {};
    const question = typeof payload.question === "string" ? payload.question : null;
    const titleText = typeof payload.title === "string" ? payload.title : (row.label ?? null);
    const expert = derived?.expert ?? null;
    const tags = derived?.tags ?? [];
    const runPath = derived?.runPath ?? null;
    async function respond(approved) {
        if (!window.mc) {
            setError("Not connected — run `npm run dev`");
            return;
        }
        if (!runPath) {
            setError("Run path unknown — wait a moment, then retry");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await window.mc.respondBreakpoint({
                taskId,
                runPath,
                effectId: row.effectId,
                approved,
                ...(feedback.trim() ? (approved ? { response: feedback.trim() } : { feedback: feedback.trim() }) : {}),
            });
            publish("tasks");
            setFeedback("");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { style: {
            background: "rgba(232, 177, 76,0.08)",
            border: "1px solid var(--warn)",
            borderRadius: 8,
            padding: 12,
            display: "grid",
            gap: 10,
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("span", { style: { color: "var(--warn)", fontSize: 14 }, children: "\u23F8" }), _jsx("strong", { children: "Awaiting human approval" }), expert && expert !== "owner" && (_jsxs("span", { className: "muted", style: { fontSize: 12 }, children: ["\u00B7 expert: ", expert] })), tags.length > 0 && (_jsxs("span", { className: "muted", style: { fontSize: 12 }, children: ["\u00B7 ", tags.join(" · ")] }))] }), titleText && _jsx("div", { style: { fontWeight: 500 }, children: titleText }), question && (_jsx("div", { className: "muted", style: { whiteSpace: "pre-wrap", fontSize: 13 }, children: question })), _jsx("textarea", { rows: 2, value: feedback, placeholder: "Optional response or change request", onChange: (e) => setFeedback(e.target.value), disabled: busy, style: {
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    width: "100%",
                    resize: "vertical",
                } }), _jsxs("div", { style: { display: "flex", gap: 8 }, children: [_jsx("button", { className: "button", disabled: busy || !runPath, onClick: () => void respond(true), title: runPath ? "Approve and continue the run" : "Run path not yet known — wait a moment", children: "\u2713 Approve" }), _jsx("button", { className: "button warn", disabled: busy || !runPath, onClick: () => void respond(false), title: runPath ? "Reject; the workflow's retry/refine loop picks this up" : "Run path not yet known — wait a moment", children: "\u21BA Request changes" }), _jsxs("span", { className: "muted", style: { fontSize: 11, alignSelf: "center", marginLeft: 8 }, children: ["effect: ", _jsx("code", { children: row.effectId })] })] }), !runPath && (_jsx("div", { className: "muted", style: { fontSize: 11 }, children: "SDK reports this breakpoint pending but the journal hasn't surfaced its run path yet \u2014 it will catch up shortly." })), error && (_jsx("div", { style: { color: "var(--bad)", fontSize: 12 }, children: error }))] }));
}
/**
 * Sleep row — informational only in v1. The SDK index reports the
 * effect as pending; we render kind, optional label, and effect id.
 * No countdown until we know the SDK row carries `wakeAt` /
 * `durationMs` (open Q in SPEC §1b). When the workflow's sleep
 * resolves, the next runListPending tick removes the row.
 */
function SleepRow({ row }) {
    return (_jsxs("div", { style: {
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            display: "grid",
            gap: 6,
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("span", { style: { fontSize: 14 }, children: "\u23F3" }), _jsx("strong", { children: "Sleep" }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: "\u00B7 sleeping\u2026" })] }), row.label && _jsx("div", { style: { fontWeight: 500 }, children: row.label }), _jsxs("div", { className: "muted", style: { fontSize: 11 }, children: ["effect: ", _jsx("code", { children: row.effectId })] })] }));
}
/**
 * Custom-kind row — read-only forward-compat (v1.1 will expose actions
 * once the SDK row shape for arbitrary kinds is nailed down). For now
 * we surface the kind + label + effect id so users can at least see
 * the workflow is waiting on something.
 */
function CustomEffectRow({ row }) {
    return (_jsxs("div", { style: {
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            display: "grid",
            gap: 6,
        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [_jsx("span", { style: { fontSize: 14 }, children: "\u2609" }), _jsx("strong", { children: "Pending effect" }), _jsxs("span", { className: "muted", style: { fontSize: 12 }, children: ["\u00B7 ", row.kind] })] }), row.label && _jsx("div", { style: { fontWeight: 500 }, children: row.label }), _jsxs("div", { className: "muted", style: { fontSize: 11 }, children: ["effect: ", _jsx("code", { children: row.effectId })] })] }));
}
/**
 * Horizontal phase chip strip — sits at the top of Task Detail. Same data
 * source as LaneTimeline (`derivePhases`); different layout. Mockup spec
 * is `queued → plan → approval ● → build → verify` with the active chip
 * highlighted and a `cycle 1 · 12m` summary on the right side.
 */
/**
 * Active subagents panel — flat list of every effect_requested /
 * pi:subagent_spawn the journal has surfaced. Running rows float to
 * the top with a pulsing dot; completed/failed rows show duration.
 * Hidden when there are no subagent rows at all.
 */
function SubagentsPanel({ events }) {
    const rows = deriveSubagents(events);
    if (rows.length === 0)
        return null;
    // Split into two visual groups (#23 polish):
    //   - "Active" rail at top: status=running, shown as a horizontal
    //     wrap of richer chips so concurrent agents are scannable at a
    //     glance. AutoGen Studio's per-agent surface is the visual analog.
    //   - "Recent" list below: completed + failed, compact one-line rows.
    // The two groups share the same data source (deriveSubagents); only
    // their layout differs.
    const running = rows.filter((r) => r.status === "running");
    const finished = rows.filter((r) => r.status !== "running");
    const finishedShown = finished.slice(0, 25);
    const finishedHidden = finished.length - finishedShown.length;
    return (_jsxs("section", { className: "card", children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Subagents" }), _jsxs("span", { className: "muted", style: { fontSize: 12 }, children: [running.length > 0 ? `${running.length} active · ` : "", finished.length, " finished"] })] }), running.length > 0 && (_jsx("div", { style: {
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    padding: "8px 0 12px",
                    marginBottom: finished.length > 0 ? 8 : 0,
                    borderBottom: finished.length > 0 ? "1px solid var(--border)" : undefined,
                }, children: running.map((r) => (_jsx(ActiveSubagentChip, { entry: r }, r.id))) })), finished.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "muted", style: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }, children: "Recent" }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [finishedShown.map((r) => (_jsx(SubagentHistoryRow, { entry: r }, r.id))), finishedHidden > 0 && (_jsxs("div", { className: "muted", style: { fontSize: 11, padding: "4px 2px" }, children: ["\u2026", finishedHidden, " more in the journal"] }))] })] }))] }));
}
/**
 * Big chip for an active subagent — sits in the top rail. Pulsing
 * dot + label + subtitle + source + elapsed-since-start when known.
 * Visual emphasis (warn-tinted bg) so the user can spot what's
 * currently churning at a glance.
 */
function ActiveSubagentChip({ entry }) {
    return (_jsxs("div", { style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            border: "1px solid var(--warn)",
            borderRadius: 18,
            background: "rgba(232, 177, 76,0.08)",
            minHeight: 28,
        }, children: [_jsx("span", { style: {
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--warn)",
                    animation: "mc-pulse 1.4s ease-in-out infinite",
                    flex: "0 0 auto",
                }, "aria-label": "running" }), _jsx("strong", { style: { fontSize: 13 }, children: entry.label }), entry.subtitle && (_jsx("span", { className: "muted", style: { fontSize: 12 }, children: entry.subtitle })), _jsxs("span", { className: "muted", style: { fontSize: 11 }, children: [entry.source === "sdk" ? "SDK" : "pi", entry.durationMs !== null && ` · ${(entry.durationMs / 1000).toFixed(1)}s`] })] }));
}
/**
 * Compact one-line row for completed/failed subagents — sits in the
 * "Recent" list below the active rail. Tiny status dot (no animation),
 * label, subtitle, source, duration.
 */
function SubagentHistoryRow({ entry }) {
    const tone = entry.status === "failed" ? "var(--bad)" : "var(--good)";
    return (_jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 12,
        }, children: [_jsx("span", { style: {
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: tone,
                    flex: "0 0 auto",
                }, "aria-label": entry.status }), _jsx("span", { children: entry.label }), entry.subtitle && (_jsx("span", { className: "muted", style: { fontSize: 11 }, children: entry.subtitle })), _jsxs("span", { className: "muted", style: { fontSize: 11, marginLeft: "auto" }, children: [entry.source === "sdk" ? "SDK" : "pi", entry.durationMs !== null && ` · ${(entry.durationMs / 1000).toFixed(1)}s`, ` · ${entry.status}`] })] }));
}
function PhaseChipStrip({ task, events }) {
    const { phases, current: derivedCurrent, source } = derivePhases(task, events);
    // SDK-authoritative current marker (#20). The timeline shape stays
    // journal-derived (we want the full history); but the "active"
    // chip prefers what the SDK state cache reports via runs:status.
    // Fall back to derivePhases.current when the SDK CLI is unreachable.
    const [sdkCurrent, setSdkCurrent] = useState(null);
    useEffect(() => {
        if (!window.mc?.runStatus)
            return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await window.mc.runStatus(task.id);
                if (cancelled || !res || typeof res !== "object")
                    return;
                const obj = res;
                const cur = typeof obj["currentPhase"] === "string" ? obj["currentPhase"]
                    : typeof obj["phase"] === "string" ? obj["phase"]
                        : null;
                setSdkCurrent(cur);
            }
            catch {
                if (!cancelled)
                    setSdkCurrent(null);
            }
        })();
        return () => { cancelled = true; };
    }, [task.id, events.length]);
    if (phases.length === 0)
        return null;
    // Resolve which chip is "current": prefer the SDK answer when it
    // matches a phase id we know about; otherwise trust the derive
    // helper. Render annotation reflects which source we used so users
    // can spot drift if both disagree.
    const sdkMatches = sdkCurrent ? phases.some((p) => p.id === sdkCurrent) : false;
    const current = sdkMatches ? sdkCurrent : derivedCurrent;
    const currentSource = sdkMatches ? "sdk" : "journal";
    const colorFor = (status) => {
        if (status === "active")
            return { bg: "rgba(232, 177, 76,0.15)", fg: "var(--warn)" };
        if (status === "failed")
            return { bg: "rgba(232, 116, 116,0.12)", fg: "var(--bad)" };
        if (status === "done")
            return { bg: "rgba(74,222,128,0.10)", fg: "var(--good)" };
        return { bg: "var(--panel-2)", fg: "var(--muted)" };
    };
    const elapsed = elapsedSinceLatestEvent(events) ?? "";
    return (_jsxs("div", { className: "card", style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 14px",
            flexWrap: "wrap",
        }, children: [_jsx("span", { className: "muted", style: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04, marginRight: 4 }, children: "Phase" }), phases.map((p, idx) => {
                // SDK-authoritative override: when the SDK reports this chip
                // as the current phase, render it as "active" even if
                // derivePhases labeled it differently. The journal can lag
                // the state cache, so this catches the brief window where
                // they disagree.
                const isCurrent = p.id === current;
                const effectiveStatus = isCurrent ? "active" : p.status;
                const c = colorFor(effectiveStatus);
                return (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [_jsxs("span", { style: {
                                background: c.bg,
                                color: c.fg,
                                border: `1px solid ${effectiveStatus === "active" ? c.fg : "var(--border)"}`,
                                borderRadius: 5,
                                padding: "3px 9px",
                                fontSize: 12,
                                fontWeight: effectiveStatus === "active" ? 600 : 400,
                                whiteSpace: "nowrap",
                            }, title: effectiveStatus, children: [p.label, isCurrent && " ●", p.status === "failed" && " ✕"] }), idx < phases.length - 1 && (_jsx("span", { style: { color: "var(--muted)", fontSize: 11 }, children: "\u2192" }))] }, p.id));
            }), _jsx("span", { style: { flex: 1 } }), _jsxs("span", { className: "muted", style: { fontSize: 11, fontFamily: "monospace" }, title: currentSource === "sdk"
                    ? "Current phase reported by the SDK state cache"
                    : "Current phase derived from journal events (SDK CLI unreachable or no match)", children: ["cycle ", task.cycle, elapsed ? ` · ${elapsed}` : "", source !== "curated" ? ` · ${source}` : "", currentSource === "sdk" ? " · sdk" : ""] })] }));
}
function elapsedSinceLatestEvent(events) {
    const last = events[events.length - 1];
    if (!last)
        return null;
    const ts = last.timestamp;
    if (!ts)
        return null;
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 0 || !Number.isFinite(ms))
        return null;
    const s = Math.floor(ms / 1000);
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}
function LaneTimeline({ task, events }) {
    const { phases, source } = derivePhases(task, events);
    const colorFor = (status) => {
        if (status === "active")
            return "var(--warn)";
        if (status === "failed")
            return "var(--bad)";
        if (status === "done")
            return "var(--good)";
        return "var(--muted)";
    };
    return (_jsxs("div", { children: [_jsx("h3", { children: "Phase timeline" }), _jsxs("div", { className: "muted", style: { fontSize: 11, marginTop: 2 }, children: [source === "curated" && "From workflow journal", source === "lane" && "From lane transitions", source === "generic" && "Generic phases — no run data yet"] }), _jsxs("div", { style: {
                    display: "grid",
                    gap: 0,
                    position: "relative",
                    paddingLeft: 22,
                    marginTop: 12,
                }, children: [_jsx("div", { style: {
                            position: "absolute",
                            left: 7,
                            top: 4,
                            bottom: 4,
                            width: 2,
                            background: "var(--border)",
                        } }), phases.map((p) => {
                        const dotColor = colorFor(p.status);
                        return (_jsxs("div", { style: { position: "relative", padding: "6px 0 14px" }, children: [_jsx("div", { style: {
                                        position: "absolute",
                                        left: -22,
                                        top: 10,
                                        width: 12,
                                        height: 12,
                                        borderRadius: "50%",
                                        background: dotColor,
                                        border: `2px solid ${dotColor}`,
                                        boxShadow: p.status === "active" ? "0 0 0 4px rgba(232, 177, 76,0.2)" : undefined,
                                    } }), _jsxs("h4", { style: { margin: "0 0 2px", fontSize: 14 }, children: [p.label, p.status === "active" && " — current", p.status === "failed" && " — failed"] }), (p.enteredAt || p.leftAt) && (_jsxs("div", { className: "sub", children: [p.enteredAt && `Entered ${fmt(p.enteredAt)}`, p.leftAt && ` · left ${fmt(p.leftAt)}`] }))] }, p.id));
                    })] })] }));
}
/**
 * Compact cost + token pill for the topbar — running total across every
 * pi:turn_end seen for this task. Hidden until at least one run has been
 * recorded. A green pulse on the left means the most recent run-started
 * has no matching run-ended yet (i.e. an agent is currently spending).
 */
function CostTicker({ events }) {
    const runs = deriveRuns(events);
    if (runs.length === 0)
        return null;
    const totals = runs.reduce((a, r) => ({
        tokensIn: a.tokensIn + (r.tokensIn ?? 0),
        tokensOut: a.tokensOut + (r.tokensOut ?? 0),
        cost: a.cost + (r.costUSD ?? 0),
    }), { tokensIn: 0, tokensOut: 0, cost: 0 });
    const live = !runs[runs.length - 1].endedAt;
    const fmtTok = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
            : String(n);
    const tip = `${runs.length} run${runs.length === 1 ? "" : "s"} · ` +
        `${totals.tokensIn.toLocaleString()} in / ${totals.tokensOut.toLocaleString()} out` +
        (live ? " · running now" : "");
    return (_jsxs("span", { className: "pill info", title: tip, style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginRight: 0,
        }, children: [live && (_jsx("span", { "aria-label": "run live", style: {
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--good)",
                    animation: "mc-pulse 1.4s ease-in-out infinite",
                } })), totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "$0.0000", _jsxs("span", { style: { opacity: 0.65, fontWeight: 400 }, children: ["\u00B7 ", fmtTok(totals.tokensIn), " in / ", fmtTok(totals.tokensOut), " out"] })] }));
}
function TaskMeta({ task, events }) {
    const runs = deriveRuns(events);
    const totals = runs.reduce((acc, r) => ({
        tokensIn: acc.tokensIn + (r.tokensIn ?? 0),
        tokensOut: acc.tokensOut + (r.tokensOut ?? 0),
        cost: acc.cost + (r.costUSD ?? 0),
    }), { tokensIn: 0, tokensOut: 0, cost: 0 });
    return (_jsxs("div", { children: [_jsx("h3", { children: "Task meta" }), _jsxs("div", { style: { marginTop: 10 }, children: [_jsx(Row, { label: "Project", value: task.project }), _jsx(Row, { label: "Kind", value: task.kind }), _jsx(Row, { label: "Cycles so far", value: String(task.cycle) }), _jsx(Row, { label: "Tokens in / out", value: `${totals.tokensIn.toLocaleString()} / ${totals.tokensOut.toLocaleString()}` }), _jsx(Row, { label: "Cost (USD)", value: totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "—" }), _jsx(Row, { label: "Created", value: fmt(task.createdAt) }), _jsx(Row, { label: "Updated", value: fmt(task.updatedAt) }), _jsx(Row, { label: "Status", value: task.status })] })] }));
}
function Row({ label, value }) {
    return (_jsxs("div", { style: {
            padding: "10px 0",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
        }, children: [_jsx("span", { children: label }), _jsx("span", { className: "muted", children: value })] }));
}
/**
 * Campaign items table — shown only when task.kind === "campaign". Each
 * row is one unit of work. The runtime iterator (one session per item)
 * isn't wired yet; today this is display-only so users can plan + paste
 * items in, and so the schema is exercised.
 */
function CampaignItems({ task }) {
    const items = task.items;
    const counts = items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});
    const done = counts.done ?? 0;
    const failed = counts.failed ?? 0;
    const running = counts.running ?? 0;
    const pending = counts.pending ?? 0;
    const finishedPct = items.length === 0 ? 0 : Math.round(((done + failed) / items.length) * 100);
    return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Campaign items" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: items.length === 0
                    ? "No items yet. Paste items into the Create Task form or let the workflow's planning agent generate them."
                    : `${done} done · ${failed} failed · ${running} running · ${pending} pending — ${finishedPct}% finished` }), items.length > 0 && (_jsxs("div", { style: {
                    marginTop: 8,
                    height: 8,
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    overflow: "hidden",
                    display: "flex",
                }, title: `${done} done · ${failed} failed · ${running} running · ${pending} pending`, children: [_jsx("div", { style: { width: `${(done / items.length) * 100}%`, background: "var(--good)" } }), _jsx("div", { style: { width: `${(failed / items.length) * 100}%`, background: "var(--bad)" } }), _jsx("div", { style: {
                            width: `${(running / items.length) * 100}%`,
                            background: "var(--warn)",
                            animation: running > 0 ? "mc-pulse 2.1s ease-in-out infinite" : undefined,
                        } })] })), items.length > 0 && (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)", textAlign: "left" }, children: [_jsx("th", { style: cellHead, children: "ID" }), _jsx("th", { style: cellHead, children: "Description" }), _jsx("th", { style: cellHead, children: "Status" }), _jsx("th", { style: cellHead, children: "Notes" })] }) }), _jsx("tbody", { children: items.map((item) => (_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: cell, children: _jsx("strong", { children: item.id }) }), _jsx("td", { style: cell, children: item.description }), _jsx("td", { style: cell, children: _jsx("span", { className: `pill ${item.status === "done" ? "good" : item.status === "failed" ? "bad" : item.status === "running" ? "warn" : "info"}`, children: item.status }) }), _jsx("td", { style: cell, children: item.notes || "—" })] }, item.id))) })] }))] }));
}
function RunHistory({ events }) {
    const runs = deriveRuns(events);
    const [expanded, setExpanded] = useState({});
    return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Run history" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "One row per agent session. Model, tokens and cost come from pi's turn_end events." }), runs.length === 0 ? (_jsx("p", { className: "muted", style: { marginTop: 10 }, children: "No runs yet." })) : (_jsxs("table", { style: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)", textAlign: "left" }, children: [_jsx("th", { style: cellHead, children: "Started" }), _jsx("th", { style: cellHead, children: "Agent" }), _jsx("th", { style: cellHead, children: "Model" }), _jsx("th", { style: cellHead, children: "Babysitter run" }), _jsx("th", { style: cellHead, children: "Subagents" }), _jsx("th", { style: cellHead, children: "Duration" }), _jsx("th", { style: cellHead, children: "Tokens (in/out)" }), _jsx("th", { style: cellHead, children: "Cost" }), _jsx("th", { style: cellHead, children: "Exit" })] }) }), _jsx("tbody", { children: runs.map((r, idx) => (_jsxs(Fragment, { children: [_jsxs("tr", { style: { borderTop: "1px solid var(--border)" }, children: [_jsx("td", { style: cell, children: fmt(r.startedAt) }), _jsx("td", { style: cell, children: r.agentSlug ?? "—" }), _jsx("td", { style: cell, children: r.model ? `${r.provider ?? ""}${r.provider ? " · " : ""}${r.model}` : "—" }), _jsx("td", { style: cell, children: r.babysitterRunId && r.babysitterRunPath ? (_jsx("button", { className: "button ghost", style: { padding: "2px 8px", fontSize: 12 }, title: r.babysitterRunPath, onClick: () => { void window.mc?.openPath(r.babysitterRunPath); }, children: r.babysitterRunId })) : "—" }), _jsx("td", { style: cell, children: r.subagents.length > 0 ? (_jsxs("button", { className: "button ghost", style: { padding: "2px 8px", fontSize: 12 }, onClick: () => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] })), children: [expanded[idx] ? "▾" : "▸", " ", r.subagents.length, " subagent", r.subagents.length === 1 ? "" : "s"] })) : "—" }), _jsx("td", { style: cell, children: r.endedAt ? dur(r.startedAt, r.endedAt) : "running" }), _jsx("td", { style: cell, children: r.tokensIn !== undefined
                                                ? `${r.tokensIn.toLocaleString()} / ${(r.tokensOut ?? 0).toLocaleString()}`
                                                : "—" }), _jsx("td", { style: cell, children: r.costUSD ? `$${r.costUSD.toFixed(4)}` : "—" }), _jsx("td", { style: cell, children: _jsx("span", { className: `pill ${pillForReason(r.reason)}`, children: r.reason ?? "ongoing" }) })] }), expanded[idx] && r.subagents.length > 0 && (_jsx("tr", { style: { borderTop: "1px solid var(--border)" }, children: _jsx("td", { style: { ...cell, paddingTop: 8, paddingBottom: 12 }, colSpan: 9, children: _jsx("div", { style: { display: "grid", gap: 8 }, children: r.subagents.map((sub) => (_jsx(SubagentRow, { sub: sub }, sub.spawnId))) }) }) }))] }, `run-${idx}`))) })] }))] }));
}
function SubagentRow({ sub }) {
    const label = sub.agentName ?? sub.agentSlug ?? sub.spawnId;
    return (_jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--panel-2)",
        }, children: [_jsx("span", { style: { fontSize: 12 }, children: "\u2934" }), _jsx("strong", { children: label }), _jsx("span", { className: "muted", style: { fontSize: 12 }, children: sub.reason ?? sub.spawnId }), _jsx("span", { className: "muted", style: { fontSize: 12, marginLeft: "auto" }, children: sub.endedAt
                    ? `${sub.exitReason ?? "completed"} · ${sub.durationMs !== undefined ? `${(sub.durationMs / 1000).toFixed(1)}s` : dur(sub.startedAt, sub.endedAt)}`
                    : "running" })] }));
}
/**
 * Native <select> model picker, grouped by provider. Empty value = let
 * pi pick its default (auth + settings). Value sent up is in
 * "provider:id" form so PiSessionManager's resolver finds it cleanly.
 *
 * The list is restricted to models pi has auth for — same set
 * `pi /model` shows. The ↻ button refetches without restarting MC,
 * for the case where the user just ran `pi /login` in another shell.
 */
function ModelPicker({ value, onChange, disabled, models, onRefresh, }) {
    const grouped = new Map();
    for (const m of models) {
        const bucket = grouped.get(m.provider) ?? [];
        bucket.push(m);
        grouped.set(m.provider, bucket);
    }
    // Providers sorted alpha; within each, models alpha by name.
    const providers = [...grouped.keys()].sort();
    for (const p of providers)
        grouped.get(p).sort((a, b) => a.name.localeCompare(b.name));
    return (_jsxs("div", { style: { display: "flex", gap: 6, alignItems: "center" }, children: [_jsx("span", { className: "muted", style: { fontSize: 12 }, children: "Model" }), _jsxs("select", { value: value, onChange: (e) => onChange(e.target.value), disabled: disabled, style: {
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    minWidth: 220,
                }, title: providers.length === 0
                    ? "No authed providers. Run `pi /login` (or set OPENAI_API_KEY / ANTHROPIC_API_KEY) and click ↻."
                    : "Model pi will use for this run. Empty = pi's default. Limited to providers pi has auth for.", children: [_jsx("option", { value: "", children: providers.length === 0 ? "(no authed providers — pi default)" : "(pi default)" }), providers.map((p) => (_jsx("optgroup", { label: p, children: grouped.get(p).map((m) => (_jsxs("option", { value: `${m.provider}:${m.id}`, children: [m.name, " \u00B7 $", m.costInputPerMTok.toFixed(2), "/$", m.costOutputPerMTok.toFixed(2), "/MTok"] }, `${m.provider}:${m.id}`))) }, p)))] }), onRefresh && (_jsx("button", { className: "button ghost", onClick: () => { void onRefresh(); }, disabled: disabled, title: "Reload models from pi (use after `pi /login` or env-var changes)", style: { padding: "4px 10px", lineHeight: 1 }, children: "\u21BB" }))] }));
}
/**
 * Mission card — renders the task's PROMPT.md. Not parsed as markdown
 * today (keeping the dep footprint minimal); shown as preformatted text
 * in a scrollable container. Empty/missing state is explicit so the
 * user knows whether the file has been created yet.
 */
function Mission({ prompt }) {
    return (_jsxs("div", { children: [_jsx("h3", { children: "Mission" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "PROMPT.md \u2014 regenerated on each Start. Edit the task's title or description to change it." }), prompt === null ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "10px 2px" }, children: "No PROMPT.md yet. Click Start once to generate it." })) : (_jsx("pre", { style: {
                    margin: "10px 0 0",
                    padding: 10,
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    maxHeight: 280,
                    overflow: "auto",
                }, children: prompt }))] }));
}
/**
 * Status log card — renders STATUS.md tail. Append-only progress log
 * updated by agents during their sessions (and seeded with a "task
 * created" line at createTask time).
 */
function StatusLog({ status }) {
    // Show most recent entries first by tailing lines. STATUS.md tends to
    // grow linearly; we render the last ~40 lines so it stays readable.
    const lines = (status ?? "").split("\n").filter((l) => l.length > 0);
    const tail = lines.slice(-40);
    return (_jsxs("div", { children: [_jsx("h3", { children: "Status log" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "STATUS.md \u2014 append-only. Agents add one line per meaningful step." }), status === null ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "10px 2px" }, children: "No STATUS.md yet." })) : (_jsx("pre", { style: {
                    margin: "10px 0 0",
                    padding: 10,
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    maxHeight: 280,
                    overflow: "auto",
                }, children: tail.join("\n") }))] }));
}
function pillForReason(reason) {
    if (reason === "completed")
        return "good";
    if (reason === "failed")
        return "bad";
    if (reason === "user")
        return "info";
    return "warn";
}
function LinkedFiles({ task }) {
    const [files, setFiles] = useState([]);
    // Refetch the task folder listing on mount + every "tasks" topic publish
    // (which fires on every event-appended / task-saved). Cheap stat-only call.
    useSubscribe("tasks", () => { void load(); });
    async function load() {
        if (!window.mc)
            return;
        try {
            setFiles(await window.mc.listTaskFiles(task.id));
        }
        catch { /* ignore */ }
    }
    useEffect(() => { void load(); }, [task.id]);
    const noteFor = (name) => {
        const stem = name.replace(/\.md$/, "");
        if (stem === task.id)
            return "task brief / manifest area";
        if (stem === "PROMPT")
            return "mission brief";
        if (stem === "STATUS")
            return "progress log";
        if (name.endsWith(".jsonl"))
            return "event journal";
        if (name.endsWith(".json"))
            return "manifest";
        return "(other)";
    };
    return (_jsxs("div", { children: [_jsx("h3", { children: "Task-linked files" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Live listing of the task folder." }), _jsxs("div", { style: { marginTop: 10 }, children: [files.map((f) => (_jsxs("div", { style: {
                            padding: "10px 0",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 12,
                        }, children: [_jsx("strong", { style: { fontFamily: "monospace", fontSize: 13 }, children: f.name }), _jsxs("span", { className: "muted", style: { fontSize: 12, textAlign: "right" }, children: [noteFor(f.name), " \u00B7 ", fmtSize(f.size)] })] }, f.name))), files.length === 0 && (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "10px 2px" }, children: "No files yet." }))] })] }));
}
function fmtSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function RunConfigCard({ runConfig }) {
    return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Run config" }), _jsx("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: "Persisted pre-run settings from the workflow runner (`RUN_CONFIG.json`)." }), !runConfig ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "10px 2px" }, children: "No run config recorded for this task yet." })) : (_jsx("pre", { style: {
                    margin: "10px 0 0",
                    padding: 10,
                    background: "var(--panel-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    maxHeight: 320,
                    overflow: "auto",
                }, children: JSON.stringify(runConfig, null, 2) }))] }));
}
function RunStatusCard({ task, events, runConfig, }) {
    const summary = summarizeRunStatus(task, events);
    const cfg = pickRunConfigHighlights(runConfig);
    return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Run status" }), _jsxs("div", { style: { marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }, children: [_jsx(StatusPill, { label: "Run state", value: task.runState, tone: task.runState === "running" ? "warn" : task.runState === "paused" ? "info" : "good" }), _jsx(StatusPill, { label: "Cycle", value: String(task.cycle), tone: "info" }), _jsx(StatusPill, { label: "Kind", value: task.kind, tone: "info" })] }), _jsxs("div", { style: { marginTop: 10, display: "grid", gap: 6, fontSize: 13 }, children: [_jsxs("div", { children: [_jsx("strong", { children: "Current step:" }), " ", summary.currentStep] }), _jsxs("div", { children: [_jsx("strong", { children: "Step progress:" }), " ", summary.completed, "/", summary.expected, " completed \u00B7 ", summary.failed, " failed"] }), _jsxs("div", { children: [_jsx("strong", { children: "Last transition:" }), " ", summary.lastTransition] })] }), (cfg.workflowPath || cfg.model || cfg.inputsCount !== null) && (_jsxs("div", { style: { marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "grid", gap: 6, fontSize: 12 }, children: [_jsx("div", { className: "muted", children: "Run config highlights" }), cfg.workflowPath && _jsxs("div", { children: [_jsx("strong", { children: "Workflow path:" }), " ", _jsx("code", { children: cfg.workflowPath })] }), cfg.model && _jsxs("div", { children: [_jsx("strong", { children: "Model override:" }), " ", _jsx("code", { children: cfg.model })] }), cfg.inputsCount !== null && _jsxs("div", { children: [_jsx("strong", { children: "Input fields:" }), " ", cfg.inputsCount] })] })), summary.recentEvents.length > 0 && (_jsxs("div", { style: { marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }, children: [_jsx("div", { className: "muted", style: { fontSize: 12, marginBottom: 6 }, children: "Recent run events" }), _jsx("div", { style: { display: "grid", gap: 4 }, children: summary.recentEvents.map((line) => (_jsx("div", { style: { fontSize: 12 }, children: line }, line))) })] }))] }));
}
function RunMetricsCard({ metrics, fileName, }) {
    const val = (k) => {
        const v = metrics?.[k];
        if (typeof v === "number")
            return Number.isInteger(v) ? String(v) : v.toFixed(4);
        if (typeof v === "string")
            return v;
        return "—";
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h3", { children: "Run metrics artifact" }), _jsxs("p", { className: "muted", style: { marginTop: 4, fontSize: 12 }, children: ["Latest persisted metrics snapshot from ", _jsx("code", { children: "artifacts/*.metrics.json" }), "."] }), !metrics ? (_jsx("div", { className: "muted", style: { fontSize: 12, padding: "10px 2px" }, children: "No metrics artifact yet." })) : (_jsxs("div", { style: { marginTop: 10, display: "grid", gap: 6, fontSize: 13 }, children: [_jsxs("div", { children: [_jsx("strong", { children: "File:" }), " ", _jsx("code", { children: fileName ?? "(unknown)" })] }), _jsxs("div", { children: [_jsx("strong", { children: "Step:" }), " ", val("step"), " \u00B7 ", _jsx("strong", { children: "Cycle:" }), " ", val("cycle")] }), _jsxs("div", { children: [_jsx("strong", { children: "Model:" }), " ", val("provider"), " ", val("model")] }), _jsxs("div", { children: [_jsx("strong", { children: "Tokens:" }), " ", val("tokensIn"), " in / ", val("tokensOut"), " out"] }), _jsxs("div", { children: [_jsx("strong", { children: "Cost:" }), " $", val("costUSD"), " \u00B7 ", _jsx("strong", { children: "Wall time:" }), " ", val("wallTimeSeconds"), "s"] }), _jsxs("div", { children: [_jsx("strong", { children: "Reason:" }), " ", val("reason")] })] }))] }));
}
function StatusPill({ label, value, tone, }) {
    return (_jsxs("div", { style: { background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }, children: [_jsx("div", { className: "muted", style: { fontSize: 11, marginBottom: 4 }, children: label }), _jsx("span", { className: `pill ${tone}`, style: { marginRight: 0 }, children: value })] }));
}
function summarizeRunStatus(task, events) {
    let currentStep = "(none)";
    let expected = 0;
    let completed = 0;
    let failed = 0;
    let lastTransition = "—";
    const recent = [];
    for (const event of events) {
        const e = event;
        const type = String(e["type"] ?? "");
        if (type === "step:start") {
            currentStep = String(e["stepId"] ?? currentStep);
            expected = Number(e["expected"] ?? expected) || expected;
            completed = 0;
            failed = 0;
            lastTransition = `${type} (${currentStep})`;
        }
        else if (type === "step:agent-end") {
            completed = Number(e["completed"] ?? completed) || completed;
            failed = Number(e["failed"] ?? failed) || failed;
            expected = Number(e["expected"] ?? expected) || expected;
            lastTransition = `${type} (${String(e["agent"] ?? "?")})`;
        }
        else if (type === "step:end" || type === "run-started" || type === "run-ended" || type === "run-paused" || type === "run-resumed") {
            if (type === "step:end") {
                completed = Number(e["completed"] ?? completed) || completed;
                failed = Number(e["failed"] ?? failed) || failed;
                expected = Number(e["expected"] ?? expected) || expected;
            }
            const suffix = typeof e["reason"] === "string" ? ` (${e["reason"]})` : "";
            lastTransition = `${type}${suffix}`;
        }
        if (type.startsWith("run-") || type.startsWith("step:")) {
            recent.push(`${fmt(String(e["timestamp"] ?? ""))} · ${type}`);
        }
    }
    return {
        currentStep,
        expected,
        completed,
        failed,
        lastTransition,
        recentEvents: recent.slice(-5).reverse(),
    };
}
function pickRunConfigHighlights(runConfig) {
    if (!runConfig)
        return { workflowPath: null, model: null, inputsCount: null };
    const workflow = runConfig["libraryWorkflow"];
    const settings = runConfig["runSettings"];
    const inputs = (settings?.["inputs"] ?? null);
    return {
        workflowPath: typeof workflow?.["logicalPath"] === "string" ? String(workflow["logicalPath"]) : null,
        model: typeof settings?.["model"] === "string" ? String(settings["model"]) : null,
        inputsCount: inputs ? Object.keys(inputs).length : null,
    };
}
// ── helpers ────────────────────────────────────────────────────────────
const cellHead = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell = { padding: "8px 10px" };
function fmt(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    catch {
        return iso;
    }
}
function dur(start, end) {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60_000);
    if (mins < 60)
        return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
