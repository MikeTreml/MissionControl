/**
 * RunManager — owns task run state transitions.
 *
 * Single tasks: Start opens one pi session driven by /babysit, agent_end
 * flips the task to idle. Pause/Resume are MC-level only (they don't
 * touch the pi session) — pi has no first-class pause primitive.
 *
 * Campaign tasks (`task.kind === "campaign"`): Start kicks off the
 * iteration. Each item gets its own pi session — when one finishes the
 * next pending item starts automatically. Task.runState stays "running"
 * across the whole campaign; flips to "idle" only when every item is
 * done OR the user stops. Stop marks any "running" item as "failed".
 *
 * ── PI-WIRE: campaign prompting ─────────────────────────────────────────
 * Today every campaign item invokes /babysit with the item's description.
 * Babysitter generates its own per-item process.js. A future enhancement
 * could pre-author a campaign-specific process.js (with cross-item
 * lessons + checkpoint-every-N) — see docs/IDEAS-WORTH-BORROWING.md.
 */
import { existsSync } from "node:fs";

import type { TaskStore } from "./store.ts";
import type { ProjectStore } from "./project-store.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { AgentLoader } from "./agent-loader.ts";
import { renderPromptFile } from "./render-prompt.ts";
import type { CampaignItem, RunState, Task } from "../shared/models.ts";

export type StopReason = "user" | "completed" | "failed";

export class RunManager {
  private readonly tasks: TaskStore;
  private readonly projects: ProjectStore | null;
  private readonly pi: PiSessionManager | null;
  private readonly agents: AgentLoader | null;

  constructor(
    tasks: TaskStore,
    pi?: PiSessionManager | null,
    agents?: AgentLoader | null,
    projects?: ProjectStore | null,
  ) {
    this.tasks = tasks;
    this.pi = pi ?? null;
    this.agents = agents ?? null;
    this.projects = projects ?? null;
  }

  async start(input: {
    taskId: string;
    agentSlug?: string;
    model?: string;
  }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "idle", "start");

    // Per-task active model — held in memory so completeRun can pass it
    // to the next campaign item without the renderer needing to re-send.
    if (input.model) this.activeModel.set(task.id, input.model);

