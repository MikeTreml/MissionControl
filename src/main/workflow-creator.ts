/**
 * Writes a generated workflow.js into `library/workflows/<category>/<slug>/`
 * and rebuilds the library index so the new workflow is immediately visible.
 *
 * Boundaries:
 *   - Category must be one of the existing top-level workflow folders.
 *   - Slug must be kebab-case.
 *   - Will not clobber an existing workflow.js — caller must pick a fresh slug.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { LibraryWalker } from "./library-walker.ts";
import { generateWorkflow, type WorkflowSpec } from "./workflow-generator.ts";

export const VALID_WORKFLOW_CATEGORIES = [
  "cradle",
  "contrib",
  "core",
  "processes",
  "methodologies",
] as const;
export type WorkflowCategory = (typeof VALID_WORKFLOW_CATEGORIES)[number];

export type CreateWorkflowOpts = {
  spec: WorkflowSpec;
  category: string;
  slug: string;
};

export type CreateWorkflowResult = {
  diskPath: string;
  relPath: string;
};

export class WorkflowCreator {
  private readonly libraryRoot: string;

  constructor(libraryRoot: string) {
    this.libraryRoot = libraryRoot;
  }

  async create(opts: CreateWorkflowOpts): Promise<CreateWorkflowResult> {
    if (!VALID_WORKFLOW_CATEGORIES.includes(opts.category as WorkflowCategory)) {
      throw new Error(
        `Invalid category "${opts.category}". Must be one of: ${VALID_WORKFLOW_CATEGORIES.join(", ")}`,
      );
    }
    if (!/^[a-z][a-z0-9-]*$/.test(opts.slug)) {
      throw new Error(
        `Invalid slug "${opts.slug}". Must be kebab-case (lowercase letters, digits, hyphens).`,
      );
    }

    const targetDir = path.join(this.libraryRoot, "workflows", opts.category, opts.slug);
    const targetFile = path.join(targetDir, "workflow.js");

    if (await exists(targetFile)) {
      throw new Error(`Workflow already exists at ${targetFile}`);
    }

    // Generate first — fail before touching disk if the spec is invalid.
    const source = generateWorkflow(opts.spec);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, source, "utf8");

    // Rebuild library/_index.json so the new entry is visible to the UI.
    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await fs.writeFile(
      path.join(this.libraryRoot, "_index.json"),
      JSON.stringify(index, null, 2),
    );

    return {
      diskPath: targetFile,
      relPath: path.relative(this.libraryRoot, targetFile).split(path.sep).join("/"),
    };
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
