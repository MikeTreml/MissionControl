#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LibraryWalker, writeIndexFiles, INDEX_FILES } from "../src/main/library-walker.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "library");

async function main(): Promise<void> {
  const walker = new LibraryWalker(LIBRARY_ROOT);
  const index = await walker.buildIndex();
  await writeIndexFiles(LIBRARY_ROOT, index);
  console.log(
    `[library-index] wrote 4 per-kind files at ${LIBRARY_ROOT} ` +
      `(${index.items.length} items: ${index.summary.agents} agents, ` +
      `${index.summary.skills} skills, ${index.summary.workflows} workflows, ` +
      `${index.summary.examples} examples) → ${Object.values(INDEX_FILES).join(", ")}`,
  );
}

main().catch((err) => {
  console.error("[library-index] failed:", err);
  process.exit(1);
});
