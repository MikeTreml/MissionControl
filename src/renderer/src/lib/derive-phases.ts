/**
 * Derive a task's phase timeline from its event journal, with multiple
 * fallback sources so every task surface gets *some* sensible chip strip.
 *
 *   1. **Curated workflow runs.** When the babysitter SDK CLI emits
 *      bs:phase / bs:error events (RunManager.startCuratedWorkflow), each
 *      `phase` value becomes a chip. The latest `bs:phase` is "active";
 *      anything before it is "done"; bs:error becomes "failed".
 *
 *   2. **Lane-changed events.** Legacy auto-gen path. Each
 *      `lane-changed` event with `{from, to}` extends the chip strip by
 *      one. Current chip = the lane the task is in *now* (per the
 *      latest event).
 *
 *   3. **Generic fallback.** No phase or lane events seen. Renders
 *      Draft / Active / Paused / Error / Finished based on runState.
 *
 * `task.lane` and `task.laneHistory` are NOT consulted here — they're
 * the legacy fields we're moving away from. The journal is the source
 * of truth.
 */
import type { Task, TaskEvent } from "../../../shared/models";

export interface DerivedPhase {
  id: string;
  label: string;
  status: "done" | "active" | "pending" | "failed";
  enteredAt?: string;
  leftAt?: string;
}

export interface DerivedPhases {
  phases: DerivedPhase[];
  source: "curated" | "lane" | "generic";
  /** The currently-active phase id, if any. */
  current: string | null;
}

const GENERIC_BY_RUN_STATE: Record<string, DerivedPhase[]> = {
  idle: [
    { id: "draft", label: "Draft", status: "active" },
    { id: "active", label: "Active", status: "pending" },
    { id: "finished", label: "Finished", status: "pending" },
  ],
  running: [
    { id: "draft", label: "Draft", status: "done" },
    { id: "active", label: "Active", status: "active" },
    { id: "finished", label: "Finished", status: "pending" },
  ],
  paused: [
    { id: "draft", label: "Draft", status: "done" },
    { id: "paused", label: "Paused", status: "active" },
    { id: "finished", label: "Finished", status: "pending" },
  ],
};

export function derivePhases(task: Task, events: TaskEvent[]): DerivedPhases {
  const curated = phasesFromCuratedEvents(events);
  if (curated.phases.length > 0) return curated;

  const lane = phasesFromLaneEvents(task, events);
  if (lane.phases.length > 0) return lane;

  return {
    phases: GENERIC_BY_RUN_STATE[task.runState] ?? GENERIC_BY_RUN_STATE.idle!,
    source: "generic",
    current: task.runState === "running" ? "active" : task.runState === "paused" ? "paused" : "draft",
  };
}

function phasesFromCuratedEvents(events: TaskEvent[]): DerivedPhases {
  const seen: DerivedPhase[] = [];
  let activeId: string | null = null;
  for (const ev of events) {
    if (ev.type !== "bs:phase" && ev.type !== "bs:error") continue;
    const rec = ev as unknown as Record<string, unknown>;
    const phase = typeof rec.phase === "string" ? rec.phase : null;
    if (!phase) continue;
    const id = `phase-${phase}`;
    const label = `Phase ${phase}`;
    const status: DerivedPhase["status"] = ev.type === "bs:error" ? "failed" : "done";

    // Mark all prior phases done, swap current to this one.
    for (const p of seen) if (p.status === "active") p.status = "done";
    const existing = seen.find((p) => p.id === id);
    if (existing) {
      existing.status = status;
      if (typeof rec.timestamp === "string") existing.leftAt = rec.timestamp;
    } else {
      seen.push({
        id,
        label,
        status,
        ...(typeof rec.timestamp === "string" ? { enteredAt: rec.timestamp } : {}),
      });
    }
    if (status !== "failed") activeId = id;
  }
  if (seen.length > 0 && activeId) {
    const last = seen[seen.length - 1]!;
    if (last.id === activeId) last.status = "active";
  }
  return { phases: seen, source: "curated", current: activeId };
}

function phasesFromLaneEvents(task: Task, events: TaskEvent[]): DerivedPhases {
  const transitions = events.filter((e) => e.type === "lane-changed");
  if (transitions.length === 0) return { phases: [], source: "lane", current: null };

  const phases: DerivedPhase[] = [];
  let prevAt = task.createdAt;
  let prevLane: string | null = null;

  for (const ev of transitions) {
    const rec = ev as unknown as Record<string, unknown>;
    const from = typeof rec.from === "string" ? rec.from : null;
    const to = typeof rec.to === "string" ? rec.to : null;
    const at = typeof rec.timestamp === "string" ? rec.timestamp : prevAt;
    const fromLabel = from ?? prevLane;
    if (fromLabel) {
      phases.push({
        id: `lane-${fromLabel}-${at}`,
        label: titleCase(fromLabel),
        status: "done",
        enteredAt: prevAt,
        leftAt: at,
      });
    }
    prevLane = to;
    prevAt = at;
  }
  if (prevLane) {
    phases.push({
      id: `lane-${prevLane}-current`,
      label: titleCase(prevLane),
      status: "active",
      enteredAt: prevAt,
    });
  }
  return {
    phases,
    source: "lane",
    current: phases.length > 0 ? phases[phases.length - 1]!.id : null,
  };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
