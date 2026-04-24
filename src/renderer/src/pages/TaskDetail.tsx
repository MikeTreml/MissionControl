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
import { publish } from "../hooks/data-bus";
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
        <div style={{ display: "flex", gap: 8 }}>
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
  const { models: piModels } = usePiModels();

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
  return (
    <section className="card">
      <h3>Campaign items</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        {items.length === 0
          ? "No items yet. Paste items into the Create Task form or let the Planner generate them."
          : `${items.length} item${items.length === 1 ? "" : "s"} · runtime iteration not wired yet (see docs/WORKFLOW-EXECUTION.md).`}
      </p>
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
 */
function ModelPicker({
  value,
  onChange,
  disabled,
  models,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  models: PiModelInfo[];
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
        title="Model pi will use for this run. Empty = pi's default."
      >
        <option value="">(pi default)</option>
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

  // Base manifest + one file per primary agent (code-based suffix). Subagent
  // files are added dynamically once they've actually been spawned — not
  // listed speculatively here.
  const files: Array<{ name: string; note: string }> = [
    { name: task.id, note: "base manifest" },
    ...primaries.map((a) => ({
      name: `${task.id}-${a.code}`,
      note: `${a.name} output`,
    })),
  ];

  return (
    <div>
      <h3>Task-linked files</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        File names follow the task-id + agent-code convention.
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
            }}
          >
            <strong>{f.name}</strong>
            <span className="muted">{f.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
