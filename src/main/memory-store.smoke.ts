/**
 * Standalone smoke test for MemoryStore.
 *
 *   node --experimental-strip-types src/main/memory-store.smoke.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { MemoryStore } from "./memory-store.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok -", msg);
}

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "memstore-"));
  const store = new MemoryStore(tmp);

  // Read missing → null.
  const missing = await store.read("algodelta");
  assert(missing === null, "read of missing project returns null");

  // Write creates dirs + file.
  await store.write("algodelta", "Initial memory.\n");
  const after = await store.read("algodelta");
  assert(after === "Initial memory.\n", "round-trip write/read");

  const expected = path.join(tmp, "algodelta", "MEMORY.md");
  const stat = await fs.stat(expected);
  assert(stat.isFile(), "MEMORY.md created at the expected path");

  // Overwrite preserves content (no append semantics).
  await store.write("algodelta", "Replaced.\n");
  const replaced = await store.read("algodelta");
  assert(replaced === "Replaced.\n", "write replaces previous content");

  // Slug validation rejects path traversal + bad chars.
  for (const bad of ["../etc", "AlgoDelta", "with space", "..", ""]) {
    let threw = false;
    try {
      store.fileFor(bad);
    } catch {
      threw = true;
    }
    assert(threw, `slug "${bad}" rejected`);
  }
  // Read also rejects via fileFor.
  let readThrew = false;
  try {
    await store.read("../etc");
  } catch {
    readThrew = true;
  }
  assert(readThrew, "read with bad slug throws");

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("\nmemory-store smoke OK");
}

await main();
