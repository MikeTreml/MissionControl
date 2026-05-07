/**
 * Type for the `window.mc` API exposed by the preload script.
 *
 * Declared in terms of shared models — single source of truth. If preload
 * and this drift, the first mismatched call will surface at compile time.
 */
import type {
  Task,
  TaskEvent,
  ProjectWithGit,
  TaskKind,
  CampaignItem,
  MCSettings,
} from "../../shared/models";
import type { LibraryIndex } from "./types/library";

/** Summed run metrics from per-task `artifacts/*.metrics.json` files. */
export interface ProjectRunMetricsRollup {
  projectId: string;
  tasksWithArtifacts: number;
  metricsArtifactCount: number;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  wallTimeSeconds: number;
}

export interface WorkflowRunTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workflowLogicalPath: string;
  workflowName: string;
  projectId: string;
  goal: string;
  model: string | null;
  inputs: Record<string, unknown>;
}

export interface TestPresetInfo {
  id: string;
  name: string;
  group: string;
  description: string;
  cwd: string;
  command: string;
  args: string[];
  kind: "command" | "server";
  expectedReportPath?: string;
  cwdExists?: boolean;
}

export interface TestRunSnapshot {
  id: string;
  presetId: string;
  status: "running" | "passed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  cwd: string;
  commandLine: string;
  output: string;
}

export type TestRunnerEvent =
  | { type: "started"; run: TestRunSnapshot }
  | { type: "output"; runId: string; stream: "stdout" | "stderr"; text: string }
  | { type: "finished"; run: TestRunSnapshot };

type CreateTaskInput = {
  title: string;
  description?: string;
  projectId: string;
  projectPrefix: string;
  workflow?: string;
  kind?: TaskKind;
  items?: CampaignItem[];
  babysitterMode?: "plan" | "yolo" | "forever" | "execute" | "direct";
  /** Source task id when this is a re-run / clone / spin-off. */
  parentTaskId?: string;
};

type CreateProjectInput = {
  id: string;
  name: string;
  prefix: string;
  path?: string;
  notes?: string;
  icon?: string;
};

/**
 * Renderer-facing shape for the library:createWorkflow IPC. The `spec` field
 * is opaque at this boundary — main-process WorkflowGenerator validates shape
 * at runtime. See src/main/workflow-generator.ts for the full WorkflowSpec.
 */
export type CreateWorkflowOpts = {
  spec: Record<string, unknown>;
  category: string;
  slug: string;
};

export type CreateLibraryItemOpts = {
  kind: "agent" | "skill";
  targetRoot: string;
  slug: string;
  name: string;
  description: string;
  role?: string;
  philosophy?: string;
  tags?: string[];
  capabilities?: string[];
  tools?: string[];
  prerequisites?: string[];
};

export interface McApi {
  version: string;

  // tasks
  listTasks: () => Promise<Task[]>;
  getTask: (id: string) => Promise<Task | null>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  readTaskEvents: (id: string) => Promise<TaskEvent[]>;
  appendTaskEvent: (
    id: string,
    event: { type: string } & Record<string, unknown>,
  ) => Promise<void>;
  readTaskPrompt: (id: string) => Promise<string | null>;
  readTaskStatus: (id: string) => Promise<string | null>;
  readTaskRunConfig: (id: string) => Promise<Record<string, unknown> | null>;
  writeTaskRunConfig: (id: string, config: Record<string, unknown>) => Promise<void>;
  readTaskFile: (id: string, stem: string, options?: { cycle?: number }) => Promise<string | null>;
  listTaskFiles: (id: string) => Promise<Array<{ name: string; size: number; modifiedAt: string }>>;
  listTaskArtifacts: (id: string) => Promise<Array<{ name: string; size: number; modifiedAt: string }>>;
  readTaskArtifactJson: (id: string, fileName: string) => Promise<Record<string, unknown> | null>;
  listTaskFileCycles: (id: string, stem: string) => Promise<number[]>;
  appendTaskStatus: (id: string, line: string) => Promise<void>;
  openTaskFolder: (id: string) => Promise<{ ok: boolean; reason?: "not-found" }>;
  openPath: (absPath: string) => Promise<{ ok: boolean; reason?: "invalid-path" | "not-absolute" | "not-found" }>;

  // projects — enriched with derived git info on the main side
  listProjects: () => Promise<ProjectWithGit[]>;
  getProject: (id: string) => Promise<ProjectWithGit | null>;
  createProject: (input: CreateProjectInput) => Promise<ProjectWithGit>;
  // Edit a project. `id` and `prefix` are immutable; patch fields update the rest.
  updateProject: (
    id: string,
    patch: Partial<Omit<CreateProjectInput, "id" | "prefix">>,
  ) => Promise<ProjectWithGit>;
  deleteProject: (id: string) => Promise<void>;
  aggregateProjectRunMetrics: (projectId: string) => Promise<ProjectRunMetricsRollup>;

