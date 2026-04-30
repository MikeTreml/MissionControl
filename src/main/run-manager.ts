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
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import type { TaskStore } from "./store.ts";
import type { ProjectStore } from "./project-store.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { SettingsStore } from "./settings-store.ts";
import { renderPromptFile } from "./render-prompt.ts";
import { writeLatestRunMetricsArtifact } from "./run-cost-tracker.ts";
import type { CampaignItem, MCSettings, RunState, Task } from "../shared/models.ts";

/**
 * Resolve the path to the babysitter SDK CLI (`bin/babysitter`).
 * Goes through Node's resolver so it works in dev and packaged builds.
 */
function resolveBabysitterCliPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@a5c-ai/babysitter-sdk/package.json");
    return path.join(path.dirname(pkgPath), "dist/cli/main.js");
  } catch {
    return null;
  }
}

export type StopReason = "user" | "completed" | "failed";

interface ParallelStepState {
  stepId: string;
  cycle: number;
  agents: string[];
  expected: number;
  completed: number;
  failed: number;
  seen: Set<string>;
  ended: boolean;
  stopOnFirstFailure: boolean;
}

export class RunManager {
  private readonly tasks: TaskStore;
  private readonly projects: ProjectStore | null;
  private readonly pi: PiSessionManager | null;
  private readonly settings: SettingsStore | null;

  constructor(
    tasks: TaskStore,
    pi?: PiSessionManager | null,
    _legacyAgents?: unknown,
    projects?: ProjectStore | null,
    settings?: SettingsStore | null,
  ) {
    this.tasks = tasks;
    this.pi = pi ?? null;
    this.projects = projects ?? null;
    this.settings = settings ?? null;
  }

  async start(input: {
    taskId: string;
    agentSlug?: string;
    model?: string;
  }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "idle", "start");

