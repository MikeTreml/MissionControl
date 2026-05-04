/**
 * Live MCSettings — reads on mount, refreshes when anything publishes
 * "settings" on the data-bus (call after `saveSettings()` to broadcast).
 *
 * Sensible defaults are returned while settings haven't loaded yet so
 * consumers don't have to handle null. The defaults match
 * MCSettingsSchema in src/shared/models.ts.
 */
import { useEffect, useState } from "react";
import { MCSettingsSchema, type MCSettings } from "../../../shared/models";
import { useSubscribe } from "./data-bus";

const DEFAULTS: MCSettings = MCSettingsSchema.parse({});

export function useSettings(): MCSettings {
  const [settings, setSettings] = useState<MCSettings>(DEFAULTS);

  async function load(): Promise<void> {
    try {
      if (!window.mc?.getSettings) return;
      const next = await window.mc.getSettings();
      // Z-shape from the IPC may not carry the new field on older user
      // settings — backfill from defaults defensively.
      setSettings({ ...DEFAULTS, ...(next as Partial<MCSettings>) });
    } catch {
      // Stay on defaults; the Settings page will show a clearer error.
    }
  }

  useEffect(() => { void load(); }, []);
  useSubscribe("settings", () => { void load(); });

  return settings;
}
