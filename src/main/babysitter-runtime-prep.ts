/**
 * Stage SKILL.md content into the workspace before babysitter spawns a
 * curated run. Why this exists:
 *
 * The SDK's prompt builder (harnessUtils.js:546) loads skills from
 *   <workspace>/.a5c/skills/<name>/SKILL.md
 *   <workspace>/.claude/plugins/<name>/SKILL.md
 * and *only* recognises the plural `metadata: { skills: [...] }` field on
 * a task. Library workflows in MC use a singular `skill: { name: 'X' }`
 * shape that the SDK silently ignores. So before invoking
 * `harness:create-run` we:
 *   1. extract every skill name referenced by the workflow,
 *   2. resolve it against library/_index.skill.json + libraryRoot,
 *   3. copy the resolved SKILL.md into <workspace>/.a5c/skills/<name>/,
 *   4. emit a rewritten workflow copy under
 *      <workspace>/.a5c/mc-generated/<basename>.gen.js that swaps
 *      `skill: { name: 'X' }` → `metadata: { skills: ['X'] }`
 *      so the SDK actually injects the SKILL.md text into the worker
 *      session prompt.
 *
 * Scope (intentional): skills only — agent materialization is a follow-up.
 * Resolution priority is by `name` field, then by trailing slug of
 * `logicalPath`. Missing skills are reported but do not throw — the
 * caller decides whether to abort.
 */
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";

import { INDEX_FILES, type LibraryIndexItem } from "./library-walker.ts";

export type SkillResolution = {
  name: string;
  status: "materialized" | "missing";
  /** Source SKILL.md (absolute) when resolved. */
  resolvedFrom?: string;
  /** Destination SKILL.md (absolute) when materialized. */
  materializedTo?: string;
};

export type RuntimePrepResult = {
  /** Path to pass to `babysitter harness:create-run --process`. */
  generatedWorkflowPath: string;
  /** True when MC produced a rewritten copy under .a5c/mc-generated/. */
  rewritten: boolean;
  skills: SkillResolution[];
  /** Names that appeared in the workflow source but had no library match. */
  missingSkills: string[];
};

/** Bare-bones index reader — only pulls the skill index. */
async function readSkillIndexItems(libraryRoot: string): Promise<LibraryIndexItem[]> {
  const file = path.join(libraryRoot, INDEX_FILES.skill);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { items?: LibraryIndexItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/**
 * Find every `skill: { ... }` occurrence, including ones with nested
 * objects like `skill: { name: 'x', params: { y: 1 } }`. Returns the
 * body (between the outermost braces) plus the full match span so the
 * rewriter can do a slice replacement. Brace balance ignores braces
 * inside string literals.
 */
function findSkillObjects(src: string): Array<{ start: number; end: number; body: string }> {
  const out: Array<{ start: number; end: number; body: string }> = [];
  const headRe = /skill:\s*\{/g;
  let head: RegExpExecArray | null;
  while ((head = headRe.exec(src)) !== null) {
    const bodyStart = head.index + head[0].length;
    let depth = 1;
    let i = bodyStart;
    let inString: string | null = null;
    while (i < src.length && depth > 0) {
      const ch = src[i]!;
      if (inString) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === inString) inString = null;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        inString = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push({ start: head.index, end: i + 1, body: src.slice(bodyStart, i) });
          headRe.lastIndex = i + 1;
          break;
        }
      }
      i += 1;
    }
  }
  return out;
}

/**
 * Pull every skill name referenced by a workflow. Two shapes:
 *   skill: { name: 'foo', ...other fields }  (singular — needs rewrite)
 *   metadata: { ..., skills: ['a', 'b'] }    (plural — already SDK-shaped)
 *
 * The singular matcher walks balanced braces so nested objects (e.g.
 * `params: { ... }`) don't confuse it, then pulls `name: 'X'` from the
 * outer body. Bodies without a `name:` field are skipped — that filters
 * false-positive schema declarations like
 * `properties: { skill: { type: 'number' } }`.
 *
 * Names are returned uniqued in source order.
 */
