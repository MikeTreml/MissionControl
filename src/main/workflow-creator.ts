/**
 * Writes a generated workflow into `library/<category>/workflows/<slug>.js`
 * and rebuilds the library index so the new workflow is immediately visible.
 *
 * Boundaries:
 *   - Category must be an existing library container path.
 *   - Slug must be kebab-case.
 *   - Will not clobber an existing workflow file — caller must pick a fresh slug.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { LibraryWalker, writeIndexFiles } from "./library-walker.ts";
import { generateWorkflow, type WorkflowSpec } from "./workflow-generator.ts";

export const VALID_WORKFLOW_CATEGORIES = [
  "business/knowledge-management",
  "business/operations",
  "business/project-management",
  "methodologies/atdd-tdd",
  "methodologies/process-hardening",
  "methodologies/shared",
  "methodologies",
  "methodologies/spec-kit",
  "reference/babysitter",
  "specializations/devops-sre-platform",
  "specializations/software-architecture",
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
    if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(opts.category)) {
      throw new Error(
        `Invalid category "${opts.category}". Must be a library path such as ${VALID_WORKFLOW_CATEGORIES.join(", ")}`,
      );
    }
    if (!/^[a-z][a-z0-9-]*$/.test(opts.slug)) {
      throw new Error(
        `Invalid slug "${opts.slug}". Must be kebab-case (lowercase letters, digits, hyphens).`,
      );
    }

    const categoryDir = path.resolve(this.libraryRoot, opts.category);
    if (!isLibraryDescendant(this.libraryRoot, categoryDir)) {
      throw new Error(`Invalid category "${opts.category}". Must stay inside the library root.`);
    }
    if (!(await isDirectory(categoryDir))) {
      throw new Error(`Invalid category "${opts.category}". No such library container exists.`);
    }

    const targetDir = path.join(categoryDir, "workflows");
    const targetFile = path.join(targetDir, `${opts.slug}.js`);

    if (await exists(targetFile)) {
      throw new Error(`Workflow already exists at ${targetFile}`);
    }

    // Generate first — fail before touching disk if the spec is invalid.
    const source = generateWorkflow(opts.spec);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, source, "utf8");

    // Rebuild the per-kind index files so the new entry is visible to the UI.
    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await writeIndexFiles(this.libraryRoot, index);

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

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

function isLibraryDescendant(libraryRoot: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(libraryRoot), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
