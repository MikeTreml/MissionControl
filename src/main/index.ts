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
import { join } from "node:path";

import { TaskStore } from "./store.ts";
import { ProjectStore } from "./project-store.ts";
import { ModelRosterStore } from "./model-roster.ts";
import { WorkflowLoader } from "./workflows.ts";
import { AgentLoader } from "./agent-loader.ts";
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

  // PI-WIRE: RunManager currently only mutates Task.runState + appends
  // events. When pi lands it grows a PiSessionManager dependency and the
  // start/pause/resume/stop methods delegate real session work. The IPC
  // channels (`runs:*`) stay the same either way.
  const runs = new RunManager(tasks);

  registerIpc({ tasks, projects, models, workflows, agents, runs });
  console.log("[main] IPC handlers registered");
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
}

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
