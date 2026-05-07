# Agent Telemetry Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist broad agent/session/tool telemetry from multiple runtimes and surface it in Mission Control through a clean observability dashboard and optional details page.

**Architecture:** Add a file-first telemetry subsystem parallel to tasks, not a replacement for per-task `events.jsonl`. Store normalized summary events in append-only JSONL under `<userData>/telemetry/events/`, store large payloads and raw hook inputs by reference under `<userData>/telemetry/artifacts/`, then expose query IPC and React hooks/pages. Runtime-specific collectors normalize Claude Code, Codex, Pi, babysitter, Serena, and future Ollama data into one tolerant schema where missing fields are expected.

**Tech Stack:** Electron main process, TypeScript, Zod, React, existing `window.mc` IPC bridge, file-first JSON/Markdown persistence, no SQLite or DB server.

---

## Design decisions

- Keep telemetry global and task-linkable. A task can have zero, one, or many sessions; telemetry should still be inspectable even before the final session/task connection design is settled.
- Store more than the first UI needs. Dashboard queries return small summaries; detail views can load referenced payload files on demand.
- Do not store a full running log inline. Store `transcriptPath`, `agentTranscriptPath`, `rawPayloadPath`, `toolResponsePath`, `diffPath`, and `statusFilePath` references.
- Normalize without pretending all runtimes are equal. Claude Code has richer subagent/task hooks; Codex hooks are currently narrower; Ollama reports token/performance metrics at API response level; Pi already emits session events into task journals.
- Keep the page visually calm and operational: overview KPIs, live/recent timeline, session table, provider coverage badges, details drawer/page.

## File structure

### Shared contracts

- Modify: `src/shared/models.ts`
  - Add telemetry schemas/types near `TaskEventSchema`:
    - `TelemetryProviderSchema`
    - `TelemetryEventKindSchema`
    - `TelemetrySessionSummarySchema`
    - `TelemetryEventSchema`
    - `TelemetryQuerySchema`
    - `TelemetryDashboardSummarySchema`

### Main process

- Create: `src/main/telemetry-store.ts`
  - Owns `<userData>/telemetry/` layout.
  - Append/read/query normalized telemetry events.
  - Writes large payload artifacts by content-address or event id.
  - Produces dashboard summaries.

- Create: `src/main/telemetry-store.smoke.ts`
  - Tests init, append, query filters, artifact references, tolerant malformed-line handling, and summary rollups.

- Create: `src/main/telemetry-normalize.ts`
  - Pure functions for normalizing runtime-specific payloads.
  - Inputs: Claude hook payload, Codex hook payload, Pi task event, Ollama usage object, Serena snapshot.
  - Output: `TelemetryEvent`.

- Create: `src/main/telemetry-normalize.smoke.ts`
  - Tests representative payloads for Claude, Codex, Pi, Ollama, and sparse unknown provider payloads.

- Modify: `src/main/index.ts`
  - Instantiate `TelemetryStore` with `join(userData, "telemetry")`.
  - Call `telemetry.init()` during boot.
  - Pass `telemetry` into `registerIpc`.

- Modify: `src/main/ipc.ts`
  - Add `telemetry` to `Stores`.
  - Add IPC channels:
    - `telemetry:summary`
    - `telemetry:listEvents`
    - `telemetry:listSessions`
    - `telemetry:getEvent`
    - `telemetry:readArtifact`
    - `telemetry:ingest`
    - `telemetry:openFolder`
  - Keep channel naming `<domain>:<verb>`.

- Modify: `src/preload/index.ts`
  - Expose thin wrappers:
    - `telemetrySummary()`
    - `listTelemetryEvents(query)`
    - `listTelemetrySessions(query)`
    - `getTelemetryEvent(id)`
    - `readTelemetryArtifact(path)`
    - `ingestTelemetry(payload)`
    - `openTelemetryFolder()`

### Renderer types/hooks/libs

- Modify: `src/renderer/src/global.d.ts`
  - Add typed `McApi` methods for telemetry IPC.

- Create: `src/renderer/src/hooks/useTelemetry.ts`
  - Loads summary, sessions, and recent events.
  - Falls back to empty state when bridge unavailable.
  - Subscribes to the existing data-bus topic `telemetry`.

- Create: `src/renderer/src/lib/telemetry-format.ts`
  - Formatting helpers: provider label, kind label, duration, tokens, cost, artifact basename, status tone.

