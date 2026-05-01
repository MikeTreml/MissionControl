/**
 * File-based task store (main process only).
 *
 * Each task lives in its own folder under `<root>/<TASK-ID>/`:
 *
 *   TP-001/
 *     manifest.json       <- Task, serialized
 *     events.jsonl        <- append-only journal
 *     PROMPT.md           <- mission, rendered on each Start
 *     STATUS.md           <- append-only progress log
 *     shared/             <- whatever the workflow's agents write
 *     <agent-folder>/     <- created on demand by individual agents;
 *                            no fixed roster of folders is pre-created
 *
 * Originally ported from mc-v2-pi-archive/core/store.py with a fixed
 * Planner/Developer/Reviewer/Surgeon scaffold; that hardcoded set was
 * scrubbed once workflows became the source of truth for the agent
 * roster. Anything an agent needs on disk it creates itself.
 *
 * The store is deliberately dumb — no in-memory cache. Read on every call.
 * Fast enough for a local dashboard, easy to reason about when debugging.
 */
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  makeTask,
  TaskSchema,
  type Task,
  type TaskEvent,
} from "../shared/models.ts";
import { renderPromptFile } from "./render-prompt.ts";

/** Rollup of persisted `artifacts/*.metrics.json` for tasks in one project. */
export interface ProjectRunMetricsRollup {
  projectId: string;
  /** Distinct tasks that had at least one `*.metrics.json` artifact. */
  tasksWithArtifacts: number;
  /** Total metrics artifact files summed (one per completed run snapshot). */
  metricsArtifactCount: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  wallTimeSeconds: number;
}

/**
 * Events emitted by TaskStore. Consumers (the main process event
 * forwarder) subscribe via `.on("event-appended", ...)` / `.on("task-saved", ...)`.
 *
 * Using Node's EventEmitter keeps the surface small and avoids pulling in
 * a pub/sub dep. Renderer-side pub/sub lives in `renderer/src/hooks/data-bus.ts`.
 */
export interface TaskStoreEvents {
  "event-appended": (payload: { taskId: string; event: TaskEvent }) => void;
  "task-saved": (payload: { task: Task }) => void;
}

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

export class TaskStore extends EventEmitter {
  private readonly root: string;
  private readonly sampleRoot: string | null;

  /**
   * @param root        absolute path to the user's tasks root (e.g. `<userData>/tasks`)
   * @param sampleRoot  optional absolute path to a read-only sample tasks
   *                    root (e.g. `<appRoot>/library/samples/tasks`).
   *                    Tasks loaded from this root are tagged
   *                    `isSample:true`. Writes against sample tasks throw.
   */
  constructor(root: string, sampleRoot: string | null = null) {
    super();
    this.root = root;
    this.sampleRoot = sampleRoot;
  }

  /** Absolute path to a task's folder in the user root. May not exist. */
  folderFor(taskId: string): string {
    return path.join(this.root, taskId);
  }

  /**
   * Resolve a task's folder by checking the user root first, then the
   * sample root if set. Returns the directory path that exists, or null.
   * Used by reads that don't care which root the task lives in.
   */
  private async resolveFolder(taskId: string): Promise<{ folder: string; isSample: boolean } | null> {
    const userFolder = path.join(this.root, taskId);
    if (existsSync(userFolder)) return { folder: userFolder, isSample: false };
    if (this.sampleRoot) {
      const sampleFolder = path.join(this.sampleRoot, taskId);
      if (existsSync(sampleFolder)) return { folder: sampleFolder, isSample: true };
    }
    return null;
  }

  /**
   * Synchronous variant of resolveFolder for use in non-async hot paths.
   * Returns the user-root path if it exists, otherwise falls through to
   * the sample root (if set), otherwise the user-root path even though
   * it doesn't exist (callers will fail on the next read with a clearer
   * error). Suffix is joined inside the chosen root.
   */
  private taskPath(taskId: string, ...rest: string[]): string {
    const userFolder = path.join(this.root, taskId);
    if (existsSync(userFolder)) return path.join(userFolder, ...rest);
    if (this.sampleRoot) {
      const sampleFolder = path.join(this.sampleRoot, taskId);
      if (existsSync(sampleFolder)) return path.join(sampleFolder, ...rest);
    }
    return path.join(userFolder, ...rest);
  }

