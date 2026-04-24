/**
 * Standalone smoke test for ProjectStore.
 *
 * Run from mc-v2-electron/:
 *   node --experimental-strip-types src/main/project-store.smoke.ts
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ProjectStore } from "./project-store.ts";

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-project-smoke-"));
  console.log(`[smoke] tmp=${tmp}`);

  const store = new ProjectStore(tmp);
  await store.init();

  // ── empty store ─────────────────────────────────────────────────────
  const empty = await store.listProjects();
  assert(empty.length === 0, `new store should be empty, got ${empty.length}`);

  // ── create ──────────────────────────────────────────────────────────
  const a = await store.createProject({
    id: "dogapp",
    name: "DogApp",
    prefix: "da", // lowercase input → should be normalized to "DA"
    path: "C:\\Users\\x\\source\\repos\\dogapp",
  });
  assert(a.prefix === "DA", `prefix should normalize to uppercase, got ${a.prefix}`);
  assert(existsSync(path.join(tmp, "dogapp", "project.json")), "project.json missing");
  console.log(`[smoke] created ${a.id} (prefix ${a.prefix})`);

  const b = await store.createProject({
    id: "d365-costing",
    name: "D365 Costing",
    prefix: "DX",
  });
  assert(b.prefix === "DX", `expected DX, got ${b.prefix}`);

  // ── list (sorted by name, case-insensitive) ─────────────────────────
  const listed = await store.listProjects();
  assert(listed.length === 2, `expected 2 projects, got ${listed.length}`);
  assert(listed[0]!.name === "D365 Costing", `expected D365 first alphabetically, got ${listed[0]!.name}`);
  console.log(`[smoke] list returned ${listed.length} projects (sorted)`);

  // ── getProject ──────────────────────────────────────────────────────
  const got = await store.getProject("dogapp");
  assert(got !== null && got.name === "DogApp", "getProject should find dogapp");
  const missing = await store.getProject("nope");
  assert(missing === null, "getProject returns null for missing id");
  console.log(`[smoke] getProject OK`);

  // ── uniqueness: duplicate id ────────────────────────────────────────
  await assertThrows(
    () => store.createProject({ id: "dogapp", name: "Another", prefix: "ZZ" }),
    /already exists/,
    "duplicate id",
  );

  // ── uniqueness: duplicate prefix ────────────────────────────────────
  await assertThrows(
    () => store.createProject({ id: "other", name: "Other", prefix: "da" }),
    /prefix "DA" already used/,
    "duplicate prefix (case-insensitive)",
  );
  console.log(`[smoke] uniqueness constraints enforced`);

  // ── invalid slug ────────────────────────────────────────────────────
  await assertThrows(
    () => store.createProject({ id: "Bad ID!", name: "x", prefix: "BX" }),
    /Invalid project id/,
    "invalid slug",
  );

  // ── invalid prefix ──────────────────────────────────────────────────
  await assertThrows(
    () => store.createProject({ id: "tool", name: "Tool", prefix: "way-too-long-prefix" }),
    /prefix/i,
    "prefix too long",
  );
  console.log(`[smoke] validation errors OK`);

  // ── update ──────────────────────────────────────────────────────────
  const updated = await store.updateProject("dogapp", {
    name: "DogApp (renamed)",
    icon: "🐕",
    notes: "added notes",
  });
  assert(updated.name === "DogApp (renamed)", "name updated");
  assert(updated.icon === "🐕", "icon updated");
  assert(updated.prefix === "DA", "prefix unchanged (immutable)");
  assert(updated.id === "dogapp", "id unchanged (immutable)");

  // Attempt to change prefix via patch — should be ignored at runtime.
  // Cast through `unknown` because the TS signature already forbids it.
  const sneakyPatch = { prefix: "ZZ" } as unknown as Parameters<typeof store.updateProject>[1];
  const sneaky = await store.updateProject("dogapp", sneakyPatch);
  assert(sneaky.prefix === "DA", "prefix still DA after sneaky patch");
  console.log(`[smoke] updateProject keeps id + prefix immutable`);

  // update on non-existent → throws
  await assertThrows(
    () => store.updateProject("nope", { name: "x" }),
    /not found/,
    "update missing project",
  );

  // ── delete ──────────────────────────────────────────────────────────
  await store.deleteProject("dogapp");
  assert((await store.getProject("dogapp")) === null, "dogapp deleted");
  assert((await store.listProjects()).length === 1, "one project remaining (d365-costing)");
  await assertThrows(
    () => store.deleteProject("nope"),
    /not found/,
    "delete missing project",
  );
  console.log(`[smoke] deleteProject OK`);

  // ── cleanup ─────────────────────────────────────────────────────────
  await fs.rm(tmp, { recursive: true, force: true });
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
