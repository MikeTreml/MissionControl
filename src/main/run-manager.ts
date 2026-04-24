/**
 * RunManager — owns task run state transitions.
 *
 * Start/Pause/Resume/Stop flip Task.runState on disk and append events to
 * events.jsonl. When a PiSessionManager is provided, Start also creates a
 * live pi AgentSession for the task, and Stop disposes it.
 *
 * Pause and Resume are MC-level state today — they do NOT touch the pi
 * session. A paused task's pi session sits idle (no prompt in flight);
 * resume just flips MC state back. This mirrors how pi itself has no
 * first-class pause primitive on AgentSession.
 *
 * ── PI-WIRE: prompting ──────────────────────────────────────────────────
 * Today the pi session is created but never prompted. Next baby step:
 * resolve the task's current agent → its primaryModel → call
 * `session.prompt(...)` with the task title/description. That step
 * requires API key setup + per-agent model selection.
 */
import { existsSync } from "node:fs";

import type { TaskStore } from "./store.ts";
import type { ProjectStore } from "./project-store.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { AgentLoader } from "./agent-loader.ts";
import type { RunState, Task } from "../shared/models.ts";

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

    // Create the pi session BEFORE flipping state: if pi fails to start
    // (missing auth, workspace unwritable, etc.), the task stays idle
    // and the error surfaces to the UI.
    if (this.pi) {
      const agentSlug = input.agentSlug ?? task.currentAgentSlug;

      // Resolve workspace cwd. Prefer the project's real path so pi can
      // see + edit actual code. Fall back to a per-task scratch workspace
      // (`tasks/<id>/workspace/`) when the project has no path — keeps
      // pi's tools from scribbling on unrelated folders.
      const project = this.projects ? await this.projects.getProject(task.project) : null;
      const projectPath = project?.path?.trim();
      const cwd = projectPath && existsSync(projectPath)
        ? projectPath
        : await this.tasks.ensureWorkspace(task.id);

      // Persist the task's mission as PROMPT.md alongside manifest.json.
      // Babysitter's generated process + future agents re-read this when
      // they need the full brief. Overwrite on each Start so edits to
      // title/description propagate.
      await this.tasks.writePromptFile(task.id, renderPromptFile(task, agentSlug));

      // Drive orchestration through babysitter's /babysit skill. Passing
      // no custom systemPrompt means pi loads its full extension set
      // (including babysitter-pi), so /babysit resolves to the real
      // skill and not a free-form user message.
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
    return next;
  }

  /**
   * Called by PiSessionManager when pi completes (or errors) a prompt.
   * Transitions the task to idle with the matching exit reason. If the
   * task is already idle (user clicked Stop first), we no-op.
   */
  async completeRun(
    taskId: string,
    reason: StopReason,
  ): Promise<void> {
    const task = await this.tasks.getTask(taskId);
    if (!task || task.runState === "idle") return;

    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason,
    });
  }

  async pause(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "running", "pause");

    const next: Task = { ...task, runState: "paused" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-paused" });
    return next;
  }

  async resume(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "paused", "resume");

    const next: Task = { ...task, runState: "running" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-resumed" });
    return next;
  }

  async stop(input: { taskId: string; reason?: StopReason }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    if (task.runState === "idle") {
      throw new Error(`Task "${task.id}" is already idle`);
    }

    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason: input.reason ?? "user",
    });

    // Best-effort pi cleanup — don't let a dispose failure undo the state
    // flip the UI already relied on.
    if (this.pi) {
      await this.pi.stop(task.id);
    }
    return next;
  }

  // ── internals ────────────────────────────────────────────────────────

  private async requireTask(id: string): Promise<Task> {
    const task = await this.tasks.getTask(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    return task;
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
  ];
  return lines.join("\n");
}

/**
 * Content for `tasks/<id>/PROMPT.md` — the human-readable mission brief.
 * Regenerated on each Start so edits to title/description propagate.
 * Agents can read this during their session for the full context.
 */
function renderPromptFile(task: Task, agentSlug: string | null): string {
  const lines = [
    `# ${task.id} — ${task.title}`,
    "",
    task.description || "_(no description)_",
    "",
    "## Context",
    "",
    `- Project: **${task.project}**`,
    `- Workflow: **${task.workflow}**`,
    `- Cycle: **${task.cycle}**`,
    `- Starting agent: **${agentSlug ?? "planner"}**`,
    "",
    "## Done criteria",
    "",
    "_(fill in as the Planner refines scope)_",
    "",
  ];
  return lines.join("\n");
}