    if (task.kind === "campaign") {
      return this.startCampaign(task, input);
    }
    return this.startSingle(task, input);
  }

  /** Single-task path: one /babysit run, agent_end flips task to idle. */
  private async startSingle(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    if (this.pi) {
      const agentSlug = input.agentSlug ?? task.currentAgentSlug;
      const cwd = await this.resolveCwd(task);
      await this.tasks.writePromptFile(task.id, renderPromptFile(task, agentSlug));
      await this.pi.start(task.id, {
        prompt: buildBabysitPrompt(task, agentSlug),
        cwd,
        ...(input.model ? { model: input.model } : {}),
      });
    }
    const next: Task = {
      ...task,
      runState: "running",
      currentAgentSlug: input.agentSlug ?? task.currentAgentSlug,
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      agentSlug: next.currentAgentSlug,
    });
    await this.tasks.appendStatus(
      task.id,
      `Started — agent: ${next.currentAgentSlug ?? "(none)"}`,
    );
    return next;
  }

  /**
   * Campaign path: kick off the first pending item. Subsequent items are
   * started by `completeRun` as each finishes. The task stays in
   * runState="running" across the whole campaign.
   */
  private async startCampaign(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    const pendingIdx = task.items.findIndex((i) => i.status === "pending");
    if (pendingIdx === -1) {
      // Nothing to do — flip to idle so the UI doesn't get stuck.
      await this.tasks.appendStatus(task.id, "Campaign has no pending items");
      return task;
    }

    // Mark the chosen item as running, save, then start pi for it.
    const items = task.items.slice();
    items[pendingIdx] = { ...items[pendingIdx]!, status: "running" };
    const next: Task = {
      ...task,
      runState: "running",
      currentAgentSlug: input.agentSlug ?? task.currentAgentSlug,
      items,
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      agentSlug: next.currentAgentSlug,
    });
    await this.tasks.appendStatus(
      task.id,
      `Campaign started — ${pendingItemCount(next)} of ${next.items.length} pending`,
    );
    await this.startCampaignItem(next, items[pendingIdx]!, input.model);
    return next;
  }

  /** Open a pi session focused on a single campaign item. */
  private async startCampaignItem(task: Task, item: CampaignItem, model?: string): Promise<void> {
    if (!this.pi) return;
    const cwd = await this.resolveCwd(task);
    const m = model ?? this.activeModel.get(task.id);
    await this.tasks.writePromptFile(task.id, renderPromptFile(task, task.currentAgentSlug));
    await this.tasks.appendEvent(task.id, { type: "item-started", itemId: item.id });
    await this.tasks.appendStatus(task.id, `Item ${item.id} started — ${item.description}`);
    await this.pi.start(task.id, {
      prompt: buildItemBabysitPrompt(task, item),
      cwd,
      ...(m ? { model: m } : {}),
    });
  }

  /**
   * Called by PiSessionManager when pi completes (or errors) a prompt.
   *
   * Single tasks: flip to idle with the exit reason.
   *
   * Campaign tasks: mark the running item as done/failed; if more pending
   * items remain, kick off the next one and STAY in running. Otherwise
   * flip the whole task to idle.
   */
  async completeRun(
    taskId: string,
    reason: StopReason,
  ): Promise<void> {
    const task = await this.tasks.getTask(taskId);
    if (!task || task.runState === "idle") return;

    if (task.kind === "campaign") {
      await this.completeCampaignItem(task, reason);
      return;
    }

    // Single task — original behavior.
    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason,
    });
    await this.tasks.appendStatus(task.id, `Run ended — ${reason}`);
    this.activeModel.delete(task.id);
  }

  private async completeCampaignItem(task: Task, reason: StopReason): Promise<void> {
    // Find the running item; mark it done or failed based on exit reason.
    const idx = task.items.findIndex((i) => i.status === "running");
    if (idx === -1) {
      // Defensive: no running item to close out. Treat as fully done.
      await this.finalizeCampaign(task, reason);
      return;
    }

    const items = task.items.slice();
    const finishedItem = items[idx]!;
    const newStatus: CampaignItem["status"] = reason === "completed" ? "done" : "failed";
    items[idx] = {
      ...finishedItem,
      status: newStatus,
      notes: reason === "completed" ? finishedItem.notes : `${finishedItem.notes}\n[run reason: ${reason}]`.trim(),
    };

    const updated: Task = { ...task, items };
    await this.tasks.saveTask(updated);
    await this.tasks.appendEvent(task.id, {
      type: "item-ended",
      itemId: finishedItem.id,
      reason,
    });
    await this.tasks.appendStatus(
      task.id,
      `Item ${finishedItem.id} ${newStatus} — ${pendingItemCount(updated)} pending`,
    );

    // More items pending? Start the next one. Else finalize.
    const nextPending = items.find((i) => i.status === "pending");
    if (nextPending) {
      const items2 = items.slice();
      const nextIdx = items2.findIndex((i) => i.id === nextPending.id);
      items2[nextIdx] = { ...nextPending, status: "running" };
      const stepped: Task = { ...updated, items: items2 };
      await this.tasks.saveTask(stepped);
      await this.startCampaignItem(stepped, items2[nextIdx]!);
      return;
    }

    await this.finalizeCampaign(updated, reason);
  }

  private async finalizeCampaign(task: Task, _reason: StopReason): Promise<void> {
    const failed = task.items.filter((i) => i.status === "failed").length;
    const done = task.items.filter((i) => i.status === "done").length;
    const finalReason: StopReason = failed > 0 && done === 0 ? "failed" : "completed";
    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-ended", reason: finalReason });
    await this.tasks.appendStatus(
      task.id,
      `Campaign ended — ${done}/${task.items.length} done, ${failed} failed`,
    );
    this.activeModel.delete(task.id);
  }

  async pause(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "running", "pause");

    const next: Task = { ...task, runState: "paused" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-paused" });
    await this.tasks.appendStatus(task.id, "Paused");
    return next;
  }

  async resume(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "paused", "resume");

    const next: Task = { ...task, runState: "running" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-resumed" });
    await this.tasks.appendStatus(task.id, "Resumed");
    return next;
  }

  async stop(input: { taskId: string; reason?: StopReason }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    if (task.runState === "idle") {
      throw new Error(`Task "${task.id}" is already idle`);
    }

    // For campaigns: mark any running item as failed before the state flip,
    // so the UI doesn't show an item stuck in "running" after a Stop click.
    let next: Task;
    if (task.kind === "campaign") {
      const items = task.items.map((i) =>
        i.status === "running"
          ? { ...i, status: "failed" as const, notes: `${i.notes}\n[stopped by user]`.trim() }
          : i,
      );
      next = { ...task, runState: "idle", items };
    } else {
      next = { ...task, runState: "idle" };
    }
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason: input.reason ?? "user",
    });
    await this.tasks.appendStatus(task.id, `Stopped (${input.reason ?? "user"})`);

    // Best-effort pi cleanup — don't let a dispose failure undo the state
    // flip the UI already relied on.
    if (this.pi) {
      await this.pi.stop(task.id);
    }
    this.activeModel.delete(task.id);
    return next;
  }

  // ── internals ────────────────────────────────────────────────────────

  /** Per-task model selection, kept in memory across campaign items. */
  private readonly activeModel = new Map<string, string>();

  private async requireTask(id: string): Promise<Task> {
    const task = await this.tasks.getTask(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    return task;
  }

  /**
   * Resolve workspace cwd. Prefer project.path when set so pi can see
   * the real codebase; fall back to per-task scratch workspace.
   */
  private async resolveCwd(task: Task): Promise<string> {
    const project = this.projects ? await this.projects.getProject(task.project) : null;
    const projectPath = project?.path?.trim();
    if (projectPath && existsSync(projectPath)) return projectPath;
    return this.tasks.ensureWorkspace(task.id);
  }

  private assertTransition(
    current: RunState,
    expected: RunState,
    action: string,
  ): void {
    if (current !== expected) {
      throw new Error(
        `Cannot ${action} task in runState "${current}" (expected "${expected}")`,
      );
    }
  }
}

