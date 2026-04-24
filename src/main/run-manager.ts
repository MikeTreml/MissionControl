/**
 * RunManager — owns task run state transitions.
 *
 * Today this is a state machine only: Start/Pause/Resume/Stop flip
 * Task.runState on disk and append matching events to events.jsonl. No pi
 * session is spawned yet.
 *
 * ── PI-WIRE: THIS FILE IS THE SEAM ─────────────────────────────────────
 *
 * When pi lands, this class grows a private `PiSessionManager` and the
 * methods below delegate the real work:
 *
 *   start  → pi.createSession({ model, fallbacks, prompt }); stream events
 *   pause  → session.pause()
 *   resume → session.resume()
 *   stop   → session.end(reason); collect final token/cost totals
 *
 * The IPC surface + renderer wiring already assume THIS manager, so wiring
 * pi later doesn't ripple out — the method signatures stay the same, only
 * the bodies grow. See docs/WORKFLOW-EXECUTION.md for the full architecture.
 */
import type { TaskStore } from "./store.ts";
import type { RunState, Task } from "../shared/models.ts";

export type StopReason = "user" | "completed" | "failed";

export class RunManager {
  private readonly tasks: TaskStore;

  constructor(tasks: TaskStore) {
    this.tasks = tasks;
  }

  async start(input: { taskId: string; agentSlug?: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "idle", "start");

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
