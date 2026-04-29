import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const metaPath = path.join(repoRoot, "build-meta.json");

async function main() {
  const current = existsSync(metaPath)
    ? JSON.parse(await readFile(metaPath, "utf8"))
    : { buildNumber: 0 };

  const next = {
    ...current,
    buildNumber: Number(current.buildNumber ?? 0) + 1,
    builtAt: new Date().toISOString(),
  };

  await writeFile(metaPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`[build-meta] buildNumber=${next.buildNumber}`);
}

main().catch((err) => {
  console.error("[build-meta] failed to bump build number", err);
  process.exit(1);
});
