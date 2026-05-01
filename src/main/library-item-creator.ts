/**
 * Writes agent and skill library items, then rebuilds library/_index.json.
 *
 * Workflow creation already goes through WorkflowCreator because workflow.js
 * has a richer structured generator. This creator covers the markdown-backed
 * AGENT.md and SKILL.md entries used by the Library Browser.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { LibraryWalker } from "./library-walker.ts";

export type LibraryCreatableKind = "agent" | "skill";

export const VALID_LIBRARY_ITEM_ROOTS = [
  "business/knowledge-management",
  "specializations/ai-agents-conversational",
  "specializations/gpu-programming",
  "specializations/software-architecture",
] as const;

export type CreateLibraryItemOpts = {
  kind: LibraryCreatableKind;
  targetRoot: string;
  slug: string;
  name: string;
  description: string;
  role?: string;
  philosophy?: string;
  tags?: string[];
  capabilities?: string[];
  tools?: string[];
  prerequisites?: string[];
};

export type CreateLibraryItemResult = {
  diskPath: string;
  relPath: string;
};

export class LibraryItemCreator {
  private readonly libraryRoot: string;

  constructor(libraryRoot: string) {
    this.libraryRoot = path.resolve(libraryRoot);
  }

  async create(opts: CreateLibraryItemOpts): Promise<CreateLibraryItemResult> {
    const normalized = normalizeCreateOpts(opts);
    if (!VALID_LIBRARY_ITEM_ROOTS.includes(normalized.targetRoot as (typeof VALID_LIBRARY_ITEM_ROOTS)[number])) {
      throw new Error(
        `Invalid targetRoot "${normalized.targetRoot}". Must be one of: ${VALID_LIBRARY_ITEM_ROOTS.join(", ")}`,
      );
    }

    const itemDirName = normalized.kind === "agent" ? "agents" : "skills";
    const fileName = normalized.kind === "agent" ? "AGENT.md" : "SKILL.md";
    const targetDir = path.resolve(this.libraryRoot, normalized.targetRoot, itemDirName, normalized.slug);
    const targetFile = path.join(targetDir, fileName);
    if (!isDescendantOrSelf(this.libraryRoot, targetFile)) {
      throw new Error("Target path must stay under library root");
    }
    if (await exists(targetFile)) {
      throw new Error(`${fileName} already exists at ${targetFile}`);
    }

    const source = normalized.kind === "agent"
      ? renderAgent(normalized)
      : renderSkill(normalized);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, source, "utf8");

    const walker = new LibraryWalker(this.libraryRoot);
    const index = await walker.buildIndex();
    await fs.writeFile(
      path.join(this.libraryRoot, "_index.json"),
      JSON.stringify(index, null, 2),
    );

    return {
      diskPath: targetFile,
      relPath: path.relative(this.libraryRoot, targetFile).split(path.sep).join("/"),
    };
  }
}

function normalizeCreateOpts(opts: CreateLibraryItemOpts): Required<CreateLibraryItemOpts> {
  const kind = opts.kind === "skill" ? "skill" : "agent";
  const slug = String(opts.slug ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Invalid slug "${slug}". Must be kebab-case.`);
  }

  const name = String(opts.name ?? "").trim() || titleFromSlug(slug);
  const description = String(opts.description ?? "").trim();
  if (!description) throw new Error("Description is required");

  const targetRoot = normalizeRelPath(opts.targetRoot);
  const tags = unique([targetRoot.split("/").at(-1) ?? "", ...toArray(opts.tags)]);
  const capabilities = toArray(opts.capabilities);
  const tools = kind === "skill" && toArray(opts.tools).length === 0
    ? ["Read", "Write", "Edit", "Glob", "Grep", "Bash(*)"]
    : toArray(opts.tools);
  const prerequisites = toArray(opts.prerequisites);

  return {
    kind,
    targetRoot,
    slug,
    name,
    description,
    role: String(opts.role ?? "").trim() || (kind === "agent" ? "Library specialist" : "Skill operator"),
    philosophy: String(opts.philosophy ?? "").trim() || "Make the reusable path clear, concrete, and easy to validate.",
    tags,
    capabilities,
    tools,
    prerequisites,
  };
}

function renderAgent(opts: Required<CreateLibraryItemOpts>): string {
  const capabilities = opts.capabilities.length > 0
    ? opts.capabilities
    : [
        `Plan and execute ${opts.name} work using Mission Control library conventions.`,
        "Use nearby library examples before inventing new structure.",
        "Report assumptions, missing inputs, and validation notes clearly.",
      ];
  return `---
name: ${yamlScalar(opts.slug)}
description: ${yamlScalar(opts.description)}
tags: ${yamlInlineList(opts.tags)}
version: ${yamlScalar("1.0.0")}
---

# ${opts.name}

You are **${opts.slug}** - ${opts.description}

## Persona

**Role**: ${opts.role}
**Identity**: A focused Mission Control agent for ${opts.name}.
**Philosophy**: "${opts.philosophy}"

## Core Principles

1. Use existing library patterns before creating new structure.
2. Keep outputs concrete, reviewable, and tied to source evidence.
3. State assumptions and missing information instead of fabricating certainty.

## Capabilities

${bullets(capabilities)}

## Inputs

- User request or task brief.
- Relevant repository, library, or project context.
- Constraints, target paths, and quality expectations.

## Outputs

- Actionable plan or artifact draft.
- Validation notes and risks.
- Follow-up recommendations when more context is needed.

## Quality Bar

- Metadata is useful for search and routing.
- The role boundary is clear enough for workflow assignment.
- Any uncertainty is visible in the handoff.
`;
}

function renderSkill(opts: Required<CreateLibraryItemOpts>): string {
  const capabilities = opts.capabilities.length > 0
    ? opts.capabilities
    : [
        `Perform ${opts.name} using repeatable Mission Control steps.`,
        "Find related examples in the library before drafting output.",
        "Validate generated artifacts before handoff.",
      ];
  const prerequisites = opts.prerequisites.length > 0
    ? opts.prerequisites
    : [
        "Confirm the requested output and target path.",
        "Search the library for related examples.",
        "Identify missing inputs before writing files.",
      ];
  return `---
name: ${yamlScalar(opts.slug)}
description: ${yamlScalar(opts.description)}
allowed-tools: ${yamlScalar(opts.tools.join(" "))}
tags: ${yamlInlineList(opts.tags)}
version: ${yamlScalar("1.0.0")}
---

# ${opts.name}

Use this skill when a task needs ${opts.description}

## Prerequisites

${bullets(prerequisites)}

## Capabilities

${bullets(capabilities)}

## Workflow

1. Normalize the request into inputs, outputs, target path, and constraints.
2. Search nearby library files and \`library/_knowledge.json\` for examples.
3. Draft the smallest complete artifact that satisfies the request.
4. Validate required metadata and expected outputs.
5. Report files changed, assumptions, and follow-up checks.

## Failure Modes

- Required inputs are missing or ambiguous.
- Generated metadata is too generic to route or search.
- The output cannot be verified from available context.

## Output Expectations

- Concrete file paths or artifact names.
- Concise summary of what changed.
- Validation status and remaining gaps.
`;
}

function normalizeRelPath(value: string): string {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function yamlInlineList(values: string[]): string {
  return `[${values.map(yamlScalar).join(", ")}]`;
}

function bullets(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((x) => x.trim()).filter(Boolean))];
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isDescendantOrSelf(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
