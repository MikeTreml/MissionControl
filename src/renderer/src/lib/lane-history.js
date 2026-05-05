const DAY_MS = 24 * 3600 * 1000;
const MAX_CHIPS = 8;
export function buildRunningHistory(perTask, now = Date.now()) {
    const cutoff = now - DAY_MS;
    const out = [];
    for (const [taskId, events] of perTask) {
        for (const e of events) {
            if (e.type !== "run-ended")
                continue;
            const ts = new Date(e.timestamp).getTime();
            if (!Number.isFinite(ts) || ts < cutoff)
                continue;
            const exit = typeof e.exit === "string" ? e.exit : "";
            const state = exit === "completed" ? "success" :
                exit === "failed" ? "failed" :
                    "paused";
            out.push({ taskId, state, whenMs: now - ts, whenLabel: relativeShort(now - ts) });
        }
    }
    out.sort((a, b) => a.whenMs - b.whenMs);
    return out.slice(0, MAX_CHIPS);
}
export function buildShippedHistory(tasks, now = Date.now()) {
    const cutoff = now - 7 * DAY_MS;
    return tasks
        .filter((t) => t.boardStage === "Done")
        .map((t) => {
        const ts = new Date(t.updatedAt).getTime();
        return { taskId: t.id, state: "success", whenMs: now - ts, whenLabel: relativeShort(now - ts), ts };
    })
        .filter((r) => Number.isFinite(r.ts) && r.ts >= cutoff)
        .sort((a, b) => a.whenMs - b.whenMs)
        .slice(0, MAX_CHIPS)
        .map(({ taskId, state, whenMs, whenLabel }) => ({ taskId, state, whenMs, whenLabel }));
}
/** "11m" / "2h" / "3d" — terse format the canvas uses for lane chips. */
function relativeShort(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return "—";
    const min = Math.round(ms / 60_000);
    if (min < 60)
        return `${Math.max(1, min)}m`;
    const hr = Math.round(min / 60);
    if (hr < 24)
        return `${hr}h`;
    return `${Math.round(hr / 24)}d`;
}
/** Canvas-matching demo chips — used when isDemo so the strip isn't blank. */
export const DEMO_RUNNING_CHIPS = [
    { taskId: "ALGD-0142", state: "success", whenMs: 11 * 60_000, whenLabel: "11m" },
    { taskId: "ALGD-0141", state: "success", whenMs: 38 * 60_000, whenLabel: "38m" },
    { taskId: "BRIE-0020", state: "failed", whenMs: 2 * 3600_000, whenLabel: "2h" },
    { taskId: "CIRR-0087", state: "success", whenMs: 3 * 3600_000, whenLabel: "3h" },
    { taskId: "ALGD-0137", state: "paused", whenMs: 5 * 3600_000, whenLabel: "5h" },
    { taskId: "DMTR-0003", state: "success", whenMs: 8 * 3600_000, whenLabel: "8h" },
    { taskId: "ALGD-0136", state: "success", whenMs: 11 * 3600_000, whenLabel: "11h" },
    { taskId: "CIRR-0085", state: "failed", whenMs: 14 * 3600_000, whenLabel: "14h" },
];
export const DEMO_SHIPPED_CHIPS = [
    { taskId: "ALGD-0137", state: "success", whenMs: 2 * DAY_MS, whenLabel: "2d" },
    { taskId: "ALGD-0136", state: "success", whenMs: 2 * DAY_MS, whenLabel: "2d" },
    { taskId: "BRIE-0016", state: "success", whenMs: 3 * DAY_MS, whenLabel: "3d" },
    { taskId: "ALGD-0134", state: "success", whenMs: 3 * DAY_MS, whenLabel: "3d" },
    { taskId: "CIRR-0079", state: "success", whenMs: 4 * DAY_MS, whenLabel: "4d" },
    { taskId: "ALGD-0131", state: "success", whenMs: 5 * DAY_MS, whenLabel: "5d" },
    { taskId: "DMTR-0002", state: "success", whenMs: 6 * DAY_MS, whenLabel: "6d" },
    { taskId: "BRIE-0014", state: "success", whenMs: 7 * DAY_MS, whenLabel: "7d" },
];
