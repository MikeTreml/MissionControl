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
  ModelDefinition,
  Workflow,
  Agent,
  Lane,
  TaskKind,
  CampaignItem,
} from "../../shared/models";

type CreateTaskInput = {
  title: string;
  description?: string;
  projectId: string;
  projectPrefix: string;
  workflow?: string;
  lane?: Lane;
  kind?: TaskKind;
  items?: CampaignItem[];
};

type CreateProjectInput = {
  id: string;
  name: string;
  prefix: string;
  path?: string;
  notes?: string;
  icon?: string;
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

  // models (the LLM roster)
  listModels: () => Promise<ModelDefinition[]>;
  saveModels: (models: ModelDefinition[]) => Promise<void>;
  suggestedModels: () => Promise<ModelDefinition[]>;

  // read-only loaders
  listAgents: () => Promise<Agent[]>;
  listWorkflows: () => Promise<Workflow[]>;

  // runs (Start/Pause/Resume/Stop state machine; returns updated Task)
  startRun: (input: { taskId: string; agentSlug?: string; model?: string }) => Promise<Task>;
  pauseRun: (input: { taskId: string }) => Promise<Task>;
  resumeRun: (input: { taskId: string }) => Promise<Task>;
  stopRun: (input: { taskId: string; reason?: "user" | "completed" | "failed" }) => Promise<Task>;

  // pi meta
  listPiModels: () => Promise<PiModelInfo[]>;

  // live events (subscribe; returns unsubscribe)
  onTaskEvent: (listener: (payload: { taskId: string; event: TaskEvent }) => void) => () => void;
  onTaskSaved: (listener: (payload: { task: Task }) => void) => () => void;

  // app
  appVersion: () => Promise<string>;
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
