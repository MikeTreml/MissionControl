/**
 * Shared data models — importable from both the Electron main process and
 * the React renderer. No Node-only or DOM-only APIs here.
 *
 * Ported from mc-v2-pi-archive/core/models.py (Pydantic). Zod is the TS
 * equivalent: runtime validation + inferred static types from one schema.
 *
 * Convention:
 *   - Schemas are exported as `XxxSchema` (const).
 *   - Types are exported as `Xxx` (type).
 *   - Timestamps serialize as ISO 8601 strings (simple, JSON-friendly).
 *
 * DESIGN NOTE (2026-04-23): Roles are NOT enum. Every agent — primary or
 * subagent — is a folder under `agents/<slug>/agent.json`. The agent's
 * `code` field distinguishes:
 *   - 1 char  → primary role (planner=p, developer=d, reviewer=r, surgeon=s)
 *   - 2-4 chr → spawnable subagent (RepoMapper=rmp, DocRefresher=drf, ...)
 *
 * Agents are added/removed by dropping or deleting folders. No code change
 * required to introduce a new role or subagent.
 */
import { z } from "zod";

// ── enums ────────────────────────────────────────────────────────────────

/** Kanban lanes on the board. Codes mirror role names where it makes sense. */
export const LaneSchema = z.enum([
  "plan",
  "develop",
  "review",
  "surgery",
  "approval",
  "done",
]);
export type Lane = z.infer<typeof LaneSchema>;

