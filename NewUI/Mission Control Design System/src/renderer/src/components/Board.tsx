import { useEffect, useState } from "react";

import { useTasks, type BoardStage, type UiTask } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { useLibraryIndex } from "../hooks/useLibraryIndex";
import { usePiModels } from "../hooks/usePiModels";
import { useRoute } from "../router";
import { publish } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
import { TaskCard } from "./TaskCard";
import { SkeletonCard } from "./Skeleton";

const DEFAULT_STAGES: readonly BoardStage[] = ["Draft", "Active", "Attention", "Failed", "Complete"] as const;

function groupByStage(tasks: UiTask[]): Record<BoardStage, UiTask[]> {
  const out: Record<BoardStage, UiTask[]> = {
    Draft: [], Active: [], Attention: [], Failed: [], Complete: [], Archived: [],
  };
  for (const t of tasks) out[t.boardStage].push(t);
  return out;
}

type BoardTab = "kanban" | "drafts";

export function Board(): JSX.Element {
  const { tasks, isDemo, loading } = useTasks();
  const byStage = groupByStage(tasks);
  const archivedCount = byStage.Archived.length;
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<BoardTab>("kanban");

  // Drafts subset per SPEC §2 Option A — boardStage Draft AND cycle 0.
  // Returning-to-idle tasks (cycle > 0) belong on the Kanban under
  // their actual stage, not in the triage list.
  const drafts = tasks.filter((t) => t.boardStage === "Draft" && t.cycle === 0);
  const draftCount = drafts.length;

  return (
    <section className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div role="tablist" aria-label="Board view" style={{ display: "flex", gap: 4 }}>
          <BoardTabButton
            active={tab === "kanban"}
            onClick={() => setTab("kanban")}
          >
            Kanban
          </BoardTabButton>
          <BoardTabButton
            active={tab === "drafts"}
            onClick={() => setTab("drafts")}
          >
            Drafts <span className="muted" style={{ marginLeft: 4 }}>({draftCount})</span>
          </BoardTabButton>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tab === "kanban" && archivedCount > 0 && (
            <button
              className="button ghost"
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? "Hide the Archived lane" : "Reveal archived tasks in a 6th lane"}
              style={{ fontSize: 12 }}
            >
              {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
            </button>
          )}
          {isDemo && <span className="pill warn">Demo</span>}
        </div>
      </div>

      {tab === "kanban" ? (
        <KanbanView byStage={byStage} showArchived={showArchived} loadingCold={loading && tasks.length === 0} />
      ) : (
        <DraftsTable drafts={drafts} isDemo={isDemo} />
      )}
    </section>
  );
}

function BoardTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="button ghost"
      style={{
        fontSize: 13,
        padding: "5px 12px",
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "rgba(110,168,254,0.08)" : "transparent",
        color: active ? "var(--text)" : "var(--muted)",
      }}
    >
      {children}
    </button>
  );
}

