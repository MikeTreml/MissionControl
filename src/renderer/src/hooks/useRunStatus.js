import { useEffect, useState } from "react";
export function useRunStatus(taskId) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    async function refresh() {
        if (!taskId || !window.mc?.runStatus) {
            setStatus(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await window.mc.runStatus(taskId);
            setStatus(result && typeof result === "object" ? result : null);
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
    return { status, loading, error, refresh };
}
export function extractRunPath(status) {
    if (!status)
        return null;
    const direct = status["runPath"] ?? status["path"] ?? status["dir"];
    if (typeof direct === "string" && direct.length > 0)
        return direct;
    const run = status["run"];
    if (run && typeof run === "object") {
        const obj = run;
        const nested = obj["runPath"] ?? obj["path"] ?? obj["dir"];
        if (typeof nested === "string" && nested.length > 0)
            return nested;
    }
    return null;
}
