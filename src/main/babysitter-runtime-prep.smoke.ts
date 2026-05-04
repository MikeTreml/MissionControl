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
import { fileURLToPath } from "node:url";

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

  // Multi-field skill objects: extract name even with siblings, ignore order,
  // and ignore false-positive schema declarations that have no `name:`.
  const multi = `
    const a = defineTask('a', () => ({ skill: { name: 'multi-a', version: '1', params: { x: 1 } } }));
    const b = defineTask('b', () => ({ skill: { version: 2, name: "multi-b" } }));
    const props = { properties: { skill: { type: 'number' } } };
  `;
  const mext = extractSkillNames(multi);
  assertEq(mext.singular, ["multi-a", "multi-b"], "multi-field names extracted, schema field ignored");
  const mrw = rewriteWorkflowSource(multi);
  assert(mrw.out.includes("metadata: { skills: ['multi-a'] }"), "multi-a rewritten");
  assert(mrw.out.includes("metadata: { skills: ['multi-b'] }"), "multi-b rewritten (name not first)");
  assert(mrw.out.includes("skill: { type: 'number' }"), "schema field left alone");
  assert(!mrw.out.includes("version: '1'"), "sibling fields dropped from delegation");

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
  // Mix of shapes RunManager will hand us in practice:
  //   - simple singular (resolved)
  //   - multi-field singular with name not first (resolved)
  //   - singular pointing at an unresolved name (reported missing)
  await fs.writeFile(workflowPath, `
export const t1 = defineTask('a', () => ({
  kind: 'agent',
  skill: { name: 'foo-skill' },
}));
export const t2 = defineTask('b', () => ({
  kind: 'agent',
  skill: { version: 2, name: 'foo-skill', params: { x: 1 } },
}));
export const t3 = defineTask('c', () => ({
  kind: 'agent',
  skill: { name: 'missing-skill' },
}));
`);

  const workspaceCwd = path.join(tmp, "workspace");
  await fs.mkdir(workspaceCwd, { recursive: true });

  const result = await prepareBabysitterRuntime({ workspaceCwd, libraryRoot, workflowDiskPath: workflowPath, runId: "TP-001A" });
  assert(result.rewritten, "result.rewritten true");
  assert(
    result.generatedWorkflowPath.endsWith(path.join("mc-generated", "TP-001A", "demo.gen.js")),
    `generated path scoped by runId directory: ${result.generatedWorkflowPath}`,
  );

  // Collision isolation: a second task that points at a *different*
  // workflow file with the same basename must not clobber the first.
  const altWorkflowDir = path.join(libraryRoot, "other-domain", "workflows");
  await fs.mkdir(altWorkflowDir, { recursive: true });
  const altWorkflowPath = path.join(altWorkflowDir, "demo.js");
  await fs.writeFile(altWorkflowPath, `
export const t = defineTask('z', () => ({ kind: 'agent', skill: { name: 'foo-skill' } }));
// alt-workflow-marker
`);
  const altResult = await prepareBabysitterRuntime({ workspaceCwd, libraryRoot, workflowDiskPath: altWorkflowPath, runId: "TP-002B" });
  assert(altResult.generatedWorkflowPath !== result.generatedWorkflowPath, "different runId → different generated path");
  const altText = await fs.readFile(altResult.generatedWorkflowPath, "utf8");
  assert(altText.includes("alt-workflow-marker"), "alt task's generated copy holds the alt source");
  const firstText = await fs.readFile(result.generatedWorkflowPath, "utf8");
  assert(!firstText.includes("alt-workflow-marker"), "first task's generated copy untouched by second prep");

  const matFoo = result.skills.find((s) => s.name === "foo-skill");
  assert(matFoo?.status === "materialized", "foo-skill materialized");
  assert(matFoo?.materializedTo?.endsWith(path.join(".a5c", "skills", "foo-skill", "SKILL.md")), "destination path");

  const matMissing = result.skills.find((s) => s.name === "missing-skill");
  assert(matMissing?.status === "missing", "missing-skill flagged missing");
  assertEq(result.missingSkills, ["missing-skill"], "missingSkills list");

  const matText = await fs.readFile(matFoo!.materializedTo!, "utf8");
  assert(matText.includes("Real content."), "SKILL.md content copied");

  const genText = await fs.readFile(result.generatedWorkflowPath, "utf8");
  // Both the simple-shape and multi-field-shape skill: occurrences should
  // have been rewritten to the SDK-readable plural metadata.skills form.
  const pluralMatches = [...genText.matchAll(/metadata:\s*\{\s*skills:\s*\['foo-skill'\]\s*\}/g)];
  assert(pluralMatches.length === 2, `expected 2 plural rewrites, got ${pluralMatches.length}`);
  assert(!genText.includes("skill: { name: 'foo-skill' }"), "generated workflow lost simple singular foo");
  assert(!genText.match(/skill:\s*\{[^{}]*version:\s*2[^{}]*\}/), "generated workflow lost multi-field singular");
  // Missing-skill rewrite still happens — the SDK will load nothing for it,
  // and we already surfaced it in result.missingSkills above.
  assert(genText.includes("metadata: { skills: ['missing-skill'] }"), "missing-skill rewritten anyway");

  // ── against the real library — the path RunManager actually exercises ─
  // Pick any committed workflow that uses the singular shape, materialize
  // into a fresh workspace under tmp, and verify the SDK-readable plural
  // shape lands in the generated copy. This catches index-format drift
  // and proves the resolve→materialize→rewrite chain works against the
  // real catalog, not just the synthetic one above.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const realLibraryRoot = path.join(repoRoot, "library");
  if ((await safeStat(path.join(realLibraryRoot, "_index.skill.json"))) !== null) {
    const realWorkflow = path.join(
      realLibraryRoot,
      "business", "finance-accounting", "workflows", "annual-budget-development.js",
    );
    if ((await safeStat(realWorkflow)) !== null) {
      const realWorkspace = path.join(tmp, "real-workspace");
      await fs.mkdir(realWorkspace, { recursive: true });
      const realResult = await prepareBabysitterRuntime({
        workspaceCwd: realWorkspace,
        libraryRoot: realLibraryRoot,
        workflowDiskPath: realWorkflow,
        runId: "REAL-001",
      });
      assert(realResult.rewritten, "real workflow rewritten");
      const realGen = await fs.readFile(realResult.generatedWorkflowPath, "utf8");
      assert(
        /metadata:\s*\{\s*skills:\s*\[/.test(realGen),
        "real generated workflow contains plural metadata.skills",
      );
      assert(
        !/skill:\s*\{\s*name:\s*['"]/.test(realGen),
        "real generated workflow has no remaining singular skill: { name }",
      );
      console.log(
        `[smoke] real library: rewrote ${realResult.skills.length} skill ref(s), ${realResult.missingSkills.length} unresolved`,
      );
    }
  }

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("GREEN");
}

async function safeStat(p: string): Promise<unknown | null> {
  try { return await fs.stat(p); } catch { return null; }
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
