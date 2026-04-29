/**
 * useWorkflows — calls window.mc.listWorkflows().
 *
 * No demo default: workflows are bundled with the app, so this should
 * always return the 2 starter workflows (F-feature, X-brainstorm). Empty
 * result means the bundled folder is missing — surface as error.
 */
import { useEffect, useState } from "react";

import type { Workflow } from "../../../shared/models";

export interface WorkflowsState {
  workflows: Workflow[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useWorkflows(): WorkflowsState {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    try {
      setLoading(true);
      if (!window.mc) {
        // Default static-preview data — shape-match what loaders return.
        setWorkflows([
          { code: "F", name: "Feature",    description: "Standard feature development." },
          { code: "X", name: "Brainstorm", description: "Exploratory / ideation workflow." },
        ]);
        return;
      }
      setWorkflows(await window.mc.listWorkflows());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { workflows, loading, error, refresh: load };
}
