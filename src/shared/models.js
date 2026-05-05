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
 * DESIGN NOTE (2026-04-23, refreshed 2026-04-30): Roles are NOT enum.
 * The library at `library/` is the source of truth for every agent,
 * skill, and workflow. Workflows declare which agents they use; MC
 * does not maintain a fixed roster. Adding a new agent or subagent
 * means dropping a folder under `library/`, then rebuilding the
 * index — no code change required.
 */
import { z } from "zod";
// ── enums ────────────────────────────────────────────────────────────────
/** Task lifecycle status independent of run state. */
export const TaskStatusSchema = z.enum([
    "active", // currently being worked by an agent
    "waiting", // blocked (e.g. awaiting human approval)
    "done",
    "archived",
    "failed",
]);
/** Live run state for a task — drives the Start/Pause/Resume/Stop buttons. */
export const RunStateSchema = z.enum(["idle", "running", "paused"]);
/**
 * Shape of work:
 *   "single"   — one task × N cycles (the default, what the wireframe shows)
 *   "campaign" — one task × N items (e.g. harvest 1000 DLLs, process each)
 */
export const TaskKindSchema = z.enum(["single", "campaign"]);
export const ScopePolicySchema = z.enum(["strict", "balanced", "flexible", "experimental"]);
export const ImpactPolicySchema = z.enum(["low", "medium", "high"]);
export const RiskPolicySchema = z.enum(["low", "medium", "high"]);
export const AutoProceedModeSchema = z.enum(["off", "suggest", "auto"]);
export const ProjectDecisionPolicySchema = z.object({
    scope: ScopePolicySchema.default("balanced"),
    impact: ImpactPolicySchema.default("medium"),
    risk: RiskPolicySchema.default("medium"),
    autoProceedMode: AutoProceedModeSchema.default("suggest"),
});
export const FeatureDecisionScoreSchema = z.object({
    scope: z.number().min(0).max(100),
    impact: z.number().min(0).max(100),
    risk: z.number().min(0).max(100),
});
/**
 * One item in a campaign task. Each item represents one unit of work the
 * agent will process (one DLL, one file, one entity). The runtime
 * iterator (future: babysitter's ctx.map / pi-subagents parallel) spawns
 * a session per item.
 */
