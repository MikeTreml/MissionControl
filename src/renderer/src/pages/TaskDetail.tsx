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
import { useEffect, useState } from "react";

import { useRoute } from "../router";
import { useTask } from "../hooks/useTask";
import { useAgents } from "../hooks/useAgents";
import { usePiModels } from "../hooks/usePiModels";
import { useWorkflows } from "../hooks/useWorkflows";
import { publish, useSubscribe } from "../hooks/data-bus";
import { deriveRuns, type DerivedRun } from "../lib/derive-runs";
import { PageStub } from "./PageStub";
import { effectiveLanes } from "../../../shared/models";
import type { Lane, LaneHistoryEntry, Task, TaskEvent } from "../../../shared/models";
import type { PiModelInfo } from "../global";

const LANE_LABEL: Record<Lane, string> = {
  plan: "Plan", develop: "Develop", review: "Review",
  surgery: "Surgery", approval: "Approval", done: "Done",
};

export function TaskDetail(): JSX.Element {
  const { selectedTaskId } = useRoute();
  const { task, events, prompt, status, isDemo } = useTask(selectedTaskId);

  if (!task) {
    return (
      <PageStub
        title="Task not selected"
        purpose="Pick a task from the board to see its detail."
      />
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>
            {task.id} — {task.title}
          </h1>
          <p className="muted">
            {task.kind} · workflow {task.workflow} · project {task.project}
            {isDemo && " · demo"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CostTicker events={events} />
          {!isDemo && (
            <button
              className="button ghost"
              title="Open the task's folder in your OS file explorer"
              onClick={() => { void window.mc?.openTaskFolder(task.id); }}
            >
              📁 Open folder
            </button>
          )}
          {!isDemo && <DeleteTaskButton taskId={task.id} />}
          <BackToDashboard />
        </div>
      </div>

      <div className="content">
        <Controls task={task} />

        {!isDemo && <BlockerField task={task} />}

        {task.lane === "approval" && !isDemo && <ApprovalGate task={task} />}

        <section
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
        >
          <Mission prompt={prompt} />
          <StatusLog status={status} />
        </section>

        <section className="card" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
          <LaneTimeline task={task} />
          <TaskMeta task={task} events={events} />
        </section>

        {task.kind === "campaign" && <CampaignItems task={task} />}

        <RunHistory events={events} />

        <section
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
        >
          <LinkedFiles task={task} />
          <PerAgentNotes task={task} />
        </section>
      </div>
    </>
  );
}

function BackToDashboard(): JSX.Element {
  const { setView } = useRoute();
  return (
    <button className="button ghost" onClick={() => setView("dashboard")}>
      ← Dashboard
    </button>
  );
}

/**
 * Delete button with two-click confirm (mirrors the project delete pattern).
 * CONFIRMED: we don't keep a central log, so deleting a task is total —
 * manifest + events.jsonl + per-role notes all go. No undo.
 */
function DeleteTaskButton({ taskId }: { taskId: string }): JSX.Element {
  const { setView } = useRoute();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onClick(): Promise<void> {
    if (!confirm) { setConfirm(true); return; }
    if (!window.mc) return;
    try {
      setBusy(true);
      await window.mc.deleteTask(taskId);
      publish("tasks");
      setView("dashboard");
    } catch (err) {
      console.error("[TaskDetail] deleteTask threw:", err);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={confirm ? "button bad" : "button ghost"}
      onClick={onClick}
      disabled={busy}
      style={{
        color: confirm ? undefined : "var(--bad)",
        borderColor: confirm ? undefined : "var(--bad)",
      }}
    >
      {busy ? "Deleting…" : confirm ? "Click again to confirm delete" : "Delete"}
    </button>
  );
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
 * which route through RunManager. Today that only flips Task.runState and
 * appends events; when pi lands the same methods drive a real session.
 * See src/main/run-manager.ts for the PI-WIRE seam.
 */
function Controls({ task }: { task: Task }): JSX.Element {
  const { agents } = useAgents();
  const primaries = agents.filter((a) => a.code.length === 1);
  const { models: piModels, refresh: refreshPiModels } = usePiModels();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [agentSlug, setAgentSlug] = useState(task.currentAgentSlug ?? "");
  // Empty string = use pi's default (no model override).
  const [modelId, setModelId] = useState<string>("");

  // Resync local selection when navigating to a different task — useState's
  // initial value is only honored on first mount; without this, a re-used
  // Controls instance would keep the previous task's agent/model.
  useEffect(() => {
    setAgentSlug(task.currentAgentSlug ?? "");
    setModelId("");
    setError("");
  }, [task.id]);

  const canStart   = task.runState === "idle";
  const canPause   = task.runState === "running";
  const canResume  = task.runState === "paused";
  const canStop    = task.runState !== "idle";

  // Active agent label — resolved from the agents list, not hardcoded.
  const activeAgent = task.currentAgentSlug
    ? agents.find((a) => a.slug === task.currentAgentSlug)
    : null;
  const activeLabel = activeAgent ? activeAgent.name : "(none)";

  async function callRun(
    op: "start" | "pause" | "resume" | "stop",
  ): Promise<void> {
    if (!window.mc) { setError("Not connected — run `npm run dev`"); return; }
    setError("");
    setBusy(true);
    try {
      switch (op) {
        case "start":
          await window.mc.startRun({
            taskId: task.id,
            agentSlug: agentSlug || undefined,
            model: modelId || undefined,
          });
          break;
        case "pause":  await window.mc.pauseRun({ taskId: task.id }); break;
        case "resume": await window.mc.resumeRun({ taskId: task.id }); break;
        case "stop":   await window.mc.stopRun({ taskId: task.id, reason: "user" }); break;
      }
      publish("tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {canStart && (
          <>
            <button
              className="button"
              title="Start this task's current agent"
              onClick={() => void callRun("start")}
              disabled={busy}
            >
              Start
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12 }}>Set active agent</span>
              <select
                value={agentSlug}
                onChange={(e) => setAgentSlug(e.target.value)}
                disabled={busy}
                style={{
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "6px 10px",
                }}
              >
                {primaries.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
                {primaries.length === 0 && <option value="">(no agents loaded)</option>}
              </select>
            </div>
            <ModelPicker
              value={modelId}
              onChange={setModelId}
              disabled={busy}
              models={piModels}
              onRefresh={refreshPiModels}
            />
          </>
        )}

        {canPause && (
          <button
            className="button warn"
            title="Pause current agent's session"
            onClick={() => void callRun("pause")}
            disabled={busy}
          >
            Pause
          </button>
        )}

        {canResume && (
          <button
            className="button"
            title="Resume paused session"
            onClick={() => void callRun("resume")}
            disabled={busy}
          >
            Resume
          </button>
        )}

        {canStop && (
          <button
            className="button bad"
            title="Stop current session"
            onClick={() => void callRun("stop")}
            disabled={busy}
          >
            Stop
          </button>
        )}

        <div style={{ marginLeft: "auto" }}>
          <span className={`pill ${task.runState === "running" ? "warn" : task.runState === "paused" ? "info" : "good"}`}>
            {task.runState}
          </span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            Cycle {task.cycle} · {activeLabel}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            color: "var(--bad)",
            borderColor: "var(--bad)",
            background: "rgba(255,123,123,0.08)",
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

/**
 * Inline editable "Blocker" field — free text for the reason a task is
 * waiting on something external (a build callback, a customer, a plannotator
 * review, etc). Decoupled from runState/lane so it works in every wait
 * scenario. Empty by default; saves on blur. The Needs Attention rail picks
 * this up to show "why" instead of just "paused" / "awaiting approval".
 */
function BlockerField({ task }: { task: Task }): JSX.Element {
  const [value, setValue] = useState(task.blocker ?? "");
  const [busy, setBusy] = useState(false);

  // Keep local state aligned when the task changes (navigation, store push).
  useEffect(() => {
    setValue(task.blocker ?? "");
  }, [task.id, task.blocker]);

  async function commit(): Promise<void> {
    const next = value.trim();
    if (next === (task.blocker ?? "")) return;
    if (!window.mc) return;
    try {
      setBusy(true);
      await window.mc.saveTask({ ...task, blocker: next });
      publish("tasks");
    } catch (err) {
      console.error("[TaskDetail] saveTask blocker failed:", err);
      // Roll back local state so the UI doesn't lie about persisted value.
      setValue(task.blocker ?? "");
    } finally {
      setBusy(false);
    }
  }

  function clear(): void {
    setValue("");
    if (!window.mc) return;
    void (async () => {
      try {
        setBusy(true);
        await window.mc.saveTask({ ...task, blocker: "" });
        publish("tasks");
      } finally {
        setBusy(false);
      }
    })();
  }

  const hasBlocker = (task.blocker ?? "").length > 0;
  return (
    <section
      className="card"
      style={{
        borderLeft: hasBlocker ? "3px solid var(--warn)" : undefined,
        paddingLeft: hasBlocker ? 12 : undefined,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <strong style={{ fontSize: 13, color: hasBlocker ? "var(--warn)" : "var(--muted)", flex: "0 0 auto" }}>
        Blocker:
      </strong>
      <input
        type="text"
        value={value}
        placeholder="What's this waiting on? (optional — empty means not blocked)"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { void commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter")  { e.preventDefault(); void commit(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setValue(task.blocker ?? ""); (e.target as HTMLInputElement).blur(); }
        }}
        disabled={busy}
        style={{
          flex: 1,
          padding: "6px 10px",
          border: "1px solid var(--border)",
          background: "var(--panel-2)",
          color: "var(--text)",
          borderRadius: 6,
          fontSize: 13,
        }}
      />
      {hasBlocker && (
        <button
          className="button ghost"
          onClick={clear}
          disabled={busy}
          title="Clear blocker"
          style={{ flex: "0 0 auto" }}
        >
          Clear
        </button>
      )}
    </section>
  );
}

/** Vertical timeline of lane transitions, oldest at the top. */
function LaneTimeline({ task }: { task: Task }): JSX.Element {
  const entries: LaneHistoryEntry[] = task.laneHistory.length > 0
    ? task.laneHistory
    : [{ lane: task.lane, enteredAt: task.createdAt }];

  return (
    <div>
      <h3>Lane timeline</h3>
      <div
        style={{
          display: "grid",
          gap: 0,
          position: "relative",
          paddingLeft: 22,
          marginTop: 12,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 4,
            bottom: 4,
            width: 2,
            background: "var(--border)",
          }}
        />
        {entries.map((e, idx) => {
          const isCurrent = !e.leftAt;
          return (
            <div
              key={`${e.lane}-${e.enteredAt}`}
              style={{ position: "relative", padding: "6px 0 14px" }}
            >
              <div
                style={{
                  position: "absolute",
                  left: -22,
                  top: 10,
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: isCurrent ? "var(--warn)" : "var(--good)",
                  border: `2px solid ${isCurrent ? "var(--warn)" : "var(--good)"}`,
                  boxShadow: isCurrent ? "0 0 0 4px rgba(244,201,93,0.2)" : undefined,
                }}
              />
              <h4 style={{ margin: "0 0 2px", fontSize: 14 }}>
                {LANE_LABEL[e.lane]}
                {isCurrent && " — current"}
              </h4>
              <div className="sub">
                Entered {fmt(e.enteredAt)}
                {e.leftAt && ` · left ${fmt(e.leftAt)}`}
              </div>
            </div>
          );
        })}
        {entries.length === 1 && entries[0]!.leftAt === undefined && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            No history yet — task hasn't moved between lanes.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact cost + token pill for the topbar — running total across every
 * pi:turn_end seen for this task. Hidden until at least one run has been
 * recorded. A green pulse on the left means the most recent run-started
 * has no matching run-ended yet (i.e. an agent is currently spending).
 */
function CostTicker({ events }: { events: TaskEvent[] }): JSX.Element | null {
  const runs = deriveRuns(events);
  if (runs.length === 0) return null;
  const totals = runs.reduce(
    (a, r) => ({
      tokensIn:  a.tokensIn  + (r.tokensIn  ?? 0),
      tokensOut: a.tokensOut + (r.tokensOut ?? 0),
      cost:      a.cost      + (r.costUSD   ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0, cost: 0 },
  );
  const live = !runs[runs.length - 1].endedAt;
  const fmtTok = (n: number): string =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000   ? `${(n / 1_000).toFixed(1)}k`
    : String(n);
  const tip =
    `${runs.length} run${runs.length === 1 ? "" : "s"} · ` +
    `${totals.tokensIn.toLocaleString()} in / ${totals.tokensOut.toLocaleString()} out` +
    (live ? " · running now" : "");
  return (
    <span
      className="pill info"
      title={tip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginRight: 0,
      }}
    >
      {live && (
        <span
          aria-label="run live"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--good)",
            animation: "mc-pulse 1.4s ease-in-out infinite",
          }}
        />
      )}
      {totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "$0.0000"}
      <span style={{ opacity: 0.65, fontWeight: 400 }}>
        · {fmtTok(totals.tokensIn)} in / {fmtTok(totals.tokensOut)} out
      </span>
    </span>
  );
}

function TaskMeta({ task, events }: { task: Task; events: TaskEvent[] }): JSX.Element {
  const runs = deriveRuns(events);
  const totals = runs.reduce(
    (acc, r) => ({
      tokensIn:  acc.tokensIn  + (r.tokensIn  ?? 0),
      tokensOut: acc.tokensOut + (r.tokensOut ?? 0),
      cost:      acc.cost      + (r.costUSD   ?? 0),
    }),
    { tokensIn: 0, tokensOut: 0, cost: 0 },
  );
  return (
    <div>
      <h3>Task meta</h3>
      <div style={{ marginTop: 10 }}>
        <Row label="Workflow" value={task.workflow} />
        <Row label="Project" value={task.project} />
        <Row label="Kind" value={task.kind} />
        <Row label="Cycles so far" value={String(task.cycle)} />
        <Row label="Current agent" value={task.currentAgentSlug ?? "(none)"} />
        <Row label="Tokens in / out" value={`${totals.tokensIn.toLocaleString()} / ${totals.tokensOut.toLocaleString()}`} />
        <Row label="Cost (USD)" value={totals.cost > 0 ? `$${totals.cost.toFixed(4)}` : "—"} />
        <Row label="Created" value={fmt(task.createdAt)} />
        <Row label="Updated" value={fmt(task.updatedAt)} />
        <Row label="Status" value={task.status} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
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
      <span className="muted">{value}</span>
    </div>
  );
}

/**
 * Campaign items table — shown only when task.kind === "campaign". Each
 * row is one unit of work. The runtime iterator (one session per item)
 * isn't wired yet; today this is display-only so users can plan + paste
 * items in, and so the schema is exercised.
 */
function CampaignItems({ task }: { task: Task }): JSX.Element {
  const items = task.items;
  const counts = items.reduce(
    (acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const done = counts.done ?? 0;
  const failed = counts.failed ?? 0;
  const running = counts.running ?? 0;
  const pending = counts.pending ?? 0;
  const finishedPct = items.length === 0 ? 0 : Math.round(((done + failed) / items.length) * 100);

  return (
    <section className="card">
      <h3>Campaign items</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        {items.length === 0
          ? "No items yet. Paste items into the Create Task form or let the Planner generate them."
          : `${done} done · ${failed} failed · ${running} running · ${pending} pending — ${finishedPct}% finished`}
      </p>
      {items.length > 0 && (
        <div
          style={{
            marginTop: 8,
            height: 8,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
          }}
          title={`${done} done · ${failed} failed · ${running} running · ${pending} pending`}
        >
          <div style={{ width: `${(done / items.length) * 100}%`, background: "var(--good)" }} />
          <div style={{ width: `${(failed / items.length) * 100}%`, background: "var(--bad)" }} />
          <div
            style={{
              width: `${(running / items.length) * 100}%`,
              background: "var(--warn)",
              animation: running > 0 ? "mc-pulse 2.1s ease-in-out infinite" : undefined,
            }}
          />
        </div>
      )}
      {items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={cellHead}>ID</th>
              <th style={cellHead}>Description</th>
              <th style={cellHead}>Status</th>
              <th style={cellHead}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={cell}><strong>{item.id}</strong></td>
                <td style={cell}>{item.description}</td>
                <td style={cell}>
                  <span className={`pill ${item.status === "done" ? "good" : item.status === "failed" ? "bad" : item.status === "running" ? "warn" : "info"}`}>
                    {item.status}
                  </span>
                </td>
                <td style={cell}>{item.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RunHistory({ events }: { events: TaskEvent[] }): JSX.Element {
  const runs = deriveRuns(events);

  return (
    <section className="card">
      <h3>Run history</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        One row per agent session. Model, tokens and cost come from pi's
        turn_end events.
      </p>
      {runs.length === 0 ? (
        <p className="muted" style={{ marginTop: 10 }}>No runs yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={cellHead}>Started</th>
              <th style={cellHead}>Agent</th>
              <th style={cellHead}>Model</th>
              <th style={cellHead}>Duration</th>
              <th style={cellHead}>Tokens (in/out)</th>
              <th style={cellHead}>Cost</th>
              <th style={cellHead}>Exit</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={cell}>{fmt(r.startedAt)}</td>
                <td style={cell}>{r.agentSlug ?? "—"}</td>
                <td style={cell}>{r.model ? `${r.provider ?? ""}${r.provider ? " · " : ""}${r.model}` : "—"}</td>
                <td style={cell}>{r.endedAt ? dur(r.startedAt, r.endedAt) : "running"}</td>
                <td style={cell}>
                  {r.tokensIn !== undefined
                    ? `${r.tokensIn.toLocaleString()} / ${(r.tokensOut ?? 0).toLocaleString()}`
                    : "—"}
                </td>
                <td style={cell}>{r.costUSD ? `$${r.costUSD.toFixed(4)}` : "—"}</td>
                <td style={cell}>
                  <span className={`pill ${pillForReason(r.reason)}`}>
                    {r.reason ?? "ongoing"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
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
function ModelPicker({
  value,
  onChange,
  disabled,
  models,
  onRefresh,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  models: PiModelInfo[];
  onRefresh?: () => Promise<void>;
}): JSX.Element {
  const grouped = new Map<string, PiModelInfo[]>();
  for (const m of models) {
    const bucket = grouped.get(m.provider) ?? [];
    bucket.push(m);
    grouped.set(m.provider, bucket);
  }
  // Providers sorted alpha; within each, models alpha by name.
  const providers = [...grouped.keys()].sort();
  for (const p of providers) grouped.get(p)!.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span className="muted" style={{ fontSize: 12 }}>Model</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "6px 10px",
          minWidth: 220,
        }}
        title={
          providers.length === 0
            ? "No authed providers. Run `pi /login` (or set OPENAI_API_KEY / ANTHROPIC_API_KEY) and click ↻."
            : "Model pi will use for this run. Empty = pi's default. Limited to providers pi has auth for."
        }
      >
        <option value="">
          {providers.length === 0 ? "(no authed providers — pi default)" : "(pi default)"}
        </option>
        {providers.map((p) => (
          <optgroup key={p} label={p}>
            {grouped.get(p)!.map((m) => (
              <option key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>
                {m.name} · ${m.costInputPerMTok.toFixed(2)}/${m.costOutputPerMTok.toFixed(2)}/MTok
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {onRefresh && (
        <button
          className="button ghost"
          onClick={() => { void onRefresh(); }}
          disabled={disabled}
          title="Reload models from pi (use after `pi /login` or env-var changes)"
          style={{ padding: "4px 10px", lineHeight: 1 }}
        >
          ↻
        </button>
      )}
    </div>
  );
}

/**
 * Approval lane gate — only rendered when task.lane === "approval".
 * Offers Approve (advance to next lane in workflow.lanes) and Request
 * Changes (loop back to first lane, cycle++).
 *
 * PROPOSED integration: when `plannotator@claude-code-plugins` exposes
 * an invocation surface, replace these manual buttons with "Open in
 * plannotator" + read its approve/reject + annotation-feedback result.
 * Today the buttons are a direct human gate on the lane transition.
 */
function ApprovalGate({ task }: { task: Task }): JSX.Element {
  const { workflows } = useWorkflows();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const workflow = workflows.find((w) => w.code === task.workflow);
  const lanes = effectiveLanes(workflow);
  const currentIdx = lanes.indexOf(task.lane);
  const nextLane: Lane | undefined = lanes[currentIdx + 1];
  const firstLane: Lane = lanes[0] ?? "plan";

  async function transition(next: Partial<Task>): Promise<void> {
    if (!window.mc) { setError("Not connected"); return; }
    setBusy(true);
    setError("");
    try {
      await window.mc.saveTask({ ...task, ...next });
      publish("tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="card"
      style={{
        background: "rgba(244,201,93,0.08)",
        borderColor: "var(--warn)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>⏸ Awaiting human approval</h3>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Review the planner's output and per-agent notes. Approve to
            advance to <strong>{nextLane ?? "done"}</strong>, or request
            changes to loop back to <strong>{firstLane}</strong> (cycle
            {" "}{task.cycle + 1}).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button"
            onClick={() => void transition({ lane: nextLane ?? "done" })}
            disabled={busy}
            title="Advance to the next lane in this workflow"
          >
            ✓ Approve
          </button>
          <button
            className="button warn"
            onClick={() =>
              void transition({ lane: firstLane, cycle: task.cycle + 1 })
            }
            disabled={busy}
            title="Loop back to the first lane with cycle+1"
          >
            ↺ Request changes
          </button>
        </div>
      </div>
      {error && (
        <div
          style={{
            color: "var(--bad)",
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {error}
        </div>
      )}
    </section>
  );
}

/**
 * Mission card — renders the task's PROMPT.md. Not parsed as markdown
 * today (keeping the dep footprint minimal); shown as preformatted text
 * in a scrollable container. Empty/missing state is explicit so the
 * user knows whether the file has been created yet.
 */
function Mission({ prompt }: { prompt: string | null }): JSX.Element {
  return (
    <div>
      <h3>Mission</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        PROMPT.md — regenerated on each Start. Edit the task's title or
        description to change it.
      </p>
      {prompt === null ? (
        <div className="muted" style={{ fontSize: 12, padding: "10px 2px" }}>
          No PROMPT.md yet. Click Start once to generate it.
        </div>
      ) : (
        <pre
          style={{
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
          }}
        >
          {prompt}
        </pre>
      )}
    </div>
  );
}

/**
 * Status log card — renders STATUS.md tail. Append-only progress log
 * updated by agents during their sessions (and seeded with a "task
 * created" line at createTask time).
 */
function StatusLog({ status }: { status: string | null }): JSX.Element {
  // Show most recent entries first by tailing lines. STATUS.md tends to
  // grow linearly; we render the last ~40 lines so it stays readable.
  const lines = (status ?? "").split("\n").filter((l) => l.length > 0);
  const tail = lines.slice(-40);

  return (
    <div>
      <h3>Status log</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        STATUS.md — append-only. Agents add one line per meaningful step.
      </p>
      {status === null ? (
        <div className="muted" style={{ fontSize: 12, padding: "10px 2px" }}>
          No STATUS.md yet.
        </div>
      ) : (
        <pre
          style={{
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
          }}
        >
          {tail.join("\n")}
        </pre>
      )}
    </div>
  );
}

function pillForReason(reason: string | undefined): string {
  if (reason === "completed") return "good";
  if (reason === "failed")    return "bad";
  if (reason === "user")      return "info";
  return "warn";
}

function LinkedFiles({ task }: { task: Task }): JSX.Element {
  const { agents } = useAgents();
  const primaries = agents.filter((a) => a.code.length === 1);
  const [files, setFiles] = useState<Array<{ name: string; size: number; modifiedAt: string }>>([]);

  // Refetch the task folder listing on mount + every "tasks" topic publish
  // (which fires on every event-appended / task-saved). Cheap stat-only call.
  useSubscribe("tasks", () => { void load(); });
  async function load(): Promise<void> {
    if (!window.mc) return;
    try { setFiles(await window.mc.listTaskFiles(task.id)); } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, [task.id]);

  // Map known agent-code suffix → friendly note. Files written by
  // babysitter that don't match the convention show as "(babysitter)"
  // so the user can tell them apart from agent deliverables.
  const noteFor = (name: string): string => {
    const stem = name.replace(/\.md$/, "");
    if (stem === task.id) return "task brief / manifest area";
    if (stem === "PROMPT") return "mission brief";
    if (stem === "STATUS") return "progress log";
    const m = stem.match(new RegExp(`^${task.id}-([a-z0-9]{1,4})$`, "i"));
    if (m) {
      const code = m[1]!.toLowerCase();
      const agent = agents.find((a) => a.code === code);
      if (agent) return `${agent.name} output`;
      return `agent code "${code}"`;
    }
    if (name.endsWith(".jsonl")) return "event journal";
    if (name.endsWith(".json"))  return "manifest";
    return "(other)";
  };

  // Expected-but-not-yet-produced placeholders, only for primary agents
  // whose code-suffix file doesn't exist yet. Helps the user see what's
  // expected vs what's there.
  const presentNames = new Set(files.map((f) => f.name));
  const expectedMissing = primaries
    .map((a) => `${task.id}-${a.code}.md`)
    .filter((n) => !presentNames.has(n));

  return (
    <div>
      <h3>Task-linked files</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Live listing of the task folder. Per-agent deliverables follow
        the <code>&lt;taskId&gt;-&lt;code&gt;.md</code> convention; agents in
        babysitter mode are asked to honor it but may not always.
      </p>
      <div style={{ marginTop: 10 }}>
        {files.map((f) => (
          <div
            key={f.name}
            style={{
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{f.name}</strong>
            <span className="muted" style={{ fontSize: 12, textAlign: "right" }}>
              {noteFor(f.name)} · {fmtSize(f.size)}
            </span>
          </div>
        ))}
        {files.length === 0 && (
          <div className="muted" style={{ fontSize: 12, padding: "10px 2px" }}>
            No files yet.
          </div>
        )}
        {expectedMissing.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <div className="muted" style={{ marginBottom: 4 }}>Expected (not yet produced):</div>
            {expectedMissing.map((n) => (
              <div key={n} style={{ fontFamily: "monospace", color: "var(--muted)", padding: "2px 0" }}>
                · {n}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function PerAgentNotes({ task: _task }: { task: Task }): JSX.Element {
  const { agents } = useAgents();
  const primaries = agents.filter((a) => a.code.length === 1);

  return (
    <div>
      <h3>Per-agent notes</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Grows across cycles — each agent's running scratchpad. One file per agent slug.
      </p>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {primaries.map((a) => (
          <div key={a.slug}>
            <strong>{a.name}</strong>
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              Notes file: <code>{a.slug}/notes.md</code>
            </p>
          </div>
        ))}
        {primaries.length === 0 && (
          <div className="muted" style={{ fontSize: 12 }}>No agents loaded.</div>
        )}
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

const cellHead: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 };
const cell: React.CSSProperties = { padding: "8px 10px" };

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}
function dur(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