/** Task state independent of which lane it sits in. */
export const TaskStatusSchema = z.enum([
  "active",    // currently being worked by an agent
  "waiting",   // blocked (e.g. awaiting human approval)
  "done",
  "archived",
  "failed",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Live run state for a task — drives the Start/Pause/Resume/Stop buttons. */
export const RunStateSchema = z.enum(["idle", "running", "paused"]);
export type RunState = z.infer<typeof RunStateSchema>;

/**
 * Shape of work:
 *   "single"   — one task × N cycles (the default, what the wireframe shows)
 *   "campaign" — one task × N items (e.g. harvest 1000 DLLs, process each)
 */
export const TaskKindSchema = z.enum(["single", "campaign"]);
export type TaskKind = z.infer<typeof TaskKindSchema>;

/**
 * One item in a campaign task. Each item represents one unit of work the
 * agent will process (one DLL, one file, one entity). The runtime
 * iterator (future: babysitter's ctx.map / pi-subagents parallel) spawns
 * a session per item.
 */
export const CampaignItemSchema = z.object({
  id: z.string().min(1),                       // stable identifier — user-supplied or auto-generated
  description: z.string().default(""),         // what pi should do for this item
  status: z
    .enum(["pending", "running", "done", "failed"])
    .default("pending"),
  notes: z.string().default(""),               // free-form — captures exit reason, summary, etc.
});
export type CampaignItem = z.infer<typeof CampaignItemSchema>;

// ── main models ──────────────────────────────────────────────────────────

/** Single uppercase letter workflow code (F=Feature, B=Bug, R=Refactor, S=Spike, ...). */
export const WorkflowLetterSchema = z
  .string()
  .length(1)
  .regex(/^[A-Z]$/, "workflow must be a single uppercase letter");

/**
 * One entry in a task's lane history. Missing `leftAt` = currently in this lane.
 * Lets the Project Detail / Task Detail pages render a timeline and compute
 * how long a task has been sitting in any given lane.
 */
export const LaneHistoryEntrySchema = z.object({
  lane: LaneSchema,
  enteredAt: z.string().datetime(),
  leftAt: z.string().datetime().optional(),
});
export type LaneHistoryEntry = z.infer<typeof LaneHistoryEntrySchema>;

/** A unit of work moving through the pipeline. Serialized in manifest.json. */
export const TaskSchema = z.object({
  id: z.string(),                              // e.g. "DA-015F"
  title: z.string(),
  description: z.string().default(""),
  project: z.string().default("default"),      // project id slug, e.g. "dogapp"
  workflow: WorkflowLetterSchema.default("F"), // e.g. "F" (Feature)
  kind: TaskKindSchema.default("single"),      // single-task vs campaign (N items)
  lane: LaneSchema.default("plan"),
  status: TaskStatusSchema.default("active"),
  runState: RunStateSchema.default("idle"),    // live state for Start/Pause/Stop
  // Slug of the agent currently working this task (refs agents/<slug>/).
  // Nullable = no one assigned yet.
  currentAgentSlug: z.string().nullable().default("planner"),
  cycle: z.number().int().default(1),          // increments on reviewer loop-back
  currentStep: z.string().default(""),         // short human-readable status line
  lastEvent: z.string().default(""),           // most-recent event summary
  laneHistory: z.array(LaneHistoryEntrySchema).default([]), // timeline data
  /**
   * Campaign items. Only populated when `kind === "campaign"`. Empty at
   * creation is fine — the Planner may generate them during its run.
   * Runtime iteration (one session per item) is PROPOSED and not wired
   * yet — see docs/WORKFLOW-EXECUTION.md for the babysitter plan.
   */
  items: z.array(CampaignItemSchema).default([]),
  createdAt: z.string().datetime(),            // ISO 8601
  updatedAt: z.string().datetime(),
});
export type Task = z.infer<typeof TaskSchema>;

/**
 * User-chosen project prefix used in task IDs. Alphanumeric, 1–8 chars.
 * Normalized to uppercase on parse so "da" and "DA" store identically.
 */
export const ProjectPrefixSchema = z
  .string()
  .min(1)
  .max(8)
  .regex(/^[A-Za-z0-9]+$/, "prefix must be alphanumeric (A–Z, 0–9)")
  .transform((s) => s.toUpperCase());

/** A group of related tasks. Minimal today — expands with repo linkage. */
export const ProjectSchema = z.object({
  id: z.string(),                              // slug, e.g. "dogapp"
  name: z.string(),                            // human-readable, e.g. "DogApp"
  prefix: ProjectPrefixSchema,                 // e.g. "DA" — used in task IDs
  path: z.string().default(""),                // local folder; empty = track-only
  notes: z.string().default(""),
  // Optional visual icon shown in the sidebar chip. Empty = use the prefix.
  // A short emoji or 1-2 chars works best; no schema enforcement so future
  // formats (svg data url, icon name from a library) can drop in.
  icon: z.string().default(""),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Git metadata derived from the project's path (not stored). Enriched in the
 * IPC layer before returning to the renderer. Renderer treats it as read-only.
 */
export type GitKind = "github" | "azure-devops" | "gitlab" | "git" | "none";
export interface GitInfo {
  kind: GitKind;
  label: string;        // "GitHub: owner/repo" etc.
  remoteUrl: string;
}

/** Renderer-shaped project: stored fields + derived git info. */
export interface ProjectWithGit extends Project {
  gitInfo: GitInfo;
}

/** Header KPIs. Computed at render time from the task list. */
export const KpiSchema = z.object({
  activeTasks: z.number().int().default(0),
  waitingApproval: z.number().int().default(0),
  runningAgents: z.number().int().default(0),
  failedRunsToday: z.number().int().default(0),
});
export type Kpi = z.infer<typeof KpiSchema>;

/**
 * An entry in the user-editable MODEL roster (`models.json`). New LLMs drop
 * in here — agents reference these by `id`.
 *
 * `kind` is a free string so new runtimes can be added without a code change.
 * The main process knows how to dispatch each known kind (anthropic, openai,
 * ollama, ...); unknown kinds throw at runtime with a clear error.
 *
 * ── PI-WIRE: DISPATCH BY KIND ──────────────────────────────────────────
 *
 * PROPOSED: the pi session manager has a `dispatch(kind, model, endpoint)`
 * switch. Known kinds map to pi's provider adapters:
 *   "anthropic" → pi uses ANTHROPIC_API_KEY + model id
 *   "openai"    → pi uses OPENAI_API_KEY + model id (Codex goes here)
 *   "ollama"    → pi talks to endpoint (defaults http://localhost:11434)
 *
 * OPEN: does pi already have all these adapters built in, or do we need
 * to configure them? See docs/PI-FEATURES.md — pi's /model picker suggests
 * auto-discovery. Verify during the wire-up.
 */
export const ModelDefinitionSchema = z.object({
  id: z.string().min(1),                       // stable id referenced by agents, e.g. "claude-opus"
  label: z.string().min(1),                    // human-readable, e.g. "Claude Opus 4.6"
  kind: z.string().min(1),                     // "anthropic" | "openai" | "ollama" | "other" | future kinds
  model: z.string().default(""),               // provider-specific model id, e.g. "claude-opus-4-6"
  endpoint: z.string().default(""),            // optional override, e.g. "http://localhost:11434"
  notes: z.string().default(""),
});
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>;

/**
 * A workflow — how a task moves through the board. Declared by workflow.json
 * under <root>/workflows/<CODE>-<slug>/workflow.json.
 *
 * `lanes` is an optional subset of LaneSchema values that this workflow
 * uses, in order. Omit to use the full LANE_ORDER. X-brainstorm, for
 * example, might only use ["plan", "develop", "done"] since it doesn't
 * need review/surgery/approval gates.
 */
export const WorkflowSchema = z.object({
  code: WorkflowLetterSchema,                  // "F"
  name: z.string().min(1),                     // "Feature"
  description: z.string().default(""),
  lanes: z.array(LaneSchema).optional(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * Resolve the lanes a workflow actually uses. Returns the workflow's
 * `lanes` if set, otherwise falls back to the project-wide LANE_ORDER.
 */
export function effectiveLanes(workflow: Workflow | undefined): readonly Lane[] {
  if (workflow?.lanes && workflow.lanes.length > 0) return workflow.lanes;
  return LANE_ORDER;
}

/**
 * Permission scope for an agent. Intentionally open-ended (.passthrough) —
 * the runtime interprets fields it knows about and ignores the rest, so this
 * can grow without a schema migration.
 *
 *   inherit      = start from parent's access, then apply further restrictions
 *   readonly     = no writes (overrides inherit)
 *   allowedPaths = restrict file access to these paths/globs
 */
export const AgentPermissionSchema = z
  .object({
    inherit: z.boolean().default(true),
    readonly: z.boolean().default(false),
    allowedPaths: z.array(z.string()).default([]),
  })
  .passthrough();
export type AgentPermission = z.infer<typeof AgentPermissionSchema>;

/**
 * An agent. One folder per agent at `agents/<slug>/agent.json`.
 *
 * The `code` distinguishes primary role (1 char) from subagent (2-4 chars).
 * This is how `DA-015F-p` (planner) and `DA-015F-rmp` (RepoMapper) are both
 * expressible in the same naming convention.
 *
 * `primaryModel` + `fallbackModels[]` reference ModelDefinition.id values from
 * the roster. The old `role-config.json` is gone — every agent declares its
 * own model directly.
 */
export const AgentSchema = z.object({
  slug: z.string().min(1),                     // folder slug, e.g. "python-dev" or "repomapper"
  name: z.string().min(1),                     // specific display name, e.g. "Python Dev" or "X++ Reviewer"
  /**
   * Soft category / role this agent plays. Multiple agents can share a title
   * (e.g. "Developer" covers both "Python Dev" and "C# Dev"; "Reviewer" covers
   * both generic and "Best-practice X++ reviewer"). Title groups agents in the
   * UI but isn't enforced — empty is fine.
   */
  title: z.string().default(""),
  code: z.string().min(1).max(4)
    .regex(/^[a-z0-9]+$/, "code must be lowercase alphanumeric, 1-4 chars"),
  description: z.string().default(""),
  primaryModel: z.string().default(""),        // ModelDefinition.id (or "" = caller chooses)
  fallbackModels: z.array(z.string()).default([]), // ModelDefinition.id list
  permissions: AgentPermissionSchema.default({}),
  // Optional prompt file inside the agent folder — e.g. "prompt.md".
  promptFile: z.string().default("prompt.md"),
});
export type Agent = z.infer<typeof AgentSchema>;

/**
 * One agent session run, persisted under `tasks/<id>/runs/<runId>.json`.
 *
 * Captures the telemetry needed for the Run History and Metrics pages:
 * who ran, for how long, how many tokens, did it finish cleanly.
 */
export const RunRecordSchema = z.object({
  id: z.string().min(1),                       // unique, e.g. "<taskId>-<isoStart>"
  taskId: z.string().min(1),
  agentSlug: z.string().min(1),                // agent that ran
  modelId: z.string().default(""),             // ModelDefinition.id used
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),   // unset = still running
  tokensIn: z.number().int().default(0),
  tokensOut: z.number().int().default(0),
  costUSD: z.number().default(0),              // 0 if provider doesn't report
  cycle: z.number().int().default(1),          // which Task.cycle this run belonged to
  exitReason: z
    .enum(["completed", "paused", "stopped", "failed", "ongoing"])
    .default("ongoing"),
  notes: z.string().default(""),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

/**
 * One subagent spawn event, persisted under `tasks/<id>/spawns/<spawnId>.json`.
 * A subagent IS an agent — `parentAgentSlug` is usually a primary role (1-char
 * code) but nothing stops a subagent from spawning another subagent.
 */
export const SubagentSpawnSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  parentAgentSlug: z.string().min(1),          // who spawned it
  agentSlug: z.string().min(1),                // which agent was spawned
  reason: z.string().default(""),              // short text — why was it spawned
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  modelId: z.string().default(""),             // model used
  exitReason: z
    .enum(["completed", "stopped", "failed", "ongoing"])
    .default("ongoing"),
});
export type SubagentSpawn = z.infer<typeof SubagentSpawnSchema>;

// ── helpers ──────────────────────────────────────────────────────────────

/**
 * App-level settings persisted to `<userData>/settings.json`. Distinct
 * from the LLM model roster (models.json) and from pi's own settings
 * (~/.pi/agent/settings.json). MC owns this file.
 *
 * `babysitterMode` controls which slash command `RunManager.start`
 * sends to babysitter-pi:
 *   - "plan"    → /plan   (author a process.js + run scaffold, don't run)
 *   - "execute" → /yolo   (author + run end-to-end, no breakpoints)
 *   - "direct"  → no slash command — send the task brief as a regular pi
 *                 prompt. Skips babysitter entirely. Use for trivial
 *                 tasks where babysitter's investigation overhead
 *                 (~$0.30 + 90s before any work happens) isn't worth it.
 *
 * Default is "plan" because it's the safest first test. Flip per task.
 */
export const MCSettingsSchema = z.object({
  babysitterMode: z.enum(["plan", "execute", "direct"]).default("plan"),
}).passthrough();
export type MCSettings = z.infer<typeof MCSettingsSchema>;

/** Fixed lane render order for the board. Source of truth — don't hardcode elsewhere. */
export const LANE_ORDER: readonly Lane[] = [
  "plan",
  "develop",
  "review",
  "surgery",
  "approval",
  "done",
] as const;

/** Create a new Task with sane defaults. Caller supplies id + title at minimum. */
export function makeTask(
  input: Pick<Task, "id" | "title"> & Partial<Task>,
): Task {
  const now = new Date().toISOString();
  return TaskSchema.parse({
    createdAt: now,
    updatedAt: now,
    ...input,
  });
}

/**
 * Build a task-linked file stem from a base task id + optional agent code.
 *   taskFile("DA-015F")          === "DA-015F"       (base file)
 *   taskFile("DA-015F", "p")     === "DA-015F-p"     (planner output)
 *   taskFile("DA-015F", "rmp")   === "DA-015F-rmp"   (RepoMapper subagent)
 */
export function taskFile(taskId: string, agentCode?: string): string {
  return agentCode ? `${taskId}-${agentCode}` : taskId;
}

/**
 * One line in a task's events.jsonl — the append-only journal.
 *
 * Kept intentionally open: a `type` string + arbitrary payload. The Run
 * Activity feed and Task Detail timeline read from this file. Keeping the
 * payload free-form means new event types can be added without a schema
 * migration. Known types so far: "created", "saved", "lane-changed",
 * "cycle-changed", "run-started", "run-ended", "subagent-spawned".
 */
export const TaskEventSchema = z
  .object({
    timestamp: z.string().datetime(),
    type: z.string().min(1),
  })
  .passthrough();
export type TaskEvent = z.infer<typeof TaskEventSchema>;

/** True if an agent is a primary role (1-char code), false if subagent. */
export function isPrimaryAgent(agent: Pick<Agent, "code">): boolean {
  return agent.code.length === 1;
}
