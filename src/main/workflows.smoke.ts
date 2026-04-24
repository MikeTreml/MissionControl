/**
 * Standalone smoke test for WorkflowLoader.
 *
 * Run from mc-v2-electron/:
 *   node --experimental-strip-types src/main/workflows.smoke.ts
 *
 * Covers the happy path (the two starter workflows shipped in ../../workflows)
 * plus error cases on a freshly-built tmp directory.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WorkflowLoader } from "./workflows.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

async function main(): Promise<void> {
  // ── happy path: load real workflows shipped in /workflows ───────────
  const realLoader = new WorkflowLoader(path.join(REPO_ROOT, "workflows"));
  const loaded = await realLoader.loadAll();
  assert(loaded.length === 2, `expected 2 workflows, got ${loaded.length}`);
  assert(loaded[0]!.code === "F", `expected F first (alphabetical), got ${loaded[0]!.code}`);
  assert(loaded[0]!.name === "Feature", `expected name "Feature"`);
  assert(loaded[1]!.code === "X", `expected X second, got ${loaded[1]!.code}`);
  console.log(`[smoke] real workflows load: ${loaded.map((w) => w.code).join(", ")}`);

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
