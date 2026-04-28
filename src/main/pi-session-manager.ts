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
import {
  makeAskUserTool,
  type AskUserParams,
} from "./ask-user-tool.ts";

interface PendingAsk {
  toolCallId: string;
  params: AskUserParams;
  resolve: (value: { answer: string; cancelled?: boolean }) => void;
  postedAt: number;
}

interface Entry {
  session: AgentSession;
  unsubscribe: () => void;
  /** True once we've fired onSessionEnd — prevents double-dispatch on stop(). */
  ended: boolean;
  /** True while MC has paused the task via session.steer(). */
  paused: boolean;
  /** Open ask_user calls keyed by toolCallId. resolve() is called by the IPC handler when the renderer sends an answer. */
  pendingAsks: Map<string, PendingAsk>;
  /** Last successful ask timestamp — drives the runtime rate limit per task. */
  lastAskedAt?: number;
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

  /**
   * List currently pending ask_user calls for a task (renderer uses this
   * to seed the question card on first mount, in addition to the live
   * `pi:awaiting_input` event stream).
   */
  pendingAsksFor(taskId: string): Array<{
    toolCallId: string;
    params: AskUserParams;
    postedAt: number;
  }> {
    const entry = this.sessions.get(taskId);
    if (!entry) return [];
    return [...entry.pendingAsks.values()].map((p) => ({
      toolCallId: p.toolCallId,
      params: p.params,
      postedAt: p.postedAt,
    }));
  }

  /**
   * Resolve a pending ask_user with the user's answer. The pi tool's
   * `execute()` Promise resolves and the agent sees `answer` as the tool
   * result. No-op if the ask was already answered/cancelled (keeps the
   * IPC channel idempotent in the face of double-clicks).
   */
  answerAsk(taskId: string, toolCallId: string, answer: string): boolean {
    const entry = this.sessions.get(taskId);
    if (!entry) return false;
    const pending = entry.pendingAsks.get(toolCallId);
    if (!pending) return false;
    entry.pendingAsks.delete(toolCallId);
    pending.resolve({ answer });
    void this.tasks.appendEvent(taskId, {
      type: "pi:input_answered",
      toolCallId,
      answerLength: answer.length,
    });
    return true;
  }

  /** Mark a pending ask as cancelled (e.g. user clicked Stop). */
  cancelAsk(taskId: string, toolCallId: string): boolean {
    const entry = this.sessions.get(taskId);
    if (!entry) return false;
    const pending = entry.pendingAsks.get(toolCallId);
    if (!pending) return false;
    entry.pendingAsks.delete(toolCallId);
    pending.resolve({ answer: "", cancelled: true });
    return true;
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

    // Per-task ask_user tool: closes over `entry` (created below) so the
    // tool's hooks read/write the live entry's pending map + lastAskedAt.
    // Build the entry shell first so the tool can capture it; we mutate
    // the session/unsubscribe properties after createAgentSession returns.
    const entry: Entry = {
      session: undefined as unknown as AgentSession, // filled below
      unsubscribe: () => {},
      ended: false,
      paused: false,
      pendingAsks: new Map(),
    };
    const askUserTool = makeAskUserTool({
      postQuestion: (toolCallId, params) =>
        new Promise((resolve) => {
          entry.pendingAsks.set(toolCallId, {
            toolCallId,
            params,
            resolve,
            postedAt: Date.now(),
          });
          // Surface the question to the renderer via the journal — TaskDetail
          // subscribes to `pi:awaiting_input` and renders an answer card.
          void this.tasks.appendEvent(taskId, {
            type: "pi:awaiting_input",
            toolCallId,
            question: params.question,
            category: params.category,
            why_blocked: params.why_blocked,
            options: params.options ?? [],
          });
        }),
      getLastAskedAt: () => entry.lastAskedAt,
      recordAsk: (now) => { entry.lastAskedAt = now; },
    });

    const { session } = await createAgentSession({
      cwd,
      ...(resourceLoader ? { resourceLoader } : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      customTools: [askUserTool],
    });
    entry.session = session;

    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      // Mirror every pi event into MC's journal as `pi:<type>`. Fire-and-
      // forget — never let a journal write failure drop an event.
      void this.tasks.appendEvent(taskId, {
        type: `pi:${event.type}`,
        ...extractPayload(event),
      });

      // agent_end = the turn pi was running has finished. If MC paused the
      // task via session.steer(), keep the session alive so resume can send a
      // follow-up into the same conversation instead of disposing it.
      if (event.type === "agent_end") {
        if (entry.paused) {
          void this.tasks.appendEvent(taskId, {
            type: "pi:session-held",
            reason: "paused",
          });
          return;
        }
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

  async steer(taskId: string, text: string): Promise<void> {
    const entry = this.sessions.get(taskId);
    if (!entry) {
      throw new Error(`No active pi session for task "${taskId}"`);
    }
    entry.paused = true;
    await entry.session.steer(text);
  }

  async followUp(taskId: string, text: string): Promise<void> {
    const entry = this.sessions.get(taskId);
    if (!entry) {
      throw new Error(`No active pi session for task "${taskId}"`);
    }
    entry.paused = false;
    await entry.session.followUp(text);
  }

  async stop(taskId: string): Promise<void> {
    const entry = this.sessions.get(taskId);
    if (!entry) return;

    // Cancel any pending ask_user calls so their Promises resolve and
    // pi's tool-call machinery cleans up rather than hanging forever.
    for (const pending of entry.pendingAsks.values()) {
      pending.resolve({ answer: "", cancelled: true });
    }
    entry.pendingAsks.clear();

    entry.paused = false;
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
