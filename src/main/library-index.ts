import path from "node:path";

import {
  LibraryWalker,
  readIndexFiles,
  writeIndexFiles,
  type LibraryIndex,
} from "./library-walker.ts";
import { promises as fs } from "node:fs";

/**
 * Reads (and on demand re-walks) the library index. The catalog is
 * persisted as four per-kind files — `_index.workflow.json`,
 * `_index.agent.json`, `_index.skill.json`, `_index.example.json` —
 * one per Library tab. `load()` reads all four and concatenates;
 * `refresh()` re-walks the tree and writes all four back.
 *
 * Why split: the legacy combined `_index.json` was 6.5MB and churned
 * any time a single item changed. Each tab now has a self-describing
 * file that's roughly a quarter the size, easier to grep, and easier
 * to inspect in isolation.
 */
export class LibraryIndexStore {
  private readonly libraryRoot: string;

  constructor(libraryRoot: string) {
    this.libraryRoot = path.resolve(libraryRoot);
  }

  async load(): Promise<LibraryIndex> {
    const index = await readIndexFiles(this.libraryRoot);
    if (!Array.isArray(index.items)) {
      throw new Error("Invalid library index: expected items[]");
    }
    return index;
  }

  /**
   * Walk the library tree in-process via LibraryWalker, write the
   * resulting index back to the four per-kind files, and return the
   * combined index. Same shape `load()` returns; consumers can
   * replace their cached index in place.
   */
  async refresh(): Promise<LibraryIndex> {
    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await writeIndexFiles(this.libraryRoot, index);
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
