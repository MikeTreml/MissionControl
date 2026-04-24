/**
 * Workflow loader — discovers workflows on disk at boot.
 *
 * Layout:
 *   <root>/workflows/
 *     F-feature/
 *       workflow.json       <- { code: "F", name: "Feature", ... }
 *       prompts/<role>.md   <- future: per-role system prompts
 *     X-brainstorm/
 *       workflow.json
 *       ...
 *
 * Rules enforced at load time:
 *   - folder name must look like `<CODE>-<slug>` where CODE is one uppercase letter
 *   - workflow.json is the source of truth; folder-name CODE must match workflow.code
 *   - each code must be unique across all workflows (collision = hard error)
 *
 * The loader is intentionally dumb — no caching. Call `loadAll()` once at boot.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import { WorkflowSchema, type Workflow } from "../shared/models.ts";

const FOLDER_RE = /^([A-Z])-([a-z0-9-]+)$/;

export class WorkflowLoader {
  private readonly root: string;

  /**
   * @param root  absolute path to the `workflows/` directory
   */
  constructor(root: string) {
    this.root = root;
  }

  /** Scan the workflows directory, parse each workflow.json, validate + dedupe. */
  async loadAll(): Promise<Workflow[]> {
    if (!existsSync(this.root)) return [];

    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const byCode = new Map<string, { workflow: Workflow; folder: string }>();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderMatch = FOLDER_RE.exec(entry.name);
      if (!folderMatch) continue; // unexpected folder name; silently skip

      const folderCode = folderMatch[1]!;
      const manifestPath = path.join(this.root, entry.name, "workflow.json");
      if (!existsSync(manifestPath)) continue;

      const raw = await fs.readFile(manifestPath, "utf8");
      const workflow = WorkflowSchema.parse(JSON.parse(raw));

      if (workflow.code !== folderCode) {
        throw new Error(
          `Workflow folder "${entry.name}" starts with code "${folderCode}" ` +
            `but workflow.json declares "${workflow.code}"`,
        );
      }

      const existing = byCode.get(workflow.code);
      if (existing) {
        throw new Error(
          `Duplicate workflow code "${workflow.code}" in ` +
            `${existing.folder} and ${entry.name}`,
        );
      }
      byCode.set(workflow.code, { workflow, folder: entry.name });
    }

    return [...byCode.values()]
      .map((v) => v.workflow)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
}
