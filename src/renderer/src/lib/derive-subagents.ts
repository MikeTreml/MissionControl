/**
 * Flat list of subagent-style work items on a task. Combines two
 * sources of "subagent" signal:
 *
 *   1. **SDK journal effects** — `bs:journal:effect_requested` with a
 *      taskDef title becomes a subagent row; resolved-ok/error close
 *      it with a duration. This is the primary source for curated
 *      workflow runs (RunManager.startCuratedWorkflow → JournalReader).
 *
 *   2. **Pi subagent events** — `pi:subagent_spawn` / `pi:subagent_complete`
 *      from the auto-gen path (babysitter-pi inside a pi session).
 *
 * Exposed as a flat list so the Subagents panel on Task Detail doesn't
 * have to know the difference.
 */
import type { TaskEvent } from "../../../shared/models";

export type SubagentStatus = "running" | "completed" | "failed";

export interface SubagentEntry {
  /** Stable id — effectId from SDK or spawnId from pi. */
  id: string;
  source: "sdk" | "pi";
  label: string;
  /** Optional subtitle (e.g. agent name, kind). */
  subtitle: string | null;
  status: SubagentStatus;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
}

export function deriveSubagents(events: TaskEvent[]): SubagentEntry[] {
  const out = new Map<string, SubagentEntry>();
  for (const ev of events) {
    const rec = ev as unknown as Record<string, unknown>;
    if (ev.type === "bs:journal:effect_requested") {
      const data = (rec.data as Record<string, unknown> | undefined) ?? {};
      const effectId = typeof data.effectId === "string" ? data.effectId : null;
      if (!effectId) continue;
      // Skip breakpoints — they're rendered by the approval card.
      const kind = typeof data.kind === "string" ? data.kind : "effect";
      if (kind === "breakpoint") continue;
      const taskDef = (data.taskDef as Record<string, unknown> | undefined) ?? {};
      const label =
        firstString(taskDef, ["title", "name"]) ??
        firstString(data, ["label"]) ??
        effectId;
      const subtitle = firstString(taskDef, ["agent", "skill", "name"]) ?? kind;
      out.set(effectId, {
        id: effectId,
        source: "sdk",
        label,
        subtitle,
        status: "running",
        startedAt: pickTimestamp(rec),
        endedAt: null,
        durationMs: null,
      });
    } else if (ev.type === "bs:journal:effect_resolved_ok" || ev.type === "bs:journal:effect_resolved_error") {
      const data = (rec.data as Record<string, unknown> | undefined) ?? {};
      const effectId = typeof data.effectId === "string" ? data.effectId : null;
      if (!effectId) continue;
      const existing = out.get(effectId);
      if (!existing) continue;
      const endedAt = pickTimestamp(rec);
      existing.status = ev.type === "bs:journal:effect_resolved_error" ? "failed" : "completed";
      existing.endedAt = endedAt;
      if (existing.startedAt && endedAt) {
        const ms = new Date(endedAt).getTime() - new Date(existing.startedAt).getTime();
        if (Number.isFinite(ms) && ms >= 0) existing.durationMs = ms;
      }
    } else if (ev.type === "pi:subagent_spawn") {
      const spawnId = firstString(rec, ["spawnId", "id"]) ?? `pi-${out.size}`;
      out.set(spawnId, {
        id: spawnId,
        source: "pi",
        label: firstString(rec, ["agentName", "subagent", "agentSlug"]) ?? spawnId,
        subtitle: firstString(rec, ["reason"]) ?? null,
        status: "running",
        startedAt: pickTimestamp(rec),
        endedAt: null,
        durationMs: null,
      });
    } else if (ev.type === "pi:subagent_complete") {
      const spawnId = firstString(rec, ["spawnId", "id"]);
      const existing = spawnId ? out.get(spawnId) : undefined;
      if (!existing) continue;
      const endedAt = pickTimestamp(rec);
      const dur = typeof rec.durationMs === "number" ? rec.durationMs : null;
      const exitReason = firstString(rec, ["exitReason"]);
      existing.status = exitReason === "failed" ? "failed" : "completed";
      existing.endedAt = endedAt;
      existing.durationMs = dur ?? (existing.startedAt && endedAt
        ? new Date(endedAt).getTime() - new Date(existing.startedAt).getTime()
        : null);
    }
  }
  // Newest first — running rows float to the top, then most recent endedAt.
  return [...out.values()].sort((a, b) => {
    if (a.status === "running" && b.status !== "running") return -1;
    if (b.status === "running" && a.status !== "running") return 1;
    const aT = a.endedAt ?? a.startedAt ?? "";
    const bT = b.endedAt ?? b.startedAt ?? "";
    return bT.localeCompare(aT);
  });
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickTimestamp(rec: Record<string, unknown>): string | null {
  if (typeof rec.recordedAt === "string") return rec.recordedAt;
  if (typeof rec.timestamp === "string") return rec.timestamp;
  return null;
}
