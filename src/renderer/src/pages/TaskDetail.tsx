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
import { usePiModels } from "../hooks/usePiModels";
import { usePendingAsks } from "../hooks/usePendingAsks";
import { publish, useSubscribe } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
import { deriveRuns, type DerivedRun, type DerivedSubagent } from "../lib/derive-runs";
import { derivePhases } from "../lib/derive-phases";
import { derivePendingBreakpoint } from "../lib/derive-pending-breakpoint";
import { deriveSubagents, type SubagentEntry } from "../lib/derive-subagents";
import { AskUserCard } from "../components/AskUserCard";
import { EditTaskForm } from "../components/EditTaskForm";
import { ChangeWorkflowModal } from "../components/ChangeWorkflowModal";
import { SkeletonLine, SkeletonBlock, SkeletonRows } from "../components/Skeleton";
import { CreateTaskForm, type CreateTaskPreload } from "../components/CreateTaskForm";
import { PageStub } from "./PageStub";
import type { Task, TaskEvent } from "../../../shared/models";
import type { PiModelInfo } from "../global";

export function TaskDetail(): JSX.Element {
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
    return <TaskDetailSkeleton />;
  }

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
            {task.kind} · project {task.project}
            {isDemo && " · demo"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <CostTicker events={events} />
          {!isDemo && (
            <button
              className="button ghost"
              title="Edit title and description"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </button>
          )}
          {!isDemo && (
            <button
              className="button ghost"
              title="Re-assign or clear the curated library workflow used on the next Start"
              onClick={() => setWorkflowOpen(true)}
            >
              Workflow…
            </button>
          )}
          {!isDemo && (
            <button
              className="button ghost"
              title="Create a new task pre-filled from this one — edit anything before saving"
              onClick={() => setRerunOpen(true)}
            >
              ↻ Re-run…
            </button>
          )}
          {!isDemo && (
            <button
              className="button ghost"
              title="Open the task's folder in your OS file explorer"
              onClick={() => { void window.mc?.openTaskFolder(task.id); }}
            >
              📁 Open folder
            </button>
          )}
          {!isDemo && (
            <TaskActionsMenu>
              <button
                className="button ghost"
                title="Spin off a doctor task — diagnose why this task is stuck without modifying it"
                onClick={() => setDoctorOpen(true)}
              >
                ↳ Spin off doctor
              </button>
              <ArchiveTaskButton task={task} />
              <DeleteTaskButton taskId={task.id} />
            </TaskActionsMenu>
          )}
          <BackToDashboard />
        </div>
      </div>

      {!isDemo && (
        <EditTaskForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          task={task}
        />
      )}

      {!isDemo && (
        <ChangeWorkflowModal
          open={workflowOpen}
          onClose={() => setWorkflowOpen(false)}
          task={task}
        />
      )}

      {!isDemo && (
        <CreateTaskForm
          open={rerunOpen}
          onClose={() => setRerunOpen(false)}
          preload={buildRerunPreload(task, runConfig)}
        />
      )}

      {!isDemo && (
        <CreateTaskForm
          open={doctorOpen}
          onClose={() => setDoctorOpen(false)}
          preload={buildDoctorPreload(task, runConfig)}
        />
      )}

      <div className="content">
        <Controls task={task} />
        <PhaseChipStrip task={task} events={events} />
        {!isDemo && <RunMetadataChips task={task} events={events} />}
        {!isDemo && <PendingEffectsPanel task={task} events={events} />}
        {!isDemo && <RunStatusCard task={task} events={events} runConfig={runConfig} />}

        {!isDemo && pendingAsks.map((ask) => (
          <AskUserCard key={ask.toolCallId} taskId={task.id} ask={ask} />
        ))}

        {!isDemo && <BlockerField task={task} />}


        <section
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
        >
          <Mission prompt={prompt} />
          <StatusLog status={status} />
        </section>

        <section className="card" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
          <LaneTimeline task={task} events={events} />
          <TaskMeta task={task} events={events} />
        </section>

        {task.kind === "campaign" && <CampaignItems task={task} />}

        {!isDemo && <SpawnedFromPanel task={task} />}

        <SubagentsPanel events={events} />

        <RunHistory events={events} />

        <section
          className="card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
        >
          <LinkedFiles task={task} />
        </section>

        {!isDemo && <RunConfigCard runConfig={runConfig} />}
        {!isDemo && <RunMetricsCard metrics={latestMetrics} fileName={metricsFileName} />}
      </div>
    </>
  );
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
function buildRerunPreload(
  task: Task,
  runConfig: Record<string, unknown> | null,
): CreateTaskPreload {
  const preload: CreateTaskPreload = {
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
    const lw = runConfig["libraryWorkflow"] as
      | { logicalPath?: unknown }
      | null
      | undefined;
    if (lw && typeof lw.logicalPath === "string") {
      preload.workflowLogicalPath = lw.logicalPath;
    }
    const rs = runConfig["runSettings"] as
      | { inputs?: unknown }
      | undefined;
    if (rs && rs.inputs && typeof rs.inputs === "object") {
      preload.inputs = rs.inputs as Record<string, unknown>;
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
function buildDoctorPreload(
  task: Task,
  runConfig: Record<string, unknown> | null,
): CreateTaskPreload {
  const lastPhase = task.runState !== "idle" ? `still ${task.runState}` : task.status;
  const starter =
    `Diagnose why ${task.id} is stuck (${lastPhase}). Read the source ` +
    `task's STATUS.md and events.jsonl to identify the failure mode, ` +
    `then propose a fix or a follow-up task. Do not modify the source ` +
    `task's files.\n\n` +
    `Source description:\n${task.description || "(no description)"}\n`;

  const preload: CreateTaskPreload = {
    title: `Doctor: ${task.title}`,
    description: starter,
    projectId: task.project,
    kind: "single",
    parentTaskId: task.id,
  };

  // Carry the workflow if the source had one curated. For auto-gen
  // sources, leave the doctor task on auto-gen too — same path.
  if (runConfig) {
    const lw = runConfig["libraryWorkflow"] as { logicalPath?: unknown } | null | undefined;
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
function RunMetadataChips({ task, events }: { task: Task; events: TaskEvent[] }): JSX.Element | null {
  const [iteration, setIteration] = useState<number | null>(null);
  const [completionProof, setCompletionProof] = useState<string | null>(null);

  useEffect(() => {
    if (!window.mc?.runStatus) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.mc.runStatus(task.id);
        if (cancelled || !res || typeof res !== "object") return;
        const obj = res as Record<string, unknown>;
        const iter =
          typeof obj["iterationCount"] === "number" ? (obj["iterationCount"] as number)
          : typeof obj["stateVersion"] === "number" ? (obj["stateVersion"] as number)
          : null;
        const proof = typeof obj["completionProof"] === "string"
          ? (obj["completionProof"] as string)
          : null;
        setIteration(iter);
        setCompletionProof(proof);
      } catch {
        // CLI unreachable / no run yet — leave both null and render nothing
      }
    })();
    return () => { cancelled = true; };
  }, [task.id, events.length]);

  if (iteration === null && !completionProof) return null;

  return (
    <div
      className="muted"
      style={{
        display: "flex",
        gap: 12,
        marginTop: -4,
        fontSize: 11,
        alignItems: "center",
      }}
    >
      {iteration !== null && (
        <span title="SDK state cache reports this many iterations have completed">
          Iteration {iteration}
        </span>
      )}
      {completionProof && (
        <span
          title={`completionProof: ${completionProof}`}
          style={{
            color: "var(--good)",
            fontWeight: 500,
          }}
        >
          ✓ verified done
        </span>
      )}
    </div>
  );
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
function SpawnedFromPanel({ task }: { task: Task }): JSX.Element | null {
  const { tasks, isDemo: tasksDemo } = useTasks();
  const { openTask } = useRoute();

  // Don't try to render lineage from demo data — the IDs are
  // synthetic and won't link to anything meaningful.
  if (tasksDemo) return null;

  const parent = task.parentTaskId
    ? tasks.find((t) => t.id === task.parentTaskId)
    : null;
  const children = tasks.filter((t) => t.parentTaskId === task.id);

  if (!parent && children.length === 0) return null;

  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>Lineage</h3>

      {parent && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span className="muted" style={{ minWidth: 100 }}>Spawned from</span>
          <button
            className="button ghost"
            onClick={() => openTask(parent.id)}
            style={{ fontSize: 12, padding: "3px 8px" }}
            title={parent.summary}
          >
            ← {parent.id}
          </button>
          <span className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {parent.summary}
          </span>
        </div>
      )}

      {task.parentTaskId && !parent && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span className="muted" style={{ minWidth: 100 }}>Spawned from</span>
          <span className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>
            {task.parentTaskId} (deleted or not loaded)
          </span>
        </div>
      )}

      {children.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
          <span className="muted" style={{ minWidth: 100, paddingTop: 4 }}>
            Spawns ({children.length})
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {children.map((c) => (
              <button
                key={c.id}
                className="button ghost"
                onClick={() => openTask(c.id)}
                style={{ fontSize: 12, padding: "3px 8px" }}
                title={c.summary}
              >
                {c.id} →
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Loading shell shown while `useTask` is resolving a real task. Mirrors
 * the live page's structure (header + chip strip + cards row + meta) so
 * the layout doesn't shift when content swaps in. Pure presentation —
 * no data dependencies.
 */
function TaskDetailSkeleton(): JSX.Element {
  return (
    <>
      <div className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <SkeletonLine width="40%" height="1.6em" marginBottom={6} />
          <SkeletonLine width="20%" height="0.85em" />
        </div>
      </div>
      <div className="content">
        <SkeletonBlock height={48} />
        <SkeletonBlock height={56} />
        <section className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <SkeletonRows rows={6} />
          <SkeletonRows rows={6} />
        </section>
        <section className="card" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
          <SkeletonRows rows={4} />
          <SkeletonRows rows={4} />
        </section>
      </div>
    </>
  );
}

/**
 * Overflow / kebab menu — wraps less-frequent or destructive actions
 * so the Task Detail header stays readable. Click ⋯ to open; click
 * any item or anywhere else to close. Children render as menu items
 * via the `.task-actions-menu` rules in styles.css (auto-styled
 * full-width left-aligned rows).
 */
function TaskActionsMenu({ children }: { children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="button ghost"
        onClick={() => setOpen((v) => !v)}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          className="task-actions-menu"
          role="menu"
          // Click-anywhere-inside collapses the menu after the action
          // fires; the action itself runs first because button onClick
          // happens at the target before bubbling here.
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
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
 * Archive button — toggles `task.status` between "archived" and a sane
 * non-archived value. No confirm dialog: archive is fully reversible
 * (Unarchive button shows up when the task IS archived).
 *
 * Unarchive behavior: we don't try to remember what status the task
 * had before archiving. Instead we drop it back to "active" and let
 * the user / next run advance it from there. The previous status is
 * recoverable from the events.jsonl trail if it really matters.
 */
function ArchiveTaskButton({ task }: { task: Task }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const archived = task.status === "archived";

  async function onClick(): Promise<void> {
    if (!window.mc) return;
    try {
      setBusy(true);
      const next: Task = {
        ...task,
        status: archived ? "active" : "archived",
        updatedAt: new Date().toISOString(),
      };
      await window.mc.saveTask(next);
      publish("tasks");
    } catch (err) {
      console.error("[TaskDetail] saveTask (archive toggle) threw:", err);
      pushErrorToast(archived ? "Unarchive failed" : "Archive failed", err, task.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="button ghost"
      onClick={onClick}
      disabled={busy}
      title={archived ? "Restore this task to the active board" : "Archive this task — hides it from the default board"}
    >
      {busy ? "…" : archived ? "↩ Unarchive" : "📦 Archive"}
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
      pushErrorToast("Delete failed", err, taskId);
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
 * which route through RunManager → PiSessionManager. CONFIRMED wired:
 * Start opens a real pi session and prompts babysitter; Stop ends it.
 */
function Controls({ task }: { task: Task }): JSX.Element {
  const { models: piModels, refresh: refreshPiModels } = usePiModels();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Empty string = use pi's default (no model override).
  const [modelId, setModelId] = useState<string>("");

  // Resync local selection when navigating to a different task — useState's
  // initial value is only honored on first mount; without this, a re-used
  // Controls instance would keep the previous task's model selection.
  useEffect(() => {
    setModelId("");
    setError("");
  }, [task.id]);

  const canStart   = task.runState === "idle";
  const canPause   = task.runState === "running";
  const canResume  = task.runState === "paused";
  const canStop    = task.runState !== "idle";

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
              title="Start this task"
              onClick={() => void callRun("start")}
              disabled={busy}
            >
              Start
            </button>
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
            Cycle {task.cycle}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            color: "var(--bad)",
            borderColor: "var(--bad)",
            background: "rgba(232, 116, 116,0.08)",
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
      pushErrorToast("Couldn't save blocker", err, task.id);
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
        Waiting on:
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
          title="Clear waiting reason"
          style={{ flex: "0 0 auto" }}
        >
          Clear
        </button>
      )}
    </section>
  );
}

/**
 * Vertical phase timeline, oldest at the top. Driven by `derivePhases`,
 * which reads journal events (curated workflow phases or lane-changed
 * legacy events) and falls back to a generic Draft/Active/Finished
 * skeleton if no events are present yet.
 */
/**
 * Pending Effects panel (item #7) — replaces the old breakpoint-only
 * card. Drives off `runListPending` (SDK as primary list) and joins
 * with `derivePendingBreakpoint` for the rich breakpoint payload
 * (question, title, expert, tags) that the SDK CLI doesn't return.
 *
 * v1 supports breakpoint + sleep. Custom kinds (any other kind
 * string) render read-only as forward-compat. See
 * docs/SPEC-PENDING-EFFECTS.md for rationale, edge cases, and
 * deferred items.
 *
 * Fallback behavior:
 * - SDK list reachable: render rows from the SDK list. Breakpoint
 *   rows enrich themselves via the derive helper when effectIds match.
 *   If derive doesn't have a match (race: SDK ahead of journal),
 *   the breakpoint row renders with SDK label only.
 * - SDK list unreachable (CLI missing, child process errored): fall
 *   back to derive-only for breakpoints. Sleep / custom rows are
 *   hidden — we have no journal-derived equivalent. A small footer
 *   warns the user.
 */
type SdkPendingRow = {
  effectId: string;
  kind: string;
  label?: string;
  status?: string;
};

function PendingEffectsPanel({ task, events }: { task: Task; events: TaskEvent[] }): JSX.Element | null {
  const derivedBreakpoint = derivePendingBreakpoint(events);
  // null = not yet fetched / CLI unreachable. Otherwise a (possibly
  // empty) array drives the panel.
  const [sdkRows, setSdkRows] = useState<SdkPendingRow[] | null>(null);
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
        if (cancelled) return;
        const rows = (result?.tasks ?? []).filter(
          (r) => !r.status || r.status === "requested",
        );
        setSdkRows(rows as SdkPendingRow[]);
        setCliUnreachable(false);
      } catch {
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
    if (!derivedBreakpoint) return null;
    return (
      <section className="card" style={{ display: "grid", gap: 10 }}>
        <BreakpointRow
          taskId={task.id}
          row={{ effectId: derivedBreakpoint.effectId, kind: "breakpoint" }}
          derived={derivedBreakpoint}
        />
        <div className="muted" style={{ fontSize: 11 }}>
          ⚠ SDK CLI unreachable — sleep / custom effects hidden.
        </div>
      </section>
    );
  }

  // SDK list resolved (possibly empty). Empty → no panel at all.
  if (!sdkRows || sdkRows.length === 0) return null;

  // Sort: breakpoints first (need user action), others below in SDK order.
  const sorted = [...sdkRows].sort((a, b) => {
    const ap = a.kind === "breakpoint" ? 0 : 1;
    const bp = b.kind === "breakpoint" ? 0 : 1;
    return ap - bp;
  });

  const needsUserCount = sorted.filter((r) => r.kind === "breakpoint").length;
  const totalCount = sorted.length;

  return (
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <strong>Pending effects · {totalCount}</strong>
        {totalCount > 1 && needsUserCount > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            ({needsUserCount} need{needsUserCount === 1 ? "s" : ""} you)
          </span>
        )}
      </div>
      {sorted.map((row, idx) => {
        // Visual separator between rows when there's more than one.
        const dividerStyle = idx === 0 ? {} : { borderTop: "1px solid var(--border)", paddingTop: 12 };
        if (row.kind === "breakpoint") {
          // Match the derive helper to this row by effectId so we can
          // render the rich payload. If derive has nothing, the row
          // still works with SDK label only.
          const derived =
            derivedBreakpoint && derivedBreakpoint.effectId === row.effectId
              ? derivedBreakpoint
              : null;
          return (
            <div key={row.effectId} style={dividerStyle}>
              <BreakpointRow taskId={task.id} row={row} derived={derived} />
            </div>
          );
        }
        if (row.kind === "sleep") {
          return (
            <div key={row.effectId} style={dividerStyle}>
              <SleepRow row={row} />
            </div>
          );
        }
        return (
          <div key={row.effectId} style={dividerStyle}>
            <CustomEffectRow row={row} />
          </div>
        );
      })}
    </section>
  );
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
function BreakpointRow({
  taskId,
  row,
  derived,
}: {
  taskId: string;
  row: SdkPendingRow;
  derived: ReturnType<typeof derivePendingBreakpoint>;
}): JSX.Element {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const payload = derived?.payload ?? {};
  const question = typeof payload.question === "string" ? payload.question : null;
  const titleText = typeof payload.title === "string" ? payload.title : (row.label ?? null);
  const expert = derived?.expert ?? null;
  const tags = derived?.tags ?? [];
  const runPath = derived?.runPath ?? null;

  async function respond(approved: boolean): Promise<void> {
    if (!window.mc) { setError("Not connected — run `npm run dev`"); return; }
    if (!runPath) { setError("Run path unknown — wait a moment, then retry"); return; }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "rgba(232, 177, 76,0.08)",
        border: "1px solid var(--warn)",
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "var(--warn)", fontSize: 14 }}>⏸</span>
        <strong>Awaiting human approval</strong>
        {expert && expert !== "owner" && (
          <span className="muted" style={{ fontSize: 12 }}>· expert: {expert}</span>
        )}
        {tags.length > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>· {tags.join(" · ")}</span>
        )}
      </div>
      {titleText && <div style={{ fontWeight: 500 }}>{titleText}</div>}
      {question && (
        <div className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
          {question}
        </div>
      )}
      <textarea
        rows={2}
        value={feedback}
        placeholder="Optional response or change request"
        onChange={(e) => setFeedback(e.target.value)}
        disabled={busy}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          fontFamily: "inherit",
          fontSize: 13,
          width: "100%",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="button"
          disabled={busy || !runPath}
          onClick={() => void respond(true)}
          title={runPath ? "Approve and continue the run" : "Run path not yet known — wait a moment"}
        >
          ✓ Approve
        </button>
        <button
          className="button warn"
          disabled={busy || !runPath}
          onClick={() => void respond(false)}
          title={runPath ? "Reject; the workflow's retry/refine loop picks this up" : "Run path not yet known — wait a moment"}
        >
          ↺ Request changes
        </button>
        <span className="muted" style={{ fontSize: 11, alignSelf: "center", marginLeft: 8 }}>
          effect: <code>{row.effectId}</code>
        </span>
      </div>
      {!runPath && (
        <div className="muted" style={{ fontSize: 11 }}>
          SDK reports this breakpoint pending but the journal hasn't surfaced its
          run path yet — it will catch up shortly.
        </div>
      )}
      {error && (
        <div style={{ color: "var(--bad)", fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Sleep row — informational only in v1. The SDK index reports the
 * effect as pending; we render kind, optional label, and effect id.
 * No countdown until we know the SDK row carries `wakeAt` /
 * `durationMs` (open Q in SPEC §1b). When the workflow's sleep
 * resolves, the next runListPending tick removes the row.
 */
function SleepRow({ row }: { row: SdkPendingRow }): JSX.Element {
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14 }}>⏳</span>
        <strong>Sleep</strong>
        <span className="muted" style={{ fontSize: 12 }}>· sleeping…</span>
      </div>
      {row.label && <div style={{ fontWeight: 500 }}>{row.label}</div>}
      <div className="muted" style={{ fontSize: 11 }}>
        effect: <code>{row.effectId}</code>
      </div>
    </div>
  );
}

/**
 * Custom-kind row — read-only forward-compat (v1.1 will expose actions
 * once the SDK row shape for arbitrary kinds is nailed down). For now
 * we surface the kind + label + effect id so users can at least see
 * the workflow is waiting on something.
 */
function CustomEffectRow({ row }: { row: SdkPendingRow }): JSX.Element {
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 14 }}>☉</span>
        <strong>Pending effect</strong>
        <span className="muted" style={{ fontSize: 12 }}>· {row.kind}</span>
      </div>
      {row.label && <div style={{ fontWeight: 500 }}>{row.label}</div>}
      <div className="muted" style={{ fontSize: 11 }}>
        effect: <code>{row.effectId}</code>
      </div>
    </div>
  );
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
function SubagentsPanel({ events }: { events: TaskEvent[] }): JSX.Element | null {
  const rows = deriveSubagents(events);
  if (rows.length === 0) return null;

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

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Subagents</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {running.length > 0 ? `${running.length} active · ` : ""}
          {finished.length} finished
        </span>
      </div>

      {running.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "8px 0 12px",
            marginBottom: finished.length > 0 ? 8 : 0,
            borderBottom: finished.length > 0 ? "1px solid var(--border)" : undefined,
          }}
        >
          {running.map((r) => (
            <ActiveSubagentChip key={r.id} entry={r} />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <>
          <div
            className="muted"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}
          >
            Recent
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {finishedShown.map((r) => (
              <SubagentHistoryRow key={r.id} entry={r} />
            ))}
            {finishedHidden > 0 && (
              <div className="muted" style={{ fontSize: 11, padding: "4px 2px" }}>
                …{finishedHidden} more in the journal
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Big chip for an active subagent — sits in the top rail. Pulsing
 * dot + label + subtitle + source + elapsed-since-start when known.
 * Visual emphasis (warn-tinted bg) so the user can spot what's
 * currently churning at a glance.
 */
function ActiveSubagentChip({ entry }: { entry: SubagentEntry }): JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        border: "1px solid var(--warn)",
        borderRadius: 18,
        background: "rgba(232, 177, 76,0.08)",
        minHeight: 28,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--warn)",
          animation: "mc-pulse 1.4s ease-in-out infinite",
          flex: "0 0 auto",
        }}
        aria-label="running"
      />
      <strong style={{ fontSize: 13 }}>{entry.label}</strong>
      {entry.subtitle && (
        <span className="muted" style={{ fontSize: 12 }}>{entry.subtitle}</span>
      )}
      <span className="muted" style={{ fontSize: 11 }}>
        {entry.source === "sdk" ? "SDK" : "pi"}
        {entry.durationMs !== null && ` · ${(entry.durationMs / 1000).toFixed(1)}s`}
      </span>
    </div>
  );
}

/**
 * Compact one-line row for completed/failed subagents — sits in the
 * "Recent" list below the active rail. Tiny status dot (no animation),
 * label, subtitle, source, duration.
 */
function SubagentHistoryRow({ entry }: { entry: SubagentEntry }): JSX.Element {
  const tone = entry.status === "failed" ? "var(--bad)" : "var(--good)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 10px",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone,
          flex: "0 0 auto",
        }}
        aria-label={entry.status}
      />
      <span>{entry.label}</span>
      {entry.subtitle && (
        <span className="muted" style={{ fontSize: 11 }}>{entry.subtitle}</span>
      )}
      <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>
        {entry.source === "sdk" ? "SDK" : "pi"}
        {entry.durationMs !== null && ` · ${(entry.durationMs / 1000).toFixed(1)}s`}
        {` · ${entry.status}`}
      </span>
    </div>
  );
}

function PhaseChipStrip({ task, events }: { task: Task; events: TaskEvent[] }): JSX.Element | null {
  const { phases, current: derivedCurrent, source } = derivePhases(task, events);
  // SDK-authoritative current marker (#20). The timeline shape stays
  // journal-derived (we want the full history); but the "active"
  // chip prefers what the SDK state cache reports via runs:status.
  // Fall back to derivePhases.current when the SDK CLI is unreachable.
  const [sdkCurrent, setSdkCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!window.mc?.runStatus) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.mc.runStatus(task.id);
        if (cancelled || !res || typeof res !== "object") return;
        const obj = res as Record<string, unknown>;
        const cur =
          typeof obj["currentPhase"] === "string" ? (obj["currentPhase"] as string)
          : typeof obj["phase"] === "string" ? (obj["phase"] as string)
          : null;
        setSdkCurrent(cur);
      } catch {
        if (!cancelled) setSdkCurrent(null);
      }
    })();
    return () => { cancelled = true; };
  }, [task.id, events.length]);

  if (phases.length === 0) return null;

  // Resolve which chip is "current": prefer the SDK answer when it
  // matches a phase id we know about; otherwise trust the derive
  // helper. Render annotation reflects which source we used so users
  // can spot drift if both disagree.
  const sdkMatches = sdkCurrent ? phases.some((p) => p.id === sdkCurrent) : false;
  const current = sdkMatches ? sdkCurrent : derivedCurrent;
  const currentSource: "sdk" | "journal" = sdkMatches ? "sdk" : "journal";

  const colorFor = (status: typeof phases[number]["status"]): { bg: string; fg: string } => {
    if (status === "active") return { bg: "rgba(232, 177, 76,0.15)", fg: "var(--warn)" };
    if (status === "failed") return { bg: "rgba(232, 116, 116,0.12)", fg: "var(--bad)" };
    if (status === "done")   return { bg: "rgba(74,222,128,0.10)", fg: "var(--good)" };
    return { bg: "var(--panel-2)", fg: "var(--muted)" };
  };

  const elapsed = elapsedSinceLatestEvent(events) ?? "";
  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        flexWrap: "wrap",
      }}
    >
      <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.04, marginRight: 4 }}>
        Phase
      </span>
      {phases.map((p, idx) => {
        // SDK-authoritative override: when the SDK reports this chip
        // as the current phase, render it as "active" even if
        // derivePhases labeled it differently. The journal can lag
        // the state cache, so this catches the brief window where
        // they disagree.
        const isCurrent = p.id === current;
        const effectiveStatus = isCurrent ? "active" : p.status;
        const c = colorFor(effectiveStatus);
        return (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                background: c.bg,
                color: c.fg,
                border: `1px solid ${effectiveStatus === "active" ? c.fg : "var(--border)"}`,
                borderRadius: 5,
                padding: "3px 9px",
                fontSize: 12,
                fontWeight: effectiveStatus === "active" ? 600 : 400,
                whiteSpace: "nowrap",
              }}
              title={effectiveStatus}
            >
              {p.label}
              {isCurrent && " ●"}
              {p.status === "failed" && " ✕"}
            </span>
            {idx < phases.length - 1 && (
              <span style={{ color: "var(--muted)", fontSize: 11 }}>→</span>
            )}
          </span>
        );
      })}
      <span style={{ flex: 1 }} />
      <span
        className="muted"
        style={{ fontSize: 11, fontFamily: "monospace" }}
        title={
          currentSource === "sdk"
            ? "Current phase reported by the SDK state cache"
            : "Current phase derived from journal events (SDK CLI unreachable or no match)"
        }
      >
        cycle {task.cycle}
        {elapsed ? ` · ${elapsed}` : ""}
        {source !== "curated" ? ` · ${source}` : ""}
        {currentSource === "sdk" ? " · sdk" : ""}
      </span>
    </div>
  );
}

