#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LibraryWalker } from "../src/main/library-walker.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "library");
const OUT_PATH = path.join(LIBRARY_ROOT, "_index.json");

async function main(): Promise<void> {
  const walker = new LibraryWalker(LIBRARY_ROOT);
  const index = await walker.buildIndex();
  await fs.writeFile(OUT_PATH, JSON.stringify(index, null, 2));
  console.log(
    `[library-index] wrote ${OUT_PATH} (${index.items.length} items: ` +
      `${index.summary.agents} agents, ${index.summary.skills} skills, ` +
      `${index.summary.workflows} workflows, ${index.summary.examples} examples)`,
  );
}

main().catch((err) => {
  console.error("[library-index] failed:", err);
  process.exit(1);
});