### Renderer pages/components

- Create: `src/renderer/src/pages/Telemetry.tsx`
  - Top-level overview page.
  - Sections:
    - KPI cards: sessions, events, tool calls, failures, tokens in/out, cost, providers seen.
    - Provider coverage strip: Claude Code, Codex, Pi, Babysitter, Serena, Ollama, Unknown.
    - Recent timeline: compact event rows with provider/kind/status/time/task/session.
    - Sessions table: session id, provider, model, cwd/project/task, started, last event, tool count, failures, artifact links.
    - Empty state explaining where data will appear and that transcript/file paths may exist before full connection wiring.

- Create: `src/renderer/src/pages/TelemetryDetail.tsx`
  - Detail page for selected session or event.
  - Reads one session/event plus referenced artifacts.
  - Shows metadata, linked task/project if present, transcript path, artifact list, tool timeline, final message excerpt, and raw JSON preview toggle.

- Create: `src/renderer/src/components/TelemetryEventRow.tsx`
  - Single-line row used by overview and details.

- Create: `src/renderer/src/components/TelemetrySessionTable.tsx`
  - Session summary table used by overview.

- Create: `src/renderer/src/components/TelemetryArtifactLinks.tsx`
  - Renders transcript/raw/diff/status/tool-response references with `openPath` actions.

- Modify: `src/renderer/src/router.ts`
  - Add `"telemetry"` and `"telemetry-detail"` to `ViewId`.
  - Add optional `selectedTelemetryId` if details need route state. If avoiding router shape changes, keep detail selection local in `Telemetry.tsx` as a drawer for the first slice.

- Modify: `src/renderer/src/App.tsx`
  - Import/register `Telemetry` and `TelemetryDetail` or drawer variant.

- Modify: `src/renderer/src/components/Sidebar.tsx`
  - Add a System nav item labeled `Telemetry` with a neutral/semantic glyph.
  - Prefer a simple ASCII/mono-friendly glyph if replacing emoji is in scope later; current Sidebar uses emoji, so match existing convention for this slice.

- Modify: `src/renderer/src/styles.css`
  - Add only page-specific utility classes needed by telemetry components.
  - Use existing tokens (`--surface`, `--raised`, `--muted`, `--success-bg`, etc.).

## Storage contract

Proposed disk layout:

```text
<userData>/telemetry/
  index.json                    # schemaVersion, createdAt, lastCompactedAt, counters
  events/
    2026-05-07.jsonl            # normalized append-only events, daily partition
  sessions/
    <sessionId>.summary.json     # latest derived summary per session/provider
  artifacts/
    <eventId>/
      raw.json                   # full hook/runtime payload, when useful
      tool-response.json         # large tool result, if separated
      diff.patch                 # optional diff snapshot/ref
      note.md                    # optional human-readable summary
```

`TelemetryEvent` minimum shape:

```ts
type TelemetryEvent = {
  id: string;
  timestamp: string;
  provider: "claude-code" | "codex" | "pi" | "babysitter" | "serena" | "ollama" | "manual" | "unknown";
  kind:
    | "session-started"
    | "session-ended"
    | "user-prompt"
    | "tool-started"
    | "tool-completed"
    | "tool-failed"
    | "tool-batch-completed"
    | "subagent-started"
    | "subagent-ended"
    | "task-created"
    | "task-completed"
    | "file-changed"
    | "diff-captured"
    | "model-usage"
    | "error";
  status: "ok" | "running" | "failed" | "blocked" | "unknown";
  sessionId?: string;
  turnId?: string;
  agentId?: string;
  agentType?: string;
  taskId?: string;
  projectId?: string;
  cwd?: string;
  model?: string;
  toolName?: string;
  toolUseId?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUSD?: number;
  transcriptPath?: string;
  agentTranscriptPath?: string;
  artifactRefs?: Array<{ kind: string; path: string; size?: number }>;
  summary?: string;
  rawShapeVersion: number;
};
```

Unknown fields remain in the raw artifact. The normalized row stays small enough for list views.

## Runtime source mapping

### Claude Code

Use hooks when available:

- `SessionStart` → `session-started`, model, transcript path, cwd.
- `UserPromptSubmit` → `user-prompt`, store prompt excerpt + raw payload path.
- `PreToolUse` → `tool-started`, tool name/input/id.
- `PostToolUse` → `tool-completed`, tool response ref, duration.
- `PostToolUseFailure` → `tool-failed`, error, duration.
- `PostToolBatch` → `tool-batch-completed`.
- `SubagentStart` / `SubagentStop` → subagent lifecycle + `agent_transcript_path`.
- `TaskCreated` / `TaskCompleted` → task lifecycle where available.
- `Stop` / `StopFailure` → session/turn completion or error.

### Codex

Use Codex hooks with feature flag `codex_hooks = true` where available:

- Common fields: session id, transcript path, cwd, model.
- Current useful events: `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`.
- Codex currently reports narrower tool coverage than Claude Code; store provider coverage honestly rather than backfilling missing subagent data.

### Pi/babysitter

Use existing MC task journals first:

- `PiSessionManager` already mirrors `AgentSessionEvent` as `pi:<event.type>` into task `events.jsonl`.
- Add a lightweight bridge later that copies selected `pi:*`, `bs:*`, and run events into telemetry store for global cross-task views.
- Keep task journals authoritative for task detail; telemetry is a cross-session index.

### Serena

Optional enrichment adapter:

- Store snapshot paths/summary from Serena dashboard endpoints when discovered:
  - `/get_log_messages`
  - `/get_tool_stats`
  - `/queued_task_executions`
  - `/last_execution`
  - `/get_config_overview`
- Label clearly as `provider: "serena"`; Serena only sees Serena MCP tool usage.

### Ollama

When MC directly invokes or proxies Ollama later:

- Normalize usage fields from final response chunk:
  - `total_duration`
  - `load_duration`
  - `prompt_eval_count`
  - `prompt_eval_duration`
  - `eval_count`
  - `eval_duration`
- Map `prompt_eval_count` → `tokensIn`, `eval_count` → `tokensOut`, nanosecond durations → milliseconds.

## Task breakdown

### Task 1: Shared telemetry contracts

**Files:**
- Modify: `src/shared/models.ts`

- [ ] Add provider/kind/status schemas.
- [ ] Add `TelemetryArtifactRefSchema`.
- [ ] Add `TelemetryEventSchema` with passthrough for forward compatibility.
- [ ] Add query/summary/session schemas.
- [ ] Run `npm run typecheck:node` and `npm run typecheck:web`.

### Task 2: Main-process telemetry store

**Files:**
- Create: `src/main/telemetry-store.ts`
- Create: `src/main/telemetry-store.smoke.ts`

- [ ] Implement `init()` to create `telemetry/events`, `telemetry/sessions`, `telemetry/artifacts` and seed `index.json`.
- [ ] Implement `appendEvent(eventInput)` to validate, assign id/timestamp if missing, write daily JSONL, update session summary, and emit `event-appended`.
- [ ] Implement `writeArtifact(eventId, kind, content)` with safe file names and JSON/text support.
- [ ] Implement `listEvents(query)` with provider/kind/status/session/task/date filters and limit.
- [ ] Implement `listSessions(query)` by reading `sessions/*.summary.json`.
- [ ] Implement `dashboardSummary()` with totals and provider coverage.
- [ ] Smoke test all behavior using a temp directory.
- [ ] Run `node --experimental-strip-types src/main/telemetry-store.smoke.ts`.

### Task 3: Normalizers

**Files:**
- Create: `src/main/telemetry-normalize.ts`
- Create: `src/main/telemetry-normalize.smoke.ts`

- [ ] Implement `normalizeClaudeHookPayload(payload)`.
- [ ] Implement `normalizeCodexHookPayload(payload)`.
- [ ] Implement `normalizePiTaskEvent(taskId, event)`.
- [ ] Implement `normalizeOllamaUsage(payload)`.
- [ ] Implement `normalizeUnknownPayload(payload)` fallback.
- [ ] Smoke test sparse/missing fields: every normalizer must return useful partial events, not throw on missing optional fields.
- [ ] Run `node --experimental-strip-types src/main/telemetry-normalize.smoke.ts`.