function elapsedSinceLatestEvent(events: TaskEvent[]): string | null {
  const last = events[events.length - 1];
  if (!last) return null;
  const ts = (last as unknown as { timestamp?: string }).timestamp;
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function LaneTimeline({ task, events }: { task: Task; events: TaskEvent[] }): JSX.Element {
  const { phases, source } = derivePhases(task, events);

  const colorFor = (status: typeof phases[number]["status"]): string => {
    if (status === "active") return "var(--warn)";
    if (status === "failed") return "var(--bad)";
    if (status === "done") return "var(--good)";
    return "var(--muted)";
  };

  return (
    <div>
      <h3>Phase timeline</h3>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        {source === "curated" && "From workflow journal"}
        {source === "lane" && "From lane transitions"}
        {source === "generic" && "Generic phases — no run data yet"}
      </div>
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
        {phases.map((p) => {
          const dotColor = colorFor(p.status);
          return (
            <div
              key={p.id}
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
                  background: dotColor,
                  border: `2px solid ${dotColor}`,
                  boxShadow: p.status === "active" ? "0 0 0 4px rgba(232, 177, 76,0.2)" : undefined,
                }}
              />
              <h4 style={{ margin: "0 0 2px", fontSize: 14 }}>
                {p.label}
                {p.status === "active" && " — current"}
                {p.status === "failed" && " — failed"}
              </h4>
              {(p.enteredAt || p.leftAt) && (
                <div className="sub">
                  {p.enteredAt && `Entered ${fmt(p.enteredAt)}`}
                  {p.leftAt && ` · left ${fmt(p.leftAt)}`}
                </div>
              )}
            </div>
          );
        })}
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
        <Row label="Project" value={task.project} />
        <Row label="Kind" value={task.kind} />
        <Row label="Cycles so far" value={String(task.cycle)} />
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
          ? "No items yet. Paste items into the Create Task form or let the workflow's planning agent generate them."
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

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
              <th style={cellHead}>Babysitter run</th>
              <th style={cellHead}>Subagents</th>
              <th style={cellHead}>Duration</th>
              <th style={cellHead}>Tokens (in/out)</th>
              <th style={cellHead}>Cost</th>
              <th style={cellHead}>Exit</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => (
              <Fragment key={`run-${idx}`}>
                <tr style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={cell}>{fmt(r.startedAt)}</td>
                  <td style={cell}>{r.agentSlug ?? "—"}</td>
                  <td style={cell}>{r.model ? `${r.provider ?? ""}${r.provider ? " · " : ""}${r.model}` : "—"}</td>
                  <td style={cell}>
                    {r.babysitterRunId && r.babysitterRunPath ? (
                      <button
                        className="button ghost"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        title={r.babysitterRunPath}
                        onClick={() => { void window.mc?.openPath(r.babysitterRunPath!); }}
                      >
                        {r.babysitterRunId}
                      </button>
                    ) : "—"}
                  </td>
                  <td style={cell}>
                    {r.subagents.length > 0 ? (
                      <button
                        className="button ghost"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      >
                        {expanded[idx] ? "▾" : "▸"} {r.subagents.length} subagent{r.subagents.length === 1 ? "" : "s"}
                      </button>
                    ) : "—"}
                  </td>
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
                {expanded[idx] && r.subagents.length > 0 && (
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...cell, paddingTop: 8, paddingBottom: 12 }} colSpan={9}>
                      <div style={{ display: "grid", gap: 8 }}>
                        {r.subagents.map((sub) => (
                          <SubagentRow key={sub.spawnId} sub={sub} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SubagentRow({ sub }: { sub: DerivedSubagent }): JSX.Element {
  const label = sub.agentName ?? sub.agentSlug ?? sub.spawnId;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--panel-2)",
      }}
    >
      <span style={{ fontSize: 12 }}>⤴</span>
      <strong>{label}</strong>
      <span className="muted" style={{ fontSize: 12 }}>{sub.reason ?? sub.spawnId}</span>
      <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
        {sub.endedAt
          ? `${sub.exitReason ?? "completed"} · ${sub.durationMs !== undefined ? `${(sub.durationMs / 1000).toFixed(1)}s` : dur(sub.startedAt, sub.endedAt)}`
          : "running"}
      </span>
    </div>
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
  const [files, setFiles] = useState<Array<{ name: string; size: number; modifiedAt: string }>>([]);

  // Refetch the task folder listing on mount + every "tasks" topic publish
  // (which fires on every event-appended / task-saved). Cheap stat-only call.
  useSubscribe("tasks", () => { void load(); });
  async function load(): Promise<void> {
    if (!window.mc) return;
    try { setFiles(await window.mc.listTaskFiles(task.id)); } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, [task.id]);

  const noteFor = (name: string): string => {
    const stem = name.replace(/\.md$/, "");
    if (stem === task.id) return "task brief / manifest area";
    if (stem === "PROMPT") return "mission brief";
    if (stem === "STATUS") return "progress log";
    if (name.endsWith(".jsonl")) return "event journal";
    if (name.endsWith(".json")) return "manifest";
    return "(other)";
  };

  return (
    <div>
      <h3>Task-linked files</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Live listing of the task folder.
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
      </div>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function RunConfigCard({ runConfig }: { runConfig: Record<string, unknown> | null }): JSX.Element {
  return (
    <section className="card">
      <h3>Run config</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Persisted pre-run settings from the workflow runner (`RUN_CONFIG.json`).
      </p>
      {!runConfig ? (
        <div className="muted" style={{ fontSize: 12, padding: "10px 2px" }}>
          No run config recorded for this task yet.
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
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {JSON.stringify(runConfig, null, 2)}
        </pre>
      )}
    </section>
  );
}

function RunStatusCard({
  task,
  events,
  runConfig,
}: {
  task: Task;
  events: TaskEvent[];
  runConfig: Record<string, unknown> | null;
}): JSX.Element {
  const summary = summarizeRunStatus(task, events);
  const cfg = pickRunConfigHighlights(runConfig);
  return (
    <section className="card">
      <h3>Run status</h3>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <StatusPill label="Run state" value={task.runState} tone={task.runState === "running" ? "warn" : task.runState === "paused" ? "info" : "good"} />
        <StatusPill label="Cycle" value={String(task.cycle)} tone="info" />
        <StatusPill label="Kind" value={task.kind} tone="info" />
      </div>
      <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
        <div><strong>Current step:</strong> {summary.currentStep}</div>
        <div><strong>Step progress:</strong> {summary.completed}/{summary.expected} completed · {summary.failed} failed</div>
        <div><strong>Last transition:</strong> {summary.lastTransition}</div>
      </div>
      {(cfg.workflowPath || cfg.model || cfg.inputsCount !== null) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "grid", gap: 6, fontSize: 12 }}>
          <div className="muted">Run config highlights</div>
          {cfg.workflowPath && <div><strong>Workflow path:</strong> <code>{cfg.workflowPath}</code></div>}
          {cfg.model && <div><strong>Model override:</strong> <code>{cfg.model}</code></div>}
          {cfg.inputsCount !== null && <div><strong>Input fields:</strong> {cfg.inputsCount}</div>}
        </div>
      )}
      {summary.recentEvents.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Recent run events</div>
          <div style={{ display: "grid", gap: 4 }}>
            {summary.recentEvents.map((line) => (
              <div key={line} style={{ fontSize: 12 }}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RunMetricsCard({
  metrics,
  fileName,
}: {
  metrics: Record<string, unknown> | null;
  fileName: string | null;
}): JSX.Element {
  const val = (k: string): string => {
    const v = metrics?.[k];
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4);
    if (typeof v === "string") return v;
    return "—";
  };
  return (
    <section className="card">
      <h3>Run metrics artifact</h3>
      <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        Latest persisted metrics snapshot from <code>artifacts/*.metrics.json</code>.
      </p>
      {!metrics ? (
        <div className="muted" style={{ fontSize: 12, padding: "10px 2px" }}>
          No metrics artifact yet.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
          <div><strong>File:</strong> <code>{fileName ?? "(unknown)"}</code></div>
          <div><strong>Step:</strong> {val("step")} · <strong>Cycle:</strong> {val("cycle")}</div>
          <div><strong>Model:</strong> {val("provider")} {val("model")}</div>
          <div><strong>Tokens:</strong> {val("tokensIn")} in / {val("tokensOut")} out</div>
          <div><strong>Cost:</strong> ${val("costUSD")} · <strong>Wall time:</strong> {val("wallTimeSeconds")}s</div>
          <div><strong>Reason:</strong> {val("reason")}</div>
        </div>
      )}
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "info" | "bad";
}): JSX.Element {
  return (
    <div style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <span className={`pill ${tone}`} style={{ marginRight: 0 }}>{value}</span>
    </div>
  );
}

function summarizeRunStatus(task: Task, events: TaskEvent[]): {
  currentStep: string;
  expected: number;
  completed: number;
  failed: number;
  lastTransition: string;
  recentEvents: string[];
} {
  let currentStep = "(none)";
  let expected = 0;
  let completed = 0;
  let failed = 0;
  let lastTransition = "—";
  const recent: string[] = [];

  for (const event of events) {
    const e = event as Record<string, unknown>;
    const type = String(e["type"] ?? "");
    if (type === "step:start") {
      currentStep = String(e["stepId"] ?? currentStep);
      expected = Number(e["expected"] ?? expected) || expected;
      completed = 0;
      failed = 0;
      lastTransition = `${type} (${currentStep})`;
    } else if (type === "step:agent-end") {
      completed = Number(e["completed"] ?? completed) || completed;
      failed = Number(e["failed"] ?? failed) || failed;
      expected = Number(e["expected"] ?? expected) || expected;
      lastTransition = `${type} (${String(e["agent"] ?? "?")})`;
    } else if (type === "step:end" || type === "run-started" || type === "run-ended" || type === "run-paused" || type === "run-resumed") {
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

function pickRunConfigHighlights(runConfig: Record<string, unknown> | null): {
  workflowPath: string | null;
  model: string | null;
  inputsCount: number | null;
} {
  if (!runConfig) return { workflowPath: null, model: null, inputsCount: null };
  const workflow = runConfig["libraryWorkflow"] as Record<string, unknown> | undefined;
  const settings = runConfig["runSettings"] as Record<string, unknown> | undefined;
  const inputs = (settings?.["inputs"] ?? null) as Record<string, unknown> | null;
  return {
    workflowPath: typeof workflow?.["logicalPath"] === "string" ? String(workflow["logicalPath"]) : null,
    model: typeof settings?.["model"] === "string" ? String(settings["model"]) : null,
    inputsCount: inputs ? Object.keys(inputs).length : null,
  };
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