function KanbanView({
  byStage,
  showArchived,
  loadingCold,
}: {
  byStage: Record<BoardStage, UiTask[]>;
  showArchived: boolean;
  loadingCold: boolean;
}): JSX.Element {
  const stages: readonly BoardStage[] = showArchived
    ? [...DEFAULT_STAGES, "Archived"]
    : DEFAULT_STAGES;
  return (
    <div className="lane-wrap">
      {stages.map((stage) => (
        <div key={stage} className="lane">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{stage}</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {loadingCold ? "" : byStage[stage].length}
            </span>
          </div>
          {loadingCold ? (
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <>
              {byStage[stage].length === 0 && (
                <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
                  —
                </div>
              )}
              {byStage[stage].map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Drafts triage view — flat cross-project table of draft tasks
 * (boardStage=Draft, cycle=0) with inline workflow + model pickers
 * and a Start button. The point: decide-and-Start in one motion
 * without click-through to Task Detail.
 *
 * Per SPEC §4, picker controls and action buttons are visible per-row
 * (no hover-reveal). The opposite of TaskCard's Trello-style hover
 * actions because Drafts is about *act*, not *scan*.
 */
function DraftsTable({ drafts, isDemo }: { drafts: UiTask[]; isDemo: boolean }): JSX.Element {
  const { setView } = useRoute();
  if (isDemo) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          fontSize: 13,
          color: "var(--muted)",
        }}
      >
        Demo data — create a real task to see drafts here.
      </div>
    );
  }
  if (drafts.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          display: "grid",
          gap: 8,
          justifyItems: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 500 }}>✦ Nothing to triage</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Every task is either running or finished.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="button ghost"
            onClick={() => setView("library")}
          >
            Run from library
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="drafts-table-wrap">
      <table className="drafts-table">
        <thead>
          <tr>
            <th className="col-id">ID</th>
            <th className="col-title">Title</th>
            <th className="col-project">Project</th>
            <th className="col-workflow">Workflow</th>
            <th className="col-model">Model</th>
            <th className="col-created">Created</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((t) => (
            <DraftRow key={t.id} draft={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const AUTO_GEN_VALUE = "__autogen__";

function DraftRow({ draft }: { draft: UiTask }): JSX.Element {
  const { openTask } = useRoute();
  const { projects } = useProjects();
  const { items: libraryItems } = useLibraryIndex();
  const { models } = usePiModels();

  const project = projects.find((p) => p.id === draft.projectId);
  const workflows = libraryItems.filter((i) => i.kind === "workflow");

  const [workflowPath, setWorkflowPath] = useState<string>(AUTO_GEN_VALUE);
  const [modelId, setModelId] = useState<string>("");
  const [busy, setBusy] = useState<"none" | "workflow" | "model" | "start">("none");
  const [hasInputsSchema, setHasInputsSchema] = useState(false);

  // Hydrate dropdowns from RUN_CONFIG on mount so the row reflects
  // the persisted state (e.g. user picked a workflow, navigated away,
  // came back — the row should show that workflow already).
  useEffect(() => {
    if (!window.mc) return;
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await window.mc.readTaskRunConfig(draft.id);
        if (cancelled) return;
        if (cfg) {
          const lw = cfg["libraryWorkflow"] as { logicalPath?: unknown } | null | undefined;
          if (lw && typeof lw.logicalPath === "string") {
            setWorkflowPath(lw.logicalPath);
          }
          const rs = cfg["runSettings"] as { model?: unknown } | undefined;
          if (rs && typeof rs.model === "string") {
            setModelId(rs.model);
          }
        }
      } catch {
        // silent — hydration is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [draft.id]);

  // Note when the picked workflow has an inputsSchemaPath so we can
  // surface the "Configure inputs ▸" link. The link routes the user to
  // Task Detail's Workflow… modal where the schema form already exists.
  useEffect(() => {
    if (workflowPath === AUTO_GEN_VALUE) {
      setHasInputsSchema(false);
      return;
    }
    const wf = workflows.find((w) => w.logicalPath === workflowPath);
    setHasInputsSchema(Boolean(wf?.inputsSchemaPath));
  }, [workflowPath, workflows]);

  async function onWorkflowChange(value: string): Promise<void> {
    setWorkflowPath(value);
    if (!window.mc) return;
    try {
      setBusy("workflow");
      const existing = (await window.mc.readTaskRunConfig(draft.id)) ?? {};
      if (value === AUTO_GEN_VALUE) {
        await window.mc.writeTaskRunConfig(draft.id, {
          ...existing,
          kind: "library-workflow-run",
          libraryWorkflow: null,
        });
      } else {
        const wf = workflows.find((w) => w.logicalPath === value);
        if (!wf) return;
        const rs = (existing["runSettings"] as Record<string, unknown> | undefined) ?? {};
        await window.mc.writeTaskRunConfig(draft.id, {
          ...existing,
          kind: "library-workflow-run",
          libraryWorkflow: {
            logicalPath: wf.logicalPath,
            name: wf.name,
            diskPath: wf.diskPath,
            inputsSchemaPath: wf.inputsSchemaPath ?? null,
          },
          runSettings: {
            ...rs,
            inputs: rs["inputs"] ?? {},
          },
        });
      }
      publish("tasks");
    } catch (err) {
      pushErrorToast("Couldn't save workflow choice", err, draft.id);
    } finally {
      setBusy("none");
    }
  }

  async function onModelChange(value: string): Promise<void> {
    setModelId(value);
    if (!window.mc) return;
    try {
      setBusy("model");
      const existing = (await window.mc.readTaskRunConfig(draft.id)) ?? {};
      const rs = (existing["runSettings"] as Record<string, unknown> | undefined) ?? {};
      await window.mc.writeTaskRunConfig(draft.id, {
        ...existing,
        runSettings: {
          ...rs,
          model: value || null,
        },
      });
      publish("tasks");
    } catch (err) {
      pushErrorToast("Couldn't save model choice", err, draft.id);
    } finally {
      setBusy("none");
    }
  }

  async function onStart(): Promise<void> {
    if (!window.mc) return;
    try {
      setBusy("start");
      await window.mc.startRun({
        taskId: draft.id,
        ...(modelId ? { model: modelId } : {}),
      });
      publish("tasks");
    } catch (err) {
      pushErrorToast("Start failed", err, draft.id);
    } finally {
      setBusy("none");
    }
  }

  const created = new Date(draft.updatedAt).getTime();
  const ago = formatRelative(Date.now() - created);

  // Start is enabled when the user has explicitly chosen something —
  // either a real workflow or auto-generate. The dropdown defaults to
  // auto-gen so this is essentially "always enabled," which matches
  // the existing Start behavior on Task Detail.
  const startReady = !busy;

  return (
    <tr>
      <td className="col-id">
        <button
          className="button ghost"
          onClick={() => openTask(draft.id)}
          style={{ fontSize: 12, padding: "2px 8px", fontFamily: "var(--mono, monospace)" }}
          title="Open Task Detail"
        >
          {draft.id}
        </button>
      </td>
      <td
        className="col-title"
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={draft.summary}
      >
        {draft.summary}
      </td>
      <td className="col-project">
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, minWidth: 0 }} title={project?.name ?? draft.projectId}>
          {(project?.icon || draft.projectIcon) && (
            <span style={{ fontSize: 14, flex: "0 0 auto" }}>{project?.icon || draft.projectIcon}</span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {project?.name ?? draft.projectId}
          </span>
        </div>
      </td>
      <td className="col-workflow">
        <div style={{ display: "grid", gap: 2 }}>
          <select
            value={workflowPath}
            onChange={(e) => void onWorkflowChange(e.target.value)}
            disabled={busy !== "none"}
            style={selectStyle}
            aria-label={`Workflow for ${draft.id}`}
          >
            <option value={AUTO_GEN_VALUE}>Auto-generate (no workflow)</option>
            {workflows.map((w) => (
              <option key={w.logicalPath} value={w.logicalPath}>
                {w.name}
              </option>
            ))}
          </select>
          {hasInputsSchema && (
            <button
              className="button ghost"
              onClick={() => openTask(draft.id)}
              style={{ fontSize: 10, padding: "1px 6px", justifySelf: "start" }}
              title="Open Task Detail to fill the workflow's inputs schema"
            >
              Configure inputs ▸
            </button>
          )}
        </div>
      </td>
      <td className="col-model">
        <select
          value={modelId}
          onChange={(e) => void onModelChange(e.target.value)}
          disabled={busy !== "none"}
          style={selectStyle}
          aria-label={`Model for ${draft.id}`}
        >
          <option value="">(pi default)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </td>
      <td className="col-created" style={{ color: "var(--muted)", fontSize: 12 }}>
        {ago}
      </td>
      <td className="col-actions">
        <div style={{ display: "inline-flex", gap: 4 }}>
          <button
            className="button"
            onClick={() => void onStart()}
            disabled={!startReady}
            style={{ fontSize: 12, padding: "3px 10px" }}
          >
            {busy === "start" ? "Starting…" : "▶ Start"}
          </button>
          <button
            className="button ghost"
            onClick={() => openTask(draft.id)}
            style={{ fontSize: 12, padding: "3px 8px" }}
            title="Open Task Detail"
          >
            ↗
          </button>
        </div>
      </td>
    </tr>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "3px 6px",
  fontSize: 12,
  fontFamily: "inherit",
  width: "100%",
  // Column widths constrain the actual rendered size; this just stops
  // selects from overflowing on long workflow names.
  maxWidth: "100%",
};

/** "3h ago" / "2d ago" / "just now". Same heuristic as TaskCard's idle indicator. */
function formatRelative(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = ms / 60_000;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