  // Typed overrides so callers get autocomplete on event names.
  override on<K extends keyof TaskStoreEvents>(event: K, listener: TaskStoreEvents[K]): this {
    return super.on(event, listener);
  }
  override emit<K extends keyof TaskStoreEvents>(event: K, ...args: Parameters<TaskStoreEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
  override off<K extends keyof TaskStoreEvents>(event: K, listener: TaskStoreEvents[K]): this {
    return super.off(event, listener);
  }

  /** Ensure the root folder exists. Call once at app start. */
  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await this.reconcileInterruptedRuns();
  }

  /**
   * Crash recovery — at process start, scan every task and fix any whose
   * `runState` is "running" or "paused". A live runState only makes sense
   * while a pi session is attached; if we're booting fresh, no session
   * exists, so the value is stale state from a prior crash / force-quit.
   *
   * For each stuck task:
   *   - flip runState back to "idle"
   *   - close any in-flight campaign items (running → failed with note)
   *   - append `interrupted` + `run-ended { reason: "interrupted" }` to
   *     events.jsonl so Run History closes the open run cleanly
   *   - rewrite manifest.json
   *
   * Idempotent: tasks already idle are skipped. Returns how many it fixed
   * so callers / tests can verify.
   */
  async reconcileInterruptedRuns(): Promise<number> {
    if (!existsSync(this.root)) return 0;
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    let fixed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !TASK_ID_RE.test(entry.name)) continue;
      const folder = path.join(this.root, entry.name);
      const task = await this.readManifest(folder);
      if (!task) continue;
      if (task.runState === "idle") continue;

      // Mark any running campaign item failed — we can't resume mid-item.
      const items = task.items.map((it) =>
        it.status === "running"
          ? { ...it, status: "failed" as const, notes: it.notes
              ? `${it.notes} · interrupted by process restart`
              : "interrupted by process restart" }
          : it,
      );

