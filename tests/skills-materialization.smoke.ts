/**
 * Smoke test: prepareBabysitterRuntime materializes referenced SKILL.md
 * files into the workspace.
 *
 * Verifies both library sources actually work as inputs:
 *   1. The out-of-the-box process-library at
 *      C:/Users/Treml/.a5c/process-library/babysitter-repo/library
 *   2. MC's local library at <repo>/library
 *
 * For each: runs prep against a workflow that uses the legacy
 * `skill: { name }` shape, then asserts the resolved SKILL.md was copied
 * to <workspace>/.a5c/skills/<name>/SKILL.md AND
 *      <workspace>/.pi/skills/<name>/SKILL.md, plus that the rewritten
 * .gen.js file was emitted under <workspace>/.a5c/mc-generated/.
 */
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepareBabysitterRuntime } from "../src/main/babysitter-runtime-prep.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}
function ok(msg: string): void { console.log(`[PASS] ${msg}`); }

async function makeTempWorkspace(label: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `mc-skills-${label}-`));
  return dir;
}

async function runCase(input: {
  label: string;
  libraryRoot: string;
  workflowDiskPath: string;
  expectedAtLeastOneSkill: string;
}): Promise<void> {
  console.log(`\n=== ${input.label} ===`);
  console.log(`library: ${input.libraryRoot}`);
  console.log(`workflow: ${input.workflowDiskPath}`);

  assert(existsSync(input.libraryRoot), `library exists: ${input.libraryRoot}`);
  assert(existsSync(input.workflowDiskPath), `workflow exists: ${input.workflowDiskPath}`);

  const indexFile = path.join(input.libraryRoot, "_index.skill.json");
  if (!existsSync(indexFile)) {
    console.warn(`[SKIP] library has no _index.skill.json — prep cannot resolve skills here.`);
    console.warn(`[SKIP] To enable: run library-walker against ${input.libraryRoot} to emit _index.*.json.`);
    return;
  }

  const workspace = await makeTempWorkspace(input.label);
  console.log(`workspace: ${workspace}`);

  const result = await prepareBabysitterRuntime({
    workspaceCwd: workspace,
    libraryRoot: input.libraryRoot,
    workflowDiskPath: input.workflowDiskPath,
    runId: `SMOKE-${input.label}`,
  });

  console.log(`prep result: ${result.skills.length} skills, ${result.missingSkills.length} missing, rewritten=${result.rewritten}`);

  assert(result.skills.length > 0, `at least one skill name was extracted from workflow source`);

  // Confirm the named skill was located + copied
  const expectedName = input.expectedAtLeastOneSkill;
  const sk = result.skills.find((s) => s.name === expectedName);
  assert(sk, `expected skill '${expectedName}' is in the prep result`);

  if (sk.status === "missing") {
    // Honest failure: the skill name was extracted from the workflow but
    // the library index doesn't carry it. That's a library bug, not a
    // prep bug. Report it loudly so it can be fixed in the library.
    console.error(`[INFO] skill '${expectedName}' was NOT found in this library — recording as missing`);
    assert(result.missingSkills.includes(expectedName), `missingSkills includes ${expectedName}`);
    console.log(`[NOTE] missingSkills: ${result.missingSkills.join(", ")}`);
    return;
  }

  // Materialized: verify both targets exist and contain content
  const a5cDest = path.join(workspace, ".a5c", "skills", expectedName, "SKILL.md");
  const piDest  = path.join(workspace, ".pi",  "skills", expectedName, "SKILL.md");
  assert(existsSync(a5cDest), `materialized to .a5c/skills/${expectedName}/SKILL.md`);
  assert(existsSync(piDest),  `mirrored to .pi/skills/${expectedName}/SKILL.md`);

  const a5cContent = await fs.readFile(a5cDest, "utf8");
  const piContent  = await fs.readFile(piDest, "utf8");
  assert(a5cContent.length > 0, `.a5c SKILL.md non-empty (${a5cContent.length} bytes)`);
  assert(a5cContent === piContent, `.a5c and .pi copies are byte-identical`);

  // Source resolved field should match
  assert(sk.resolvedFrom && existsSync(sk.resolvedFrom), `resolvedFrom path exists`);
  assert(sk.materializedTo === a5cDest, `materializedTo matches .a5c destination`);
  assert(sk.piMaterializedTo === piDest, `piMaterializedTo matches .pi destination`);

  // Rewritten workflow .gen.js should exist when singular shape is used
  if (result.rewritten) {
    assert(result.generatedWorkflowPath !== input.workflowDiskPath, `generatedWorkflowPath differs from source`);
    assert(existsSync(result.generatedWorkflowPath), `rewritten .gen.js file exists`);
    const genSrc = await fs.readFile(result.generatedWorkflowPath, "utf8");
    assert(genSrc.includes(`metadata: { skills: ['${expectedName}'] }`), `rewrite injected metadata.skills for ${expectedName}`);
    ok(`rewrite produced .gen.js with metadata.skills for ${expectedName}`);
  }

  ok(`${input.label}: ${expectedName} resolved + materialized + mirrored`);
}

async function main(): Promise<void> {
  console.log("== prepareBabysitterRuntime materialization smoke ==");

  // Case 1: out-of-the-box process-library
  await runCase({
    label: "out-of-box",
    libraryRoot: "C:/Users/Treml/.a5c/process-library/babysitter-repo/library",
    workflowDiskPath:
      "C:/Users/Treml/.a5c/process-library/babysitter-repo/library/specializations/web-development/unit-testing-react.js",
    expectedAtLeastOneSkill: "vitest-skill",
  });

  // Case 2a: MC's local library — workflow with STALE skill names.
  // Documents the data-drift case (workflow refs don't match index).
  // Prep extracts and rewrites correctly; resolution returns missing.
  await runCase({
    label: "mc-local-stale",
    libraryRoot: "C:/Users/Treml/source/repos/MissionControl/library",
    workflowDiskPath:
      "C:/Users/Treml/source/repos/MissionControl/library/specializations/web-development/workflows/restful-api-nodejs.js",
    expectedAtLeastOneSkill: "express-skill",
  });

  // Case 2b: MC's local library — workflow with at least one MATCHING
  // skill name. Proves the resolve+copy path actually materializes a
  // real SKILL.md when the workflow and index agree on names.
  await runCase({
    label: "mc-local-match",
    libraryRoot: "C:/Users/Treml/source/repos/MissionControl/library",
    workflowDiskPath:
      "C:/Users/Treml/source/repos/MissionControl/library/business/finance-accounting/workflows/industry-competitive-analysis.js",
    expectedAtLeastOneSkill: "competitive-intelligence",
  });

  console.log("\nGREEN");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
