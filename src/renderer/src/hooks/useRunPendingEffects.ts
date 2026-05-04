import { useEffect, useState } from "react";

import { useSettings } from "./useSettings";

export type PendingRunEffect = {
  effectId: string;
  kind: string;
  label?: string;
  status?: string;
  [key: string]: unknown;
};

export function useRunPendingEffects(taskId: string | null | undefined): {
  effects: PendingRunEffect[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const settings = useSettings();
  const [effects, setEffects] = useState<PendingRunEffect[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!taskId || !window.mc?.runListPending) {
      setEffects([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await window.mc.runListPending(taskId);
      const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
      setEffects(tasks as PendingRunEffect[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !settings.pendingEffectFallbackPolling) return;

    const interval = Math.max(5_000, settings.pendingEffectPollIntervalMs ?? 15_000);
    const timer = window.setInterval(() => {
      void refresh();
    }, interval);

    return () => window.clearInterval(timer);
  }, [taskId, settings.pendingEffectFallbackPolling, settings.pendingEffectPollIntervalMs]);

  return { effects, loading, error, refresh };
}
