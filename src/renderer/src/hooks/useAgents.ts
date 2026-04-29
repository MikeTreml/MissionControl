/**
 * useAgents — the unified agent list (primary roles + subagents) plus the
 * pi-visible model list. Single source for anything that needs to know "what
 * agents exist and what models can they use?"
 *
 * Consumers filter as needed:
 *   agents.filter((a) => a.code.length === 1 && a.enabled !== false) → active primary roles
 *   agents.filter((a) => a.code.length > 1)                          → subagents
 *
 * Demo default: when no real data, returns a mock set with the four
 * primary roles + two subagents (matches the mockup visually).
 */
import { useEffect, useState } from "react";

import { useSubscribe } from "./data-bus";
import type { Agent } from "../../../shared/models";
import type { PiModelInfo } from "../global";

const MOCK_AGENTS: Agent[] = [
  { slug: "planner",      code: "p",   name: "Planner",      title: "Planner",   description: "", enabled: true, primaryModel: "anthropic:claude-opus-4-7", permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "developer",    code: "d",   name: "Developer",    title: "Developer", description: "", enabled: true, primaryModel: "openai-codex:gpt-5.5", permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "reviewer",     code: "r",   name: "Reviewer",     title: "Reviewer",  description: "", enabled: true, primaryModel: "anthropic:claude-opus-4-7", permissions: { inherit: true, readonly: true,  allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "surgeon",      code: "s",   name: "Surgeon",      title: "Surgeon",   description: "", enabled: true, primaryModel: "google:gemini-3.1-pro-preview", permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "repomapper",   code: "rmp", name: "RepoMapper",   title: "Subagent",  description: "", enabled: true, primaryModel: "google:gemini-3.1-pro-preview", permissions: { inherit: false, readonly: true, allowedPaths: ["./"] }, promptFile: "prompt.md" },
  { slug: "docrefresher", code: "drf", name: "DocRefresher", title: "Subagent",  description: "", enabled: true, primaryModel: "google:gemini-3.1-pro-preview", permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
];

const MOCK_MODELS: PiModelInfo[] = [
  { id: "claude-opus-4-7", name: "claude-opus-4-7", provider: "anthropic", api: "anthropic", contextWindow: 200000, maxTokens: 8192, costInputPerMTok: 15, costOutputPerMTok: 75, reasoning: true },
  { id: "gpt-5.5", name: "gpt-5.5", provider: "openai-codex", api: "openai", contextWindow: 400000, maxTokens: 16384, costInputPerMTok: 1.25, costOutputPerMTok: 10, reasoning: true },
  { id: "gemini-3.1-pro-preview", name: "gemini-3.1-pro-preview", provider: "google", api: "google", contextWindow: 1048576, maxTokens: 8192, costInputPerMTok: 1.25, costOutputPerMTok: 10, reasoning: true },
];

export interface AgentsState {
  agents: Agent[];
  models: PiModelInfo[];
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useAgents(): AgentsState {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<PiModelInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  async function load(): Promise<void> {
    try {
      setLoading(true);
      if (!window.mc) {
        setAgents(MOCK_AGENTS);
        setModels(MOCK_MODELS);
        setIsDemo(true);
        return;
      }
      const [a, m] = await Promise.all([
        window.mc.listAgents(),
        window.mc.listPiModels(),
      ]);
      if (a.length === 0) {
        setAgents(MOCK_AGENTS);
        setIsDemo(true);
      } else {
        setAgents(a);
        setIsDemo(false);
      }
      setModels(m.length === 0 ? MOCK_MODELS : m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setAgents(MOCK_AGENTS);
      setModels(MOCK_MODELS);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useSubscribe("agents", () => { void load(); });

  return { agents, models, loading, isDemo, error, refresh: load };
}

/** Resolve a persisted provider:model id to a display label (uses the raw id when missing). */
export function modelLabel(id: string, roster: PiModelInfo[]): string {
  if (!id) return "";
  const [provider, modelId] = id.includes(":") ? id.split(":", 2) : [undefined, id];
  const m = roster.find((x) => x.id === modelId && (provider ? x.provider === provider : true));
  return m ? `${m.provider}:${m.name}` : id;
}
