/**
 * useProjects — calls window.mc.listProjects().
 *
 * Returns an empty list when window.mc is unavailable (preload failure)
 * or when the user has no projects. Empty-state UX lives in the consumer
 * (Sidebar shows a "+ Add your first project" card).
 */
import { useEffect, useMemo, useState } from "react";

import { useSubscribe } from "./data-bus";
import { useSettings } from "./useSettings";
import type { ProjectWithGit } from "../../../shared/models";

export interface UiProject {
  id: string;
  name: string;
  prefix: string;
  icon: string;          // optional emoji/short string; empty = show prefix
  path: string;          // local folder path, may be empty
  notes: string;         // free-form notes (carried through for the edit form)
  sourceHint: string;    // "GitHub: owner/repo" or the raw path
  stats: string;         // computed for real projects
  active?: boolean;
  /** True if loaded from library/samples/ (read-only sample data). */
  isSample: boolean;
}

function toUiProject(p: ProjectWithGit): UiProject {
  const sourceHint =
    p.gitInfo.kind !== "none" && p.gitInfo.label
      ? p.gitInfo.label
      : p.path || "(no path)";
  return {
    id: p.id,
    name: p.name,
    prefix: p.prefix,
    icon: p.icon,
    path: p.path,
    notes: p.notes,
    sourceHint,
    stats: "—",
    isSample: p.isSample === true,
  };
}

export interface ProjectsState {
  projects: UiProject[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<UiProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    if (!window.mc) {
      setProjects([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const real = await window.mc.listProjects();
      setProjects(real.map(toUiProject));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Re-fetch when any mutation publishes "projects" (or tasks, which affect
  // project stats).
  useSubscribe("projects", () => { void load(); });
  useSubscribe("tasks", () => { void load(); });

  // Filter sample projects when the user has hidden them.
  const { showSampleData } = useSettings();
  const visible = useMemo(
    () => (showSampleData ? projects : projects.filter((p) => !p.isSample)),
    [projects, showSampleData],
  );

  return { projects: visible, loading, error, refresh: load };
}
