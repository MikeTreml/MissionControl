import { listPendingEffects } from "./babysitter-interaction-service";

const POLL_MS = 2000;

export function startBabysitterPolling(runPath: string, onEffects: (effects: any[]) => void) {
  const timer = setInterval(async () => {
    try {
      const pending = await listPendingEffects(runPath);
      if (Array.isArray(pending) && pending.length > 0) {
        onEffects(pending);
      }
    } catch {
      // swallow transient errors
    }
  }, POLL_MS);

  return () => clearInterval(timer);
}
