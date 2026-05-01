/**
 * Standalone smoke test for LibraryItemCreator.
 *
 *   node --experimental-strip-types src/main/library-item-creator.smoke.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { LibraryItemCreator } from "./library-item-creator.ts";

async function main(): Promise<void> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mc-library-item-"));
  await fs.writeFile(
    path.join(tmpRoot, "_index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary: { agents: 0, skills: 0, workflows: 0, examples: 0 }, items: [] }, null, 2),
  );

  const creator = new LibraryItemCreator(tmpRoot);
  const agent = await creator.create({
    kind: "agent",
    targetRoot: "business/knowledge-management",
    slug: "smoke-agent",
    name: "Smoke Agent",
    description: "Creates smoke-test agent files.",
    tags: ["smoke", "agent"],
    capabilities: ["Draft test artifacts"],
  });
  const agentText = await fs.readFile(agent.diskPath, "utf8");
  assert(agent.relPath === "business/knowledge-management/agents/smoke-agent/AGENT.md", "agent relPath follows convention");
  assert(agentText.includes("## Persona"), "agent includes persona section");
  assert(agentText.includes("Draft test artifacts"), "agent includes capabilities");

  const skill = await creator.create({
    kind: "skill",
    targetRoot: "business/knowledge-management",
    slug: "smoke-skill",
    name: "Smoke Skill",
    description: "Creates smoke-test skill files.",
    tags: ["smoke", "skill"],
    capabilities: ["Validate test artifacts"],
  });
  const skillText = await fs.readFile(skill.diskPath, "utf8");
  assert(skill.relPath === "business/knowledge-management/skills/smoke-skill/SKILL.md", "skill relPath follows convention");
  assert(skillText.includes("allowed-tools:"), "skill includes allowed-tools");
  assert(skillText.includes("## Failure Modes"), "skill includes failure modes");

  const index = JSON.parse(await fs.readFile(path.join(tmpRoot, "_index.json"), "utf8")) as {
    items: Array<{ kind: string; logicalPath: string }>;
  };
  assert(index.items.some((item) => item.kind === "agent" && item.logicalPath.endsWith("smoke-agent")), "index includes created agent");
  assert(index.items.some((item) => item.kind === "skill" && item.logicalPath.endsWith("smoke-skill")), "index includes created skill");

  let refusedOverwrite = false;
  try {
    await creator.create({
      kind: "agent",
      targetRoot: "business/knowledge-management",
      slug: "smoke-agent",
      name: "Smoke Agent",
      description: "Should not overwrite.",
    });
  } catch {
    refusedOverwrite = true;
  }
  assert(refusedOverwrite, "creator refuses to overwrite existing files");

  await fs.rm(tmpRoot, { recursive: true, force: true });
  console.log("library-item-creator smoke OK");
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