export const CampaignItemSchema = z.object({
    id: z.string().min(1), // stable identifier — user-supplied or auto-generated
    description: z.string().default(""), // what pi should do for this item
    status: z
        .enum(["pending", "running", "done", "failed"])
        .default("pending"),
    notes: z.string().default(""), // free-form — captures exit reason, summary, etc.
});
// ── main models ──────────────────────────────────────────────────────────
/** A unit of work moving through the pipeline. Serialized in manifest.json. */
export const TaskSchema = z.object({
    id: z.string(), // e.g. "DA-015F" — workflow letter encoded in suffix
    title: z.string(),
    description: z.string().default(""),
    project: z.string().default("default"), // project id slug, e.g. "dogapp"
    kind: TaskKindSchema.default("single"), // single-task vs campaign (N items)
    status: TaskStatusSchema.default("active"),
    runState: RunStateSchema.default("idle"), // live state for Start/Pause/Stop
    cycle: z.number().int().default(1), // increments on workflow loop-back (e.g. review failed → re-plan)
    /**
     * Campaign items. Only populated when `kind === "campaign"`. Empty at
     * creation is fine — the workflow's planning agent may generate items
     * during its run. CONFIRMED: RunManager opens one pi session per item;
     * Stop marks any running item failed; failed items don't halt the
     * campaign.
     */
    items: z.array(CampaignItemSchema).default([]),
    /** Decision score used by project policy gates. Null means not scored yet. */
    decisionScore: FeatureDecisionScoreSchema.nullable().default(null),
    /**
     * Free-text reason this task is currently blocked, if any. Decoupled
     * from `runState`/`lane` so it works in every wait scenario:
     * "Awaiting customer clarification" while runState=idle, "Build
     * callback pending" while paused, "Plannotator review" while in the
     * approval lane. Empty string = not blocked.
     */
    blocker: z.string().default(""),
    /**
     * Lineage — id of the task that spawned this one, if any. Empty string
     * (default) means "no parent." Used by:
     *   - Doctor / spin-off pattern: a stuck task forks a child to debug it
     *   - Cascading creation: authoring an agent that needs a missing skill
     *     spawns a child to author the skill
     *   - Planning tasks: a meta-task whose output is a list of child tasks
     * Children are queried by scanning all tasks for matching parentTaskId
     * (no inverse index — task counts are small and the scan is cheap).
     */
    parentTaskId: z.string().default(""),
    createdAt: z.string().datetime(), // ISO 8601
    updatedAt: z.string().datetime(),
    /**
     * How MC should drive pi when this task is Started. Was global in
     * MCSettings; moved to per-task on 2026-05-01 so different tasks can
     * use different modes without flipping a global setting between runs.
     *
     *   - "plan"    → /plan   (author a process.js + run scaffold, don't run)
     *   - "execute" → /yolo   (author + run end-to-end, no breakpoints)
     *   - "direct"  → no slash command — send the task brief as a regular
     *                 pi prompt. Skips babysitter entirely. Cheapest.
     *
     * Defaults to "plan" — the safest first test.
     */
    babysitterMode: z.enum(["plan", "execute", "direct"]).default("plan"),
    /**
     * Marker for sample/demo records that ship with the app under
     * `library/samples/`. Tagged at read-time by TaskStore when loaded
     * from the sample root; never written back to user data. The
     * renderer filters these out when MCSettings.showSampleData is false.
     */
    isSample: z.boolean().default(false),
});
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
    id: z.string(), // slug, e.g. "dogapp"
    name: z.string(), // human-readable, e.g. "DogApp"
    prefix: ProjectPrefixSchema, // e.g. "DA" — used in task IDs
    path: z.string().default(""), // local folder; empty = track-only
    notes: z.string().default(""),
    /** Feature/task decision policy used by MC gates. Scope is always a hard gate. */
    policy: ProjectDecisionPolicySchema.default({}),
    // Optional visual icon shown in the sidebar chip. Empty = use the prefix.
    // A short emoji or 1-2 chars works best; no schema enforcement so future
    // formats (svg data url, icon name from a library) can drop in.
    icon: z.string().default(""),
    /** Same semantics as `Task.isSample`. Tagged at read-time. */
    isSample: z.boolean().default(false),
});
// ── helpers ──────────────────────────────────────────────────────────────
/**
 * App-level settings persisted to `<userData>/settings.json`. Distinct
 * from the LLM model roster (models.json) and from pi's own settings
 * (~/.pi/agent/settings.json). MC owns this file.
 *
 * Babysitter mode used to live here as a global; it was moved to
 * Task.babysitterMode on 2026-05-01 so different tasks can use
 * different modes without flipping a global setting between runs.
 */
export const MCSettingsSchema = z.object({
    // Max number of tasks MC should actively run at once.
    runConcurrencyCap: z.number().int().min(1).max(50).default(10),
    /**
     * Show pre-baked sample tasks/projects from `library/samples/` alongside
     * real user data. Default true so first-run users see a populated UI
     * without setting anything up. Toggle off in Settings to hide samples
     * once the user has their own work going. Sample records are tagged
     * isSample:true at read time and filtered in the renderer hooks.
     */
    showSampleData: z.boolean().default(true),
    /** Runtime/review display behavior. Keep live review useful while avoiding
     * unnecessary rendering across multiple active projects. */
    liveTaskEventStreaming: z.boolean().default(true),
    pendingEffectFallbackPolling: z.boolean().default(true),
    pendingEffectPollIntervalMs: z.number().int().min(5_000).max(300_000).default(15_000),
    liveUpdatesOnlyInTaskDetails: z.boolean().default(true),
    lazyRawLogs: z.boolean().default(true),
    /** Generated workflow safety gate. Off by default until generator wiring is
     * validated across existing specs. */
    generatedWorkflowConfidenceGate: z.boolean().default(false),
    confidenceThreshold: z.number().int().min(0).max(100).default(90),
    /** Hide legacy/borrowed metadata labels like domainGroup from MC UI without
     * breaking old indexed data that may still contain those fields. */
    hideLegacyDomainGroup: z.boolean().default(true),
}).passthrough();
/** Create a new Task with sane defaults. Caller supplies id + title at minimum. */
export function makeTask(input) {
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
export const StepStartEventSchema = TaskEventSchema.extend({
    type: z.literal("step:start"),
    stepId: z.string().min(1),
    cycle: z.number().int().min(1),
    expected: z.number().int().min(1),
    agents: z.array(z.string().min(1)).min(1),
});
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
export const StepEndEventSchema = TaskEventSchema.extend({
    type: z.literal("step:end"),
    stepId: z.string().min(1),
    cycle: z.number().int().min(1),
    status: z.enum(["ok", "partial", "aborted"]),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
    expected: z.number().int().min(1),
});
