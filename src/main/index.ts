/**
 * Electron main process entry.
 *
 * On ready:
 *   1. resolve paths (userData for mutable; app root for bundled loaders)
 *   2. instantiate stores, init the writable ones (mkdir on disk)
 *   3. register IPC handlers (ipc.ts)
 *   4. open the BrowserWindow, point it at the renderer
 *
 * Path layout:
 *   <userData>/tasks/<TP-NNN>/manifest.json · events.jsonl · notes.md per agent
 *   <userData>/projects/<slug>/project.json
 *   <userData>/models.json                 (LLM roster — user-editable)
 *   <appRoot>/agents/<slug>/agent.json     (bundled — primary roles + subagents)
 *   <appRoot>/workflows/<CODE>-<slug>/workflow.json  (bundled)
 *
 * ── HANDOFF POINTERS (for whoever picks this up next) ──────────────────
 *
 * PI-WIRE: this file is where the pi-coding-agent SDK gets booted.
 *   After bootstrapStores(), add:
 *     1. new PiSessionManager({ modelsStore, agentsLoader, tasksStore })
 *     2. pass it to registerIpc() alongside the existing stores
 *     3. in ipc.ts, add handlers for: runs:start, runs:pause, runs:resume,
 *        runs:stop, runs:list (per task)
 *   The manager holds live pi.Session instances keyed by `<taskId>:<agentSlug>`
 *   and forwards session events to the renderer via webContents.send("event",
 *   payload) — subscribed in the renderer with an EventBus hook (not built yet).
 *
 * See docs/HANDOFF.md for the full orientation.
 */
import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` isn't defined under ESM (which electron-vite emits for main).
// Derive it from import.meta.url so built + packaged runs resolve the
// preload + renderer paths the same way dev mode does.
const __dirname = dirname(fileURLToPath(import.meta.url));

import { TaskStore } from "./store.ts";
import { ProjectStore } from "./project-store.ts";
import { ModelRosterStore } from "./model-roster.ts";
import { WorkflowLoader } from "./workflows.ts";
import { AgentLoader } from "./agent-loader.ts";
import { PiSessionManager } from "./pi-session-manager.ts";
import { RunManager } from "./run-manager.ts";
import { registerIpc } from "./ipc.ts";

async function bootstrapStores(): Promise<void> {
  const userData = app.getPath("userData");
  const appRoot = app.getAppPath();
  console.log("[main] userData:", userData);
  console.log("[main] appRoot:", appRoot);

  const tasks = new TaskStore(join(userData, "tasks"));
  const projects = new ProjectStore(join(userData, "projects"));
  const models = new ModelRosterStore(userData);
  const workflows = new WorkflowLoader(join(appRoot, "workflows"));
  const agents = new AgentLoader(join(appRoot, "agents"));

  await Promise.all([tasks.init(), projects.init(), models.init()]);

  // PiSessionManager owns live pi sessions (via babysitter-sdk's
  // createPiSession wrapper). RunManager owns the task state machine
  // and the prompt-building logic. On Start, RunManager tells
  // PiSessionManager to create a session and prompt it. When pi's
  // turn resolves, PiSessionManager calls back into RunManager to flip
  // the task to idle.
  //
  // Pi inherits auth from the environment: OPENAI_API_KEY,
  // ANTHROPIC_API_KEY, etc. Set them in the shell that launched `npm run dev`.
  const pi = new PiSessionManager(tasks);
  const runs = new RunManager(tasks, pi, agents);
  pi.setOnSessionEnd((taskId, result) =>
    runs.completeRun(taskId, result.reason),
  );

  bootstrappedTasks = tasks;

  registerIpc({ tasks, projects, models, workflows, agents, runs, pi });
  console.log("[main] IPC handlers registered");
}

/**
 * Forward TaskStore emissions into the renderer so React hooks can react
 * to live events. Cleanup is captured per-window so a macOS `activate`
 * reopen (which spawns a second window) doesn't accidentally detach the
 * live window's listeners when the stale first window's `closed` event
 * fires later.
 */
function attachStoreForwarders(win: BrowserWindow, tasks: TaskStore): void {
  const onEvent = (payload: { taskId: string; event: unknown }): void => {
    if (win.isDestroyed()) return;
    win.webContents.send("task:event", payload);
  };
  const onSaved = (payload: { task: unknown }): void => {
    if (win.isDestroyed()) return;
    win.webContents.send("task:saved", payload);
  };
  tasks.on("event-appended", onEvent);
  tasks.on("task-saved", onSaved);
  // Per-window cleanup — each window captures its own detach closure so
  // closing window N never affects window N+1's listeners.
  win.on("closed", () => {
    tasks.off("event-appended", onEvent);
    tasks.off("task-saved", onSaved);
  });
}

function createMainWindow(): void {
  // Preload is emitted as .cjs (see electron.vite.config.ts — Electron's
  // preload loader is CommonJS-only and our package.json has type:module).
  const preloadPath = join(__dirname, "../preload/index.cjs");
  console.log("[main] creating window; preload =", preloadPath);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // avoid white flash — show on ready-to-show below
    webPreferences: {
      preload: preloadPath,
      /*
       * `sandbox: false` is required because our package.json has
       * "type": "module" — Electron's sandbox requires CommonJS preload,
       * and electron-vite outputs ESM under that setting. Security impact
       * is minimal for MC: we ship our own renderer and the contextBridge
       * (kept on via contextIsolation: true) still prevents the renderer
       * from touching Node APIs directly.
       */
      sandbox: false,
      contextIsolation: true,
    },
  });

  win.on("ready-to-show", () => {
    console.log("[main] window ready-to-show");
    win.show();
    // Dev convenience: open DevTools so the renderer Console + Network panes
    // are one Ctrl+Shift+I away. Skip in packaged builds.
    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: "right" });
    }
  });

  win.webContents.on("preload-error", (_e, preload, error) => {
    console.error("[main] preload-error:", preload, error);
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[main] renderer gone:", details);
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    console.log("[main] loading dev URL:", process.env["ELECTRON_RENDERER_URL"]);
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (bootstrappedTasks) {
    attachStoreForwarders(win, bootstrappedTasks);
  }
}

// Bootstrapped stores kept at module scope so createMainWindow (which may
// be called on macOS `activate`) can reattach forwarders to a new window.
let bootstrappedTasks: TaskStore | null = null;

app.whenReady().then(async () => {
  await bootstrapStores();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
