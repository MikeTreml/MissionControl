/**
 * Standalone smoke test for AgentLoader — unified primary + subagents.
 *
 *   node --experimental-strip-types src/main/agent-loader.smoke.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AgentLoader } from "./agent-loader.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

async function main(): Promise<void> {
  // ── real agents (bundled) ──────────────────────────────────────────
  const real = new AgentLoader(path.join(REPO_ROOT, "agents"));
  const loaded = await real.loadAll();
  assert(loaded.length >= 6, `expected at least 6 agents, got ${loaded.length}`);

  // Primary agents (1-char code) sort first, alphabetically within.
  const primaries = loaded.filter((a) => a.code.length === 1);
  const subs = loaded.filter((a) => a.code.length > 1);
  assert(primaries.length >= 4, `expected at least 4 primary agents, got ${primaries.length}`);
  assert(subs.length >= 2, `expected at least 2 subagents, got ${subs.length}`);
  const slugs = loaded.map((a) => a.slug);
  const codes = loaded.map((a) => a.code);
  assert(
    slugs.includes("planner") && slugs.includes("developer") &&
    slugs.includes("reviewer") && slugs.includes("surgeon"),
    "primary role slugs present",
  );
  assert(
    slugs.includes("repomapper") && slugs.includes("docrefresher"),
    "subagent slugs present",
  );
  // Check title field populated.
  const planner = loaded.find((a) => a.slug === "planner");
  assert(planner?.title === "Planner", `planner.title expected "Planner", got ${planner?.title}`);
  console.log(`[smoke] real agents loaded: ${codes.join(", ")}`);

  // ── missing root → [] ───────────────────────────────────────────────
  const missing = await new AgentLoader("/tmp/mc-agents-no-exist").loadAll();
  assert(missing.length === 0, "missing root returns empty list");
  console.log(`[smoke] missing root returns empty list`);

  // ── folder/slug mismatch ────────────────────────────────────────────
  const mismatchTmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-agents-mismatch-"));
  await fs.mkdir(path.join(mismatchTmp, "foo"), { recursive: true });
  await fs.writeFile(
    path.join(mismatchTmp, "foo", "agent.json"),
    JSON.stringify({ slug: "bar", code: "x", name: "Bar" }),
  );
  await assertThrows(
    () => new AgentLoader(mismatchTmp).loadAll(),
    /folder "foo" but agent.json says slug "bar"/,
    "folder/slug mismatch",
  );
  await fs.rm(mismatchTmp, { recursive: true, force: true });

  // ── duplicate code ──────────────────────────────────────────────────
  const dupTmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-agents-dup-"));
  for (const slug of ["alpha", "bravo"]) {
    await fs.mkdir(path.join(dupTmp, slug), { recursive: true });
    await fs.writeFile(
      path.join(dupTmp, slug, "agent.json"),
      JSON.stringify({ slug, code: "xx", name: slug }),
    );
  }
  await assertThrows(
    () => new AgentLoader(dupTmp).loadAll(),
    /Duplicate agent code "xx"/,
    "duplicate code",
  );
  await fs.rm(dupTmp, { recursive: true, force: true });
  console.log(`[smoke] validation errors OK`);

  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
}
async function assertThrows(
  fn: () => Promise<unknown>,
  messagePattern: RegExp,
  label: string,
): Promise<void> {
  let threw = false;
  try { await fn(); }
  catch (err) {
    threw = true;
    const message = err instanceof Error ? err.message : String(err);
    assert(messagePattern.test(message), `${label}: expected ${messagePattern}, got: ${message}`);
  }
  assert(threw, `${label}: expected an error, got none`);
}

main().catch((err) => { console.error("RED:", err); process.exit(1); });
