#!/usr/bin/env node
/**
 * mc-cli — create and inspect MC projects/tasks from the command line.
 *
 * Writes to the same `<userData>` directory MC reads from, so changes
 * appear in MC immediately (or on next launch). Schema validation
 * happens via the same Zod schemas MC uses (`src/shared/models.ts`),
 * so anything the CLI accepts is something MC will accept.
 *
 * Subcommands:
 *
 *   mc-cli paths
 *     Print the resolved userData / projects / tasks directories. No
 *     writes. Useful for confirming the CLI and MC agree on where data
 *     lives.
 *
 *   mc-cli project list [--json]
 *     List every project on disk (excluding samples).
 *
 *   mc-cli project create <slug> --name "<name>" --prefix <PREFIX>
 *                                [--path <abs-path>] [--icon <emoji>]
 *                                [--notes <text>] [--json]
 *     Create a new project. <slug> is the lowercase id used in folder
 *     names. <PREFIX> is the 1-8 alphanumeric short code embedded in
 *     task IDs (uppercased on save). `path` is the local repo folder
 *     this project tracks; empty string means "track-only".
 *
 *   mc-cli task list [--project <slug>] [--json]
 *     List tasks. Filter by project slug if given.
 *
 *   mc-cli task create --project <slug> --title "<title>"
 *                      [--description <text>]
 *                      [--workflow <abs-path-to-workflow.js>]
 *                      [--inputs <abs-path-to-inputs.json>]
 *                      [--kind single|campaign]
 *                      [--workflow-letter <A-Z>]    (default: F)
 *                      [--mode plan|yolo|forever]   (default: plan)
 *                      [--json]
 *     Create a task. If `--workflow` is given, also writes a
 *     `RUN_CONFIG.json` with `libraryWorkflow.diskPath` so MC's
 *     RunManager treats it as a curated workflow on Start. Inputs from
 *     `--inputs` (a JSON file) are folded into `runSettings.inputs`.
 *
 * Examples:
 *
 *   # Set up a sandbox project for the dad-joke MC integration test.
 *   node --experimental-strip-types scripts/mc-cli.ts project create test-sandbox `
 *     --name "Test Sandbox" --prefix TS --icon 🧪
 *
 *   # Wire a task to a curated workflow.
 *   node --experimental-strip-types scripts/mc-cli.ts task create `
 *     --project test-sandbox --title "Verify AGENT.md inlining" `
 *     --workflow .a5c/processes/agent-resolution-test.js `
 *     --inputs .a5c/processes/agent-resolution-test.inputs.json
 *
 * Exit codes:
 *   0  success
 *   1  validation/runtime error (printed to stderr)
 *   2  argument/usage error (printed to stderr)
 *
 * Override the data root: set MC_USER_DATA=<absolute-path> to point
 * the CLI at a non-default location (e.g. for testing).
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProjectStore } from "../src/main/project-store.ts";
import { TaskStore } from "../src/main/store.ts";
import type { Task } from "../src/shared/models.ts";

// =============================================================================
// userData resolution (no Electron). Mirrors `app.getPath("userData")`.
// =============================================================================

const APP_NAME = "mc-v2-electron"; // matches package.json `name`

export function resolveUserDataDir(): string {
  if (process.env.MC_USER_DATA) return process.env.MC_USER_DATA;
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) throw new Error("APPDATA env var not set on Windows");
    return path.join(appdata, APP_NAME);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg ?? path.join(os.homedir(), ".config"), APP_NAME);
}

// =============================================================================
// Tiny argv parser. No external deps (CLAUDE.md rule against bloat).
// =============================================================================

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function requireFlag(args: ParsedArgs, name: string): string {
  const v = args.flags[name];
  if (typeof v !== "string" || v.length === 0) {
    fail(`missing required flag: --${name}`, 2);
  }
  return v;
}

function optString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

function isJson(args: ParsedArgs): boolean {
  return args.flags.json === true || args.flags.json === "true";
}

// =============================================================================
// Output helpers
// =============================================================================

function emit(value: unknown, asJson: boolean): void {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

function fail(message: string, code: number): never {
  process.stderr.write(`mc-cli: ${message}\n`);
  process.exit(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// =============================================================================
// Store factory — both stores in one place so subcommands share resolution.
// =============================================================================

interface Stores {
  userData: string;
  projects: ProjectStore;
  tasks: TaskStore;
}

async function openStores(): Promise<Stores> {
  const userData = resolveUserDataDir();
  const projectsRoot = path.join(userData, "projects");
  const tasksRoot = path.join(userData, "tasks");
  const projects = new ProjectStore(projectsRoot);
  const tasks = new TaskStore(tasksRoot);
  await projects.init();
  // TaskStore creates folders on demand; no init needed beyond the parent
  // existing. Make sure it does.
  await fs.mkdir(tasksRoot, { recursive: true });
  return { userData, projects, tasks };
}

// =============================================================================
// Subcommands
// =============================================================================

async function cmdPaths(args: ParsedArgs): Promise<void> {
  const userData = resolveUserDataDir();
  const payload = {
    userData,
    projectsDir: path.join(userData, "projects"),
    tasksDir: path.join(userData, "tasks"),
    settingsFile: path.join(userData, "settings.json"),
    overriddenByEnv: !!process.env.MC_USER_DATA,
  };
  if (isJson(args)) {
    emit(payload, true);
  } else {
    process.stdout.write(`userData:    ${payload.userData}\n`);
    process.stdout.write(`projects:    ${payload.projectsDir}\n`);
    process.stdout.write(`tasks:       ${payload.tasksDir}\n`);
    process.stdout.write(`settings:    ${payload.settingsFile}\n`);
    process.stdout.write(
      `source:      ${payload.overriddenByEnv ? "MC_USER_DATA env var" : "platform default"}\n`,
    );
  }
}

async function cmdProjectList(args: ParsedArgs): Promise<void> {
  const { projects } = await openStores();
  const all = await projects.listProjects();
  const real = all.filter((p) => !p.isSample);
  if (isJson(args)) {
    emit(real, true);
    return;
  }
  if (real.length === 0) {
    process.stdout.write("No projects yet. Try: mc-cli project create <slug> --name ... --prefix ...\n");
    return;
  }
  for (const p of real) {
    const icon = p.icon ? `${p.icon} ` : "";
    const localPath = p.path ? ` · ${p.path}` : "";
    process.stdout.write(`${icon}${p.id} [${p.prefix}] · ${p.name}${localPath}\n`);
  }
}

async function cmdProjectCreate(args: ParsedArgs): Promise<void> {
  const slug = args.positional[0];
  if (!slug) fail("project create: <slug> is required", 2);
  const name = requireFlag(args, "name");
  const prefix = requireFlag(args, "prefix");

  const { projects } = await openStores();
  try {
    const project = await projects.createProject({
      id: slug,
      name,
      prefix,
      path: optString(args, "path") ?? "",
      notes: optString(args, "notes") ?? "",
      icon: optString(args, "icon") ?? "",
    });
    if (isJson(args)) {
      emit(project, true);
    } else {
      process.stdout.write(
        `Created project ${project.id} [${project.prefix}] "${project.name}"\n`,
      );
    }
  } catch (e) {
    fail((e as Error).message, 1);
  }
}

async function cmdTaskList(args: ParsedArgs): Promise<void> {
  const { tasks } = await openStores();
  const all = await tasks.listTasks();
  const projectFilter = optString(args, "project");
  const filtered = (projectFilter
    ? all.filter((t) => t.project === projectFilter)
    : all
  ).filter((t) => !t.isSample);

  if (isJson(args)) {
    emit(filtered, true);
    return;
  }
  if (filtered.length === 0) {
    process.stdout.write(
      projectFilter
        ? `No tasks in project "${projectFilter}".\n`
        : "No tasks yet. Try: mc-cli task create --project <slug> --title ...\n",
    );
    return;
  }
  for (const t of filtered) {
    process.stdout.write(
      `${t.id} · ${t.project} · [${t.status}/${t.runState}] · ${t.title}\n`,
    );
  }
}

async function cmdTaskCreate(args: ParsedArgs): Promise<void> {
  const projectId = requireFlag(args, "project");
  const title = requireFlag(args, "title");

  const { projects, tasks } = await openStores();

  const project = await projects.getProject(projectId);
  if (!project) {
    fail(
      `project "${projectId}" not found. Create it first: mc-cli project create ${projectId} --name "..." --prefix ...`,
      1,
    );
  }

  const kindFlag = optString(args, "kind") ?? "single";
  if (kindFlag !== "single" && kindFlag !== "campaign") {
    fail(`--kind must be "single" or "campaign", got "${kindFlag}"`, 2);
  }
  const kind = kindFlag as Task["kind"];

  const workflowLetter = (optString(args, "workflow-letter") ?? "F").toUpperCase();
  if (!/^[A-Z]$/.test(workflowLetter)) {
    fail(`--workflow-letter must be a single A-Z letter, got "${workflowLetter}"`, 2);
  }

  const modeFlag = optString(args, "mode") ?? "plan";
  if (!["plan", "yolo", "forever", "execute", "direct"].includes(modeFlag)) {
    fail(`--mode must be one of plan/yolo/forever/execute/direct, got "${modeFlag}"`, 2);
  }
  const babysitterMode = modeFlag as Task["babysitterMode"];

  const workflowPath = optString(args, "workflow");
  const inputsPath = optString(args, "inputs");

  // Validate workflow path early — easier to fix before the task is on disk.
  let absWorkflow: string | undefined;
  if (workflowPath) {
    absWorkflow = path.resolve(workflowPath);
    if (!existsSync(absWorkflow)) {
      fail(`workflow not found: ${absWorkflow}`, 1);
    }
  }
  let parsedInputs: Record<string, unknown> | undefined = undefined;
  if (inputsPath) {
    const absInputs = path.resolve(inputsPath);
    if (!existsSync(absInputs)) {
      fail(`inputs file not found: ${absInputs}`, 1);
    }
    try {
      const parsed = JSON.parse(await fs.readFile(absInputs, "utf8")) as unknown;
      if (!isPlainObject(parsed)) {
        fail("--inputs must be a JSON object", 1);
      }
      parsedInputs = parsed;
    } catch (e) {
      fail(`inputs file is not valid JSON: ${(e as Error).message}`, 1);
    }
  }

  // Create the task — TaskStore generates the ID and scaffolds the folder.
  const task = await tasks.createTask({
    title,
    description: optString(args, "description") ?? "",
    projectId: project!.id,
    projectPrefix: project!.prefix,
    workflow: workflowLetter,
    kind,
    babysitterMode,
  });

  // Wire up curated-workflow path if requested.
  if (absWorkflow) {
    const workflowId = path.basename(absWorkflow, path.extname(absWorkflow));
    const logicalPath = path
      .relative(process.cwd(), absWorkflow)
      .replace(/\\/g, "/")
      .replace(/\.js$/i, "");
    const runConfig: Record<string, unknown> = {
      kind: "library-workflow-run",
      createdAt: new Date().toISOString(),
      libraryWorkflow: {
        id: workflowId,
        name: workflowId,
        logicalPath,
        diskPath: absWorkflow,
        inputsSchemaPath: null,
      },
      taskContext: {
        title,
        goal: optString(args, "description") ?? "",
        projectId: project!.id,
      },
      runSettings: { model: null, inputs: parsedInputs ?? {} },
    };
    await tasks.writeRunConfig(task.id, runConfig);
  }

  if (isJson(args)) {
    emit(
      {
        task,
        runConfig: absWorkflow
          ? { diskPath: absWorkflow, hasInputs: parsedInputs !== undefined }
          : null,
      },
      true,
    );
  } else {
    process.stdout.write(`Created task ${task.id} in project ${project!.id}\n`);
    process.stdout.write(`  title:    ${task.title}\n`);
    process.stdout.write(`  kind:     ${task.kind}\n`);
    process.stdout.write(`  mode:     ${task.babysitterMode}\n`);
    if (absWorkflow) {
      process.stdout.write(`  workflow: ${absWorkflow}\n`);
      if (parsedInputs !== undefined) {
        process.stdout.write(`  inputs:   ${path.resolve(inputsPath!)}\n`);
      }
    }
  }
}

// =============================================================================
// Router
// =============================================================================

const USAGE = `mc-cli — manage MC projects and tasks.

Usage:
  mc-cli paths [--json]
  mc-cli project list [--json]
  mc-cli project create <slug> --name "<name>" --prefix <PREFIX>
                                [--path <abs-path>] [--icon <emoji>]
                                [--notes <text>] [--json]
  mc-cli task list [--project <slug>] [--json]
  mc-cli task create --project <slug> --title "<title>"
                     [--description <text>]
                     [--workflow <abs-path-to-workflow.js>]
                     [--inputs <abs-path-to-inputs.json>]
                     [--kind single|campaign]
                     [--workflow-letter <A-Z>]
                     [--mode plan|yolo|forever]
                     [--json]

Override data root with env var MC_USER_DATA.
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const namespace = argv[0];
  const action = argv[1];
  const rest = argv.slice(2);
  const args = parseArgs(rest);

  if (!namespace || namespace === "--help" || namespace === "-h") {
    process.stdout.write(USAGE);
    return;
  }

  try {
    if (namespace === "paths") {
      // `paths` is single-word; everything after is flags.
      await cmdPaths(parseArgs(argv.slice(1)));
      return;
    }
    if (namespace === "project") {
      if (action === "list") return cmdProjectList(args);
      if (action === "create") return cmdProjectCreate(args);
      fail(`unknown project action: "${action}". Try: list, create`, 2);
    }
    if (namespace === "task") {
      if (action === "list") return cmdTaskList(args);
      if (action === "create") return cmdTaskCreate(args);
      fail(`unknown task action: "${action}". Try: list, create`, 2);
    }
    fail(`unknown namespace: "${namespace}". Try: paths, project, task`, 2);
  } catch (e) {
    fail((e as Error).message ?? String(e), 1);
  }
}

main().catch((err) => {
  process.stderr.write(`mc-cli: ${err?.message ?? String(err)}\n`);
  process.exit(1);
});
