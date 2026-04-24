/**
 * File-based task store (main process only).
 *
 * Each task lives in its own folder under `<root>/TP-NNN/`:
 *
 *   TP-001/
 *     manifest.json       <- Task, serialized
 *     planner/notes.md    <- per-role notes; owner R/W, others R
 *     dev/notes.md
 *     reviewer/notes.md
 *     doc/notes.md
 *     shared/             <- requirements, code, review reports
 *
 * Ported from mc-v2-pi-archive/core/store.py. Same layout, TS idioms.
 *
 * The store is deliberately dumb — no in-memory cache. Read on every call.
 * Fast enough for a local dashboard, easy to reason about when debugging.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  makeTask,
  TaskSchema,
  type Task,
  type TaskEvent,
} from "../shared/models.ts";

/**
 * Task folder name = task id. Form: <PREFIX>-<NNN><W>
 *   - PREFIX: 1-8 alphanumeric, uppercase (e.g. "DA")
 *   - NNN:    zero-padded number, at least 3 digits (e.g. "015")
 *   - W:      single uppercase workflow letter (e.g. "F")
 *
 * Groups:
 *   1 = prefix, 2 = number, 3 = workflow letter
 */
const TASK_ID_RE = /^([A-Z0-9]{1,8})-(\d{3,})([A-Z])$/;
const ROLE_FOLDERS = [
  "planner",
  "developer",
  "reviewer",
  "surgeon",
  "shared",
] as const;

export class TaskStore {
  private readonly root: string;

  /**
   * @param root  absolute path to the tasks root (e.g. `<userData>/tasks`)
   */
  constructor(root: string) {
    this.root = root;
  }

  /** Ensure the root folder exists. Call once at app start. */
  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  // ── read ──────────────────────────────────────────────────────────────

