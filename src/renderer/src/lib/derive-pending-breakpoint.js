export function derivePendingBreakpoint(events) {
    // The most recent `babysitter-run-detected` carries the runPath we
    // need for the response POST. Track it as we walk so we don't have
    // to re-derive it elsewhere.
    let runPath = null;
    const opens = new Map();
    const closed = new Set();
    for (const ev of events) {
        const rec = ev;
        if (ev.type === "babysitter-run-detected") {
            const rp = typeof rec.runPath === "string" ? rec.runPath : null;
            if (rp)
                runPath = rp;
            continue;
        }
        if (ev.type === "bs:journal:breakpoint_opened") {
            const data = rec.data ?? {};
            const effectId = typeof data.effectId === "string" ? data.effectId : null;
            if (!effectId)
                continue;
            opens.set(effectId, {
                effectId,
                payload: data.payload ?? null,
                expert: typeof data.expert === "string" ? data.expert : null,
                tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === "string") : [],
                openedAt: typeof rec.recordedAt === "string" ? rec.recordedAt : (typeof rec.timestamp === "string" ? rec.timestamp : null),
            });
            continue;
        }
        if (ev.type === "bs:journal:breakpoint_responded" ||
            ev.type === "bs:journal:effect_resolved_ok" ||
            ev.type === "bs:journal:effect_resolved_error") {
            const data = rec.data ?? {};
            const effectId = typeof data.effectId === "string" ? data.effectId : null;
            if (effectId)
                closed.add(effectId);
        }
    }
    if (!runPath)
        return null;
    // Latest still-open breakpoint wins. Iterate insertion order in
    // reverse so the most recent open without a close pairs first.
    const entries = [...opens.entries()].reverse();
    for (const [effectId, open] of entries) {
        if (closed.has(effectId))
            continue;
        return { ...open, runPath };
    }
    return null;
}
