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

/**
 * Per-kind index file map. The single combined `_index.json` was
 * replaced with four per-kind files (one per tab in the Library
 * Browser) so that adding/removing a single workflow doesn't churn
 * a 6.5MB combined blob, and so each tab can be inspected in
 * isolation.
 */
export const INDEX_FILES: Record<LibraryItemKind, string> = {
  workflow: "_index.workflow.json",
  agent: "_index.agent.json",
  skill: "_index.skill.json",
  example: "_index.example.json",
};
export const ALL_INDEX_FILE_NAMES = Object.values(INDEX_FILES);

/**
 * Write the combined `LibraryIndex` as four per-kind files. Each file
 * carries the same outer shape as the legacy `_index.json` —
 * `{ generatedAt, summary, items }` — so individual files are
 * self-describing if you read them in isolation. The summary in each
 * per-kind file reflects the FULL catalog (not just that kind), so
 * tools that just need top-line counts can read any one file.
 */
export async function writeIndexFiles(libraryRoot: string, index: LibraryIndex): Promise<void> {
  const byKind: Record<LibraryItemKind, LibraryIndexItem[]> = {
    workflow: [],
    agent: [],
    skill: [],
    example: [],
  };
  for (const item of index.items) byKind[item.kind].push(item);
  await Promise.all(
    (Object.keys(byKind) as LibraryItemKind[]).map(async (kind) => {
      const file = path.join(libraryRoot, INDEX_FILES[kind]);
      const slice: LibraryIndex = {
        generatedAt: index.generatedAt,
        summary: index.summary,
        items: byKind[kind],
      };
      await fs.writeFile(file, JSON.stringify(slice, null, 2));
    }),
  );
}

/**
 * Read the four per-kind files back into a combined index. Missing
 * files are tolerated (treated as empty for that kind) so the renderer
 * doesn't crash on a half-built library root.
 */