  /** Every task on disk, sorted newest-first by updatedAt. */
  async listTasks(): Promise<Task[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const tasks: Task[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !TASK_ID_RE.test(entry.name)) continue;
      const task = await this.readManifest(path.join(this.root, entry.name));
      if (task) tasks.push(task);
    }
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return tasks;
  }

  /** Read one task by id, or null if missing. */
  async getTask(id: string): Promise<Task | null> {
    const folder = path.join(this.root, id);
    return existsSync(folder) ? this.readManifest(folder) : null;
  }

  /**
   * Delete a task's folder entirely (manifest + notes + events + shared/).
   *
   * CONFIRMED: id/project/workflow/prefix are all immutable — they live
   * inside the task ID itself. So there's no "move" operation; only create
   * and delete. If you want to change them, delete and re-create.
   *
   * This does NOT touch the task's events.jsonl history in any other place
   * — we don't keep a central log. Per-task deletion is total.
   */
  async deleteTask(id: string): Promise<void> {
    const folder = path.join(this.root, id);
    if (!existsSync(folder)) {
      throw new Error(`Task "${id}" not found`);
    }
    await fs.rm(folder, { recursive: true, force: true });
  }

  // ── write ─────────────────────────────────────────────────────────────

  /**
   * Generate the next <PREFIX>-NNN<W>, scaffold folders, write manifest.
   *
   * Caller supplies:
   *   - projectId: slug stored on task.project (e.g. "dogapp")
   *   - projectPrefix: the UPPERCASE short code used in task IDs (e.g. "DA")
   *   - workflow: single uppercase letter (default "F")
   *
   * Counter is per-prefix across all workflows (DA-001F, DA-002B, DA-003F).
   */
  async createTask(input: {
    title: string;
    description?: string;
    projectId: string;
    projectPrefix: string;
    workflow?: string;
  }): Promise<Task> {
    const workflow = (input.workflow ?? "F").toUpperCase();
    const id = await this.nextTaskId(input.projectPrefix, workflow);
    const task = makeTask({
      id,
      title: input.title,
      description: input.description ?? "",
      project: input.projectId,
      workflow,
    });
    await this.scaffold(task);
    await this.saveTask(task);
    await this.appendEvent(task.id, { type: "created", by: "system" });
    return task;
  }

  /** Persist a task's manifest.json. Bumps updatedAt first. */
  async saveTask(task: Task): Promise<void> {
    const now = new Date().toISOString();
    const next: Task = { ...task, updatedAt: now };
    // Re-validate before write — cheap safety net.
    const validated = TaskSchema.parse(next);
    const folder = path.join(this.root, validated.id);

    // Read the prior manifest (if any) BEFORE overwriting so we can diff
    // lane/cycle and emit specific journal events.
    const prior = await this.readPriorForDiff(folder);

    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify(validated, null, 2),
      "utf8",
    );

    if (prior && prior.lane !== validated.lane) {
      await this.appendEvent(validated.id, {
        type: "lane-changed",
        from: prior.lane,
        to: validated.lane,
      });
    } else if (prior && prior.cycle !== validated.cycle) {
      await this.appendEvent(validated.id, {
        type: "cycle-changed",
        from: prior.cycle,
        to: validated.cycle,
      });
    }
  }

  /**
   * Append one event to `<taskId>/events.jsonl`. Fire-and-forget; any caller
   * (not just save) can log events: "run-started", "subagent-spawned", etc.
   *
   * ── PI-WIRE: EVENT TYPES FOR THE FUTURE ────────────────────────────────
   *
   * CONFIRMED today: "created", "saved", "lane-changed", "cycle-changed".
   *   (emitted by store.ts on state transitions — no pi involvement)
   *
   * PROPOSED once pi is wired:
   *   "run-started"      { role, modelId, sessionFile }
   *   "run-ended"        { role, exit: "completed"|"paused"|"stopped"|"failed",
   *                        tokensIn, tokensOut, costUSD, durationMs }
   *   "subagent-spawned" { parentRole, subagentSlug, reason }
   *   "subagent-ended"   { subagentSlug, exit, tokensIn, tokensOut }
   *   "human-approval"   { decision: "approve"|"reject", by: "human" }
   *
   * The renderer's Run History (TaskDetail) + Run Activity (RightBar) will
   * reconstruct their views from this stream. Keep payloads flat and JSON-
   * friendly so pi-messenger interop stays possible.
   */
  async appendEvent(
    taskId: string,
    event: { type: string } & Record<string, unknown>,
  ): Promise<void> {
    const line: TaskEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    const folder = path.join(this.root, taskId);
    await fs.mkdir(folder, { recursive: true });
    await fs.appendFile(
      path.join(folder, "events.jsonl"),
      JSON.stringify(line) + "\n",
      "utf8",
    );
  }

  /** Read all events for a task in order. Returns [] if file missing. */
  async readEvents(taskId: string): Promise<TaskEvent[]> {
    const p = path.join(this.root, taskId, "events.jsonl");
    if (!existsSync(p)) return [];
    const raw = await fs.readFile(p, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TaskEvent);
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** Create per-role folders + starter notes.md files. One-time per task. */
  private async scaffold(task: Task): Promise<void> {
    const base = path.join(this.root, task.id);
    for (const name of ROLE_FOLDERS) {
      const folder = path.join(base, name);
      await fs.mkdir(folder, { recursive: true });
      // notes.md only for role folders, not shared/
      if (name === "shared") continue;
      const note = path.join(folder, "notes.md");
      if (!existsSync(note)) {
        await fs.writeFile(
          note,
          `# ${task.id} — ${name} notes\n\n` +
            `Owner: ${name}. This file grows across cycles.\n`,
          "utf8",
        );
      }
    }
  }

  /**
   * Read the manifest that's on disk RIGHT NOW, before we overwrite it.
   * Used by saveTask to diff lane/cycle and emit specific journal events.
   * Returns null on first write.
   */
  private async readPriorForDiff(folder: string): Promise<Task | null> {
    const manifest = path.join(folder, "manifest.json");
    if (!existsSync(manifest)) return null;
    try {
      const raw = await fs.readFile(manifest, "utf8");
      return TaskSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** Parse manifest.json. Returns null on missing or corrupt files (doesn't throw). */
  private async readManifest(folder: string): Promise<Task | null> {
    const manifest = path.join(folder, "manifest.json");
    if (!existsSync(manifest)) return null;
    try {
      const raw = await fs.readFile(manifest, "utf8");
      return TaskSchema.parse(JSON.parse(raw));
    } catch {
      // A corrupt or half-written manifest shouldn't crash the dashboard.
      return null;
    }
  }

  /**
   * Next id for the given prefix + workflow. Counter is per-prefix
   * across all workflow letters (e.g. DA-001F, DA-002B, DA-003F).
   */
  private async nextTaskId(prefix: string, workflow: string): Promise<string> {
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    let maxN = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = TASK_ID_RE.exec(entry.name);
      if (!match) continue;
      if (match[1] !== prefix) continue; // different project's counter
      maxN = Math.max(maxN, Number.parseInt(match[2]!, 10));
    }
    const nnn = String(maxN + 1).padStart(3, "0");
    return `${prefix}-${nnn}${workflow}`;
  }
}
