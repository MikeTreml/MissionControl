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
export function usePiModels() {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);
    const [error, setError] = useState(null);
    const refresh = useCallback(async () => {
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
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    return { models, loading, isDemo, error, refresh };
}