    const queueState = await this.shouldQueueStart(task.id);
    if (queueState.shouldQueue) {
      if (!this.queuedTaskIds.has(task.id)) {
        this.startQueue.push({ ...input });
        this.queuedTaskIds.add(task.id);
      }
      const position = this.startQueue.findIndex((q) => q.taskId === task.id) + 1;
      await this.tasks.appendEvent(task.id, {
        type: "run-queued",
        position,
        cap: queueState.cap,
        running: queueState.running,
      });
      await this.tasks.appendStatus(task.id, `Queued — waiting for open run slot (${queueState.running}/${queueState.cap} running)`);
      return task;
    }
    return this.startNow(task, input);
  }

  private async startNow(
    task: Task,
    input: {
      taskId: string;
      agentSlug?: string;
      model?: string;
    },
  ): Promise<Task> {
    // Per-task active model — held in memory so completeRun can pass it
    // to the next campaign item without the renderer needing to re-send.
    if (input.model) this.activeModel.set(task.id, input.model);

    // Curated library workflow takes precedence over the auto-gen
    // /babysit path. The runConfig sidecar is written by RunWorkflowModal
    // when the user picks a workflow from the library.
    const curatedPath = await this.curatedWorkflowPath(task);
    if (curatedPath) {
      return this.startCuratedWorkflow(task, curatedPath, input);
    }

    if (task.kind === "campaign") {
      return this.startCampaign(task, input);
    }
    return this.startSingle(task, input);
  }

  /**
   * If the task's run config sidecar names a library workflow with a
   * resolvable disk path, return that path. Otherwise null = take the
   * legacy auto-gen path.
   */
  private async curatedWorkflowPath(task: Task): Promise<string | null> {
    const cfg = await this.tasks.readRunConfig(task.id);
    if (!cfg) return null;
    const lw = (cfg as { libraryWorkflow?: { diskPath?: string } }).libraryWorkflow;
    if (!lw?.diskPath) return null;
    if (!existsSync(lw.diskPath)) return null;
    return lw.diskPath;
  }

  /**
   * Spawn `babysitter harness:create-run --process <path>` directly.
   * Phase 1 (auto-gen) is skipped because we supply the workflow.js. The
   * CLI emits JSON lines on stdout (phase markers, errors); we forward
   * them into the task's events.jsonl as `bs:*` events so the live-
   * events bridge picks them up.
   */
  private async startCuratedWorkflow(
    task: Task,
    processPath: string,
    input: { model?: string },
  ): Promise<Task> {
    const cliPath = resolveBabysitterCliPath();
    if (!cliPath) {
      await this.tasks.appendStatus(task.id, "Curated workflow start failed: babysitter SDK not installed");
      return task;
    }

    const cwd = await this.resolveCwd(task);
    const runsDir = path.join(cwd, ".a5c", "runs");
    await fs.mkdir(runsDir, { recursive: true });

    const args = [
      cliPath,
      "harness:create-run",
      "--process", processPath,
      "--harness", "pi",
      "--workspace", cwd,
      "--runs-dir", runsDir,
      "--non-interactive",
      "--json",
    ];
    if (input.model) args.push("--model", input.model);

    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      mode: "curated",
      processPath,
      cwd,
    });
    await this.tasks.appendStatus(
      task.id,
      `Started — curated workflow ${path.basename(path.dirname(processPath))}`,
    );

    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const onLine = (chunk: Buffer | string, stream: "stdout" | "stderr"): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        let parsed: unknown = null;
        try { parsed = JSON.parse(line); } catch { /* not JSON */ }
        void this.tasks.appendEvent(task.id, {
          type: parsed && typeof parsed === "object" ? "bs:event" : `bs:${stream}`,
          ...(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { line }),
        });
      }
    };
    child.stdout?.on("data", (c) => onLine(c, "stdout"));
    child.stderr?.on("data", (c) => onLine(c, "stderr"));
    child.on("exit", (code) => {
      const reason: StopReason = code === 0 ? "completed" : "failed";
      void this.completeRun(task.id, reason);
    });

    const next: Task = { ...task, runState: "running" };
    await this.tasks.saveTask(next);
    return next;
  }

  /** Single-task path: one /babysit run, agent_end flips task to idle. */
  private async startSingle(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    const chosenAgent = input.agentSlug ?? null;
    if (this.pi) {
      const cwd = await this.resolveCwd(task);
      const mode = (await this.settings?.get())?.babysitterMode ?? "plan";
      await this.tasks.writePromptFile(task.id, renderPromptFile(task, chosenAgent));
      const beforeRuns = await snapshotBabysitterRuns(cwd);
      await this.pi.start(task.id, {
        prompt: buildBabysitPrompt(task, chosenAgent, mode),
        cwd,
        ...(input.model ? { model: input.model } : {}),
      });
      void this.detectBabysitterRun(task.id, cwd, beforeRuns);
    }
    const next: Task = {
      ...task,
      runState: "running",
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      ...(chosenAgent ? { agentSlug: chosenAgent } : {}),
    });
    await this.tasks.appendStatus(
      task.id,
      `Started — cycle ${next.cycle}${chosenAgent ? ` · agent: ${chosenAgent}` : ""}`,
    );
    return next;
  }

  /**
   * Campaign path: kick off the first pending item. Subsequent items are
   * started by `completeRun` as each finishes. The task stays in
   * runState="running" across the whole campaign.
   */
  private async startCampaign(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    const chosenAgent = input.agentSlug ?? null;
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
      items,
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      ...(chosenAgent ? { agentSlug: chosenAgent } : {}),
    });
    await this.tasks.appendStatus(
      task.id,
      `Campaign started — cycle ${next.cycle} · ${pendingItemCount(next)} of ${next.items.length} pending`,
    );
    await this.startCampaignItem(next, items[pendingIdx]!, input.model);
    return next;
  }

  /** Open a pi session focused on a single campaign item. */
  private async startCampaignItem(task: Task, item: CampaignItem, model?: string): Promise<void> {
    if (!this.pi) return;
    const cwd = await this.resolveCwd(task);
    const m = model ?? this.activeModel.get(task.id);
    const mode = (await this.settings?.get())?.babysitterMode ?? "plan";
    await this.tasks.writePromptFile(task.id, renderPromptFile(task, null));
    await this.tasks.appendEvent(task.id, { type: "item-started", itemId: item.id });
    await this.tasks.appendStatus(task.id, `Item ${item.id} started — cycle ${task.cycle} · ${item.description}`);
    await this.pi.start(task.id, {
      prompt: buildItemBabysitPrompt(task, item, mode),
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
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(task.id, `Run ended — cycle ${task.cycle} · ${reason}`);
    this.activeModel.delete(task.id);
    await this.startQueuedIfCapacity();
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
      `Item ${finishedItem.id} ${newStatus} — cycle ${task.cycle} · ${pendingItemCount(updated)} pending`,
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
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(
      task.id,
      `Campaign ended — cycle ${task.cycle} · ${done}/${task.items.length} done, ${failed} failed`,
    );
    this.activeModel.delete(task.id);
    await this.startQueuedIfCapacity();
  }

  async pause(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "running", "pause");

    if (this.pi) {
      await this.pi.steer(task.id, "[paused by user — wait for resume signal]");
      await this.tasks.appendEvent(task.id, {
        type: "pi:steer-sent",
        reason: "pause",
        message: "[paused by user — wait for resume signal]",
      });
    }

    const next: Task = { ...task, runState: "paused" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-paused" });
    await this.tasks.appendStatus(task.id, `Paused — cycle ${task.cycle}`);
    await this.startQueuedIfCapacity();
    return next;
  }

  async resume(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "paused", "resume");

    if (this.pi) {
      await this.pi.followUp(task.id, "[resumed — continue from where you left off]");
      await this.tasks.appendEvent(task.id, {
        type: "pi:steer-sent",
        reason: "resume",
        message: "[resumed — continue from where you left off]",
      });
    }

    const next: Task = { ...task, runState: "running", blocker: "" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-resumed" });
    await this.tasks.appendStatus(task.id, task.blocker ? `Resumed — cycle ${task.cycle} · cleared waiting reason` : `Resumed — cycle ${task.cycle}`);
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
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(task.id, `Stopped — cycle ${task.cycle} (${input.reason ?? "user"})`);

    // Best-effort pi cleanup — don't let a dispose failure undo the state
    // flip the UI already relied on.
    if (this.pi) {
      await this.pi.stop(task.id);
    }
    this.activeModel.delete(task.id);
    this.parallelSteps.delete(task.id);
    await this.startQueuedIfCapacity();
    return next;
  }

  async startParallelStep(input: {
    taskId: string;
    stepId: string;
    agents: string[];
    cycle?: number;
    stopOnFirstFailure?: boolean;
  }): Promise<void> {
    const task = await this.requireTask(input.taskId);
    const agents = [...new Set(input.agents.map((a) => a.trim()).filter(Boolean))];
    if (agents.length === 0) throw new Error(`Parallel step "${input.stepId}" needs at least one agent`);
    const key = stepKey(input.stepId, input.cycle ?? task.cycle);
    const byTask = this.parallelSteps.get(task.id) ?? new Map<string, ParallelStepState>();
    if (byTask.has(key)) throw new Error(`Parallel step "${input.stepId}" already active for cycle ${input.cycle ?? task.cycle}`);
    byTask.set(key, {
      stepId: input.stepId,
      cycle: input.cycle ?? task.cycle,
      agents,
      expected: agents.length,
      completed: 0,
      failed: 0,
      seen: new Set(),
      ended: false,
      stopOnFirstFailure: input.stopOnFirstFailure ?? false,
    });
    this.parallelSteps.set(task.id, byTask);
    await this.tasks.appendEvent(task.id, {
      type: "step:start",
      stepId: input.stepId,
      cycle: input.cycle ?? task.cycle,
      expected: agents.length,
      agents,
    });
  }

  async recordParallelAgentEnd(input: {
    taskId: string;
    stepId: string;
    agent: string;
    status: "ok" | "failed";
    cycle?: number;
    outputPath?: string;
    error?: string;
  }): Promise<{ done: boolean; status?: "ok" | "partial" | "aborted"; completed: number; failed: number; expected: number }> {
    const task = await this.requireTask(input.taskId);
    const cycle = input.cycle ?? task.cycle;
    const key = stepKey(input.stepId, cycle);
    const byTask = this.parallelSteps.get(task.id);
    const state = byTask?.get(key);
    if (!state) throw new Error(`Parallel step "${input.stepId}" is not active for cycle ${cycle}`);
    if (state.ended) {
      return { done: true, status: state.failed === 0 ? "ok" : state.stopOnFirstFailure ? "aborted" : "partial", completed: state.completed, failed: state.failed, expected: state.expected };
    }
    if (state.seen.has(input.agent)) {
      throw new Error(`Parallel step "${input.stepId}" already recorded agent "${input.agent}" for cycle ${cycle}`);
    }
    state.seen.add(input.agent);
    if (input.status === "ok") state.completed += 1;
    else state.failed += 1;

    await this.tasks.appendEvent(task.id, {
      type: "step:agent-end",
      stepId: input.stepId,
      cycle,
      agent: input.agent,
      status: input.status,
      completed: state.completed,
      failed: state.failed,
      expected: state.expected,
      ...(input.outputPath ? { outputPath: input.outputPath } : {}),
      ...(input.error ? { error: input.error } : {}),
    });

    const total = state.completed + state.failed;
    const shouldAbort = input.status === "failed" && state.stopOnFirstFailure;
    if (!shouldAbort && total < state.expected) {
      return { done: false, completed: state.completed, failed: state.failed, expected: state.expected };
    }

    const endStatus: "ok" | "partial" | "aborted" =
      state.failed === 0 ? "ok" : state.stopOnFirstFailure ? "aborted" : "partial";
    state.ended = true;
    await this.tasks.appendEvent(task.id, {
      type: "step:end",
      stepId: input.stepId,
      cycle,
      status: endStatus,
      completed: state.completed,
      failed: state.failed,
      expected: state.expected,
    });
    byTask?.delete(key);
    if (byTask && byTask.size === 0) this.parallelSteps.delete(task.id);
    return { done: true, status: endStatus, completed: state.completed, failed: state.failed, expected: state.expected };
  }

  // ── internals ────────────────────────────────────────────────────────

  /** Per-task model selection, kept in memory across campaign items. */
  private readonly activeModel = new Map<string, string>();
  private readonly parallelSteps = new Map<string, Map<string, ParallelStepState>>();
  private readonly startQueue: Array<{ taskId: string; agentSlug?: string; model?: string }> = [];
  private readonly queuedTaskIds = new Set<string>();

  private async shouldQueueStart(taskId: string): Promise<{ shouldQueue: boolean; running: number; cap: number }> {
    const cap = await this.getRunConcurrencyCap();
    const running = await this.countRunningTasks();
    const alreadyQueued = this.queuedTaskIds.has(taskId);
    return { shouldQueue: !alreadyQueued && running >= cap, running, cap };
  }

  private async startQueuedIfCapacity(): Promise<void> {
    // Start as many queued tasks as free slots allow.
    while (this.startQueue.length > 0) {
      const running = await this.countRunningTasks();
      const cap = await this.getRunConcurrencyCap();
      if (running >= cap) return;
      const next = this.startQueue.shift();
      if (!next) return;
      this.queuedTaskIds.delete(next.taskId);
      try {
        await this.start(next);
      } catch (error) {
        await this.tasks.appendEvent(next.taskId, {
          type: "run-queue-error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async countRunningTasks(): Promise<number> {
    const all = await this.tasks.listTasks();
    return all.filter((t) => t.runState === "running").length;
  }

  private async getRunConcurrencyCap(): Promise<number> {
    const cap = (await this.settings?.get())?.runConcurrencyCap;
    return typeof cap === "number" && Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 10;
  }

  private async recordMetricsArtifact(taskId: string, fallbackStep: string, cycle: number): Promise<void> {
    try {
      const absPath = await writeLatestRunMetricsArtifact(this.tasks, taskId, fallbackStep, cycle);
      if (absPath) {
        await this.tasks.appendEvent(taskId, {
          type: "metrics:recorded",
          path: absPath,
        });
      }
    } catch (error) {
      await this.tasks.appendEvent(taskId, {
        type: "metrics:error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.tasks.getTask(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    return task;
  }


  /**
   * Resolve workspace cwd. Prefer project.path when set so pi can see
   * the real codebase; otherwise use the per-task scratch workspace.
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

  private async detectBabysitterRun(taskId: string, cwd: string, beforeRuns: Set<string>): Promise<void> {
    const runsRoot = path.join(cwd, ".a5c", "runs");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(250);
      const afterRuns = await snapshotBabysitterRuns(cwd);
      const newRunId = [...afterRuns].find((id) => !beforeRuns.has(id));
      if (!newRunId) continue;
      const runPath = path.join(runsRoot, newRunId);
      await this.tasks.appendEvent(taskId, {
        type: "babysitter-run-detected",
        babysitterRunId: newRunId,
        runPath,
      });
      await this.tasks.appendStatus(taskId, `Babysitter run detected — ${newRunId}`);
      return;
    }
  }
}

async function snapshotBabysitterRuns(cwd: string): Promise<Set<string>> {
  const runsRoot = path.join(cwd, ".a5c", "runs");
  if (!existsSync(runsRoot)) return new Set();
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pendingItemCount(task: Task): number {
  return task.items.filter((i) => i.status === "pending").length;
}

function stepKey(stepId: string, cycle: number): string {
  return `${stepId}@c${cycle}`;
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
function buildBabysitPrompt(
  task: Task,
  agentSlug: string | null,
  mode: MCSettings["babysitterMode"] = "plan",
): string {
  // Per babysitter-pi's skill files (read 2026-04-26):
  //   /plan    — author process.js, do NOT execute it
  //   /babysit — author + execute INTERACTIVELY (breakpoints prompt the user;
  //              only useful from a real pi TUI; in MC's programmatic
  //              session breakpoints have no surface to land on)
  //   /yolo    — author + execute NON-interactively (no breakpoints)
  //   "direct" — no slash command; pi runs as a single agent on the brief
  //              alone. Skips babysitter authoring + execution entirely.
  const prefix =
    mode === "execute" ? "/yolo " :
    mode === "plan"    ? "/plan "  :
    "";  // direct
  const lines = [
    `${prefix}${task.title}`,
    "",
    task.description || "(no description)",
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Cycle: ${task.cycle}`,
    `Suggested starting agent: ${agentSlug ?? "(none)"}`,
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
    ...artifactExampleLines(task.id, task.cycle),
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
function buildItemBabysitPrompt(
  task: Task,
  item: CampaignItem,
  mode: MCSettings["babysitterMode"] = "plan",
): string {
  const prefix =
    mode === "execute" ? "/yolo " :
    mode === "plan"    ? "/plan "  :
    "";  // direct
  const total = task.items.length;
  const idx = task.items.findIndex((i) => i.id === item.id);
  return [
    `${prefix}${task.title} — item ${item.id} (${idx + 1}/${total})`,
    "",
    item.description,
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Campaign cycle: ${task.cycle}`,
    `Item index: ${idx + 1} of ${total}`,
    "",
    ...artifactExampleLines(task.id, task.cycle),
    "",
    "Process this single item. When done, summarize what you produced.",
    "The orchestrator iterates the remaining items after this one ends.",
  ].join("\n");
}

function artifactExampleLines(_taskId: string, _cycle: number): string[] {
  return [
    "  - Per-agent output → <task-id>-<agent-code>-c<cycle>.md",
    "  - Subagent output  → <task-id>-<2-4 char code>-c<cycle>.md",
  ];
}