export async function readIndexFiles(libraryRoot: string): Promise<LibraryIndex> {
  const items: LibraryIndexItem[] = [];
  let generatedAt = new Date(0).toISOString();
  for (const kind of Object.keys(INDEX_FILES) as LibraryItemKind[]) {
    const file = path.join(libraryRoot, INDEX_FILES[kind]);
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as LibraryIndex;
      if (Array.isArray(parsed.items)) items.push(...parsed.items);
      if (parsed.generatedAt && parsed.generatedAt > generatedAt) {
        generatedAt = parsed.generatedAt;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return {
    generatedAt,
    summary: {
      agents: items.filter((x) => x.kind === "agent").length,
      skills: items.filter((x) => x.kind === "skill").length,
      workflows: items.filter((x) => x.kind === "workflow").length,
      examples: items.filter((x) => x.kind === "example").length,
    },
    items,
  };
}

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
      // Sidecar info files (<slug>.info.json next to flat sources, INFO.json
      // next to AGENT.md/SKILL.md) are NOT items themselves — they're
      // overlays merged into the item they describe.
      const isSidecar = base === "INFO.json" || base.endsWith(".info.json");
      const isExampleJson =
        ext === ".json" &&
        base !== "_meta.json" &&
        base !== "_index.json" &&
        !ALL_INDEX_FILE_NAMES.includes(base) &&
        !isSidecar;
      const isWorkflowJs = isWorkflowSource(rel, base, ext);
      if (!TARGET_FILES.has(base) && !isExampleJson && !isWorkflowJs) continue;
      if (isSidecar) continue;

      const kind = classifyKind(base, isExampleJson, isWorkflowJs);
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

    let item: LibraryIndexItem = base;
    if (kind === "workflow") {
      const workflowData = await buildWorkflowFields(filePath, text);
      item = { ...base, ...workflowData };
    }

    // Sidecar overlay — last layer. The walker can't reliably derive
    // most editorial fields (containerKind, domainGroup, hasParallel,
    // etc.) from source files, so a sibling .info.json / INFO.json
    // is the source of truth for anything in SIDECAR_OVERRIDE_FIELDS
    // when present. Computed fields (id, diskPath, sizeBytes,
    // modifiedAt) can never be overridden — they always reflect disk.
    const sidecarPath = sidecarPathFor(filePath, kind);
    const sidecar = await readSidecar(sidecarPath);
    return applySidecar(item, sidecar);
  }

  private async walk(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".claude") continue;
      // Sample data lives under library/samples/ — it's read-only seed data
      // for the demo board, not part of the curated agent/skill/workflow
      // catalog. Skip so it doesn't show up in the Library Browser.
      if (entry.name === "samples") continue;
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

/**
 * Sidecar info-file resolver. Two file naming conventions because items
 * have two structural shapes:
 *
 *   - AGENT.md / SKILL.md always live in their own folder; the sidecar
 *     is `INFO.json` in that folder.
 *   - Workflows (`<slug>.js` flat under a `<category>/workflows/` dir)
 *     and examples (`<example>.json` flat) get a sibling sidecar named
 *     `<stem>.info.json` next to the source file.
 *
 * Sidecars are optional. Missing sidecar → no overrides.
 */
export function sidecarPathFor(filePath: string, kind: LibraryItemKind): string {
  const dir = path.dirname(filePath);
  if (kind === "agent" || kind === "skill") {
    return path.join(dir, "INFO.json");
  }
  const base = path.basename(filePath);
  const stem = base.replace(/\.[^.]+$/, "");
  return path.join(dir, `${stem}.info.json`);
}

async function readSidecar(sidecarPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(sidecarPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    // Corrupt JSON shouldn't crash the index build; treat as empty.
    return {};
  }
}

/**
 * Fields a sidecar is allowed to override. Computed fields (id,
 * diskPath, sizeBytes, modifiedAt, descriptionMdPath, etc.) are
 * deliberately not in this list — they always reflect disk truth and
 * the user can't usefully edit them in the UI.
 */
export const SIDECAR_OVERRIDE_FIELDS = [
  "name",
  "description",
  "role",
  "tags",
  "languages",
  "expertise",
  "version",
  "container",
  "containerKind",
  "domainGroup",
  "originalSource",
  "hasParallel",
  "hasBreakpoints",
  "estimatedSteps",
  "usesAgents",
  "usesSkills",
] as const;

function applySidecar(item: LibraryIndexItem, sidecar: Record<string, unknown>): LibraryIndexItem {
  if (Object.keys(sidecar).length === 0) return item;
  const out: Record<string, unknown> = { ...item };
  for (const key of SIDECAR_OVERRIDE_FIELDS) {
    if (sidecar[key] !== undefined) {
      out[key] = sidecar[key];
    }
  }
  return out as LibraryIndexItem;
}

function classifyKind(base: string, isExampleJson: boolean, isWorkflowJs: boolean): LibraryItemKind | null {
  if (base === "AGENT.md") return "agent";
  if (base === "SKILL.md") return "skill";
  if (base === "workflow.js" || isWorkflowJs) return "workflow";
  if (isExampleJson) return "example";
  return null;
}

function isWorkflowSource(relPath: string, base: string, ext: string): boolean {
  if (ext !== ".js") return false;
  const parts = toPosix(relPath).split("/");
  if (!parts.includes("workflows")) return false;
  if (parts.some((part) => part.startsWith("_"))) return false;
  if (base === "index.js") return false;
  return true;
}

function toLogicalPath(relPath: string): string {
  const posix = toPosix(relPath);
  if (posix.endsWith("/AGENT.md")) return posix.slice(0, -"/AGENT.md".length);
  if (posix.endsWith("/SKILL.md")) return posix.slice(0, -"/SKILL.md".length);
  if (posix.endsWith("/workflow.js")) return posix.slice(0, -"/workflow.js".length);
  return posix.replace(/\.[^./]+$/, "");
}

/**
 * When frontmatter omits languages:, infer labels from card `name` and path
 * (skills: folder after `skills/`, else leaf; examples: filename stem).
 * Applies to any tech slug — not specific to YAML.
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
  const companionDoc =
    path.basename(filePath) === "workflow.js"
      ? await existingPath(path.join(dir, "README.md"))
      : await existingPath(path.join(dir, `${path.basename(filePath, ".js")}.md`));

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
