/**
 * Standalone smoke test for prepareBabysitterRuntime.
 *   node --experimental-strip-types src/main/babysitter-runtime-prep.smoke.ts
 *
 * Builds a tiny fake library + workspace in a tmp dir, runs the prep,
 * asserts the SKILL.md is materialized and the workflow rewrite swapped
 * `skill: { name }` for `metadata: { skills: [...] }`.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  prepareBabysitterRuntime,
  extractSkillNames,
  rewriteWorkflowSource,
  resolveSkillSource,
} from "./babysitter-runtime-prep.ts";
import { INDEX_FILES, type LibraryIndexItem } from "./library-walker.ts";

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-prep-smoke-"));
  console.log(`[smoke] tmp=${tmp}`);

  // ── pure helpers first ───────────────────────────────────────────────
  const sample = `
    export const t1 = defineTask('a', () => ({
      kind: 'agent',
      skill: { name: 'foo-skill' },
      agent: { name: 'x' },
    }));
    export const t2 = defineTask('b', () => ({
      kind: 'agent',
      metadata: { processId: 'whatever', skills: ['bar-skill', "baz-skill"] },
    }));
    // false positive shouldn't trip us — schema field, not delegation
    const schema = { properties: { skill: { type: 'number' } } };
  `;
  const ext = extractSkillNames(sample);
  assertEq(ext.singular, ["foo-skill"], "singular extracted");
  assertEq(ext.plural, ["bar-skill", "baz-skill"], "plural extracted");
  assertEq(ext.all, ["foo-skill", "bar-skill", "baz-skill"], "all in source order");

  const rw = rewriteWorkflowSource(sample);
  assert(rw.changed, "rewrite reports changed");
  assert(rw.out.includes("metadata: { skills: ['foo-skill'] }"), "rewrite swapped foo-skill");
  assert(!rw.out.includes("skill: { name: 'foo-skill' }"), "old singular gone");

  // ── full pipeline against a tmp fake library ─────────────────────────
  const libraryRoot = path.join(tmp, "library");
  const skillId = "domain/skills/foo-skill/SKILL";
  const skillDir = path.join(libraryRoot, "domain", "skills", "foo-skill");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), "# foo-skill\nReal content.\n");

  const item: LibraryIndexItem = {
    kind: "skill",
    id: skillId,
    name: "foo-skill",
    diskPath: "/somewhere/else/foo-skill/SKILL.md",  // intentionally stale
    logicalPath: "domain/skills/foo-skill",
    container: "domain",
    containerKind: null,
    domainGroup: null,
    description: null,
    role: null,
    expertise: [],
    languages: [],
    tags: [],
    originalSource: null,
    version: null,
    sizeBytes: 0,
    modifiedAt: new Date().toISOString(),
    descriptionMdPath: null,
    readmeMdPath: null,
    containerReadmePath: null,
  };
  await fs.writeFile(
    path.join(libraryRoot, INDEX_FILES.skill),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary: { agents: 0, skills: 1, workflows: 0, examples: 0 }, items: [item] }, null, 2),
  );

  // resolveSkillSource should re-derive against libraryRoot, not trust the stale diskPath.
  const resolved = resolveSkillSource("foo-skill", libraryRoot, [item]);
  assert(resolved !== null, "resolved foo-skill");
  assert(resolved!.startsWith(libraryRoot), `resolved under libraryRoot, got ${resolved}`);

  const workflowDir = path.join(libraryRoot, "domain", "workflows");
  await fs.mkdir(workflowDir, { recursive: true });
  const workflowPath = path.join(workflowDir, "demo.js");
  await fs.writeFile(workflowPath, `
export const t = defineTask('a', () => ({
  kind: 'agent',
  skill: { name: 'foo-skill' },
  skill: { name: 'missing-skill' },
}));
`);

  const workspaceCwd = path.join(tmp, "workspace");
  await fs.mkdir(workspaceCwd, { recursive: true });

  const result = await prepareBabysitterRuntime({ workspaceCwd, libraryRoot, workflowDiskPath: workflowPath });
  assert(result.rewritten, "result.rewritten true");
  assert(result.generatedWorkflowPath.endsWith("demo.gen.js"), `generated path: ${result.generatedWorkflowPath}`);

  const matFoo = result.skills.find((s) => s.name === "foo-skill");
  assert(matFoo?.status === "materialized", "foo-skill materialized");
  assert(matFoo?.materializedTo?.endsWith(path.join(".a5c", "skills", "foo-skill", "SKILL.md")), "destination path");

  const matMissing = result.skills.find((s) => s.name === "missing-skill");
  assert(matMissing?.status === "missing", "missing-skill flagged missing");
  assertEq(result.missingSkills, ["missing-skill"], "missingSkills list");

  const matText = await fs.readFile(matFoo!.materializedTo!, "utf8");
  assert(matText.includes("Real content."), "SKILL.md content copied");

  const genText = await fs.readFile(result.generatedWorkflowPath, "utf8");
  assert(genText.includes("metadata: { skills: ['foo-skill'] }"), "generated workflow has plural shape");
  assert(!genText.includes("skill: { name: 'foo-skill' }"), "generated workflow lost singular foo");

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL: ${msg}\n  actual:   ${a}\n  expected: ${e}`); process.exit(1); }
}

main().catch((err) => { console.error("RED:", err); process.exit(1); });
