import { promises as fs } from "node:fs";
import path from "node:path";

import type { LibraryIndex } from "./library-walker.ts";

/**
 * Reads the generated library index from disk.
 * Source of truth is `library/_index.json`, built by scripts/build-library-index.ts.
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