export function extractSkillNames(src: string): { singular: string[]; plural: string[]; all: string[] } {
  const singular: string[] = [];
  for (const obj of findSkillObjects(src)) {
    const nameMatch = obj.body.match(/\bname:\s*(['"])([^'"]+)\1/);
    if (nameMatch && nameMatch[2]) singular.push(nameMatch[2]);
  }

  const plural: string[] = [];
  // metadata: { ... skills: [ 'a', "b" ] ... } — allow newlines inside
  const pluralRe = /metadata:\s*\{[\s\S]*?skills:\s*\[([\s\S]*?)\]/g;
  for (const m of src.matchAll(pluralRe)) {
    const body = m[1] ?? "";
    for (const item of body.matchAll(/['"]([^'"]+)['"]/g)) {
      if (item[1]) plural.push(item[1]);
    }
  }

  const seen = new Set<string>();
  const all: string[] = [];
  for (const n of [...singular, ...plural]) {
    if (!seen.has(n)) { seen.add(n); all.push(n); }
  }
  return { singular: dedupe(singular), plural: dedupe(plural), all };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Resolve a skill name against the index. Match priority:
 *   1. exact `name` field
 *   2. trailing slug of `logicalPath`
 * Returns the absolute disk path of the source SKILL.md, or null.
 *
 * NOTE: We don't trust `item.diskPath` from the index directly — those
 * paths are recorded at index-build time and may reflect a different
 * machine. We re-derive from `id` + libraryRoot.
 */
export function resolveSkillSource(
  name: string,
  libraryRoot: string,
  items: LibraryIndexItem[],
): string | null {
  const byName = items.find((it) => it.name === name);
  const byLeaf = byName ?? items.find((it) => it.logicalPath.split("/").at(-1) === name);
  if (!byLeaf) return null;
  // id looks like "business/.../skills/<slug>/SKILL" — append .md.
  const candidate = path.join(libraryRoot, `${byLeaf.id}.md`);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Rewrite `skill: { ...name: 'X'... }` → `metadata: { skills: ['X'] }`.
 *
 * The matcher tolerates additional fields inside the skill object
 * (version, params, etc.); only `name` is preserved because that's all
 * the SDK reads. Any sibling fields are dropped — the SDK's
 * `delegationConfig.skills` is a `string[]` per harnessUtils.js:546, so
 * there's nowhere for them to land.
 *
 * We deliberately don't try to merge with an existing `metadata: {...}`
 * on the same task — none of MC's affected workflows have one today,
 * and a real merge requires a JS parser. If a future workflow does, the
 * SDK will see two `metadata:` keys and the second wins; the run will
 * still execute, just without the skill if metadata-key order loses.
 * // OPEN: per-task metadata merge if/when a workflow needs it.
 */
export function rewriteWorkflowSource(src: string): { out: string; changed: boolean } {
  // Walk skill objects in reverse so slice replacements don't shift
  // earlier match indexes.
  const objects = findSkillObjects(src).reverse();
  let out = src;
  let changed = false;
  for (const obj of objects) {
    const nameMatch = obj.body.match(/\bname:\s*(['"])([^'"]+)\1/);
    if (!nameMatch || !nameMatch[2]) continue;
    out = out.slice(0, obj.start) + `metadata: { skills: ['${nameMatch[2]}'] }` + out.slice(obj.end);
    changed = true;
  }
  return { out, changed };
}

export async function prepareBabysitterRuntime(input: {
  workspaceCwd: string;
  libraryRoot: string;
  workflowDiskPath: string;
  /**
   * Caller-supplied scope for the generated workflow filename — usually
   * the task id. Without this, two tasks in the same project that pick
   * different workflows with the same basename (e.g. two repos each with
   * `analysis.js`) would clobber each other's `.gen.js` under
   * `<cwd>/.a5c/mc-generated/`. Required when the rewrite runs.
   */
  runId: string;
}): Promise<RuntimePrepResult> {
  const { workspaceCwd, libraryRoot, workflowDiskPath, runId } = input;
  const src = await fs.readFile(workflowDiskPath, "utf8");
  const { singular, all } = extractSkillNames(src);

  const skills: SkillResolution[] = [];
  const missingSkills: string[] = [];

  if (all.length > 0) {
    const indexItems = await readSkillIndexItems(libraryRoot);
    const skillsRoot = path.join(workspaceCwd, ".a5c", "skills");
    for (const name of all) {
      const source = resolveSkillSource(name, libraryRoot, indexItems);
      if (!source) {
        skills.push({ name, status: "missing" });
        missingSkills.push(name);
        continue;
      }
      const destDir = path.join(skillsRoot, name);
      const destFile = path.join(destDir, "SKILL.md");
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(source, destFile);
      skills.push({
        name,
        status: "materialized",
        resolvedFrom: source,
        materializedTo: destFile,
      });
    }
  }

  if (singular.length === 0) {
    return {
      generatedWorkflowPath: workflowDiskPath,
      rewritten: false,
      skills,
      missingSkills,
    };
  }

  const { out, changed } = rewriteWorkflowSource(src);
  if (!changed) {
    return {
      generatedWorkflowPath: workflowDiskPath,
      rewritten: false,
      skills,
      missingSkills,
    };
  }

  const genDir = path.join(workspaceCwd, ".a5c", "mc-generated");
  await fs.mkdir(genDir, { recursive: true });
  const baseName = path.basename(workflowDiskPath).replace(/\.js$/i, "");
  const safeRunId = runId.replace(/[^A-Za-z0-9._-]/g, "_");
  const generatedWorkflowPath = path.join(genDir, `${safeRunId}-${baseName}.gen.js`);
  await fs.writeFile(generatedWorkflowPath, out, "utf8");

  return {
    generatedWorkflowPath,
    rewritten: true,
    skills,
    missingSkills,
  };
}
