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
  id: z.string(),                              // e.g. "DA-015F" — workflow letter encoded in suffix
  title: z.string(),
  description: z.string().default(""),
  project: z.string().default("default"),      // project id slug, e.g. "dogapp"
  kind: TaskKindSchema.default("single"),      // single-task vs campaign (N items)
  lane: LaneSchema.default("plan"),
  status: TaskStatusSchema.default("active"),
  runState: RunStateSchema.default("idle"),    // live state for Start/Pause/Stop
  cycle: z.number().int().default(1),          // increments on reviewer loop-back
  currentStep: z.string().default(""),         // short human-readable status line
  lastEvent: z.string().default(""),           // most-recent event summary
  laneHistory: z.array(LaneHistoryEntrySchema).default([]), // timeline data
  /**
   * Campaign items. Only populated when `kind === "campaign"`. Empty at
   * creation is fine — the Planner may generate them during its run.
   * CONFIRMED: RunManager opens one pi session per item; Stop marks any
   * running item failed; failed items don't halt the campaign.
   */
  items: z.array(CampaignItemSchema).default([]),
  /**
   * Free-text reason this task is currently blocked, if any. Decoupled
   * from `runState`/`lane` so it works in every wait scenario:
   * "Awaiting customer clarification" while runState=idle, "Build
   * callback pending" while paused, "Plannotator review" while in the
   * approval lane. Empty string = not blocked.
   */
  blocker: z.string().default(""),
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
  // Max number of tasks MC should actively run at once.
  runConcurrencyCap: z.number().int().min(1).max(50).default(10),
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
 * One line in a task's events.jsonl — the append-only journal.
 *
 * Kept intentionally open: a `type` string + arbitrary payload. The Run
 * Activity feed and Task Detail timeline read from this file. Keeping the
 * payload free-form means new event types can be added without a schema
 * migration. Known types so far: "created", "saved", "lane-changed",
 * "cycle-changed", "run-started", "run-ended", "step:start",
 * "step:agent-end", "step:end", "subagent-spawned".
 */
export const TaskEventSchema = z
  .object({
    timestamp: z.string().datetime(),
    type: z.string().min(1),
  })
  .passthrough();
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const StepStartEventSchema = TaskEventSchema.extend({
  type: z.literal("step:start"),
  stepId: z.string().min(1),
  cycle: z.number().int().min(1),
  expected: z.number().int().min(1),
  agents: z.array(z.string().min(1)).min(1),
});
export type StepStartEvent = z.infer<typeof StepStartEventSchema>;

export const StepAgentEndEventSchema = TaskEventSchema.extend({
  type: z.literal("step:agent-end"),
  stepId: z.string().min(1),
  cycle: z.number().int().min(1),
  agent: z.string().min(1),
  status: z.enum(["ok", "failed"]),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  expected: z.number().int().min(1),
  outputPath: z.string().optional(),
  error: z.string().optional(),
});
export type StepAgentEndEvent = z.infer<typeof StepAgentEndEventSchema>;

export const StepEndEventSchema = TaskEventSchema.extend({
  type: z.literal("step:end"),
  stepId: z.string().min(1),
  cycle: z.number().int().min(1),
  status: z.enum(["ok", "partial", "aborted"]),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  expected: z.number().int().min(1),
});
export type StepEndEvent = z.infer<typeof StepEndEventSchema>;

