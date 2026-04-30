/**
 * Detect a task's *pending* SDK breakpoint by walking its event journal.
 *
 * The journal-reader (src/main/journal-reader.ts) appends every SDK
 * journal event to events.jsonl as `bs:journal:<lowercased-type>`. A
 * breakpoint is "pending" when we've seen a `breakpoint_opened` for an
 * effectId AND no matching `breakpoint_responded` (or
 * `effect_resolved_*`) has come in yet. The most recent such pair is
 * what surfaces on Task Detail's approval card.
 */
import type { TaskEvent } from "../../../shared/models";

export interface PendingBreakpoint {
  effectId: string;
  runPath: string;
  /** Question / payload metadata as written by the SDK. */
  payload: Record<string, unknown> | null;
  /** "owner" | string — who the breakpoint expects to respond. */
  expert: string | null;
  /** Routing tags from the SDK (e.g. ["approval-gate", "diagnosis"]). */
  tags: string[];
  openedAt: string | null;
}

export function derivePendingBreakpoint(events: TaskEvent[]): PendingBreakpoint | null {
  // The most recent `babysitter-run-detected` carries the runPath we
  // need for the response POST. Track it as we walk so we don't have
  // to re-derive it elsewhere.
  let runPath: string | null = null;
  // Map of effectId -> { open event index } — overwritten by later
  // openings of the same effectId (shouldn't happen, but safe).
  type Open = {
    effectId: string;
    payload: Record<string, unknown> | null;
    expert: string | null;
    tags: string[];
    openedAt: string | null;
  };
  const opens = new Map<string, Open>();
  const closed = new Set<string>();

  for (const ev of events) {
    const rec = ev as unknown as Record<string, unknown>;
    if (ev.type === "babysitter-run-detected") {
      const rp = typeof rec.runPath === "string" ? rec.runPath : null;
      if (rp) runPath = rp;
      continue;
    }
    if (ev.type === "bs:journal:breakpoint_opened") {
      const data = (rec.data as Record<string, unknown> | undefined) ?? {};
      const effectId = typeof data.effectId === "string" ? data.effectId : null;
      if (!effectId) continue;
      opens.set(effectId, {
        effectId,
        payload: (data.payload as Record<string, unknown> | undefined) ?? null,
        expert: typeof data.expert === "string" ? data.expert : null,
        tags: Array.isArray(data.tags) ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
        openedAt: typeof rec.recordedAt === "string" ? rec.recordedAt : (typeof rec.timestamp === "string" ? rec.timestamp : null),
      });
      continue;
    }
    if (
      ev.type === "bs:journal:breakpoint_responded" ||
      ev.type === "bs:journal:effect_resolved_ok" ||
      ev.type === "bs:journal:effect_resolved_error"
    ) {
      const data = (rec.data as Record<string, unknown> | undefined) ?? {};
      const effectId = typeof data.effectId === "string" ? data.effectId : null;
      if (effectId) closed.add(effectId);
    }
  }

  if (!runPath) return null;
  // Latest still-open breakpoint wins. Iterate insertion order in
  // reverse so the most recent open without a close pairs first.
  const entries = [...opens.entries()].reverse();
  for (const [effectId, open] of entries) {
    if (closed.has(effectId)) continue;
    return { ...open, runPath };
  }
  return null;
}
