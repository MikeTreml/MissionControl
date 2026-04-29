/**
 * Agent loader — discovers all agents on disk at boot.
 *
 * One unified folder:
 *   <root>/agents/
 *     planner/      code: "p"     (primary role — 1 char)
 *     developer/    code: "d"
 *     reviewer/     code: "r"
 *     surgeon/      code: "s"
 *     repomapper/   code: "rmp"   (subagent — 2+ chars)
 *     docrefresher/ code: "drf"
 *
 * Each folder has:
 *   agent.json       <- REQUIRED: { slug, code, name, title, description, primaryModel, permissions, promptFile }
 *   prompt.md        <- optional system prompt/instructions (referenced by agent.json.promptFile)
 *
 * Rules enforced at boot:
 *   - folder name must match `slug` in agent.json
 *   - `code` must be unique across all agents (used in task-linked filenames)
 *   - 1-char code = primary role, 2-4 char = subagent (convention only)
 *
 * Adding an agent = drop a folder. No code change. No UI dependency.
 *
 * ── PROPOSED INTEROP WITH pi-subagents ─────────────────────────────────
 *
 * PROPOSED: when we adopt pi-subagents (docs/PI-FEATURES.md), this loader
 * can EITHER stay as-is (our canonical list lives here) OR morph to also
 * read `.pi/agents/*.md` files in the user's project folder. The second
 * path lets project-scope agent overrides work. Decide later based on use.
 *
 * PI-WIRE: each Agent's `primaryModel` is passed to pi.createSession({ model, ... })
 * when a run starts. See src/renderer/src/pages/TaskDetail.tsx for the call site.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import { AgentSchema, type Agent } from "../shared/models.ts";

export class AgentLoader {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async loadAll(): Promise<Agent[]> {
    if (!existsSync(this.root)) return [];

    const entries = await fs.readdir(this.root, { withFileTypes: true });
    const bySlug = new Map<string, Agent>();
    const byCode = new Map<string, string>(); // code -> slug for error messages

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.root, entry.name, "agent.json");
      if (!existsSync(manifestPath)) continue;

      const raw = await fs.readFile(manifestPath, "utf8");
      const agent = AgentSchema.parse(JSON.parse(raw));

      if (agent.slug !== entry.name) {
        throw new Error(
          `Agent folder "${entry.name}" but agent.json says slug "${agent.slug}"`,
        );
      }
      if (bySlug.has(agent.slug)) {
        throw new Error(`Duplicate agent slug "${agent.slug}"`);
      }
      const codeOwner = byCode.get(agent.code);
      if (codeOwner) {
        throw new Error(
          `Duplicate agent code "${agent.code}" in ${codeOwner} and ${agent.slug}`,
        );
      }
      bySlug.set(agent.slug, agent);
      byCode.set(agent.code, agent.slug);
    }

    // Sort primary agents (1-char code) first, then subagents, each alphabetical.
    return [...bySlug.values()].sort((a, b) => {
      const aP = a.code.length === 1 ? 0 : 1;
      const bP = b.code.length === 1 ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return a.slug.localeCompare(b.slug);
    });
  }

  /**
   * Load the prompt.md (or whatever the agent's `promptFile` field points at)
   * content for a given slug. Returns null if the agent or file is missing
   * — callers should use pi's default system prompt.
   */
  async loadPrompt(slug: string): Promise<string | null> {
    if (!existsSync(this.root)) return null;
    const manifestPath = path.join(this.root, slug, "agent.json");
    if (!existsSync(manifestPath)) return null;
    const raw = await fs.readFile(manifestPath, "utf8");
    const agent = AgentSchema.parse(JSON.parse(raw));
    const promptPath = path.join(this.root, slug, agent.promptFile);
    if (!existsSync(promptPath)) return null;
    return fs.readFile(promptPath, "utf8");
  }
}
