import { useEffect, useState } from "react";
import { useSettings } from "./useSettings";
export function useRunPendingEffects(taskId) {
    const settings = useSettings();
    const [effects, setEffects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    async function refresh() {
        if (!taskId || !window.mc?.runListPending) {
            setEffects([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await window.mc.runListPending(taskId);
            const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
            setEffects(tasks);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
    }, [taskId]);
    useEffect(() => {
        if (!taskId || !settings.pendingEffectFallbackPolling)
            return;
        const interval = Math.max(5_000, settings.pendingEffectPollIntervalMs ?? 15_000);
        const timer = window.setInterval(() => {
            void refresh();
        }, interval);
        return () => window.clearInterval(timer);
    }, [taskId, settings.pendingEffectFallbackPolling, settings.pendingEffectPollIntervalMs]);
    return { effects, loading, error, refresh };
}