  // library catalog
  getLibraryIndex: () => Promise<LibraryIndex>;
  /** Walk the library tree in-process, write `_index.json`, return fresh index. */
  refreshLibraryIndex: () => Promise<LibraryIndex>;
  readLibraryJsonSchema: (absPath: string | null | undefined) => Promise<Record<string, unknown> | null>;
  readLibraryJsonFile: (absPath: string | null | undefined) => Promise<Record<string, unknown> | null>;
  /** Generate a workflow.js from a WorkflowSpec and write it under library/workflows/. */
  createLibraryWorkflow: (
    opts: CreateWorkflowOpts,
  ) => Promise<{ diskPath: string; relPath: string }>;
  /** Generate an AGENT.md or SKILL.md and rebuild library/_index.json. */
  createLibraryItem: (
    opts: CreateLibraryItemOpts,
  ) => Promise<{ diskPath: string; relPath: string }>;
  /**
   * Edit an item's sidecar metadata (INFO.json next to AGENT.md/SKILL.md,
   * or <stem>.info.json next to flat workflow / example sources). The
   * walker merges these on top of source-derived fields, so this is the
   * place editorial fields like containerKind / hasParallel / display
   * name overrides are persisted without modifying the source files.
   * `null` in the patch removes that key (source value wins again).
   * Triggers an in-process index rebuild before returning.
   */
  saveItemInfo: (opts: {
    kind: "agent" | "skill" | "workflow" | "example";
    diskPath: string;
    patch: Record<string, unknown>;
  }) => Promise<{ sidecarPath: string; contents: Record<string, unknown> }>;

  // per-project memory (~/.pi/memory-md/<projectId>/MEMORY.md). Pi will
  // consume this directly once it lands; MC reads/writes the same path
  // so the operator can edit memory from the Project page.
  readProjectMemory: (projectId: string) => Promise<string | null>;
  writeProjectMemory: (projectId: string, content: string) => Promise<void>;

  // runs (Start/Pause/Resume/Stop state machine; returns updated Task)
  startRun: (input: { taskId: string; agentSlug?: string; model?: string }) => Promise<Task>;
  pauseRun: (input: { taskId: string }) => Promise<Task>;
  resumeRun: (input: { taskId: string }) => Promise<Task>;
  stopRun: (input: { taskId: string; reason?: "user" | "completed" | "failed" }) => Promise<Task>;
  /**
   * POST a response back to a babysitter SDK breakpoint via
   * `babysitter task:post --status ok --value-inline '{...}'`. Used by
   * the journal-driven approval card on Task Detail.
   */
  respondBreakpoint: (input: {
    taskId: string;
    runPath: string;
    effectId: string;
    approved: boolean;
    response?: string;
    feedback?: string;
  }) => Promise<void>;
  /**
   * SDK-authoritative run state. Wraps `babysitter run:status --json`.
   * Returns null when the task has no detected run path yet (auto-gen
   * tasks before babysitter-pi spins one up).
   */
  runStatus: (taskId: string) => Promise<unknown | null>;
  /**
   * SDK-authoritative pending-effects list. Wraps
   * `babysitter task:list --pending --json`. The shape is the SDK's
   * `{ tasks: Array<{ effectId, kind, label?, status }> }`. Use this
   * for breakpoint/approval detection instead of walking events.
   */
  runListPending: (taskId: string) => Promise<{ tasks?: Array<{ effectId: string; kind: string; label?: string; status?: string }> } | null>;

  // pi meta
  listPiModels: () => Promise<PiModelInfo[]>;

  // mc_ask_user — pending question routing
  listPendingAsks: (taskId: string) => Promise<PendingAskInfo[]>;
  answerAsk: (taskId: string, toolCallId: string, answer: string) => Promise<boolean>;
  cancelAsk: (taskId: string, toolCallId: string) => Promise<boolean>;

  // app settings
  getSettings: () => Promise<MCSettings>;
  saveSettings: (patch: Partial<MCSettings>) => Promise<MCSettings>;
  listWorkflowRunTemplates: () => Promise<WorkflowRunTemplate[]>;
  saveWorkflowRunTemplate: (input: Omit<WorkflowRunTemplate, "createdAt" | "updatedAt">) => Promise<WorkflowRunTemplate>;
  deleteWorkflowRunTemplate: (id: string) => Promise<void>;

  // local test lab
  listTestPresets: () => Promise<TestPresetInfo[]>;
  listTestRuns: () => Promise<TestRunSnapshot[]>;
  startTestRun: (presetId: string) => Promise<TestRunSnapshot>;
  cancelTestRun: (runId: string) => Promise<TestRunSnapshot | null>;
  onTestEvent: (listener: (payload: TestRunnerEvent) => void) => () => void;

  // live events (subscribe; returns unsubscribe)
  onTaskEvent: (listener: (payload: { taskId: string; event: TaskEvent }) => void) => () => void;
  onTaskSaved: (listener: (payload: { task: Task }) => void) => () => void;

  // app
  appVersion: () => Promise<string>;
}

/** Pending mc_ask_user question, surfaced in Task Detail. */
export interface PendingAskInfo {
  toolCallId: string;
  params: {
    question: string;
    category: "scope" | "ambiguity" | "destructive" | "credential";
    why_blocked: string;
    options?: string[];
  };
  postedAt: number;
}

/** Compact model info the renderer can show in the picker. */
export interface PiModelInfo {
  id: string;
  name: string;
  provider: string;
  api: string;
  contextWindow: number;
  maxTokens: number;
  costInputPerMTok: number;
  costOutputPerMTok: number;
  reasoning: boolean;
}

declare global {
  interface Window {
    mc: McApi;
  }
}

export {};
