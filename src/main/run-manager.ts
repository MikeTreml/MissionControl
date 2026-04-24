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
import type { TaskStore } from "./store.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { AgentLoader } from "./agent-loader.ts";
import type { RunState, Task } from "../shared/models.ts";

export type StopReason = "user" | "completed" | "failed";

export class RunManager {
  private readonly tasks: TaskStore;
  private readonly pi: PiSessionManager | null;
  private readonly agents: AgentLoader | null;

  constructor(
    tasks: TaskStore,
    pi?: PiSessionManager | null,
    agents?: AgentLoader | null,
  ) {
    this.tasks = tasks;
    this.pi = pi ?? null;
    this.agents = agents ?? null;
  }

  async start(input: {
    taskId: string;
    agentSlug?: string;
    model?: string;
  }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "idle", "start");

    // Create the pi session BEFORE flipping state: if pi fails to start
    // (missing auth, model misconfigured), the task stays idle and the
    // error surfaces to the UI.
    if (this.pi) {
      const agentSlug = input.agentSlug ?? task.currentAgentSlug;
      // Read the agent's prompt.md if an AgentLoader is wired and the
      // agent exists on disk. Falls back to pi's own system prompt when
      // unavailable — either is fine for v1.
      const systemPrompt = agentSlug && this.agents
        ? await this.agents.loadPrompt(agentSlug).catch(() => null)
        : null;
      await this.pi.start(task.id, {
        prompt: buildTaskPrompt(task, agentSlug),
        ...(systemPrompt ? { systemPrompt } : {}),
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
 * Build the v1 prompt for a task. Intentionally blunt: Michael's direction
 * was "the task should have all the needed info to start" — we'll iterate
 * based on what actually works. Agent-specific prompt.md isn't loaded
 * here yet; pi falls back to its own system prompt if `systemPrompt`
 * isn't set in PiSessionOptions.
 */
function buildTaskPrompt(task: Task, agentSlug: string | null): string {
  const lines = [
    `# Task ${task.id} — ${task.title}`,
    "",
    task.description || "(no description)",
    "",
    `Project: ${task.project}`,
    `Workflow: ${task.workflow}`,
    `Cycle: ${task.cycle}`,
    `Current agent: ${agentSlug ?? "(none)"}`,
    "",
    "Work on this task. When complete, summarize what you did.",
  ];
  return lines.join("\n");
}
