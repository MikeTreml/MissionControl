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
import { useState } from "react";

import { useRoute } from "../router";
import { useTask } from "../hooks/useTask";
import { useAgents } from "../hooks/useAgents";
import { publish } from "../hooks/data-bus";
import { PageStub } from "./PageStub";
import type { Lane, LaneHistoryEntry, Task, TaskEvent } from "../../../shared/models";

const LANE_LABEL: Record<Lane, string> = {
  plan: "Plan", develop: "Develop", review: "Review",
  surgery: "Surgery", approval: "Approval", done: "Done",
};

export function TaskDetail(): JSX.Element {
  const { selectedTaskId } = useRoute();
  const { task, events, isDemo } = useTask(selectedTaskId);

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
          {!isDemo && <DeleteTaskButton taskId={task.id} />}
          <BackToDashboard />
        </div>
      </div>

      <div className="content">
        <Controls task={task} />

        <section className="card" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
          <LaneTimeline task={task} />
          <TaskMeta task={task} events={events} />
        </section>

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [agentSlug, setAgentSlug] = useState(task.currentAgentSlug ?? "");

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
        case "start":  await window.mc.startRun({ taskId: task.id, agentSlug: agentSlug || undefined }); break;
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
  const tokensIn = sumFromEvents(events, "tokensIn");
  const tokensOut = sumFromEvents(events, "tokensOut");
  return (
    <div>
      <h3>Task meta</h3>
      <div style={{ marginTop: 10 }}>
        <Row label="Workflow" value={task.workflow} />
        <Row label="Project" value={task.project} />
        <Row label="Kind" value={task.kind} />
        <Row label="Cycles so far" value={String(task.cycle)} />
        <Row label="Current agent" value={task.currentAgentSlug ?? "(none)"} />
        <Row label="Tokens in / out" value={`${tokensIn.toLocaleString()} / ${tokensOut.toLocaleString()}`} />
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

function RunHistory({ events }: { events: TaskEvent[] }): JSX.Element {
  // Pair run-started with run-ended; treat dangling run-started as ongoing.
  type Run = {
    startedAt: string;
    endedAt?: string;
    role?: string;
    model?: string;
    exit?: string;
  };
  const runs: Run[] = [];
  for (const e of events) {
    if (e.type === "run-started") {
      runs.push({
        startedAt: e.timestamp,
        role: (e as Record<string, unknown>).role as string | undefined,
        model: (e as Record<string, unknown>).model as string | undefined,
      });
    } else if (e.type === "run-ended") {
      const last = runs[runs.length - 1];
      if (last) {
        last.endedAt = e.timestamp;
        last.exit = (e as Record<string, unknown>).exit as string | undefined;
      }
    }
  }

  return (
    <section className="card">
      <h3>Run history</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        One row per agent session. Pi session events fill this in once wired.
      </p>
      {runs.length === 0 ? (
        <p className="muted" style={{ marginTop: 10 }}>No runs yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={cellHead}>Started</th>
              <th style={cellHead}>Role</th>
              <th style={cellHead}>Model</th>
              <th style={cellHead}>Duration</th>
              <th style={cellHead}>Exit</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={cell}>{fmt(r.startedAt)}</td>
                <td style={cell}>{r.role ?? "—"}</td>
                <td style={cell}>{r.model ?? "—"}</td>
                <td style={cell}>{r.endedAt ? dur(r.startedAt, r.endedAt) : "running"}</td>
                <td style={cell}>
                  <span
                    className={`pill ${
                      r.exit === "completed" ? "good" : r.exit ? "warn" : "warn"
                    }`}
                  >
                    {r.exit ?? "ongoing"}
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
function sumFromEvents(events: TaskEvent[], key: string): number {
  let total = 0;
  for (const e of events) {
    const v = (e as Record<string, unknown>)[key];
    if (typeof v === "number") total += v;
  }
  return total;
}
