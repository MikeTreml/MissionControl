export function deriveToolCalls(events) {
    const open = new Map(); // toolName → index in `out`
    const out = [];
    for (const ev of events) {
        if (ev.type === "pi:tool_execution_start") {
            const r = ev;
            const toolName = typeof r.toolName === "string" ? r.toolName : "(unknown)";
            const toolInput = (typeof r.toolInput === "object" && r.toolInput)
                ? r.toolInput
                : null;
            const idx = out.length;
            out.push({
                toolName,
                toolInput,
                startedAt: ev.timestamp,
                endedAt: null,
                exitCode: null,
                durationMs: null,
            });
            // First-in-first-matched per toolName.
            if (!open.has(toolName))
                open.set(toolName, idx);
            continue;
        }
        if (ev.type === "pi:tool_execution_end") {
            const r = ev;
            const toolName = typeof r.toolName === "string" ? r.toolName : "(unknown)";
            const idx = open.get(toolName);
            if (idx === undefined)
                continue;
            open.delete(toolName);
            const call = out[idx];
            call.endedAt = ev.timestamp;
            call.exitCode = typeof r.exitCode === "number" ? r.exitCode : null;
            call.durationMs = typeof r.durationMs === "number" ? r.durationMs : null;
            // Re-arm the next pending start for this tool, if any.
            for (let j = idx + 1; j < out.length; j++) {
                if (out[j].toolName === toolName && out[j].endedAt === null) {
                    open.set(toolName, j);
                    break;
                }
            }
        }
    }
    return out;
}
/** "$ git checkout 9f3ac1e" — best-effort one-line cmd preview. */
export function previewCmd(call) {
    const i = call.toolInput;
    if (!i)
        return call.toolName;
    for (const k of ["command", "cmd", "path", "file_path", "query", "url", "name"]) {
        const v = i[k];
        if (typeof v === "string")
            return `${k} ${v}`;
    }
    // Fallback: stringify the first scalar value.
    for (const v of Object.values(i)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            return String(v);
        }
    }
    return "(no input)";
}
