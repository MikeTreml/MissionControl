/**
 * One task card on the board. Matches the v2 design-canvas markup
 * (NewUI/Mission Control Design System/ui_kits/mission-control/index.html):
 *
 *   .task[data-proj]
 *     .head
 *       .tid (.pfx + rest)
 *       .pill <state>
 *     .summary
 *     .step
 *     .row
 *       .agent
 *       .spacer
 *       <elapsed/idle>
 *
 * The project's hashed accent color is injected as `--task-accent` so the
 * left-edge bleed picks it up without any per-card CSS.
 */
import { useState } from "react";

import type { UiTask } from "../hooks/useTasks";
import { shortModelLabel } from "../lib/derive-runs";
import { useRoute } from "../router";
import { publish } from "../hooks/data-bus";
import { pushErrorToast } from "../hooks/useToasts";
import { colorForKey } from "../lib/color-hash";

const TASK_ID_RE = /^([A-Z0-9]+)-(\d+[A-Z]?)$/;

function splitTaskId(id: string): { pfx: string; rest: string } {
  const m = TASK_ID_RE.exec(id);
  return m ? { pfx: m[1]!, rest: `-${m[2]!}` } : { pfx: "", rest: id };
}

function formatIdleSince(updatedAt: string): string | null {
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = ms / 60_000;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function TaskCard({ task }: { task: UiTask }): JSX.Element {
  const { openTask } = useRoute();
  const modelLabel = shortModelLabel(task.currentModel);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const isArchived = task.status === "archived";
  const isRunning = task.runState === "running";
  const { pfx, rest } = splitTaskId(task.id);
  const accent = pfx ? colorForKey(pfx) : "transparent";
  const ago = formatIdleSince(task.updatedAt);

  async function toggleArchive(e: React.MouseEvent): Promise<void> {
    e.stopPropagation();
    if (!window.mc) return;
    try {
      setArchiveBusy(true);
      const full = await window.mc.getTask(task.id);
      if (!full) {
        pushErrorToast("Archive failed", "task not found", task.id);
        return;
      }
      await window.mc.saveTask({
        ...full,
        status: isArchived ? "active" : "archived",
        updatedAt: new Date().toISOString(),
      });
      publish("tasks");
    } catch (err) {
      pushErrorToast(isArchived ? "Unarchive failed" : "Archive failed", err, task.id);
    } finally {
      setArchiveBusy(false);
    }
  }

  const cls = [
    "task",
    "bleed",
    isRunning ? "running" : "",
    task.active ? "active" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      data-proj
      style={{ ["--task-accent" as string]: accent }}
      onClick={() => openTask(task.id)}
    >
      <div className="hover-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => void toggleArchive(e)}
          disabled={archiveBusy}
          title={isArchived ? "Restore this task to the active board" : "Archive — hide from default board"}
        >
          {archiveBusy ? "…" : isArchived ? "↩" : "📦"}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openTask(task.id); }}
          title="Open Task Detail"
        >
          ↗
        </button>
      </div>

      <div className="head">
        <span className="tid">
          {pfx && <span className="pfx">{pfx}</span>}{rest}
        </span>
        <span className={`pill ${task.rolePill}`} style={{ marginLeft: "auto" }}>
          {isRunning && <span className="dot" />}
          {task.roleLabel.toLowerCase()}
        </span>
        {task.projectIcon && (
          <span style={{ marginLeft: 4, fontSize: 14, lineHeight: 1 }}>
            {task.projectIcon}
          </span>
        )}
      </div>

      <div className="summary">{task.summary}</div>

      {task.stepLine && <div className="step">{task.stepLine}</div>}
      {task.sub && <div className="step">{task.sub}</div>}

      <div className="row">
        {modelLabel && (
          <div className="agent" title={`Model: ${task.currentModel}`}>
            {modelLabel}
          </div>
        )}
        <span className="spacer" />
        {ago && (
          <span title={`Last updated ${new Date(task.updatedAt).toLocaleString()}`}>
            {ago}
          </span>
        )}
      </div>
    </div>
  );
}
