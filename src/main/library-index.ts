import { promises as fs } from "node:fs";
import path from "node:path";

import { LibraryWalker, type LibraryIndex } from "./library-walker.ts";

/**
 * Reads (and on demand re-walks) the library index.
 * Source of truth is `library/_index.json`, built by
 * `scripts/build-library-index.ts` for cold starts. The Library page's
 * Refresh button calls `refresh()`, which walks the tree in-process
 * and writes back the index — no subprocess, no `npm run` step.
 */
export class LibraryIndexStore {
  private readonly indexPath: string;
  private readonly libraryRoot: string;

  constructor(libraryRoot: string) {
    this.libraryRoot = path.resolve(libraryRoot);
    this.indexPath = path.join(libraryRoot, "_index.json");
  }

  async load(): Promise<LibraryIndex> {
    const raw = await fs.readFile(this.indexPath, "utf8");
    const parsed = JSON.parse(raw) as LibraryIndex;
    if (!Array.isArray(parsed.items)) {
      throw new Error("Invalid library index: expected items[]");
    }
    return parsed;
  }

  /**
   * Walk the library tree in-process via LibraryWalker, write the
   * resulting index back to `_index.json`, and return it. Same shape
   * the cold-start `load()` returns; consumers can replace their
   * cached index in place.
   */
  async refresh(): Promise<LibraryIndex> {
    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
    return index;
  }

  async readJsonSchema(absPath: string | null | undefined): Promise<Record<string, unknown> | null> {
    if (!absPath) return null;
    const resolved = path.resolve(absPath);
    if (!resolved.startsWith(this.libraryRoot)) {
      throw new Error("Schema path must be under library root");
    }
    const raw = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed;
  }
}

