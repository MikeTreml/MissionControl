/**
 * Standalone smoke test for ItemInfoStore + the walker's sidecar merge.
 *
 *   node --experimental-strip-types src/main/item-info-store.smoke.ts
 *
 * Builds a tiny library tree in /tmp, scaffolds an AGENT.md, a flat
 * workflow JS, and an example JSON, then exercises:
 *   - happy-path save creates the right sidecar with merged keys
 *   - subsequent walker run picks up the override
 *   - null patch removes a key
 *   - emptying the sidecar deletes the file
 *   - keys outside SIDECAR_OVERRIDE_FIELDS are silently dropped
 *   - a path-traversal attempt is refused
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ItemInfoStore } from "./item-info-store.ts";
import { LibraryWalker } from "./library-walker.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok -", msg);
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "iteminfo-"));

  // ── Scaffold a tiny library: one agent, one workflow, one example.
  const agentDir = path.join(root, "specializations", "demo", "agents", "smoke-agent");
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(
    path.join(agentDir, "AGENT.md"),
    "---\nname: smoke-agent\ndescription: Source-derived description.\n---\n# Smoke Agent\n",
  );

  const workflowDir = path.join(root, "specializations", "demo", "workflows");
  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(
    path.join(workflowDir, "smoke-workflow.js"),
    "/**\n * @process demo/smoke\n * @description Source-derived workflow description.\n */\n",
  );

  const exampleDir = path.join(root, "specializations", "demo", "examples");
  await fs.mkdir(exampleDir, { recursive: true });
  await fs.writeFile(
    path.join(exampleDir, "smoke-example.json"),
    JSON.stringify({ scenario: "demo" }, null, 2),
  );

  const store = new ItemInfoStore(root);
  const walker = new LibraryWalker(root);

  // ── 1. Save sidecar for the agent — overrides description + adds tags.
  const agentResult = await store.save({
    kind: "agent",
    diskPath: path.join(agentDir, "AGENT.md"),
    patch: { description: "Override description.", tags: ["custom", "smoke"] },
  });
  assert(agentResult.sidecarPath === path.join(agentDir, "INFO.json"), "agent sidecar at INFO.json in agent folder");
  const agentSidecar = JSON.parse(await fs.readFile(agentResult.sidecarPath, "utf8")) as Record<string, unknown>;
  assert(agentSidecar.description === "Override description.", "agent sidecar holds override description");
  assert(Array.isArray(agentSidecar.tags) && (agentSidecar.tags as string[])[0] === "custom", "agent sidecar holds tags");

  // ── 2. Walker rebuild picks up the override.
  let index = await walker.buildIndex();
  const agent = index.items.find((i) => i.kind === "agent");
  assert(agent !== undefined, "agent indexed");
  assert(agent!.description === "Override description.", "walker merged sidecar description over source frontmatter");
  assert(agent!.tags.includes("custom"), "walker merged sidecar tags");

  // ── 3. Workflow sidecar is <stem>.info.json sibling, NOT INFO.json.
  const wfResult = await store.save({
    kind: "workflow",
    diskPath: path.join(workflowDir, "smoke-workflow.js"),
    patch: { hasParallel: true, estimatedSteps: 7, containerKind: "specialization" },
  });
  assert(
    wfResult.sidecarPath === path.join(workflowDir, "smoke-workflow.info.json"),
    "workflow sidecar is <stem>.info.json sibling",
  );
  index = await walker.buildIndex();
  const wf = index.items.find((i) => i.kind === "workflow");
  assert(wf !== undefined, "workflow indexed");
  assert(wf!.hasParallel === true, "walker merged hasParallel from sidecar");
  assert(wf!.estimatedSteps === 7, "walker merged estimatedSteps from sidecar");
  assert(wf!.containerKind === "specialization", "walker merged containerKind from sidecar");

  // ── 4. Sidecar files are themselves NOT indexed as items.
  const sidecarsAsItems = index.items.filter((i) =>
    i.diskPath.endsWith("INFO.json") || i.diskPath.endsWith(".info.json"),
  );
  assert(sidecarsAsItems.length === 0, "sidecar files are not indexed as items");

  // ── 5. Null patch removes a single key (source value wins again).
  await store.save({
    kind: "agent",
    diskPath: path.join(agentDir, "AGENT.md"),
    patch: { description: null },
  });
  index = await walker.buildIndex();
  const agentAfterRemove = index.items.find((i) => i.kind === "agent");
  assert(
    agentAfterRemove!.description === "Source-derived description.",
    "null patch removed the override; source-derived value reinstated",
  );

  // ── 6. Removing the last key deletes the sidecar entirely.
  await store.save({
    kind: "agent",
    diskPath: path.join(agentDir, "AGENT.md"),
    patch: { tags: null },
  });
  let exists = true;
  try {
    await fs.access(path.join(agentDir, "INFO.json"));
  } catch {
    exists = false;
  }
  assert(!exists, "empty sidecar gets deleted from disk");

  // ── 7. Keys outside the allowlist are silently dropped.
  await store.save({
    kind: "workflow",
    diskPath: path.join(workflowDir, "smoke-workflow.js"),
    patch: { id: "haxxor", diskPath: "/etc/passwd", description: "kept" },
  });
  const wfSidecar = JSON.parse(
    await fs.readFile(path.join(workflowDir, "smoke-workflow.info.json"), "utf8"),
  ) as Record<string, unknown>;
  assert(!("id" in wfSidecar), "id is not allowed in sidecar");
  assert(!("diskPath" in wfSidecar), "diskPath is not allowed in sidecar");
  assert(wfSidecar.description === "kept", "allowed key was kept");

  // ── 8. Path traversal refused.
  let escaped = false;
  try {
    await store.save({
      kind: "workflow",
      diskPath: "/tmp/somewhere-completely-else/workflow.js",
      patch: { description: "shouldn't write" },
    });
  } catch {
    escaped = true;
  }
  assert(escaped, "save refuses to write outside the library root");

  await fs.rm(root, { recursive: true, force: true });
  console.log("\nitem-info-store smoke OK");
}

await main();
