/**
 * Standalone smoke test for LibraryWalker.
 *
 *   node --experimental-strip-types src/main/library-walker.smoke.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LibraryWalker } from "./library-walker.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "library");

async function main(): Promise<void> {
  const walker = new LibraryWalker(LIBRARY_ROOT);
  const index = await walker.buildIndex();

  assert(index.items.length > 0, "index has items");
  assert(index.summary.agents > 0, "has agent entries");
  assert(index.summary.skills > 0, "has skill entries");
  assert(index.summary.workflows > 0, "has workflow entries");

  const sampleWorkflow = index.items.find((item) => item.kind === "workflow");
  assert(!!sampleWorkflow, "at least one workflow found");
  assert(Array.isArray(sampleWorkflow.usesAgents), "workflow includes usesAgents");
  assert(typeof sampleWorkflow.estimatedSteps === "number", "workflow includes estimatedSteps");

  console.log(
    `[smoke] index counts: agents=${index.summary.agents}, ` +
      `skills=${index.summary.skills}, workflows=${index.summary.workflows}, ` +
      `examples=${index.summary.examples}`,
  );
  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("RED:", err);
  process.exit(1);
});