      const recovered: Task = {
        ...task,
        runState: "idle",
        items,
      };
      const validated = TaskSchema.parse({
        ...recovered,
        updatedAt: new Date().toISOString(),
      });
      await fs.writeFile(
        path.join(folder, "manifest.json"),
        JSON.stringify(validated, null, 2),
        "utf8",
      );
      await this.appendEvent(validated.id, {
        type: "interrupted",
        priorRunState: task.runState,
        reason: "process-restart",
      });
      await this.appendEvent(validated.id, {
        type: "run-ended",
        reason: "interrupted",
      });
      fixed += 1;
    }
    return fixed;
  }

  // ── read ──────────────────────────────────────────────────────────────

  /**
   * Every task on disk, sorted newest-first by updatedAt. Walks the user
   * root first, then the sample root (if set). Sample-loaded tasks are
   * tagged `isSample:true` in memory. If a sample id collides with a
   * real id (shouldn't happen — different prefixes), the real wins.
   */
  async listTasks(): Promise<Task[]> {
    const tasks: Task[] = [];
    const seen = new Set<string>();
    await this.collectFromRoot(this.root, false, tasks, seen);
    if (this.sampleRoot && existsSync(this.sampleRoot)) {
      await this.collectFromRoot(this.sampleRoot, true, tasks, seen);
    }
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return tasks;
  }

  private async collectFromRoot(
    root: string,
    isSample: boolean,
    out: Task[],
    seen: Set<string>,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !TASK_ID_RE.test(entry.name)) continue;
      if (seen.has(entry.name)) continue;
      const task = await this.readManifest(path.join(root, entry.name));
      if (!task) continue;
      seen.add(entry.name);
      out.push(isSample ? { ...task, isSample: true } : task);
    }
  }

  /** Read one task by id, or null if missing. Falls back to sampleRoot. */
  async getTask(id: string): Promise<Task | null> {
    const resolved = await this.resolveFolder(id);
    if (!resolved) return null;
    const task = await this.readManifest(resolved.folder);
    if (!task) return null;
    return resolved.isSample ? { ...task, isSample: true } : task;
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
      // If the id only lives in sampleRoot, refuse with a clearer message
      // than "not found" — samples are read-only.
      if (this.sampleRoot && existsSync(path.join(this.sampleRoot, id))) {
        throw new Error(`Task "${id}" is a sample (read-only). Cannot delete.`);
      }
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
    /**
     * Workflow letter for the task ID suffix (e.g. "F" -> DA-015F). Stored
     * only as part of the immutable id; not a separate task field.
     */
    workflow?: string;
    /** "single" (default) or "campaign". Campaigns carry an items list. */
    kind?: Task["kind"];
    items?: Task["items"];
    /** Source task id when this is a re-run / clone / spin-off. Empty = no parent. */
    parentTaskId?: string;
  }): Promise<Task> {
    const workflow = (input.workflow ?? "F").toUpperCase();
    const id = await this.nextTaskId(input.projectPrefix, workflow);
    const task = makeTask({
      id,
      title: input.title,
      description: input.description ?? "",
      project: input.projectId,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.items ? { items: input.items } : {}),
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
    });
    await this.scaffold(task);
    await this.saveTask(task);
    await this.appendEvent(task.id, { type: "created", by: "system" });
    return task;
  }

  /** Persist a task's manifest.json. Bumps updatedAt first. */
  async saveTask(task: Task): Promise<void> {
    if (task.isSample) {
      throw new Error(`Task "${task.id}" is a sample (read-only). Cannot save.`);
    }
    const now = new Date().toISOString();
    // Strip isSample from anything that might write back to user disk.
    const next: Task = { ...task, isSample: false, updatedAt: now };
    // Re-validate before write — cheap safety net.
    const validated = TaskSchema.parse(next);
    const folder = path.join(this.root, validated.id);

    // Read the prior manifest (if any) BEFORE overwriting so we can diff
    // cycle / blocker and emit specific journal events. (Lane was diffed
    // here too pre-Phase-10; that field is gone now.)
    const prior = await this.readPriorForDiff(folder);

    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify(validated, null, 2),
      "utf8",
    );

    if (prior && prior.cycle !== validated.cycle) {
      await this.appendEvent(validated.id, {
        type: "cycle-changed",
        from: prior.cycle,
        to: validated.cycle,
      });
    }

    // Blocker change is independent of lane/cycle — log it separately so
    // the journal records when a human marked / cleared a blocker.
    if (prior && (prior.blocker ?? "") !== (validated.blocker ?? "")) {
      await this.appendEvent(validated.id, {
        type: "blocker-changed",
        from: prior.blocker ?? "",
        to: validated.blocker ?? "",
      });
    }

    this.emit("task-saved", { task: validated });
  }

  /**
   * Append one event to `<taskId>/events.jsonl`. Fire-and-forget; any caller
   * (not just save) can log events.
   *
   * CONFIRMED event types in use:
   *   - store.ts itself: "created", "cycle-changed", "blocker-changed"
   *   - run-manager.ts: "run-started", "run-ended", "run-paused",
   *     "run-resumed", "run-queued", "item-started", "item-ended",
   *     "step:start", "step:agent-end", "step:end", "metrics:error"
   *   - run-manager.ts curated path: "bs:phase", "bs:error", "bs:log"
   *     (CLI JSON lines from `babysitter harness:create-run --process`)
   *   - pi-session-manager.ts: forwards pi session events directly via
   *     this method, e.g. "pi:agent_end", "pi:tool_execution_start"
   *
   * Forwarding chain:
   *   appendEvent writes events.jsonl AND emits "event-appended" on
   *   this store. attachStoreForwarders() in main/index.ts subscribes
   *   and pushes `webContents.send("task:event", ...)`. The renderer's
   *   lib/live-events-bridge.ts is the last-mile: it debounces the
   *   IPC (~400ms leading+trailing) and publishes to the data-bus so
   *   hooks refetch. RightBar / Task Detail also subscribe to the raw
   *   IPC for unthrottled per-event rendering.
   *
   * Run History (TaskDetail) + Run Activity (RightBar) reconstruct from
   * this stream. Payloads are flat + JSON-friendly.
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
    this.emit("event-appended", { taskId, event: line });
  }

  /** Read all events for a task in order. Returns [] if file missing. */
  async readEvents(taskId: string): Promise<TaskEvent[]> {
    const p = this.taskPath(taskId, "events.jsonl");
    if (!existsSync(p)) return [];
    const raw = await fs.readFile(p, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TaskEvent);
  }

  /**
   * Write the mission brief for a task to `<taskRoot>/<id>/PROMPT.md`.
   * Overwrites any prior content — PROMPT.md is expected to reflect the
   * CURRENT task state, not an append log (STATUS.md is the append log).
   */
  async writePromptFile(taskId: string, content: string): Promise<void> {
    const folder = path.join(this.root, taskId);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "PROMPT.md"), content, "utf8");
  }

  /**
   * Ensure `<taskRoot>/<id>/workspace/` exists and return its absolute
   * path. Used as a per-task pi cwd when the task's project has no
   * `path` set — keeps pi's tools from touching MC's own repo or an
   * unrelated folder.
   */
  async ensureWorkspace(taskId: string): Promise<string> {
    const ws = path.join(this.root, taskId, "workspace");
    await fs.mkdir(ws, { recursive: true });
    return ws;
  }

  /**
   * Read PROMPT.md for a task. Returns null if absent (task created
   * before this convention landed, or the file was deleted externally).
   */
  async readPromptFile(taskId: string): Promise<string | null> {
    const p = this.taskPath(taskId, "PROMPT.md");
    if (!existsSync(p)) return null;
    return fs.readFile(p, "utf8");
  }

  /**
   * Read STATUS.md for a task. Returns null if absent. STATUS.md is an
   * append-only progress log — consumers typically tail recent entries
   * rather than render the whole thing.
   */
  async readStatusFile(taskId: string): Promise<string | null> {
    const p = this.taskPath(taskId, "STATUS.md");
    if (!existsSync(p)) return null;
    return fs.readFile(p, "utf8");
  }

  /**
   * Append a line to STATUS.md, prefixed with an ISO timestamp. Creates
   * the file (with a header) if missing. Emits `task-saved` so the UI
   * refreshes its status view.
   */
  async appendStatus(taskId: string, line: string): Promise<void> {
    const folder = path.join(this.root, taskId);
    await fs.mkdir(folder, { recursive: true });
    const statusPath = path.join(folder, "STATUS.md");
    if (!existsSync(statusPath)) {
      await fs.writeFile(
        statusPath,
        `# Status — ${taskId}\n\nAppend-only progress log.\n\n`,
        "utf8",
      );
    }
    const stamp = new Date().toISOString();
    await fs.appendFile(statusPath, `- \`${stamp}\` ${line}\n`, "utf8");
    // Piggyback on task-saved so existing UI refetch paths pick it up.
    const task = await this.getTask(taskId);
    if (task) this.emit("task-saved", { task });
  }

  /**
   * Persist workflow-runner settings sidecar for reproducibility.
   * Stored at `<taskId>/RUN_CONFIG.json`.
   */
  async writeRunConfig(taskId: string, config: Record<string, unknown>): Promise<void> {
    const folder = path.join(this.root, taskId);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "RUN_CONFIG.json"),
      JSON.stringify(config, null, 2),
      "utf8",
    );
    const task = await this.getTask(taskId);
    if (task) this.emit("task-saved", { task });
  }

  /** Read workflow-runner settings sidecar, null when missing. */
  async readRunConfig(taskId: string): Promise<Record<string, unknown> | null> {
    const p = this.taskPath(taskId, "RUN_CONFIG.json");
    if (!existsSync(p)) return null;
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /** Write JSON artifact under `<taskId>/artifacts/`. Returns absolute path. */
  async writeArtifactJson(taskId: string, fileName: string, payload: Record<string, unknown>): Promise<string> {
    const folder = path.join(this.root, taskId, "artifacts");
    await fs.mkdir(folder, { recursive: true });
    const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const abs = path.join(folder, safeName);
    await fs.writeFile(abs, JSON.stringify(payload, null, 2), "utf8");
    return abs;
  }

  /** List artifact files under `<taskId>/artifacts/` (non-recursive). */
  async listArtifacts(taskId: string): Promise<Array<{ name: string; size: number; modifiedAt: string }>> {
    const folder = this.taskPath(taskId, "artifacts");
    if (!existsSync(folder)) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const out: Array<{ name: string; size: number; modifiedAt: string }> = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const stat = await fs.stat(path.join(folder, e.name));
      out.push({ name: e.name, size: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
    out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return out;
  }

  /** Read one JSON artifact by file name from `<taskId>/artifacts/`. */
  async readArtifactJson(taskId: string, fileName: string): Promise<Record<string, unknown> | null> {
    const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const p = this.taskPath(taskId, "artifacts", safeName);
    if (!existsSync(p)) return null;
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /**
   * Sum metrics from every `artifacts/*.metrics.json` under tasks whose
   * `project` field matches `projectId`. Ignores malformed files.
   */
  async aggregateProjectRunMetrics(projectId: string): Promise<ProjectRunMetricsRollup> {
    const empty: ProjectRunMetricsRollup = {
      projectId,
      tasksWithArtifacts: 0,
      metricsArtifactCount: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUSD: 0,
      wallTimeSeconds: 0,
    };
    if (!projectId) return empty;

    const tasks = await this.listTasks();
    const inProject = tasks.filter((t) => t.project === projectId);
    let tasksWithArtifacts = 0;
    let metricsArtifactCount = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let costUSD = 0;
    let wallTimeSeconds = 0;

    for (const t of inProject) {
      const arts = await this.listArtifacts(t.id);
      const metricFiles = arts.filter((a) => a.name.endsWith(".metrics.json"));
      if (metricFiles.length === 0) continue;
      tasksWithArtifacts += 1;
      for (const f of metricFiles) {
        const row = await this.readArtifactJson(t.id, f.name);
        if (!row) continue;
        metricsArtifactCount += 1;
        tokensIn += numericArtifactField(row, "tokensIn");
        tokensOut += numericArtifactField(row, "tokensOut");
        costUSD += numericArtifactField(row, "costUSD");
        wallTimeSeconds += numericArtifactField(row, "wallTimeSeconds");
      }
    }

    return {
      projectId,
      tasksWithArtifacts,
      metricsArtifactCount,
      tokensIn,
      tokensOut,
      costUSD,
      wallTimeSeconds,
    };
  }

  /**
   * Read a task-linked agent artifact by its file name stem.
   *
   * Resolution rules:
   *   - explicit cycle → `<stem>-c<cycle>.md`
   *   - no cycle      → highest available cycle if any exist
   *   - legacy        → `<stem>.md` when no cycled file exists
   *
   * Examples:
   *   `taskId` for the base task file area
   *   `<taskId>-<suffix>` for an agent's per-cycle artifact (suffix
   *   is whatever the workflow / agent declares — e.g. "p", "design")
   */
  async readTaskFile(
    taskId: string,
    stem: string,
    options: { cycle?: number } = {},
  ): Promise<string | null> {
    const folder = this.taskPath(taskId);
    const targetStem =
      options.cycle !== undefined && stem !== taskId
        ? `${stem}-c${options.cycle}`
        : await this.resolveLatestTaskFileStem(taskId, stem);
    const p = path.join(folder, `${targetStem}.md`);
    if (!existsSync(p)) return null;
    return fs.readFile(p, "utf8");
  }

  /** List all discovered cycle numbers for a given task artifact stem. */
  async listTaskFileCycles(taskId: string, stem: string): Promise<number[]> {
    const folder = this.taskPath(taskId);
    if (!existsSync(folder)) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const re = new RegExp(`^${escapeRegExp(stem)}-c(\\d+)\\.md$`, "i");
    const cycles: number[] = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const m = re.exec(e.name);
      if (!m) continue;
      cycles.push(Number.parseInt(m[1]!, 10));
    }
    return cycles.sort((a, b) => a - b);
  }

  /**
   * List the files in a task's folder (top level only — no recursion
   * into per-role subdirs or the workspace). Used by Task Detail's
   * Linked Files panel to render real artifacts babysitter / agents
   * produced, not speculative names.
   */
  async listTaskFiles(taskId: string): Promise<Array<{
    name: string;
    size: number;
    modifiedAt: string;
  }>> {
    const folder = this.taskPath(taskId);
    if (!existsSync(folder)) return [];
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const out: Array<{ name: string; size: number; modifiedAt: string }> = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const stat = await fs.stat(path.join(folder, e.name));
      out.push({
        name: e.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * Create the task folder + initial PROMPT.md, STATUS.md, and a
   * generic `shared/` folder. Per-agent folders are NOT pre-created —
   * each agent makes whatever folders/files it needs at runtime, so
   * the on-disk layout reflects the workflow that actually ran rather
   * than a hardcoded roster from this file.
   *
   * Start overwrites PROMPT.md with RunManager's richer render;
   * STATUS.md is pure append-only from here on.
   */
  private async scaffold(task: Task): Promise<void> {
    const base = path.join(this.root, task.id);
    await fs.mkdir(base, { recursive: true });

    // Mission brief stub. Start re-runs renderPromptFile on each click
    // so edits propagate; this seed ensures Task Detail has something
    // to render immediately after create-task, before the first Start.
    await fs.writeFile(
      path.join(base, "PROMPT.md"),
      renderPromptFile(task, null),
      "utf8",
    );

    // Progress log — append-only from now on.
    await fs.writeFile(
      path.join(base, "STATUS.md"),
      `# Status — ${task.id}\n\nAppend-only progress log.\n\n- \`${task.createdAt}\` task created\n`,
      "utf8",
    );

    // Generic shared/ folder for cross-agent artifacts. Anything an
    // individual agent owns (notes, outputs, working files) gets
    // created by that agent on first write — no pre-allocated set.
    await fs.mkdir(path.join(base, "shared"), { recursive: true });
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

  private async resolveLatestTaskFileStem(taskId: string, stem: string): Promise<string> {
    if (stem === taskId) return stem;
    const cycles = await this.listTaskFileCycles(taskId, stem);
    if (cycles.length > 0) return `${stem}-c${cycles[cycles.length - 1]}`;
    return stem; // legacy non-cycled artifact name
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

function numericArtifactField(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
