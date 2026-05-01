/**
 * Journal-shape assertions for event-sourced workflow runs.
 *
 * The single highest-leverage assertion in babysitter-style tests is
 * "the journal is complete and correctly ordered." Every successful run
 * MUST produce: RUN_CREATED → n × EFFECT_REQUESTED → n × EFFECT_RESOLVED → RUN_COMPLETED.
 *
 * If the journal looks right, the run is replayable; if it looks wrong, no
 * downstream assertion saves you. These helpers exist so individual smokes
 * don't reimplement the same boilerplate.
 *
 * Inspired by babysitter's e2e-tests/docker/pi-workflow.test.ts journalTypes
 * assertions, but generalized so the count and identity of effects is also
 * checked, not just the presence of event types.
 */
import type { JournalEvent } from "@a5c-ai/babysitter-sdk";
import { assert, assertEqual } from "./assert.ts";

type AnyRecord = Record<string, unknown>;

function eventTypes(events: JournalEvent[]): string[] {
  return events.map((e) => e.type);
}

function eventsOfType(events: JournalEvent[], type: string): JournalEvent[] {
  return events.filter((e) => e.type === type);
}

function payload(event: JournalEvent): AnyRecord {
  // SDK journal events use `data` (not `payload`) for the per-event body.
  return ((event as unknown as { data?: AnyRecord }).data ?? {}) as AnyRecord;
}

/**
 * Assert the journal is a complete success chain:
 *   RUN_CREATED → exactly N × EFFECT_REQUESTED → exactly N × EFFECT_RESOLVED → RUN_COMPLETED.
 *
 * `expectedEffects` is the count of effects (tasks/breakpoints/sleeps) the
 * workflow is supposed to issue. Pass `0` for a no-task no-op process.
 */
export function assertJournalComplete(
  events: JournalEvent[],
  expectedEffects: number,
): void {
  assert(events.length > 0, "journal has at least one event");
  assertEqual(events[0].type, "RUN_CREATED", "first event is RUN_CREATED");
  assertEqual(
    events[events.length - 1].type,
    "RUN_COMPLETED",
    "last event is RUN_COMPLETED",
  );
  assertEqual(
    eventsOfType(events, "EFFECT_REQUESTED").length,
    expectedEffects,
    `journal contains ${expectedEffects} EFFECT_REQUESTED event(s)`,
  );
  assertEqual(
    eventsOfType(events, "EFFECT_RESOLVED").length,
    expectedEffects,
    `journal contains ${expectedEffects} EFFECT_RESOLVED event(s)`,
  );

  // Each EFFECT_REQUESTED must precede its matching EFFECT_RESOLVED.
  const seenRequests = new Set<string>();
  for (const ev of events) {
    if (ev.type === "EFFECT_REQUESTED") {
      const id = String(payload(ev).effectId ?? "");
      seenRequests.add(id);
    } else if (ev.type === "EFFECT_RESOLVED") {
      const id = String(payload(ev).effectId ?? "");
      assert(
        seenRequests.has(id),
        `EFFECT_RESOLVED for ${id} was preceded by its EFFECT_REQUESTED`,
      );
    }
  }
}

/**
 * Assert that the workflow requested effects in this exact order, by taskId.
 * Useful for verifying phase ordering in a curated workflow.
 *
 * Effects from `ctx.parallel.*` may interleave; for those use the looser
 * `assertEffectTaskIds` which only checks set membership.
 */
export function assertEffectOrder(
  events: JournalEvent[],
  expectedTaskIds: readonly string[],
): void {
  const requested = eventsOfType(events, "EFFECT_REQUESTED").map(
    (e) => String(payload(e).taskId ?? ""),
  );
  assertEqual(
    requested.length,
    expectedTaskIds.length,
    `effect-request count matches expected order length (${expectedTaskIds.length})`,
  );
  for (let i = 0; i < expectedTaskIds.length; i++) {
    assertEqual(
      requested[i],
      expectedTaskIds[i],
      `effect #${i + 1} is taskId=${expectedTaskIds[i]}`,
    );
  }
}

/**
 * Assert that the workflow requested every taskId in `expectedTaskIds`,
 * regardless of order or duplicates. Use for parallel-invoked tasks.
 */
export function assertEffectTaskIds(
  events: JournalEvent[],
  expectedTaskIds: readonly string[],
): void {
  const requested = new Set(
    eventsOfType(events, "EFFECT_REQUESTED").map(
      (e) => String(payload(e).taskId ?? ""),
    ),
  );
  for (const id of expectedTaskIds) {
    assert(requested.has(id), `journal contains effect for taskId=${id}`);
  }
}

/** Returns the EFFECT_REQUESTED payloads keyed by taskId (last write wins). */
export function effectsByTaskId(events: JournalEvent[]): Map<string, AnyRecord> {
  const out = new Map<string, AnyRecord>();
  for (const ev of eventsOfType(events, "EFFECT_REQUESTED")) {
    const p = payload(ev);
    out.set(String(p.taskId ?? ""), p);
  }
  return out;
}

/** Convenience for debugging — `console.log(summarizeJournal(events))`. */
export function summarizeJournal(events: JournalEvent[]): string {
  return eventTypes(events)
    .map((t, i) => `${String(i + 1).padStart(3, "0")} ${t}`)
    .join("\n");
}
