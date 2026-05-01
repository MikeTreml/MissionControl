/**
 * Preload — the one place main-process capabilities get exposed to the
 * renderer via contextBridge. Runs before the React app mounts.
 *
 * Each method is a thin wrapper over ipcRenderer.invoke(). Channel names
 * must match those registered in src/main/ipc.ts. Types for the shape this
 * exposes live in src/renderer/src/global.d.ts.
 */
import { contextBridge, ipcRenderer } from "electron";

const api = {
  version: "0.1.0",

  // ── tasks ────────────────────────────────────────────────────────────
  listTasks:       () => ipcRenderer.invoke("tasks:list"),
  getTask:         (id: string) => ipcRenderer.invoke("tasks:get", id),
  createTask:      (input: unknown) => ipcRenderer.invoke("tasks:create", input),
  saveTask:        (task: unknown) => ipcRenderer.invoke("tasks:save", task),
  deleteTask:      (id: string) => ipcRenderer.invoke("tasks:delete", id),
  readTaskEvents:  (id: string) => ipcRenderer.invoke("tasks:events", id),
  appendTaskEvent: (id: string, event: unknown) =>
    ipcRenderer.invoke("tasks:appendEvent", id, event),
  readTaskPrompt:  (id: string) => ipcRenderer.invoke("tasks:readPrompt", id),
  readTaskStatus:  (id: string) => ipcRenderer.invoke("tasks:readStatus", id),
  readTaskRunConfig: (id: string) => ipcRenderer.invoke("tasks:readRunConfig", id),
  writeTaskRunConfig: (id: string, config: Record<string, unknown>) =>
    ipcRenderer.invoke("tasks:writeRunConfig", id, config),
  readTaskFile:    (id: string, stem: string, options?: { cycle?: number }) =>
    ipcRenderer.invoke("tasks:readFile", id, stem, options),
  listTaskFiles:   (id: string) => ipcRenderer.invoke("tasks:listFiles", id),
  listTaskArtifacts: (id: string) => ipcRenderer.invoke("tasks:listArtifacts", id),
  readTaskArtifactJson: (id: string, fileName: string) => ipcRenderer.invoke("tasks:readArtifactJson", id, fileName),
  listTaskFileCycles: (id: string, stem: string) => ipcRenderer.invoke("tasks:listFileCycles", id, stem),
  appendTaskStatus: (id: string, line: string) =>
    ipcRenderer.invoke("tasks:appendStatus", id, line),
  openTaskFolder: (id: string) => ipcRenderer.invoke("shell:openTaskFolder", id),
  openPath:       (absPath: string) => ipcRenderer.invoke("shell:openPath", absPath),

  // ── projects ─────────────────────────────────────────────────────────
  listProjects:    () => ipcRenderer.invoke("projects:list"),
  getProject:      (id: string) => ipcRenderer.invoke("projects:get", id),
  createProject:   (input: unknown) => ipcRenderer.invoke("projects:create", input),
  updateProject:   (id: string, patch: unknown) =>
    ipcRenderer.invoke("projects:update", id, patch),
  deleteProject:   (id: string) => ipcRenderer.invoke("projects:delete", id),
  aggregateProjectRunMetrics: (projectId: string) =>
    ipcRenderer.invoke("projects:aggregateRunMetrics", projectId),

  // ── library catalog ──────────────────────────────────────────────────
  getLibraryIndex: () => ipcRenderer.invoke("library:index"),
  refreshLibraryIndex: () => ipcRenderer.invoke("library:refresh"),
  readLibraryJsonSchema: (absPath: string | null | undefined) =>
    ipcRenderer.invoke("library:readJsonSchema", absPath),
  createLibraryWorkflow: (opts: unknown) =>
    ipcRenderer.invoke("library:createWorkflow", opts),

  // ── runs (Start/Pause/Resume/Stop) ───────────────────────────────────
  startRun:   (input: { taskId: string; agentSlug?: string; model?: string }) =>
    ipcRenderer.invoke("runs:start", input),
  pauseRun:   (input: { taskId: string }) =>
    ipcRenderer.invoke("runs:pause", input),
  resumeRun:  (input: { taskId: string }) =>
    ipcRenderer.invoke("runs:resume", input),
  stopRun:    (input: { taskId: string; reason?: "user" | "completed" | "failed" }) =>
    ipcRenderer.invoke("runs:stop", input),
  respondBreakpoint: (input: {
    taskId: string;
    runPath: string;
    effectId: string;
    approved: boolean;
    response?: string;
    feedback?: string;
  }) => ipcRenderer.invoke("runs:respondBreakpoint", input),
  /** Authoritative run state from the SDK's state cache. */
  runStatus: (taskId: string) => ipcRenderer.invoke("runs:status", taskId),
  /** Authoritative pending-effects list (breakpoints, sleeps, etc.). */
  runListPending: (taskId: string) => ipcRenderer.invoke("runs:listPending", taskId),

  // ── pi meta ──────────────────────────────────────────────────────────
  listPiModels: () => ipcRenderer.invoke("pi:listModels"),

  // ── mc_ask_user routing ─────────────────────────────────────────────
  listPendingAsks: (taskId: string) =>
    ipcRenderer.invoke("pi:pendingAsks", taskId),
  answerAsk: (taskId: string, toolCallId: string, answer: string) =>
    ipcRenderer.invoke("pi:answerAsk", { taskId, toolCallId, answer }),
  cancelAsk: (taskId: string, toolCallId: string) =>
    ipcRenderer.invoke("pi:cancelAsk", { taskId, toolCallId }),

  // ── app settings (MC's own) ──────────────────────────────────────────
  getSettings:  () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch: unknown) => ipcRenderer.invoke("settings:save", patch),
  listWorkflowRunTemplates: () => ipcRenderer.invoke("settings:listWorkflowRunTemplates"),
  saveWorkflowRunTemplate: (input: unknown) => ipcRenderer.invoke("settings:saveWorkflowRunTemplate", input),
  deleteWorkflowRunTemplate: (id: string) => ipcRenderer.invoke("settings:deleteWorkflowRunTemplate", id),

  // ── live events (main → renderer push) ───────────────────────────────
  // Each subscribe returns an unsubscribe function. The listener fires
  // whenever main broadcasts the corresponding ipc message.
  onTaskEvent: (listener: (payload: { taskId: string; event: unknown }) => void) => {
    const wrapped = (_e: unknown, payload: { taskId: string; event: unknown }) => listener(payload);
    ipcRenderer.on("task:event", wrapped);
    return () => ipcRenderer.off("task:event", wrapped);
  },
  onTaskSaved: (listener: (payload: { task: unknown }) => void) => {
    const wrapped = (_e: unknown, payload: { task: unknown }) => listener(payload);
    ipcRenderer.on("task:saved", wrapped);
    return () => ipcRenderer.off("task:saved", wrapped);
  },

  // ── app ──────────────────────────────────────────────────────────────
  appVersion:      () => ipcRenderer.invoke("app:version"),
};

// Show up in the renderer's DevTools Console AND in the main-process terminal.
// If you don't see this in DevTools, preload didn't load (look at terminal).
console.log("[preload] exposing window.mc (", Object.keys(api).length, "methods )");

contextBridge.exposeInMainWorld("mc", api);

// Sanity check after contextBridge runs:
console.log("[preload] contextBridge called; window.mc should be available now");

export type McApi = typeof api;
