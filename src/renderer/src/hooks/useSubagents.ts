/**
 * @deprecated — subagents are now part of the unified agent list.
 *
 * Use `useAgents()` and filter by code length if you need just subagents:
 *
 *   const { agents } = useAgents();
 *   const subs = agents.filter((a) => a.code.length > 1);
 *   const primary = agents.filter((a) => a.code.length === 1);
 *
 * Keeping this wrapper for one commit so existing callers don't break.
 */
import { useAgents } from "./useAgents";
import type { Agent } from "../../../shared/models";

export interface SubagentsState {
  subagents: Agent[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useSubagents(): SubagentsState {
  const { agents, loading, error, refresh } = useAgents();
  return {
    subagents: agents.filter((a) => a.code.length > 1),
    loading,
    error,
    refresh,
  };
}
