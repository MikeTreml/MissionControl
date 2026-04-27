/**
 * PiSessionManager — owns the live `AgentSession` instances behind each
 * running task, built directly on `@mariozechner/pi-coding-agent`.
 *
 * ── DEPENDENCY POLICY ──────────────────────────────────────────────────
 * MC depends only on pi (`@mariozechner/pi-coding-agent`). The babysitter
 * orchestration layer is delivered as a pi EXTENSION, not an npm dep:
 *
 *     pi install npm:@a5c-ai/babysitter-pi    # one-time, per user
 *
 * That extension registers `/babysit`, `/plan`, `/resume`, etc. as pi
 * skills, which pi sessions can invoke. We deliberately don't take
 * `@a5c-ai/babysitter` or `@a5c-ai/babysitter-sdk` as direct deps —
 * both live under pi's extension directory (`~/.pi/agent/extensions/`)
 * and pi manages their version. Duplicating them in our node_modules
 * risks version skew where MC's copy and pi's loaded copy diverge.
 *
 * ── BEHAVIOR ───────────────────────────────────────────────────────────
 * `start(taskId, options)` creates a pi session, subscribes its events
 * into the task's events.jsonl, and (if a prompt is supplied) kicks off
 * a turn via `session.prompt()`. When pi fires `agent_end`, we treat the
 * turn as complete, dispose the session, and invoke `onSessionEnd` so
 * the orchestrator (RunManager) can flip the task out of "running".
 *
 * `stop(taskId)` aborts + disposes immediately. Idempotent on unknown
 * task IDs so a late Stop click is safe.
 */
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";

import type { TaskStore } from "./store.ts";

interface Entry {
  session: AgentSession;
  unsubscribe: () => void;
  /** True once we've fired onSessionEnd — prevents double-dispatch on stop(). */
  ended: boolean;
}

export interface PiStartOptions {
  /** User prompt to drive one turn. Omit for a create-only session. */
  prompt?: string;
  /**
   * System prompt override — replaces pi's discovered default. Typically
   * the current agent's `prompt.md` content.
   */
  systemPrompt?: string;
  /** Working directory for the session (bash tool, cwd, etc.). */
  cwd?: string;
  /**
   * Model id to use. Accepts:
   *   - "provider:modelId"   e.g. "openai:gpt-5-codex"
   *   - "modelId"            searches all providers (prefers ones with auth)
   * When omitted, pi picks from its default configuration.
   */
  model?: string;
}

/** Compact shape sent over IPC — drops the heavy compat fields from pi's Model. */
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

export type SessionEndReason = "completed" | "failed";

export interface SessionEndResult {
  reason: SessionEndReason;
  /** Present when reason === "failed". */
  error?: unknown;
}

export type SessionEndHandler = (
  taskId: string,
  result: SessionEndResult,
) => void | Promise<void>;

export class PiSessionManager {
  private readonly tasks: TaskStore;
  private readonly sessions = new Map<string, Entry>();
  private onEnd: SessionEndHandler | null = null;
  private modelRegistryCache: ModelRegistry | null = null;

  constructor(tasks: TaskStore) {
    this.tasks = tasks;
  }

  /**
   * Lazy ModelRegistry cached per manager. Reads `~/.pi/agent/auth.json`
   * on first use to discover which providers the user is logged in to.
   */
  private getModelRegistry(): ModelRegistry {
    if (!this.modelRegistryCache) {
      this.modelRegistryCache = ModelRegistry.create(AuthStorage.create());
    }
    return this.modelRegistryCache;
  }

