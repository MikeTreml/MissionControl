/**
 * Model roster — user-editable list of LLMs MC knows how to dispatch to.
 *
 * Stored at `<userData>/models.json`. One record per model:
 *   { id, label, kind, model, endpoint, notes }
 *
 * Agents reference models by `id`. When pi is wired we'll prefer
 * `pi.listModels()` and treat this file as an OVERRIDE / roster of
 * custom endpoints pi wouldn't auto-discover (local LLMs, OpenAI-compat
 * servers, etc.).
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  ModelDefinitionSchema,
  type ModelDefinition,
} from "../shared/models.ts";
import { z } from "zod";

export type { ModelDefinition };

const MODELS_FILE = "models.json";
const ModelListSchema = z.array(ModelDefinitionSchema);

export class ModelRosterStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  async listModels(): Promise<ModelDefinition[]> {
    const raw = await this.readJson(MODELS_FILE);
    return raw === null ? [] : ModelListSchema.parse(raw);
  }

  /** Replace the full roster. Rejects duplicate ids. */
  async saveModels(models: z.input<typeof ModelListSchema>): Promise<void> {
    const validated = ModelListSchema.parse(models);
    const seen = new Set<string>();
    for (const m of validated) {
      if (seen.has(m.id)) throw new Error(`Duplicate model id "${m.id}"`);
      seen.add(m.id);
    }
    await this.writeJson(MODELS_FILE, validated);
  }

  // ── internals ─────────────────────────────────────────────────────────

  private async readJson(filename: string): Promise<unknown> {
    const p = path.join(this.root, filename);
    if (!existsSync(p)) return null;
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  }

  private async writeJson(filename: string, data: unknown): Promise<void> {
    await fs.writeFile(
      path.join(this.root, filename),
      JSON.stringify(data, null, 2),
      "utf8",
    );
  }
}
