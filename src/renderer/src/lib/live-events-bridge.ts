/**
 * Live events bridge — wires main-process push events into the renderer's
 * data-bus so existing hooks auto-refetch.
 *
 * Attached once at app startup (main.tsx). Side-effect module — call
 * `attachLiveEventsBridge()` before React renders.
 *
 * Two bridges:
 *   - main emits `task:event`   → publish("tasks") so every useTask /
 *     useTasks / useKpis consumer refetches
 *   - main emits `task:saved`   → same topic, same effect
 *
 * ── DEBOUNCING ─────────────────────────────────────────────────────────
 * Pi emits ~20-50 events/second during a babysitter run (we saw 3121
 * events in 137s in the spike). Without debouncing, every one would
 * trigger every subscriber to re-fetch via IPC, which is an O(tasks ×
 * events) storm. We coalesce publishes within a short window: leading-
 * edge fires immediately so the UI feels snappy; trailing fire guarantees
 * the final state lands after the last event.
 *
 * Components that need the event PAYLOAD itself (RightBar Run Activity,
 * future live-diff views) subscribe directly via `window.mc.onTaskEvent`
 * — they get every event, unthrottled, because they render incrementally
 * rather than re-fetching.
 */
import { publish } from "../hooks/data-bus";

const PUBLISH_COALESCE_MS = 400;

let attached = false;

export function attachLiveEventsBridge(): void {
  if (attached) return;
  if (!window.mc) {
    console.log("[live-events] window.mc unavailable; skipping bridge");
    return;
  }
  attached = true;

  const debouncedTasks = debounce(() => publish("tasks"), PUBLISH_COALESCE_MS);
  window.mc.onTaskEvent(debouncedTasks);
  window.mc.onTaskSaved(debouncedTasks);
  console.log("[live-events] bridge attached (debounce=" + PUBLISH_COALESCE_MS + "ms)");
}

/**
 * Leading-edge + trailing debounce. Fires `fn` immediately on the first
 * call, then suppresses subsequent calls for `waitMs`. One more call at
 * the end of the burst guarantees the final state is reflected.
 */
function debounce(fn: () => void, waitMs: number): () => void {
  let pending = false;
  let trailing = false;
  return () => {
    if (pending) {
      trailing = true;
      return;
    }
    fn();
    pending = true;
    setTimeout(() => {
      pending = false;
      if (trailing) {
        trailing = false;
        fn();
      }
    }, waitMs);
  };
}