  /**
   * Return only models the user actually has access to right now — same
   * set pi's `/model` slash command and `pi list-models` CLI show, via
   * `ModelRegistry.getAvailable()` (filters to providers with auth
   * configured: API key in env, /login OAuth token, or models.json
   * custom-provider key).
   *
   * AuthStorage caches `~/.pi/agent/auth.json` in memory at construction.
   * To pick up new auth without restarting MC (the common case: user runs
   * `pi /login` in a separate shell, then opens the model picker), we
   * reload before each call. Cheap — one file read of a small JSON.
   */
  listModels(): PiModelInfo[] {
    const registry = this.getModelRegistry();
    registry.authStorage.reload();
    return registry.getAvailable().map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      api: m.api,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      costInputPerMTok: m.cost.input,
      costOutputPerMTok: m.cost.output,
      reasoning: m.reasoning,
    }));
  }

  /**
   * Register a handler fired when a prompted session completes (or errors).
   * RunManager sets this so it can flip Task.runState → idle.
   */
  setOnSessionEnd(handler: SessionEndHandler | null): void {
    this.onEnd = handler;
  }

  hasSession(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  activeTaskIds(): string[] {
    return [...this.sessions.keys()];
  }

  async start(taskId: string, options: PiStartOptions = {}): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new Error(`Pi session already active for task "${taskId}"`);
    }

    // Auth + model registry come from `~/.pi/agent/` (pi's own defaults)
    // — whatever `pi` CLI logged in or API key env vars are set.
    //
    // When a custom systemPrompt is supplied, we build a DefaultResourceLoader
    // with it as the base, overriding pi's ambient AGENTS.md / SYSTEM.md
    // discovery. Without one, we pass no loader and pi uses its defaults.
    const cwd = options.cwd ?? process.cwd();
    const resourceLoader = options.systemPrompt
      ? await buildResourceLoader(cwd, options.systemPrompt)
      : undefined;

    const resolvedModel = options.model
      ? this.resolveModel(options.model)
      : undefined;

    const { session } = await createAgentSession({
      cwd,
      ...(resourceLoader ? { resourceLoader } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
    });
    const entry: Entry = { session, unsubscribe: () => {}, ended: false };

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      // Mirror every pi event into MC's journal as `pi:<type>`. Fire-and-
      // forget — never let a journal write failure drop an event.
      void this.tasks.appendEvent(taskId, {
        type: `pi:${event.type}`,
        ...extractPayload(event),
      });

      // agent_end = the turn pi was running has finished. Treat as
      // completion; orchestrator decides what to do next.
      if (event.type === "agent_end") {
        void this.fireEnd(taskId, { reason: "completed" });
      }
    });
    entry.unsubscribe = unsubscribe;

    this.sessions.set(taskId, entry);

    if (options.prompt) {
      // Fire-and-forget the prompt; completion arrives via agent_end.
      // If prompt() throws synchronously (bad auth, etc.) we catch and
      // route through fireEnd as a failure so RunManager can react.
      session.prompt(options.prompt).catch((error) => {
        void this.fireEnd(taskId, { reason: "failed", error });
      });
    }
  }

  async stop(taskId: string): Promise<void> {
    const entry = this.sessions.get(taskId);
    if (!entry) return;

    entry.unsubscribe();
    try {
      await entry.session.abort();
    } catch {
      // abort can race a finishing turn; swallow to keep stop safe.
    }
    entry.session.dispose();
    this.sessions.delete(taskId);
  }

  /**
   * Look up a model by `"provider:modelId"` or a bare `modelId`. Throws
   * when no match — caller surfaces the error to the UI.
   */
  private resolveModel(spec: string): ReturnType<ModelRegistry["find"]> {
    const registry = this.getModelRegistry();
    if (spec.includes(":")) {
      const [provider, modelId] = spec.split(":", 2) as [string, string];
      const hit = registry.find(provider, modelId);
      if (hit) return hit;
    }
    const bareId = spec.includes(":") ? spec.split(":")[1]! : spec;
    for (const m of registry.getAll()) {
      if (m.id === bareId) return m;
    }
    throw new Error(`Unknown pi model "${spec}"`);
  }

  /**
   * Dispose the session and call onSessionEnd exactly once. Guards
   * against double-firing (e.g. agent_end + failed promise both arriving).
   */
  private async fireEnd(taskId: string, result: SessionEndResult): Promise<void> {
    const entry = this.sessions.get(taskId);
    if (!entry || entry.ended) return;
    entry.ended = true;

    await this.stop(taskId);
    if (this.onEnd) {
      try {
        await this.onEnd(taskId, result);
      } catch (err) {
        console.error(`[pi] onSessionEnd handler threw for ${taskId}:`, err);
      }
    }
  }
}

/**
 * Build a DefaultResourceLoader with the given system prompt replacing
 * pi's discovered default. `noExtensions`/`noSkills` keep the session
 * isolated from whatever the user has installed globally — MC drives pi
 * programmatically, not interactively, and ambient extensions would
 * surprise-leak into tasks.
 */
async function buildResourceLoader(
  cwd: string,
  systemPrompt: string,
): Promise<DefaultResourceLoader> {
  const agentDir = getAgentDir();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPrompt,
  });
  await loader.reload();
  return loader;
}

/**
 * Pick the JSON-serializable fields off a pi event and strip high-volume
 * fields we don't display. Without this the hello-test journal was ~40KB
 * for 5 words of output because `message_update` events duplicate the
 * full assistant message (including `thinkingSignature.encrypted_content`
 * blobs of ~3KB each) between `assistantMessageEvent.partial` and
 * `message`. The pruned shape keeps enough for UI rendering + cost
 * accounting (text deltas, tokens, cost, model/provider) and drops the
 * rest.
 */
const STRIPPED_KEYS = new Set([
  "thinkingSignature",   // pi's opaque thinking-state blob
  "encrypted_content",   // same, inside the signature
  "responseId",          // provider trace id, not useful
  "partial",             // full duplicate of outer `message`
]);

function extractPayload(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event as Record<string, unknown>)) {
    if (k === "type") continue;
    // `pi:message_update` has a huge `message` snapshot alongside the
    // smaller `assistantMessageEvent` — the latter is enough for live
    // rendering; drop `message` entirely on updates.
    if (k === "message" && (event as Record<string, unknown>).type === "message_update") continue;
    const pruned = prune(v);
    try {
      JSON.stringify(pruned);
      out[k] = pruned;
    } catch {
      // skip unserializable values
    }
  }
  return out;
}

function prune(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(prune);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIPPED_KEYS.has(k)) continue;
    out[k] = prune(v);
  }
  return out;
}
