/**
 * IPC registration — single place where main-process stores/loaders are
 * bound to channel names. The preload script mirrors this list and exposes
 * it on `window.mc`.
 *
 * Channel naming: `<domain>:<verb>` (e.g. `tasks:list`, `agents:list`).
 * Keeps the main handler surface inspectable in one file.
 */
import { ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

import type { TaskStore } from "./store.ts";
import type { ProjectStore } from "./project-store.ts";
import type { RunManager } from "./run-manager.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { LibraryIndexStore } from "./library-index.ts";
import { detectGit } from "./git-detect.ts";
import type { Project, ProjectWithGit } from "../shared/models.ts";

/** Parallel map: enrich each stored project with live git detection. */
async function enrichProjects(projects: Project[]): Promise<ProjectWithGit[]> {
  return Promise.all(
    projects.map(async (p) => ({
      ...p,
      gitInfo: await detectGit(p.path),
    })),
  );
}

export interface Stores {
  tasks: TaskStore;
  projects: ProjectStore;
  runs: RunManager;
  pi: PiSessionManager;
  settings: SettingsStore;
  libraryIndex: LibraryIndexStore;
}

/** Log each IPC hit at debug level. Uncomment the call site to silence. */
function logged<T>(channel: string, fn: () => Promise<T> | T): Promise<T> | T {
  console.log(`[ipc] ← ${channel}`);
  return fn();
}

export function registerIpc(stores: Stores): void {
  // ── tasks ────────────────────────────────────────────────────────────
  ipcMain.handle("tasks:list",   () => logged("tasks:list", () => stores.tasks.listTasks()));
  ipcMain.handle("tasks:get",    (_e, id: string) => logged(`tasks:get ${id}`, () => stores.tasks.getTask(id)));
  ipcMain.handle("tasks:create", (_e, input: Parameters<TaskStore["createTask"]>[0]) =>
    logged(`tasks:create ${input.projectPrefix}/${input.title}`, () => stores.tasks.createTask(input)),
  );
  ipcMain.handle("tasks:save",   (_e, task: Parameters<TaskStore["saveTask"]>[0]) =>
    logged(`tasks:save ${task.id}`, () => stores.tasks.saveTask(task)),
  );
  ipcMain.handle("tasks:delete", (_e, id: string) =>
    logged(`tasks:delete ${id}`, () => stores.tasks.deleteTask(id)),
  );
  ipcMain.handle("tasks:events", (_e, id: string) => logged(`tasks:events ${id}`, () => stores.tasks.readEvents(id)));
  ipcMain.handle("tasks:appendEvent",
    (_e, id: string, event: { type: string } & Record<string, unknown>) =>
      logged(`tasks:appendEvent ${id} ${event.type}`, () => stores.tasks.appendEvent(id, event)),
  );
  // Per-task file reads — PROMPT.md, STATUS.md, arbitrary task-linked .md
  // (e.g. <taskId>-<suffix> where the suffix is whatever the workflow's
  // agents declared at runtime). Return null when the file is missing
  // so the renderer can distinguish "not produced yet" from empty.
  ipcMain.handle("tasks:readPrompt", (_e, id: string) => stores.tasks.readPromptFile(id));
  ipcMain.handle("tasks:readStatus", (_e, id: string) => stores.tasks.readStatusFile(id));
  ipcMain.handle("tasks:readRunConfig", (_e, id: string) => stores.tasks.readRunConfig(id));
  ipcMain.handle("tasks:writeRunConfig", (_e, id: string, config: Record<string, unknown>) =>
    stores.tasks.writeRunConfig(id, config));
  ipcMain.handle("tasks:readFile",   (_e, id: string, stem: string, options?: { cycle?: number }) => stores.tasks.readTaskFile(id, stem, options));
  ipcMain.handle("tasks:listFiles",  (_e, id: string) => stores.tasks.listTaskFiles(id));
  ipcMain.handle("tasks:listArtifacts", (_e, id: string) => stores.tasks.listArtifacts(id));
  ipcMain.handle("tasks:readArtifactJson", (_e, id: string, fileName: string) =>
    stores.tasks.readArtifactJson(id, fileName));
  ipcMain.handle("tasks:listFileCycles", (_e, id: string, stem: string) => stores.tasks.listTaskFileCycles(id, stem));
  ipcMain.handle("tasks:appendStatus",
    (_e, id: string, line: string) =>
      logged(`tasks:appendStatus ${id}`, () => stores.tasks.appendStatus(id, line)),
  );

  // ── projects (enriched with derived git info on read) ────────────────
  ipcMain.handle("projects:list", async () =>
    enrichProjects(await stores.projects.listProjects()),
  );
  ipcMain.handle("projects:get", async (_e, id: string) => {
    const p = await stores.projects.getProject(id);
    if (!p) return null;
    return (await enrichProjects([p]))[0];
  });
  ipcMain.handle("projects:create", async (_e, input: Parameters<ProjectStore["createProject"]>[0]) => {
    const created = await stores.projects.createProject(input);
    return (await enrichProjects([created]))[0];
  });
  ipcMain.handle("projects:update", async (
    _e,
    id: string,
    patch: Parameters<ProjectStore["updateProject"]>[1],
  ) => {
    const updated = await stores.projects.updateProject(id, patch);
    return (await enrichProjects([updated]))[0];
  });
  ipcMain.handle("projects:delete", (_e, id: string) =>
    stores.projects.deleteProject(id),
  );
  ipcMain.handle("projects:aggregateRunMetrics", (_e, projectId: string) =>
    stores.tasks.aggregateProjectRunMetrics(projectId),
  );

  // ── agents + workflows ────────────────────────────────────────────────
  // library:index — source of truth for agents, skills, and workflows.
  ipcMain.handle("library:index", () => stores.libraryIndex.load());
  ipcMain.handle("library:refresh", () =>
    logged("library:refresh", () => stores.libraryIndex.refresh()));
  ipcMain.handle("library:readJsonSchema", (_e, absPath: string | null | undefined) =>
    stores.libraryIndex.readJsonSchema(absPath));

  // ── runs (Start/Pause/Resume/Stop state machine) ─────────────────────
  // RunManager owns the task state-machine; PiSessionManager owns the
  // underlying pi session. On Start the RunManager tells PiSessionManager
  // to create a session, build the prompt, and kick off a turn.
  ipcMain.handle("runs:start", (_e, input: Parameters<RunManager["start"]>[0]) =>
    logged(`runs:start ${input.taskId}`, () => stores.runs.start(input)),
  );
  ipcMain.handle("runs:pause", (_e, input: Parameters<RunManager["pause"]>[0]) =>
    logged(`runs:pause ${input.taskId}`, () => stores.runs.pause(input)),
  );
  ipcMain.handle("runs:resume", (_e, input: Parameters<RunManager["resume"]>[0]) =>
    logged(`runs:resume ${input.taskId}`, () => stores.runs.resume(input)),
  );
  ipcMain.handle("runs:stop", (_e, input: Parameters<RunManager["stop"]>[0]) =>
    logged(`runs:stop ${input.taskId}`, () => stores.runs.stop(input)),
  );
  ipcMain.handle("runs:respondBreakpoint", (_e, input: Parameters<RunManager["respondBreakpoint"]>[0]) =>
    logged(`runs:respondBreakpoint ${input.taskId}/${input.effectId} ${input.approved ? "approve" : "reject"}`,
      () => stores.runs.respondBreakpoint(input)),
  );
  // SDK-authoritative run queries — wraps `babysitter run:status` and
  // `babysitter task:list --pending`. See docs/SDK-PRIMITIVES.md.
  ipcMain.handle("runs:status", (_e, taskId: string) =>
    logged(`runs:status ${taskId}`, () => stores.runs.runStatus(taskId)),
  );
  ipcMain.handle("runs:listPending", (_e, taskId: string) =>
    logged(`runs:listPending ${taskId}`, () => stores.runs.listPendingEffects(taskId)),
  );

  // ── pi meta (model registry from pi's own auth config) ────────────────
  ipcMain.handle("pi:listModels", () => stores.pi.listModels());

  // ── mc_ask_user routing — renderer answers / cancels pending asks ─────
  ipcMain.handle("pi:pendingAsks", (_e, taskId: string) =>
    stores.pi.pendingAsksFor(taskId));
  ipcMain.handle("pi:answerAsk",
    (_e, args: { taskId: string; toolCallId: string; answer: string }) =>
      logged(`pi:answerAsk ${args.taskId}/${args.toolCallId}`, () =>
        Promise.resolve(stores.pi.answerAsk(args.taskId, args.toolCallId, args.answer))));
  ipcMain.handle("pi:cancelAsk",
    (_e, args: { taskId: string; toolCallId: string }) =>
      logged(`pi:cancelAsk ${args.taskId}/${args.toolCallId}`, () =>
        Promise.resolve(stores.pi.cancelAsk(args.taskId, args.toolCallId))));

  // ── app settings (MC's own settings, not pi's) ───────────────────────
  ipcMain.handle("settings:get",  () => stores.settings.get());
  ipcMain.handle("settings:save", (_e, patch: Parameters<SettingsStore["save"]>[0]) =>
    stores.settings.save(patch),
  );
  ipcMain.handle("settings:listWorkflowRunTemplates", () => stores.settings.listWorkflowRunTemplates());
  ipcMain.handle("settings:saveWorkflowRunTemplate", (_e, input: Parameters<SettingsStore["saveWorkflowRunTemplate"]>[0]) =>
    stores.settings.saveWorkflowRunTemplate(input));
  ipcMain.handle("settings:deleteWorkflowRunTemplate", (_e, id: string) =>
    stores.settings.deleteWorkflowRunTemplate(id));

  // ── shell convenience — reveal folders in the OS file UI ─────────────
  // Point the user at on-disk state: task folder, babysitter run dir, etc.
  ipcMain.handle("shell:openTaskFolder", (_e, taskId: string) => {
    const folder = stores.tasks.folderFor(taskId);
    if (!existsSync(folder)) {
      return { ok: false, reason: "not-found" as const };
    }
    void shell.openPath(folder);
    return { ok: true };
  });
  ipcMain.handle("shell:openPath", (_e, absPath: string) => {
    if (typeof absPath !== "string" || !absPath) {
      return { ok: false, reason: "invalid-path" as const };
    }
    if (!path.isAbsolute(absPath)) {
      return { ok: false, reason: "not-absolute" as const };
    }
    if (!existsSync(absPath)) {
      return { ok: false, reason: "not-found" as const };
    }
    void shell.openPath(absPath);
    return { ok: true };
  });

  // ── app info ─────────────────────────────────────────────────────────
  ipcMain.handle("app:version", async () => {
    const { app } = await import("electron");
    const { readFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const version = process.env["npm_package_version"] ?? app.getVersion?.() ?? "dev";
    const metaPath = join(app.getAppPath(), "build-meta.json");
    if (!existsSync(metaPath)) return version;
    try {
      const raw = JSON.parse(await readFile(metaPath, "utf8"));
      const build = Number(raw.buildNumber ?? 0);
      return Number.isFinite(build) && build > 0 ? `${version} · b${build}` : version;
    } catch {
      return version;
    }
  });
}
