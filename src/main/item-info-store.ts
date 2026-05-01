/**
 * Item info-file editor — writes patches to the sidecar `INFO.json`
 * (folder-based agents/skills) or `<stem>.info.json` (flat workflows
 * and examples) next to the source file.
 *
 * The walker reads these sidecars and merges them on top of source-
 * derived fields (see `library-walker.ts:applySidecar`). So saving here
 * is the persistence half of "edit metadata in the UI without modifying
 * the AGENT.md / workflow.js files themselves."
 *
 * Boundaries:
 *   - The target sidecar path must resolve under the library root
 *     (path-traversal guard).
 *   - The patch is shallow-merged into the existing sidecar; `null`
 *     values delete that key (so the source-derived value wins again
 *     for that field).
 *   - Only the keys in SIDECAR_OVERRIDE_FIELDS are accepted; anything
 *     else is silently dropped to keep the file clean.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  LibraryWalker,
  SIDECAR_OVERRIDE_FIELDS,
  sidecarPathFor,
  writeIndexFiles,
  type LibraryItemKind,
} from "./library-walker.ts";

export type SaveItemInfoOpts = {
  kind: LibraryItemKind;
  /** Absolute path to the source file (AGENT.md / SKILL.md / *.js / *.json). */
  diskPath: string;
  /** Patch — keys outside SIDECAR_OVERRIDE_FIELDS are dropped. `null` removes the key. */
  patch: Record<string, unknown>;
};

export type SaveItemInfoResult = {
  sidecarPath: string;
  /** The full sidecar contents after the merge — useful for debugging/UI feedback. */
  contents: Record<string, unknown>;
};

export class ItemInfoStore {
  private readonly libraryRoot: string;

  constructor(libraryRoot: string) {
    this.libraryRoot = path.resolve(libraryRoot);
  }

  async save(opts: SaveItemInfoOpts): Promise<SaveItemInfoResult> {
    const sidecarPath = sidecarPathFor(opts.diskPath, opts.kind);
    if (!isUnderRoot(this.libraryRoot, sidecarPath)) {
      throw new Error(
        `Sidecar path "${sidecarPath}" escapes the library root — refusing to write.`,
      );
    }

    // Shallow-merge into the existing sidecar (or empty), then drop
    // null-valued keys so the source-derived field wins again.
    const existing = await readJsonOrEmpty(sidecarPath);
    const merged: Record<string, unknown> = { ...existing };
    for (const key of SIDECAR_OVERRIDE_FIELDS) {
      if (!(key in opts.patch)) continue;
      const value = opts.patch[key];
      if (value === null || value === undefined) {
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }

    if (Object.keys(merged).length === 0) {
      // Empty sidecar — remove the file rather than leaving a dead `{}`
      // committed. The walker treats missing sidecar = no overrides.
      try {
        await fs.unlink(sidecarPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      return { sidecarPath, contents: {} };
    }

    await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
    await fs.writeFile(sidecarPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    return { sidecarPath, contents: merged };
  }

  /** Rebuild the cached library index after a sidecar edit. */
  async rebuildIndex(): Promise<void> {
    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await writeIndexFiles(this.libraryRoot, index);
  }
}

async function readJsonOrEmpty(p: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    return {};
  }
}

function isUnderRoot(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
