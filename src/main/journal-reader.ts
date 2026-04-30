/**
 * JournalReader — polls a babysitter run's journal directory for new
 * events and forwards them through a callback.
 *
 * Run journal layout (from babysitter-sdk):
 *   <runPath>/journal/<file>.jsonl   one JSON object per line, e.g.
 *     { "seq": 42, "ulid": "...", "type": "EFFECT_REQUESTED",
 *       "recordedAt": "2026-04-30T...", "data": { ... } }
 *
 * Files may be rotated; we read every *.jsonl in the directory each
 * poll, sort by name (lexicographic = chronological for ULID-named
 * files), and emit any line whose ulid we haven't seen before.
 *
 * Cheap-and-correct rather than fancy — file watching across platforms
 * is fiddly (chokidar adds dep weight; fs.watch on Windows misses
 * appended writes). Polling at ~1s feels fine for the live-events
 * panel and keeps the implementation a single file.
 */
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";

export interface JournalEvent {
  seq?: number;
  ulid?: string;
  type: string;
  recordedAt?: string;
  data?: Record<string, unknown>;
}

export type JournalEventHandler = (event: JournalEvent) => void;

export class JournalReader {
  private readonly runPath: string;
  private readonly onEvent: JournalEventHandler;
  private readonly intervalMs: number;
  private readonly seenUlids = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private stopped = false;

  constructor(runPath: string, onEvent: JournalEventHandler, intervalMs = 1000) {
    this.runPath = runPath;
    this.onEvent = onEvent;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer || this.stopped) return;
    // Fire immediately so the first poll doesn't wait the full interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Read journal dir, emit any unseen lines. Re-entrancy-safe. */
  private async tick(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const journalDir = path.join(this.runPath, "journal");
      if (!existsSync(journalDir)) return;
      const entries = await fs.readdir(journalDir);
      const files = entries.filter((f) => f.endsWith(".jsonl")).sort();
      for (const file of files) {
        await this.readFile(path.join(journalDir, file));
        if (this.stopped) return;
      }
    } catch {
      // Swallow read errors — the journal can be in flux while babysitter
      // is rotating files, and a single failed poll shouldn't kill the
      // reader. Next tick will try again.
    } finally {
      this.polling = false;
    }
  }

  private async readFile(filePath: string): Promise<void> {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (this.stopped) return;
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown = null;
      try { parsed = JSON.parse(trimmed); } catch { continue; }
      if (!parsed || typeof parsed !== "object") continue;
      const obj = parsed as Record<string, unknown>;
      const ulid = typeof obj.ulid === "string" ? obj.ulid : null;
      const type = typeof obj.type === "string" ? obj.type : null;
      if (!type) continue;
      // Dedup by ulid when present; fall back to a synthetic key built
      // from seq+type so we still avoid double-emitting on lines that
      // somehow lack a ulid.
      const dedupKey = ulid ?? `seq:${typeof obj.seq === "number" ? obj.seq : -1}:${type}`;
      if (this.seenUlids.has(dedupKey)) continue;
      this.seenUlids.add(dedupKey);
      this.onEvent({
        type,
        ...(typeof obj.seq === "number" ? { seq: obj.seq } : {}),
        ...(ulid ? { ulid } : {}),
        ...(typeof obj.recordedAt === "string" ? { recordedAt: obj.recordedAt } : {}),
        ...(obj.data && typeof obj.data === "object"
          ? { data: obj.data as Record<string, unknown> }
          : {}),
      });
    }
  }
}
