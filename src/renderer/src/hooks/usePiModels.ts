/**
 * usePiModels — fetches pi's model registry once at mount. The list is
 * stable for the life of the app (it comes from pi's auth + built-in
 * model tables), so we don't auto-refetch on every tick.
 *
 * Returns an empty list with `isDemo: true` when window.mc is unavailable
 * (static preview / preload failure).
 */
import { useEffect, useState } from "react";

import type { PiModelInfo } from "../global";

export interface PiModelsState {
  models: PiModelInfo[];
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
}

export function usePiModels(): PiModelsState {
  const [models, setModels] = useState<PiModelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!window.mc) {
          if (!cancelled) { setIsDemo(true); setLoading(false); }
          return;
        }
        const list = await window.mc.listPiModels();
        if (!cancelled) { setModels(list); setLoading(false); }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { models, loading, isDemo, error };
}
