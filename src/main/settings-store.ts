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
}
