#!/usr/bin/env node
/**
 * Canary test for "did the skill actually reach the runtime?"
 *
 * Default mode is deterministic and model-free:
 *   npm run canary:skill
 *
 * It creates a temporary library/workspace, writes a salted SKILL.md and
 * workflow, calls prepareBabysitterRuntime, and asserts:
 *   - SKILL.md was copied into <workspace>/.a5c/skills/<name>/SKILL.md
 *   - the generated workflow uses metadata.skills
 *   - the generated workflow lives under .a5c/mc-generated/<runId>/
 *
 * Real mode spends a model run through Babysitter:
 *   npm run canary:skill -- --run
 *   npm run canary:skill -- --run --harness=internal
 *
 * It asks the model to report a marker and hidden answer that exist only in
 * SKILL.md, then scans stdout/stderr and run artifacts for those canaries.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareBabysitterRuntime } from "../src/main/babysitter-runtime-prep.ts";
import { buildBabysitterCliEnv } from "../src/main/babysitter-cli-env.ts";
import { INDEX_FILES, type LibraryIndexItem } from "../src/main/library-walker.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const SKILL_NAME = "mc-canary-skill";
const MARKER = "MC_CANARY_SKILL_7F3A";
const HIDDEN_ANSWER = "BLUE-RIVER-17";
const RUN_ID = "CANARY-001";

type Args = {
  run: boolean;
  keep: boolean;
  harness: string;
  model: string | null;
  timeoutMs: number;
};

function parseArgs(argv: string[]): Args {
  let run = false;
  let keep = false;
  let harness = "pi";
  let model: string | null = null;
  let timeoutMs = 5 * 60_000;
  for (const arg of argv) {
    if (arg === "--run") run = true;
    else if (arg === "--keep") keep = true;
    else if (arg.startsWith("--harness=")) harness = arg.slice("--harness=".length).trim() || "pi";
    else if (arg.startsWith("--model=")) model = arg.slice("--model=".length).trim() || null;
    else if (arg.startsWith("--timeout-ms=")) {
      const n = Number(arg.slice("--timeout-ms=".length));
      if (Number.isFinite(n) && n > 0) timeoutMs = Math.floor(n);
    }
  }
  return { run, keep, harness, model, timeoutMs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-canary-skill-"));
  const libraryRoot = path.join(tmp, "library");
  const workspaceCwd = path.join(tmp, "workspace");
  const runsDir = path.join(workspaceCwd, ".a5c", "runs");

  try {
    await fs.mkdir(libraryRoot, { recursive: true });
    await fs.mkdir(workspaceCwd, { recursive: true });

    const workflowPath = await writeCanaryLibrary(libraryRoot);
    const prep = await prepareBabysitterRuntime({
      workspaceCwd,
      libraryRoot,
      workflowDiskPath: workflowPath,
      runId: RUN_ID,
    });

    assert(prep.rewritten, "workflow was rewritten");
    assert(prep.generatedWorkflowPath.endsWith(path.join(".a5c", "mc-generated", RUN_ID, "canary.gen.js")), "generated path is run-scoped");
    assertEq(prep.missingSkills, [], "no missing skills");

    const materialized = path.join(workspaceCwd, ".a5c", "skills", SKILL_NAME, "SKILL.md");
    const skillText = await fs.readFile(materialized, "utf8");
    assert(skillText.includes(MARKER), "materialized SKILL.md contains marker");
    assert(skillText.includes(HIDDEN_ANSWER), "materialized SKILL.md contains hidden answer");

    const genText = await fs.readFile(prep.generatedWorkflowPath, "utf8");
    assert(genText.includes(`metadata: { skills: ['${SKILL_NAME}'] }`), "generated workflow uses metadata.skills");
    assert(!genText.includes(`skill: { name: '${SKILL_NAME}' }`), "legacy singular skill shape removed");

    console.log(`[canary] tmp=${tmp}`);
    console.log(`[canary] generated=${prep.generatedWorkflowPath}`);
    console.log(`[canary] materialized=${materialized}`);
    console.log("[canary] prep-only checks passed");

    if (args.run) {
      await runBabysitterCanary({
        generatedWorkflowPath: prep.generatedWorkflowPath,
        workspaceCwd,
        runsDir,
        harness: args.harness,
        model: args.model,
        timeoutMs: args.timeoutMs,
      });
    } else {
      console.log("[canary] real run skipped. Use: npm run canary:skill -- --run");
    }
  } finally {
    if (args.keep) {
      console.log(`[canary] kept tmp=${tmp}`);
    } else {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}

async function writeCanaryLibrary(libraryRoot: string): Promise<string> {
  const skillId = `core/canary/skills/${SKILL_NAME}/SKILL`;
  const skillDir = path.join(libraryRoot, "core", "canary", "skills", SKILL_NAME);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${SKILL_NAME}`,
      "description: Canary skill proving runtime prompt injection",
      "---",
      "",
      "# Canary Skill",
      "",
      "When this skill is active, the final answer must include these exact values:",
      "",
      `marker: ${MARKER}`,
      `hiddenAnswer: ${HIDDEN_ANSWER}`,
      "",
      "If the user asks for Project Codename Quartz, answer with hiddenAnswer.",
      "",
    ].join("\n"),
    "utf8",
  );

  const item: LibraryIndexItem = {
    kind: "skill",
    id: skillId,
    name: SKILL_NAME,
    diskPath: "intentionally-stale",
    logicalPath: `core/canary/skills/${SKILL_NAME}`,
    container: "canary",
    containerKind: "domain",
    domainGroup: "core",
    description: "Canary skill proving runtime prompt injection",
    role: null,
    expertise: [],
    languages: [],
    tags: [],
    originalSource: null,
    version: null,
    sizeBytes: 0,
    modifiedAt: new Date().toISOString(),
    descriptionMdPath: null,
    readmeMdPath: null,
    containerReadmePath: null,
  };
  await fs.writeFile(
    path.join(libraryRoot, INDEX_FILES.skill),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary: { agents: 0, skills: 1, workflows: 0, examples: 0 }, items: [item] }, null, 2),
    "utf8",
  );

  const workflowDir = path.join(libraryRoot, "core", "canary", "workflows");
  await fs.mkdir(workflowDir, { recursive: true });
  const workflowPath = path.join(workflowDir, "canary.js");
  await fs.writeFile(
    workflowPath,
    `
import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const result = await ctx.task(canaryTask, {
    question: 'What is the answer to Project Codename Quartz? Include the marker too.'
  });
  return { success: true, result };
}

export const canaryTask = defineTask('canary-skill-injection', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Canary skill injection',
  skill: { name: '${SKILL_NAME}' },
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Runtime canary test agent',
      task: args.question,
      instructions: [
        'Answer with one short line.',
        'Use any active skill instructions before answering.'
      ],
      outputFormat: 'Plain text'
    }
  },
  io: {
    inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`,
    outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\`
  }
}));
`,
    "utf8",
  );
  return workflowPath;
}

async function runBabysitterCanary(input: {
  generatedWorkflowPath: string;
  workspaceCwd: string;
  runsDir: string;
  harness: string;
  model: string | null;
  timeoutMs: number;
}): Promise<void> {
  await fs.mkdir(input.runsDir, { recursive: true });
  const cli = path.join(REPO_ROOT, "node_modules", "@a5c-ai", "babysitter-sdk", "dist", "cli", "main.js");
  const childArgs = [
    cli,
    "harness:create-run",
    "--process",
    input.generatedWorkflowPath,
    "--harness",
    input.harness,
    "--workspace",
    input.workspaceCwd,
    "--runs-dir",
    input.runsDir,
    "--max-iterations",
    "8",
    "--non-interactive",
    "--json",
  ];
  if (input.model) childArgs.push("--model", input.model);

  console.log(`[canary] starting real Babysitter run with harness=${input.harness}`);
  const cliEnv = await buildBabysitterCliEnv(input.workspaceCwd);
  const result = await spawnWithTimeout(process.execPath, childArgs, input.timeoutMs, input.workspaceCwd, cliEnv.env);
  const artifactText = await readTreeText(input.workspaceCwd);
  const combined = [result.stdout, result.stderr, artifactText].join("\n");

  if (!combined.includes(MARKER) || !combined.includes(HIDDEN_ANSWER)) {
    console.log("[canary] stdout:");
    console.log(result.stdout);
    console.log("[canary] stderr:");
    console.log(result.stderr);
    throw new Error(`real run did not surface both canaries (${MARKER}, ${HIDDEN_ANSWER})`);
  }

  console.log("[canary] real run surfaced marker and hidden answer");
}

function spawnWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`babysitter exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function readTreeText(root: string): Promise<string> {
  const chunks: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile() && /\.(json|jsonl|txt|md|log)$/i.test(entry.name)) {
        try {
          chunks.push(await fs.readFile(full, "utf8"));
        } catch {
          // Ignore binary or concurrently written files.
        }
      }
    }
  }
  await visit(root);
  return chunks.join("\n");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\nactual: ${a}\nexpected: ${e}`);
}

main().catch((err) => {
  console.error("[canary] failed:", err);
  process.exit(1);
});
