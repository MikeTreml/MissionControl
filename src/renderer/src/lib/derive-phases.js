export function derivePhases(task, events) {
    const curated = phasesFromCuratedEvents(events);
    if (curated.phases.length > 0)
        return curated;
    const lane = phasesFromLaneEvents(task, events);
    if (lane.phases.length > 0)
        return lane;
    return genericFallback(task);
}
/**
 * Generic 3-chip skeleton when no journal phases exist yet. Status takes
 * precedence over runState — a task that's status=failed/done should look
 * failed/done even if its runState hasn't caught up yet.
 */
function genericFallback(task) {
    if (task.status === "failed") {
        return {
            phases: [
                { id: "draft", label: "Draft", status: "done" },
                { id: "failed", label: "Failed", status: "failed" },
            ],
            source: "generic",
            current: null,
        };
    }
    if (task.status === "done") {
        return {
            phases: [
                { id: "draft", label: "Draft", status: "done" },
                { id: "active", label: "Active", status: "done" },
                { id: "finished", label: "Finished", status: "active" },
            ],
            source: "generic",
            current: "finished",
        };
    }
    if (task.runState === "running") {
        return {
            phases: [
                { id: "draft", label: "Draft", status: "done" },
                { id: "active", label: "Active", status: "active" },
                { id: "finished", label: "Finished", status: "pending" },
            ],
            source: "generic",
            current: "active",
        };
    }
    if (task.runState === "paused") {
        return {
            phases: [
                { id: "draft", label: "Draft", status: "done" },
                { id: "paused", label: "Paused", status: "active" },
                { id: "finished", label: "Finished", status: "pending" },
            ],
            source: "generic",
            current: "paused",
        };
    }
    // idle + active/waiting status → still drafting
    return {
        phases: [
            { id: "draft", label: "Draft", status: "active" },
            { id: "active", label: "Active", status: "pending" },
            { id: "finished", label: "Finished", status: "pending" },
        ],
        source: "generic",
        current: "draft",
    };
}
function phasesFromCuratedEvents(events) {
    const seen = [];
    let activeId = null;
    for (const ev of events) {
        if (ev.type !== "bs:phase" && ev.type !== "bs:error")
            continue;
        const rec = ev;
        const phase = typeof rec.phase === "string" ? rec.phase : null;
        if (!phase)
            continue;
        const id = `phase-${phase}`;
        const label = `Phase ${phase}`;
        const status = ev.type === "bs:error" ? "failed" : "done";
        const ts = typeof rec.timestamp === "string" ? rec.timestamp : undefined;
        // Close out any active prior phase: mark it done AND stamp leftAt
        // with this event's timestamp so the timeline can show duration.
        for (const p of seen) {
            if (p.status === "active") {
                p.status = "done";
                if (ts && !p.leftAt)
                    p.leftAt = ts;
            }
        }
        const existing = seen.find((p) => p.id === id);
        if (existing) {
            existing.status = status;
            if (ts)
                existing.leftAt = ts;
        }
        else {
            seen.push({
                id,
                label,
                status,
                ...(ts ? { enteredAt: ts } : {}),
            });
        }
        if (status !== "failed")
            activeId = id;
    }
    // The most recent non-failed phase becomes "active". If the last event
    // was a failure, leave current=null so callers know the run is broken.
    const last = seen.length > 0 ? seen[seen.length - 1] : null;
    const lastIsFailed = last?.status === "failed";
    const current = lastIsFailed ? null : activeId;
    if (last && current && last.id === current)
        last.status = "active";
    return { phases: seen, source: "curated", current };
}
function phasesFromLaneEvents(task, events) {
    const transitions = events.filter((e) => e.type === "lane-changed");
    if (transitions.length === 0)
        return { phases: [], source: "lane", current: null };
    const phases = [];
    let prevAt = task.createdAt;
    let prevLane = null;
    for (const ev of transitions) {
        const rec = ev;
        const from = typeof rec.from === "string" ? rec.from : null;
        const to = typeof rec.to === "string" ? rec.to : null;
        const at = typeof rec.timestamp === "string" ? rec.timestamp : prevAt;
        const fromLabel = from ?? prevLane;
        if (fromLabel) {
            phases.push({
                id: `lane-${fromLabel}-${at}`,
                label: titleCase(fromLabel),
                status: "done",
                enteredAt: prevAt,
                leftAt: at,
            });
        }
        prevLane = to;
        prevAt = at;
    }
    if (prevLane) {
        phases.push({
            id: `lane-${prevLane}-current`,
            label: titleCase(prevLane),
            status: "active",
            enteredAt: prevAt,
        });
    }
    return {
        phases,
        source: "lane",
        current: phases.length > 0 ? phases[phases.length - 1].id : null,
    };
}
function titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
