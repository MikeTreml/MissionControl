/**
 * App-level settings persisted to `<userData>/settings.json`.
 *
 * Single JSON file. Read on every `get()` (no in-memory cache —
 * matches the rest of MC's stores). `save()` overwrites with the
 * Zod-validated value so unknown fields stay alongside known ones
 * (passthrough() on the schema).
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import { MCSettingsSchema, type MCSettings } from "../shared/models.ts";

export interface WorkflowRunTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  workflowLogicalPath: string;
  workflowName: string;
  projectId: string;
  goal: string;
  model: string | null;
  inputs: Record<string, unknown>;
}

export class SettingsStore {
  private readonly file: string;

  /**
   * @param userDataDir absolute path to `<userData>` (NOT a file).
   */
  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, "settings.json");
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.file);
    await fs.mkdir(dir, { recursive: true });
    if (!existsSync(this.file)) {
      // Seed with defaults so the file is inspectable from the start.
      const defaults: MCSettings = MCSettingsSchema.parse({});
      await fs.writeFile(this.file, JSON.stringify(defaults, null, 2), "utf8");
    }
  }

  async get(): Promise<MCSettings> {
    if (!existsSync(this.file)) return MCSettingsSchema.parse({});
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return MCSettingsSchema.parse(JSON.parse(raw));
    } catch {
      return MCSettingsSchema.parse({});
    }
  }

  async save(patch: Partial<MCSettings>): Promise<MCSettings> {
    const current = await this.get();
    const merged = MCSettingsSchema.parse({ ...current, ...patch });
    await fs.writeFile(this.file, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  }

  async listWorkflowRunTemplates(): Promise<WorkflowRunTemplate[]> {
    const settings = (await this.get()) as Record<string, unknown>;
    const raw = settings["workflowRunTemplates"];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is WorkflowRunTemplate => {
        return typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string";
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveWorkflowRunTemplate(input: Omit<WorkflowRunTemplate, "createdAt" | "updatedAt">): Promise<WorkflowRunTemplate> {
    const now = new Date().toISOString();
    const all = await this.listWorkflowRunTemplates();
    const existing = all.find((t) => t.id === input.id);
    const next: WorkflowRunTemplate = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const merged = [next, ...all.filter((t) => t.id !== input.id)];
    const current = (await this.get()) as Record<string, unknown>;
    await this.save({ ...(current as MCSettings), workflowRunTemplates: merged } as unknown as Partial<MCSettings>);
    return next;
  }

  async deleteWorkflowRunTemplate(id: string): Promise<void> {
    const all = await this.listWorkflowRunTemplates();
    const next = all.filter((t) => t.id !== id);
    const current = (await this.get()) as Record<string, unknown>;
    await this.save({ ...(current as MCSettings), workflowRunTemplates: next } as unknown as Partial<MCSettings>);
  }
}
