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
 * Components that need the event PAYLOAD itself (RightBar Run Activity,
 * Task Detail Run History) subscribe directly via `window.mc.onTaskEvent`.
 */
import { publish } from "../hooks/data-bus";

let attached = false;

export function attachLiveEventsBridge(): void {
  if (attached) return;
  if (!window.mc) {
    console.log("[live-events] window.mc unavailable; skipping bridge");
    return;
  }
  attached = true;
  window.mc.onTaskEvent(() => publish("tasks"));
  window.mc.onTaskSaved(() => publish("tasks"));
  console.log("[live-events] bridge attached");
}
