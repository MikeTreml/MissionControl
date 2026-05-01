/**
 * File-based project store (main process only).
 *
 * Layout:
 *   <root>/<project-id>/project.json
 *
 * Mirror of TaskStore: dumb (no cache), Zod-validated on read, prefix uniqueness
 * enforced on create. Projects are keyed by `id` (slug); `prefix` is a second
 * uniqueness constraint because task IDs depend on it.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import { ProjectSchema, type Project } from "../shared/models.ts";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export class ProjectStore {
  private readonly root: string;
  private readonly sampleRoot: string | null;

  /**
   * @param root        absolute path to the user's projects root (e.g. `<userData>/projects`)
   * @param sampleRoot  optional read-only sample projects root (e.g.
   *                    `<appRoot>/library/samples/projects`). Projects
   *                    loaded from this root are tagged `isSample:true`.
   *                    Writes against sample projects throw.
   */
  constructor(root: string, sampleRoot: string | null = null) {
    this.root = root;
    this.sampleRoot = sampleRoot;
  }

  /** Ensure the root folder exists. Call once at app start. */
  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  // ── read ──────────────────────────────────────────────────────────────

  /** Every project on disk, sorted by name (case-insensitive). */
  async listProjects(): Promise<Project[]> {
    const projects: Project[] = [];
    const seen = new Set<string>();
    await this.collectFromRoot(this.root, false, projects, seen);
    if (this.sampleRoot) {
      await this.collectFromRoot(this.sampleRoot, true, projects, seen);
    }
    projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return projects;
  }

  private async collectFromRoot(
    root: string,
    isSample: boolean,
    out: Project[],
    seen: Set<string>,
  ): Promise<void> {
    if (!existsSync(root)) return;
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (seen.has(entry.name)) continue;
      const project = await this.readManifest(path.join(root, entry.name));
      if (!project) continue;
      seen.add(entry.name);
      out.push(isSample ? { ...project, isSample: true } : project);
    }
  }

  /** Read one project by id, or null if missing. Falls back to sampleRoot. */
  async getProject(id: string): Promise<Project | null> {
    const userFolder = path.join(this.root, id);
    if (existsSync(userFolder)) return this.readManifest(userFolder);
    if (this.sampleRoot) {
      const sampleFolder = path.join(this.sampleRoot, id);
      if (existsSync(sampleFolder)) {
        const p = await this.readManifest(sampleFolder);
        return p ? { ...p, isSample: true } : null;
      }
    }
    return null;
  }

  // ── write ─────────────────────────────────────────────────────────────

  /**
   * Create a new project. Caller supplies id (slug), name, prefix.
   * Throws on duplicate id or duplicate prefix (prefixes must be unique because
   * task IDs depend on them).
   */
  async createProject(input: {
    id: string;
    name: string;
    prefix: string;
    path?: string;
    notes?: string;
    icon?: string;
  }): Promise<Project> {
    if (!SLUG_RE.test(input.id)) {
      throw new Error(`Invalid project id "${input.id}" — must be lowercase alphanumeric + dashes`);
    }
    // Zod handles prefix validation & uppercasing.
    const project = ProjectSchema.parse({
      id: input.id,
      name: input.name,
      prefix: input.prefix,
      path: input.path ?? "",
      icon: input.icon ?? "",
      notes: input.notes ?? "",
    });

    // Uniqueness checks — cheap enough to re-run scan on every create.
    const existing = await this.listProjects();
    if (existing.some((p) => p.id === project.id)) {
      throw new Error(`Project id "${project.id}" already exists`);
    }
    if (existing.some((p) => p.prefix === project.prefix)) {
      throw new Error(
        `Project prefix "${project.prefix}" already used — prefixes must be unique`,
      );
    }

    await this.saveProject(project);
    return project;
  }

  /**
   * Patch an existing project. `id` and `prefix` are immutable (tasks
   * reference them in filenames); attempting to change them throws.
   */
  async updateProject(
    id: string,
    patch: Partial<Omit<Project, "id" | "prefix">>,
  ): Promise<Project> {
    const existing = await this.getProject(id);
    if (!existing) throw new Error(`Project "${id}" not found`);
    if (existing.isSample) {
      throw new Error(`Project "${id}" is a sample (read-only). Cannot update.`);
    }

    // Merge patch onto existing but drop any stale id/prefix in the patch.
    const merged: Project = {
      ...existing,
      ...patch,
      id: existing.id,         // immutable
      prefix: existing.prefix, // immutable
    };
    await this.saveProject(merged);
    return merged;
  }

  /**
   * Delete the project record (project.json + its folder). Does NOT touch
   * the task store — tasks that referenced this project id simply become
   * orphaned (task folders don't live inside the project folder anyway).
   * Caller should warn + optionally offer to archive tasks separately.
   */
  async deleteProject(id: string): Promise<void> {
    const folder = path.join(this.root, id);
    if (!existsSync(folder)) {
      if (this.sampleRoot && existsSync(path.join(this.sampleRoot, id))) {
        throw new Error(`Project "${id}" is a sample (read-only). Cannot delete.`);
      }
      throw new Error(`Project "${id}" not found`);
    }
    await fs.rm(folder, { recursive: true, force: true });
  }

  /** Persist a project's project.json. */
  async saveProject(project: Project): Promise<void> {
    if (project.isSample) {
      throw new Error(`Project "${project.id}" is a sample (read-only). Cannot save.`);
    }
    // Re-validate before write — cheap safety net. Strip isSample if it
    // somehow rode in from a renderer-side edit.
    const validated = ProjectSchema.parse({ ...project, isSample: false });
    const folder = path.join(this.root, validated.id);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "project.json"),
      JSON.stringify(validated, null, 2),
      "utf8",
    );
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** Parse project.json. Returns null on missing or corrupt files (doesn't throw). */
  private async readManifest(folder: string): Promise<Project | null> {
    const manifest = path.join(folder, "project.json");
    if (!existsSync(manifest)) return null;
    try {
      const raw = await fs.readFile(manifest, "utf8");
      return ProjectSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
