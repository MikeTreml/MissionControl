/**
 * useAgents — the unified agent list (primary roles + subagents) plus the
 * LLM model roster. Single source for anything that needs to know "what
 * agents exist and what models do they use?"
 *
 * Consumers filter as needed:
 *   agents.filter((a) => a.code.length === 1)  → primary roles (sidebar runtime)
 *   agents.filter((a) => a.code.length > 1)    → subagents (settings page)
 *
 * Demo fallback: when no real data, returns a mock set with the four
 * primary roles + two subagents (matches the mockup visually).
 */
import { useEffect, useState } from "react";

import { useSubscribe } from "./data-bus";
import type { Agent, ModelDefinition } from "../../../shared/models";

const MOCK_AGENTS: Agent[] = [
  { slug: "planner",      code: "p",   name: "Planner",      title: "Planner",   description: "", primaryModel: "claude-opus", fallbackModels: ["qwen-coder"], permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "developer",    code: "d",   name: "Developer",    title: "Developer", description: "", primaryModel: "gpt-5-codex", fallbackModels: ["claude-opus"], permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "reviewer",     code: "r",   name: "Reviewer",     title: "Reviewer",  description: "", primaryModel: "claude-opus", fallbackModels: [],              permissions: { inherit: true, readonly: true,  allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "surgeon",      code: "s",   name: "Surgeon",      title: "Surgeon",   description: "", primaryModel: "qwen-coder",  fallbackModels: ["claude-opus"], permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
  { slug: "repomapper",   code: "rmp", name: "RepoMapper",   title: "Subagent",  description: "", primaryModel: "qwen-coder",  fallbackModels: [],              permissions: { inherit: false, readonly: true, allowedPaths: ["./"] }, promptFile: "prompt.md" },
  { slug: "docrefresher", code: "drf", name: "DocRefresher", title: "Subagent",  description: "", primaryModel: "qwen-coder",  fallbackModels: [],              permissions: { inherit: true, readonly: false, allowedPaths: [] }, promptFile: "prompt.md" },
];

const MOCK_MODELS: ModelDefinition[] = [
  { id: "claude-opus",  label: "Claude Opus 4.6", kind: "anthropic", model: "claude-opus-4-6", endpoint: "",                         notes: "" },
  { id: "gpt-5-codex",  label: "GPT-5 Codex",     kind: "openai",    model: "gpt-5-codex",     endpoint: "",                         notes: "" },
  { id: "qwen-coder",   label: "Qwen 2.5 Coder",  kind: "ollama",    model: "qwen2.5-coder",   endpoint: "http://localhost:11434",   notes: "local" },
];

export interface AgentsState {
  agents: Agent[];                 // all agents, primary + sub
  models: ModelDefinition[];       // the LLM roster
  loading: boolean;
  isDemo: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useAgents(): AgentsState {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<ModelDefinition[]>([]);
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
        window.mc.listModels(),
      ]);
      if (a.length === 0) {
        setAgents(MOCK_AGENTS);
        setIsDemo(true);
      } else {
        setAgents(a);
        setIsDemo(false);
      }
      // Model roster being empty is fine (user hasn't added any); no demo flag for it
      setModels(m.length === 0 ? MOCK_MODELS : m);
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
  useSubscribe("models", () => { void load(); });

  return { agents, models, loading, isDemo, error, refresh: load };
}

/** Resolve a model id to its display label (falls back to the raw id). */
export function modelLabel(id: string, roster: ModelDefinition[]): string {
  if (!id) return "";
  const m = roster.find((x) => x.id === id);
  return m ? m.label : id;
}
