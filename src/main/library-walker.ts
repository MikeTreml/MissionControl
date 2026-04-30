import { promises as fs } from "node:fs";
import path from "node:path";

export type LibraryItemKind = "agent" | "skill" | "workflow" | "example";

export type LibrarySourceRef = {
  repo?: string;
  url?: string;
  license?: string;
  viaUpstream?: string;
  absorbedBy?: string;
  absorbedAt?: string;
};

export type LibraryMeta = {
  containerKind?: string;
  displayName?: string;
  originalSource?: LibrarySourceRef;
  languagePrimary?: string;
  languagesSupported?: string[];
  tags?: string[];
  summary?: string;
  domainGroup?: string;
};

export type LibraryIndexItem = {
  kind: LibraryItemKind;
  id: string;
  name: string;
  diskPath: string;
  logicalPath: string;
  container: string | null;
  containerKind: string | null;
  domainGroup: string | null;
  description: string | null;
  role: string | null;
  expertise: string[];
  languages: string[];
  tags: string[];
  originalSource: LibrarySourceRef | null;
  version: string | null;
  sizeBytes: number;
  modifiedAt: string;
  inputsSchemaPath?: string | null;
  examplesDir?: string | null;
  companionDoc?: string | null;
  usesAgents?: string[];
  usesSkills?: string[];
  estimatedSteps?: number;
  hasParallel?: boolean;
  hasBreakpoints?: boolean;
  /** Co-located long-form prose; same directory as the entry file (AGENT.md, SKILL.md, workflow.js). */
  descriptionMdPath: string | null;
  /** README.md in the same folder as the entry (standard for skills/agents); null for workflows (use companionDoc). */
  readmeMdPath: string | null;
  /** First README.md found walking up from the entry's parent folder, stopping at the library root. */
  containerReadmePath: string | null;
};

export type LibraryIndex = {
  generatedAt: string;
  summary: {
    agents: number;
    skills: number;
    workflows: number;
    examples: number;
  };
  items: LibraryIndexItem[];
};

const TARGET_FILES = new Set(["AGENT.md", "SKILL.md", "workflow.js"]);
const DOMAIN_GROUPS = new Set(["business", "science", "social-sciences-humanities"]);

