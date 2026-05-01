/**
 * Per-project memory file living at `~/.pi/memory-md/<projectId>/MEMORY.md`.
 *
 * Pi will eventually consume this directly (per CLAUDE.md: "per-project
 * memory at ~/.pi/memory-md/<project>/"). MC reads/writes the same path
 * so the operator can edit memory from the Project page without leaving
 * the app — pi sees the changes on its next session boot.
 *
 * Safety:
 *   - Project id must be a kebab-case slug; refuse anything else so a
 *     hostile id like "../../etc/passwd" can't escape the memory root.
 *   - Read returns null on missing file (not an error).
 *   - Write creates the directory tree as needed.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export class MemoryStore {
  private readonly root: string;

  /** Defaults to `~/.pi/memory-md`. Overridable for tests. */
  constructor(root: string = path.join(os.homedir(), ".pi", "memory-md")) {
    this.root = root;
  }

  fileFor(projectId: string): string {
    if (!SLUG_RE.test(projectId)) {
      throw new Error(`Invalid project id "${projectId}" — must be kebab-case slug`);
    }
    return path.join(this.root, projectId, "MEMORY.md");
  }

  async read(projectId: string): Promise<string | null> {
    const target = this.fileFor(projectId);
    try {
      return await fs.readFile(target, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async write(projectId: string, content: string): Promise<void> {
    const target = this.fileFor(projectId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
}