### Task 4: IPC bridge

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/global.d.ts`

- [ ] Instantiate and initialize `TelemetryStore` in `bootstrapStores()`.
- [ ] Add telemetry to `Stores` and register IPC handlers.
- [ ] Add preload wrappers.
- [ ] Add renderer global types.
- [ ] Forward telemetry store events to renderer via `telemetry:event` and data-bus topic `telemetry`, or defer live push and use refetch-on-mount for first slice.
- [ ] Run `npm run typecheck:node` and `npm run typecheck:web`.

### Task 5: Renderer telemetry hook and formatters

**Files:**
- Create: `src/renderer/src/hooks/useTelemetry.ts`
- Create: `src/renderer/src/lib/telemetry-format.ts`

- [ ] Implement `useTelemetry()` to fetch summary, recent events, and sessions in parallel.
- [ ] Return empty state on missing `window.mc`.
- [ ] Add `refresh()` and subscribe to `telemetry` data-bus topic if live forwarder is added.
- [ ] Implement formatting helpers for duration, tokens, cost, provider/kind labels, and status tone.
- [ ] Run `npm run typecheck:web`.

### Task 6: Telemetry overview page

**Files:**
- Create: `src/renderer/src/pages/Telemetry.tsx`
- Create: `src/renderer/src/components/TelemetryEventRow.tsx`
- Create: `src/renderer/src/components/TelemetrySessionTable.tsx`
- Create: `src/renderer/src/components/TelemetryArtifactLinks.tsx`

- [ ] Build topbar with title `Telemetry` and muted subtitle `Agent activity across providers`.
- [ ] Build KPI row with sessions/events/tool calls/failures/tokens/cost.
- [ ] Build provider coverage strip.
- [ ] Build recent timeline from normalized events.
- [ ] Build sessions table with click/selection support.
- [ ] Build empty state that explains data is stored file-first and providers may vary in completeness.
- [ ] Keep styles simple and token-based.
- [ ] Run `npm run typecheck:web`.

### Task 7: Details surface

**Files:**
- Create: `src/renderer/src/pages/TelemetryDetail.tsx` OR add a details drawer inside `Telemetry.tsx`
- Modify: `src/renderer/src/router.ts` only if a separate page is selected
- Modify: `src/renderer/src/App.tsx` only if a separate page is selected

Recommended first slice: drawer inside `Telemetry.tsx` to avoid router shape churn.

- [ ] Show selected session/event metadata.
- [ ] Show transcript/status/raw/diff artifact links with `openPath`.
- [ ] Show tool timeline for that session.
- [ ] Show raw JSON preview only behind a `Show raw` toggle.
- [ ] Run `npm run typecheck:web`.

### Task 8: Sidebar route

**Files:**
- Modify: `src/renderer/src/router.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

- [ ] Add `telemetry` to `ViewId`.
- [ ] Register `Telemetry` in `CurrentView`.
- [ ] Add `Telemetry` button under System, near Metrics.
- [ ] Run `npm run typecheck:web`.

### Task 9: Ingestion seed paths

**Files:**
- Modify: `src/main/pi-session-manager.ts` or `src/main/run-manager.ts` only if using existing MC events as first ingestion source
- Create: `docs/TELEMETRY.md`

Recommended first ingestion source: copy selected existing `pi:*`, `bs:*`, `run-started`, `run-ended`, and metrics artifact data into `TelemetryStore` at append time. External hook connection can come later.

- [ ] Add internal ingestion for existing MC/Pi/babysitter event stream.
- [ ] Document hook payload endpoint/IPC for future Claude/Codex connection without wiring it yet.
- [ ] Document disk layout and privacy expectations.
- [ ] Run `npm run typecheck:node` and relevant smoke tests.

### Task 10: Verification

**Files:**
- Update smoke script only if adding telemetry smokes to package-wide `npm run smoke` is desired.

- [ ] Run telemetry store smoke.
- [ ] Run telemetry normalize smoke.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Optionally run `npm run verify-ui` after build.

## Open questions for execution

- Whether to add a separate details page immediately or start with a details drawer. Recommendation: drawer first; separate page later if navigation history/deep-linking becomes useful.
- Whether external hook ingestion should be IPC-only for now or an HTTP localhost endpoint. Recommendation: IPC/internal first for MC-owned Pi events; later add a small local HTTP collector only when Claude/Codex connection wiring begins.
- Whether raw payload retention should have a size cap. Recommendation: store raw payloads by default, but cap single artifact preview in UI and add future retention settings.

## References

- Claude Code hooks expose session, tool, subagent, task, and transcript metadata: https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex hooks support session, prompt, pre/post tool, permission, and stop events with currently narrower coverage: https://developers.openai.com/codex/hooks
- Ollama usage metrics include prompt/output token counts and duration fields in final responses/chunks: https://docs.ollama.com/api/usage
