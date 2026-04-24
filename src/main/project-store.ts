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

  /**
   * @param root  absolute path to the projects root (e.g. `<userData>/projects`)
   */
  constructor(root: string) {
    this.root = root;
  }

  /** Ensure the root folder exists. Call once at app start. */
  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  // ── read ──────────────────────────────────────────────────────────────

  /** Every project on disk, sorted by name (case-insensitive). */
  async listProjects(): Promise<Project[]> {
    if (!existsSync(this.root)) return [];
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const projects: Project[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = await this.readManifest(path.join(this.root, entry.name));
      if (project) projects.push(project);
    }
    projects.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return projects;
  }

  /** Read one project by id, or null if missing. */
  async getProject(id: string): Promise<Project | null> {
    const folder = path.join(this.root, id);
    return existsSync(folder) ? this.readManifest(folder) : null;
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
      throw new Error(`Project "${id}" not found`);
    }
    await fs.rm(folder, { recursive: true, force: true });
  }

  /** Persist a project's project.json. */
  async saveProject(project: Project): Promise<void> {
    // Re-validate before write — cheap safety net.
    const validated = ProjectSchema.parse(project);
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