function pendingItemCount(task: Task): number {
  return task.items.filter((i) => i.status === "pending").length;
}

/**
 * Build the `/babysit` prompt — a short task brief that babysitter-pi's
 * skill ingests and turns into an orchestrated multi-agent run
 * (Planner → Developer → Reviewer → Surgeon, with loopbacks and
 * mandatory stops). Babysitter generates its own process.js from this
 * brief and writes it to `.a5c/processes/` in the session's cwd.
 *
 * Kept concise: babysitter reads `tasks/<id>/PROMPT.md` (written by
 * RunManager.start via writePromptFile) for the full mission, so we
 * don't need to duplicate the description inline.
 */
function buildBabysitPrompt(task: Task, agentSlug: string | null): string {
  const lines = [
    `/babysit ${task.title}`,
    "",
    task.description || "(no description)",
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Workflow: ${task.workflow} (cycle ${task.cycle})`,
    `Suggested starting agent: ${agentSlug ?? "planner"}`,
    "",
    "Orchestrate the full workflow: plan, implement, review, finalize.",
    "Loop back on review rejection; stop at human approval gates.",
    "",
    "## File naming convention",
    "",
    `When phase agents produce artifacts, save them in this folder using the`,
    `task-id + agent-code suffix convention so Mission Control's UI can`,
    `link them automatically:`,
    "",
    `  - Planner output    → ${task.id}-p.md`,
    `  - Developer output  → ${task.id}-d.md`,
    `  - Reviewer output   → ${task.id}-r.md`,
    `  - Surgeon output    → ${task.id}-s.md`,
    `  - Subagent output   → ${task.id}-<2-4 char code>.md (e.g. -rmp, -drf)`,
    "",
    `Babysitter's own scaffolding (process.js, run journals) can stay`,
    `under .a5c/ — that's expected. The convention applies to per-agent`,
    `MARKDOWN deliverables that humans read.`,
  ];
  return lines.join("\n");
}

/**
 * Per-item /babysit prompt for a campaign task. Each item gets its own
 * pi session — RunManager loops items[] in completeRun and calls this
 * for the next pending one. Item description is the user prompt;
 * task.title gives shared context for cross-item lessons.
 */
function buildItemBabysitPrompt(task: Task, item: CampaignItem): string {
  const total = task.items.length;
  const idx = task.items.findIndex((i) => i.id === item.id);
  return [
    `/babysit ${task.title} — item ${item.id} (${idx + 1}/${total})`,
    "",
    item.description,
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Campaign workflow: ${task.workflow}`,
    `Item index: ${idx + 1} of ${total}`,
    "",
    "Process this single item. When done, summarize what you produced.",
    "The orchestrator iterates the remaining items after this one ends.",
  ].join("\n");
}

