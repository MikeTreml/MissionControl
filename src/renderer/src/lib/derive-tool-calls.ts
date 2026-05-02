/**
 * Pair `pi:tool_execution_start` events with their matching `_end` so
 * Task Detail can render each tool call as a terminal-style `.tool-pane`
 * (canvas: NewUI/.../index.html lines 593-630).
 *
 * Pi emits these as a pair:
 *   { type: "pi:tool_execution_start", toolName, toolInput }
 *   { type: "pi:tool_execution_end",   toolName, exitCode, durationMs }
 *
 * We pair by toolName + arrival order — the journal is single-threaded,
 * so the earliest unmatched start for a given toolName matches the next
 * end. When a start has no matching end yet, exitCode is null (the
 * call is still running) and the pane renders without an exit chip.
 */
import type { TaskEvent } from "../../../shared/models";

export interface ToolCall {
  toolName: string;
  toolInput: Record<string, unknown> | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  durationMs: number | null;
}

export function deriveToolCalls(events: TaskEvent[]): ToolCall[] {
  const open: Map<string, number> = new Map(); // toolName → index in `out`
  const out: ToolCall[] = [];

  for (const ev of events) {
    if (ev.type === "pi:tool_execution_start") {
      const r = ev as unknown as Record<string, unknown>;
      const toolName = typeof r.toolName === "string" ? r.toolName : "(unknown)";
      const toolInput = (typeof r.toolInput === "object" && r.toolInput)
        ? r.toolInput as Record<string, unknown>
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
      if (!open.has(toolName)) open.set(toolName, idx);
      continue;
    }
    if (ev.type === "pi:tool_execution_end") {
      const r = ev as unknown as Record<string, unknown>;
      const toolName = typeof r.toolName === "string" ? r.toolName : "(unknown)";
      const idx = open.get(toolName);
      if (idx === undefined) continue;
      open.delete(toolName);
      const call = out[idx]!;
      call.endedAt = ev.timestamp;
      call.exitCode = typeof r.exitCode === "number" ? r.exitCode : null;
      call.durationMs = typeof r.durationMs === "number" ? r.durationMs : null;
      // Re-arm the next pending start for this tool, if any.
      for (let j = idx + 1; j < out.length; j++) {
        if (out[j]!.toolName === toolName && out[j]!.endedAt === null) {
          open.set(toolName, j);
          break;
        }
      }
    }
  }
  return out;
}

/** "$ git checkout 9f3ac1e" — best-effort one-line cmd preview. */
export function previewCmd(call: ToolCall): string {
  const i = call.toolInput;
  if (!i) return call.toolName;
  for (const k of ["command", "cmd", "path", "file_path", "query", "url", "name"]) {
    const v = i[k];
    if (typeof v === "string") return `${k} ${v}`;
  }
  // Fallback: stringify the first scalar value.
  for (const v of Object.values(i)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      return String(v);
    }
  }
  return "(no input)";
}