export class LibraryWalker {
  private readonly root: string;
  private readonly metaCache = new Map<string, LibraryMeta | null>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async buildIndex(): Promise<LibraryIndex> {
    const filePaths = await this.walk(this.root);
    const items: LibraryIndexItem[] = [];

    for (const filePath of filePaths) {
      const rel = path.relative(this.root, filePath);
      if (!rel) continue;

      const base = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const isExampleJson = ext === ".json" && base !== "_meta.json" && base !== "_index.json";
      if (!TARGET_FILES.has(base) && !isExampleJson) continue;

      const kind = classifyKind(base, isExampleJson);
      if (!kind) continue;
      items.push(await this.buildItem(filePath, rel, kind));
    }

    items.sort((a, b) => a.id.localeCompare(b.id));
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        agents: items.filter((x) => x.kind === "agent").length,
        skills: items.filter((x) => x.kind === "skill").length,
        workflows: items.filter((x) => x.kind === "workflow").length,
        examples: items.filter((x) => x.kind === "example").length,
      },
      items,
    };
  }

  private async buildItem(
    filePath: string,
    relPath: string,
    kind: LibraryItemKind,
  ): Promise<LibraryIndexItem> {
    const stat = await fs.stat(filePath);
    const logicalPath = toLogicalPath(relPath);
    const id = toPosix(relPath).replace(/\.(md|js|json)$/i, "");
    const name = logicalPath.split("/").at(-1) ?? path.basename(filePath);
    const text = await fs.readFile(filePath, "utf8");
    const frontmatter = parseFrontmatter(text);
    const itemDir = path.dirname(filePath);
    const nearestMeta = await this.findNearestMeta(itemDir);
    const inferred = inferContainerContext(logicalPath);
    const languages = uniq([
      ...toStringArray(frontmatter.languages),
      ...toStringArray(frontmatter.language),
      ...toStringArray(frontmatter.languagePrimary),
      ...toStringArray(nearestMeta?.languagesSupported),
      ...toStringArray(nearestMeta?.languagePrimary),
      ...inferLanguagesFromContext(logicalPath, kind, frontmatter),
    ]);
    const tags = uniq([
      ...toStringArray(frontmatter.tags),
      ...toStringArray(nearestMeta?.tags),
    ]);

    const descriptionMdPath = await existingPath(path.join(itemDir, "DESCRIPTION.md"));
    const readmeMdPath =
      kind === "workflow" ? null : await existingPath(path.join(itemDir, "README.md"));
    const containerReadmePath = await resolveContainerReadme(this.root, filePath);

    const base: LibraryIndexItem = {
      kind,
      id,
      name,
      diskPath: filePath,
      logicalPath,
      container: inferred.container,
      containerKind: nearestMeta?.containerKind ?? inferred.containerKind,
      domainGroup: nearestMeta?.domainGroup ?? inferred.domainGroup,
      description:
        toString(frontmatter.description) ??
        toString(frontmatter.summary) ??
        nearestMeta?.summary ??
        null,
      role: toString(frontmatter.role) ?? null,
      expertise: toStringArray(frontmatter.expertise),
      languages,
      tags,
      originalSource: nearestMeta?.originalSource ?? null,
      version: toString(frontmatter.version) ?? null,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      descriptionMdPath,
      readmeMdPath,
      containerReadmePath,
    };

    if (kind === "workflow") {
      const workflowData = await buildWorkflowFields(filePath, text);
      return { ...base, ...workflowData };
    }
    return base;
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".claude") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.walk(abs)));
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
    return out;
  }

  private async findNearestMeta(dir: string): Promise<LibraryMeta | null> {
    const key = path.resolve(dir);
    const cached = this.metaCache.get(key);
    if (cached !== undefined) return cached;

    let cursor = key;
    while (cursor.startsWith(this.root)) {
      const candidate = path.join(cursor, "_meta.json");
      try {
        const raw = await fs.readFile(candidate, "utf8");
        const parsed = JSON.parse(raw) as LibraryMeta;
        this.metaCache.set(key, parsed);
        return parsed;
      } catch {
        // Keep walking up.
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    this.metaCache.set(key, null);
    return null;
  }
}

function classifyKind(base: string, isExampleJson: boolean): LibraryItemKind | null {
  if (base === "AGENT.md") return "agent";
  if (base === "SKILL.md") return "skill";
  if (base === "workflow.js") return "workflow";
  if (isExampleJson) return "example";
  return null;
}

function toLogicalPath(relPath: string): string {
  const posix = toPosix(relPath);
  if (posix.endsWith("/AGENT.md")) return posix.slice(0, -"/AGENT.md".length);
  if (posix.endsWith("/SKILL.md")) return posix.slice(0, -"/SKILL.md".length);
  if (posix.endsWith("/workflow.js")) return posix.slice(0, -"/workflow.js".length);
  return posix.replace(/\.[^./]+$/, "");
}

/**
 * When frontmatter omits languages:, infer labels from card name and path.
 * e.g. specializations/.../skills/yaml → "yaml"; name: zustand in YAML → "zustand".
 */
function inferLanguagesFromContext(
  logicalPath: string,
  kind: LibraryItemKind,
  frontmatter: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const fmName = toString(frontmatter.name);
  if (fmName) out.push(fmName);

  if (kind === "workflow") return out;

  const parts = logicalPath.split("/").filter(Boolean);

  if (kind === "skill") {
    const si = parts.indexOf("skills");
    if (si >= 0 && parts[si + 1]) {
      out.push(parts[si + 1]!);
    } else {
      const leaf = parts.at(-1);
      if (leaf) out.push(leaf);
    }
  } else if (kind === "example") {
    const leaf = parts.at(-1)?.replace(/\.[^.]+$/, "");
    if (leaf) out.push(leaf);
  }

  return out;
}

function inferContainerContext(logicalPath: string): {
  container: string | null;
  containerKind: string | null;
  domainGroup: string | null;
} {
  const parts = logicalPath.split("/");
  const [root, second] = parts;
  if (!root) {
    return { container: null, containerKind: null, domainGroup: null };
  }
  if (root === "methodologies") {
    return { container: second ?? null, containerKind: "methodology", domainGroup: null };
  }
  if (root === "specializations") {
    return { container: second ?? null, containerKind: "specialization", domainGroup: null };
  }
  if (root === "cradle") {
    return { container: second ?? null, containerKind: "cradle", domainGroup: null };
  }
  if (root === "contrib") {
    return { container: second ?? null, containerKind: "contrib", domainGroup: null };
  }
  if (root === "core") {
    return { container: second ?? null, containerKind: "core", domainGroup: null };
  }
  if (DOMAIN_GROUPS.has(root)) {
    return { container: second ?? null, containerKind: "domain", domainGroup: root };
  }
  return { container: second ?? root, containerKind: null, domainGroup: null };
}

async function buildWorkflowFields(filePath: string, src: string): Promise<{
  inputsSchemaPath: string | null;
  examplesDir: string | null;
  companionDoc: string | null;
  usesAgents: string[];
  usesSkills: string[];
  estimatedSteps: number;
  hasParallel: boolean;
  hasBreakpoints: boolean;
}> {
  const dir = path.dirname(filePath);
  const inputsSchemaPath = await existingPath(path.join(dir, "inputs.schema.json"));
  const examplesDir = await existingPath(path.join(dir, "examples"), true);
  const companionDoc = await existingPath(path.join(dir, "README.md"));

  const usesAgents = uniq(matchRefs(src, /(["'`])((?:specializations|methodologies|agents|core|contrib|cradle)\/[^"'`\s]+)\1/g));
  const usesSkills = uniq(matchRefs(src, /(["'`])((?:skills|specializations|methodologies|core|contrib|cradle)\/[^"'`\s]*skills?\/[^"'`\s]+)\1/g));

  return {
    inputsSchemaPath,
    examplesDir,
    companionDoc,
    usesAgents,
    usesSkills,
    estimatedSteps: countRegex(src, /ctx\.task\s*\(/g),
    hasParallel: /ctx\.parallel(\.all)?\s*\(/.test(src),
    hasBreakpoints: /ctx\.breakpoint\s*\(/.test(src),
  };
}

function countRegex(text: string, regex: RegExp): number {
  return [...text.matchAll(regex)].length;
}

async function existingPath(candidate: string, asDir = false): Promise<string | null> {
  try {
    const stat = await fs.stat(candidate);
    if (asDir && !stat.isDirectory()) return null;
    if (!asDir && !stat.isFile()) return null;
    return path.resolve(candidate);
  } catch {
    return null;
  }
}

function isLibraryDescendantOrSelf(libraryRoot: string, dir: string): boolean {
  const rel = path.relative(path.resolve(libraryRoot), path.resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** README in an ancestor of the entry folder, excluding the entry's own directory (use DESCRIPTION.md there). */
async function resolveContainerReadme(libraryRoot: string, filePath: string): Promise<string | null> {
  const itemDir = path.dirname(path.resolve(filePath));
  let d = path.dirname(itemDir);
  while (isLibraryDescendantOrSelf(libraryRoot, d)) {
    const found = await existingPath(path.join(d, "README.md"));
    if (found) return found;
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return null;
}

function matchRefs(text: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = match[2]?.trim();
    if (value) out.push(value);
  }
  return out;
}

function parseFrontmatter(text: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  let i = 1;
  const out: Record<string, unknown> = {};
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const raw = line.slice(idx + 1).trim();
      out[key] = parseFrontmatterValue(raw);
    }
    i += 1;
  }
  return out;
}

function parseFrontmatterValue(raw: string): unknown {
  if (!raw) return "";
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return raw.replace(/^['"]|['"]$/g, "");
}

function toString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
