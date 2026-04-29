/**
 * Standalone smoke test for WorkflowLoader.
 *
 * Run from mc-v2-electron/:
 *   node --experimental-strip-types src/main/workflows.smoke.ts
 *
 * Covers the happy path (the bundled workflows shipped in ../../workflows)
 * plus error cases on a freshly-built tmp directory.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WorkflowLoader } from "./workflows.ts";
import { mergeRunSettings, WorkflowSchema } from "../shared/models.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

async function main(): Promise<void> {
  // ── happy path: load real workflows shipped in /workflows ───────────
  const realLoader = new WorkflowLoader(path.join(REPO_ROOT, "workflows"));
  const loaded = await realLoader.loadAll();
  const codes = loaded.map((w) => w.code);
  assert(loaded.length >= 2, `expected at least 2 workflows, got ${loaded.length}`);
  assert(codes.includes("F"), `expected bundled workflows to include F, got ${codes.join(",")}`);
  assert(codes.includes("X"), `expected bundled workflows to include X, got ${codes.join(",")}`);
  assert(codes.join(",") === [...codes].sort().join(","), `expected workflows sorted alphabetically, got ${codes.join(",")}`);
  assert(loaded.find((w) => w.code === "F")!.name === "Feature", `expected workflow F to be named Feature`);
  assert(loaded.find((w) => w.code === "F")!.steps.length > 0, `expected workflow F to have steps`);
  const merged = mergeRunSettings(loaded.find((w) => w.code === "F")!, {
    babysitter: { targetQuality: 90 },
  });
  assert(merged.babysitter.targetQuality === 90, `expected merged targetQuality 90, got ${merged.babysitter.targetQuality}`);
  assert(merged.babysitter.mode === "sequential", `expected default mode preserved`);
  console.log(`[smoke] real workflows load: ${codes.join(", ")}`);

  // ── missing root → returns [] instead of throwing ───────────────────
  const missing = await new WorkflowLoader("/tmp/does-not-exist-mc").loadAll();
  assert(missing.length === 0, `missing root should return []`);
  console.log(`[smoke] missing root returns empty list`);

  // ── folder/code mismatch → throws ───────────────────────────────────
  const mismatchTmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-wf-mismatch-"));
  await fs.mkdir(path.join(mismatchTmp, "F-feature"), { recursive: true });
  await fs.writeFile(
    path.join(mismatchTmp, "F-feature", "workflow.json"),
    JSON.stringify({ code: "B", name: "Bug" }),
  );
  await assertThrows(
    () => new WorkflowLoader(mismatchTmp).loadAll(),
    /code "F" but workflow.json declares "B"/,
    "folder/code mismatch should throw",
  );
  await fs.rm(mismatchTmp, { recursive: true, force: true });
  console.log(`[smoke] folder/code mismatch throws`);

  // ── duplicate code → throws ─────────────────────────────────────────
  const dupTmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-wf-dup-"));
  for (const folder of ["F-feature", "F-fast-feature"]) {
    await fs.mkdir(path.join(dupTmp, folder), { recursive: true });
    await fs.writeFile(
      path.join(dupTmp, folder, "workflow.json"),
      JSON.stringify({ code: "F", name: folder }),
    );
  }
  await assertThrows(
    () => new WorkflowLoader(dupTmp).loadAll(),
    /Duplicate workflow code "F"/,
    "duplicate code should throw",
  );
  await fs.rm(dupTmp, { recursive: true, force: true });
  console.log(`[smoke] duplicate code throws`);

  // ── invalid babysitter mode → schema rejects ───────────────────────
  const invalidTmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-wf-invalid-"));
  await fs.mkdir(path.join(invalidTmp, "F-feature"), { recursive: true });
  await fs.writeFile(
    path.join(invalidTmp, "F-feature", "workflow.json"),
    JSON.stringify({ code: "F", name: "Feature", babysitter: { mode: "foo" } }),
  );
  await assertThrows(
    () => new WorkflowLoader(invalidTmp).loadAll(),
    /Invalid enum value|mode/,
    "invalid babysitter mode should throw",
  );
  await fs.rm(invalidTmp, { recursive: true, force: true });
  console.log(`[smoke] invalid babysitter mode throws`);

  // ── schema defaults on minimal workflow ─────────────────────────────
  const minimal = WorkflowSchema.parse({ code: "B", name: "Bug" });
  assert(minimal.steps.length === 0, `expected default empty steps`);
  assert(minimal.babysitter.targetQuality === 80, `expected default targetQuality 80`);
  assert(minimal.campaign.iteratesItems === false, `expected campaign default false`);
  console.log(`[smoke] workflow schema defaults apply`);

  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function assertThrows(
  fn: () => Promise<unknown>,
  messagePattern: RegExp,
  label: string,
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    const message = err instanceof Error ? err.message : String(err);
    assert(
      messagePattern.test(message),
      `${label}: expected error matching ${messagePattern}, got: ${message}`,
    );
  }
  assert(threw, `${label}: expected an error, got none`);
}

main().catch((err) => {
  console.error("RED:", err);
  process.exit(1);
});
