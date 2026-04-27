/**
 * usePiModels — fetches the set of models the user is currently authed
 * into, matching what pi's `/model` slash command shows. Refetches on
 * mount (so every Task Detail visit picks up newly-logged-in providers)
 * and exposes a manual `refresh()` for the picker's "↻" button.
 *
 * Returns an empty list with `isDemo: true` when window.mc is unavailable
 * (static preview / preload failure).
 */
import { useCallback, useEffect, useState } from "react";

import type { PiModelInfo } from "../global";

export interface PiModelsState {
  models: PiModelInfo[];
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function usePiModels(): PiModelsState {
  const [models, setModels] = useState<PiModelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.mc) {
      setIsDemo(true);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await window.mc.listPiModels();
      setModels(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { models, loading, isDemo, error, refresh };
}
