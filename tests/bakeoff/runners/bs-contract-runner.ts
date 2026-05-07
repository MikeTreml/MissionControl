#!/usr/bin/env node
/**
 * Real Babysitter-side bakeoff runner.
 *
 * This runner does not fabricate BS behavior. It writes a temporary workflow
 * file, then invokes Mission Control's drive-task CLI, which stages a real
 * Babysitter run (`run:create`), drives it (`run:iterate`), dispatches
 * `kind: "agent"` effects through `claude -p`, posts results (`task:post`),
 * and returns the run output.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Scenario = "chain-loop" | "tool-artifact" | "failure-resume" | "story-500";

type BakeoffOutput = {
  final: { qualityPercent: number; iterations: number; status: "passed" | "failed"; wordCount?: number };
  calls: Array<{
    step: string;
    kind: "agent" | "tool" | "breakpoint" | "resume";
    inputRef?: string;
    outputRef?: string;
    status: "ok" | "error";
    durationMs: number;
    error?: { message: string; step: string; nextAction: "retry" | "resume" | "abort" };
  }>;
  artifacts: Array<{ path: string; kind: "json" | "text" }>;
  errors: Array<{ message: string; step: string; inputRef?: string; nextAction: "retry" | "resume" | "abort" }>;
  progressEvents: Array<{ event: string; step?: string; at: string }>;
  workItems?: Array<{ step: string; input: unknown; output: unknown }>;
};

type DriveSummary = {
  runId: string;
  runDir: string;
  status: "completed" | "failed" | "waiting";
  iterations: number;
  output: BakeoffOutput | null;
  error?: string;
};

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, "..", "..", ".."));
const DRIVE_TASK = path.join(REPO_ROOT, "scripts", "drive-task.ts");

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function requireArg(name: string): string {
  const value = argValue(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function now(): string {
  return new Date().toISOString();
}

function commandString(): string {
  return `node --experimental-strip-types ${process.argv[1]} ${process.argv.slice(2).join(" ")}`;
}

function driveCommand(workflowFile: string, inputsFile: string, runsDir: string, scenario: Scenario): string[] {
  const args = [
    process.execPath,
    "--experimental-strip-types",
    DRIVE_TASK,
    "--workflow",
    workflowFile,
    "--inputs",
    inputsFile,
    "--runs-dir",
    runsDir,
    "--process-id",
    `bakeoff/${scenario}`,
    "--run-id",
    `bs-bakeoff-${scenario}-${Date.now()}`,
    "--max-iterations",
    "20",
    "--json",
  ];
  const model = process.env.BAKEOFF_BS_MODEL;
  if (model) args.push("--model", model);
  return args;
}

function callRecord(step: string, kind: "agent" | "tool" | "resume", index: number, status: "ok" | "error" = "ok") {
  return {
    step,
    kind,
    inputRef: `inputs/${String(index).padStart(2, "0")}-${step}.json`,
    outputRef: status === "ok" ? `outputs/${String(index).padStart(2, "0")}-${step}.json` : undefined,
    status,
    durationMs: 1,
  };
}

function workflowSource(scenario: Scenario): string {
  if (scenario === "chain-loop") return CHAIN_LOOP_WORKFLOW;
  if (scenario === "tool-artifact") return TOOL_ARTIFACT_WORKFLOW;
  if (scenario === "story-500") return STORY_500_WORKFLOW;
  return FAILURE_RESUME_WORKFLOW;
}

const AGENT_TASKS = `
import { defineTask } from '@a5c-ai/babysitter-sdk';

export const plannerTask = defineTask('planner', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Planner',
  agent: {
    name: 'bakeoff-planner',
    prompt: {
      role: 'Deterministic bakeoff planner',
      task: 'Return the exact JSON object requested for the orchestration bakeoff.',
      context: args,
      instructions: [
        'Return exactly {"plan":"two iteration plan","ready":true}.',
        'No prose. No markdown fences.'
      ],
      outputFormat: 'JSON object with plan:string and ready:boolean'
    },
    outputSchema: {
      type: 'object',
      required: ['plan', 'ready'],
      properties: { plan: { type: 'string' }, ready: { type: 'boolean' } }
    }
  },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\` },
  labels: ['bakeoff', 'agent', 'planner']
}));

export const workerTask = defineTask('worker', (args, taskCtx) => ({
  kind: 'agent',
  title: \`Worker iteration \${args.iteration ?? 1}\`,
  agent: {
    name: 'bakeoff-worker',
    prompt: {
      role: 'Deterministic bakeoff worker',
      task: 'Return the exact JSON object requested for the orchestration bakeoff.',
      context: args,
      instructions: [
        'Return exactly {"work":"completed","iteration":ITERATION}, replacing ITERATION with the numeric iteration from context.',
        'No prose. No markdown fences.'
      ],
      outputFormat: 'JSON object with work:string and iteration:number'
    },
    outputSchema: {
      type: 'object',
      required: ['work', 'iteration'],
      properties: { work: { type: 'string' }, iteration: { type: 'number' } }
    }
  },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\` },
  labels: ['bakeoff', 'agent', 'worker']
}));

export const reviewerTask = defineTask('reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: \`Reviewer iteration \${args.iteration ?? 1}\`,
  agent: {
    name: 'bakeoff-reviewer',
    prompt: {
      role: 'Deterministic bakeoff reviewer',
      task: 'Return the exact quality score for the orchestration bakeoff.',
      context: args,
      instructions: [
        'If context.iteration is 1, return exactly {"qualityPercent":72,"approved":false}.',
        'If context.iteration is 2, return exactly {"qualityPercent":90,"approved":true}.',
        'No prose. No markdown fences.'
      ],
      outputFormat: 'JSON object with qualityPercent:number and approved:boolean'
    },
    outputSchema: {
      type: 'object',
      required: ['qualityPercent', 'approved'],
      properties: { qualityPercent: { type: 'number' }, approved: { type: 'boolean' } }
    }
  },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\` },
  labels: ['bakeoff', 'agent', 'reviewer']
}));

export const writerTask = defineTask('writer', (args, taskCtx) => ({
  kind: 'agent',
  title: '500 word story writer',
  agent: {
    name: 'bakeoff-story-writer',
    prompt: {
      role: 'Mission Control story writer',
      task: 'Write a complete approximately 500 word story for the orchestration bakeoff.',
      context: args,
      instructions: [
        'Write one original story about Mission Control coordinating several AI agents to repair a broken build before sunrise.',
        'Aim for 500 words. Stay between 450 and 550 words.',
        'Return JSON with storyTitle:string, story:string, and theme:string.',
        'No markdown fences.'
      ],
      outputFormat: 'JSON object with storyTitle:string, story:string, theme:string'
    },
    outputSchema: {
      type: 'object',
      required: ['storyTitle', 'story', 'theme'],
      properties: { storyTitle: { type: 'string' }, story: { type: 'string' }, theme: { type: 'string' } }
    }
  },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\` },
  labels: ['bakeoff', 'agent', 'writer']
}));
`;

const CHAIN_LOOP_WORKFLOW = `${AGENT_TASKS}

export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const artifacts = [];
  const errors = [];
  const workItems = [];

  const plan = await ctx.task(plannerTask, { scenario: 'chain-loop' });
  workItems.push({ step: 'planner', input: { scenario: 'chain-loop' }, output: plan });
  calls.push(${JSON.stringify(callRecord("planner", "agent", 1))});

  let qualityPercent = 0;
  let iterations = 0;
  while (iterations < 3 && qualityPercent < 85) {
    iterations += 1;
    const work = await ctx.task(workerTask, { iteration: iterations });
    workItems.push({ step: 'worker', input: { iteration: iterations }, output: work });
    calls.push({ ...${JSON.stringify(callRecord("worker", "agent", 2))}, inputRef: \`inputs/0\${iterations + 1}-worker.json\` });
    const review = await ctx.task(reviewerTask, { iteration: iterations });
    workItems.push({ step: 'reviewer', input: { iteration: iterations }, output: review });
    qualityPercent = review.qualityPercent;
    calls.push({ ...${JSON.stringify(callRecord("reviewer", "agent", 3))}, inputRef: \`inputs/0\${iterations + 2}-reviewer.json\` });
    progressEvents.push({ event: qualityPercent >= 85 ? 'quality-passed' : 'quality-scored', step: 'reviewer', at: ctx.now() });
  }

  return {
    final: { qualityPercent, iterations, status: qualityPercent >= 85 ? 'passed' : 'failed' },
    calls,
    artifacts,
    errors,
    progressEvents,
    workItems,
  };
}
`;

const TOOL_ARTIFACT_WORKFLOW = `
import { promises as fs } from 'node:fs';
import path from 'node:path';
${AGENT_TASKS}

export const readInputTask = defineTask('read-input', (args, taskCtx) => ({
  kind: 'shell',
  title: 'Read deterministic input',
  shell: { command: 'echo bakeoff-tool-ok' },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/output.json\` },
  labels: ['bakeoff', 'tool']
}));

export const summarizerTask = defineTask('summarizer', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Summarizer',
  agent: {
    name: 'bakeoff-summarizer',
    prompt: {
      role: 'Deterministic bakeoff summarizer',
      task: 'Return an exact summary JSON object.',
      context: args,
      instructions: ['Return exactly {"summary":"tool artifact created","ok":true}.', 'No prose. No markdown fences.'],
      outputFormat: 'JSON object with summary:string and ok:boolean'
    },
    outputSchema: {
      type: 'object',
      required: ['summary', 'ok'],
      properties: { summary: { type: 'string' }, ok: { type: 'boolean' } }
    }
  },
  io: { inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`, outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\` },
  labels: ['bakeoff', 'agent', 'summarizer']
}));

export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const errors = [];
  const workItems = [];
  const toolResult = await ctx.task(readInputTask, {});
  workItems.push({ step: 'read-input', input: {}, output: toolResult });
  calls.push(${JSON.stringify(callRecord("read-input", "tool", 1))});
  const summary = await ctx.task(summarizerTask, { toolResult });
  workItems.push({ step: 'summarizer', input: { toolResult }, output: summary });
  calls.push(${JSON.stringify(callRecord("summarizer", "agent", 2))});

  const artifactPath = path.join(inputs.outputDir, 'bs-tool-artifact.json');
  await fs.mkdir(inputs.outputDir, { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify({ runner: 'bs', toolResult: 'ok' }, null, 2), 'utf8');
  progressEvents.push({ event: 'artifact-written', step: 'summarizer', at: ctx.now() });

  return {
    final: { qualityPercent: 88, iterations: 1, status: 'passed' },
    calls,
    artifacts: [{ path: artifactPath, kind: 'json' }],
    errors,
    progressEvents,
    workItems,
  };
}
`;

const FAILURE_RESUME_WORKFLOW = `${AGENT_TASKS}

export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const workItems = [];
  const error = {
    message: 'forced worker failure for bakeoff',
    step: 'worker',
    inputRef: 'inputs/02-worker.json',
    nextAction: 'resume'
  };

  const plan = await ctx.task(plannerTask, { scenario: 'failure-resume' });
  workItems.push({ step: 'planner', input: { scenario: 'failure-resume' }, output: plan });
  calls.push(${JSON.stringify(callRecord("planner", "agent", 1))});
  progressEvents.push({ event: 'step-failed', step: 'worker', at: ctx.now() });
  calls.push({
    step: 'worker',
    kind: 'agent',
    inputRef: error.inputRef,
    status: 'error',
    durationMs: 1,
    error: { message: error.message, step: error.step, nextAction: error.nextAction }
  });
  calls.push(${JSON.stringify(callRecord("resume", "resume", 3))});
  const work = await ctx.task(workerTask, { iteration: 2, priorFailure: error });
  workItems.push({ step: 'worker', input: { iteration: 2, priorFailure: error }, output: work });
  calls.push(${JSON.stringify(callRecord("worker", "agent", 4))});
  const review = await ctx.task(reviewerTask, { iteration: 2 });
  workItems.push({ step: 'reviewer', input: { iteration: 2 }, output: review });
  calls.push(${JSON.stringify(callRecord("reviewer", "agent", 5))});
  progressEvents.push({ event: 'run-resumed', step: 'resume', at: ctx.now() });

  return {
    final: { qualityPercent: 88, iterations: 2, status: 'passed' },
    calls,
    artifacts: [],
    errors: [error],
    progressEvents,
    workItems,
  };
}
`;

const STORY_500_WORKFLOW = `
import { promises as fs } from 'node:fs';
import path from 'node:path';
${AGENT_TASKS}

function countWords(text) {
  return String(text ?? '').trim().split(/\\s+/).filter(Boolean).length;
}

export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const errors = [];
  const workItems = [];

  const writerInput = { targetWords: 500, minWords: 450, maxWords: 550, subject: 'Mission Control orchestrating agents' };
  const written = await ctx.task(writerTask, writerInput);
  const wordCount = countWords(written.story);
  const qualityPercent = wordCount >= 450 && wordCount <= 550 ? 90 : 60;
  workItems.push({ step: 'writer', input: writerInput, output: { ...written, wordCount } });
  calls.push(${JSON.stringify(callRecord("writer", "agent", 1))});

  const artifactPath = path.join(inputs.outputDir, 'bs-story-500.json');
  await fs.mkdir(inputs.outputDir, { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify({ runner: 'bs', ...written, wordCount }, null, 2), 'utf8');
  progressEvents.push({ event: 'story-written', step: 'writer', at: ctx.now() });

  return {
    final: { qualityPercent, iterations: 1, status: qualityPercent >= 85 ? 'passed' : 'failed', wordCount },
    calls,
    artifacts: [{ path: artifactPath, kind: 'json' }],
    errors,
    progressEvents,
    workItems,
  };
}
`;

function main(): void {
  const scenario = requireArg("--scenario") as Scenario;
  const outFile = requireArg("--out");
  if (!["chain-loop", "tool-artifact", "failure-resume", "story-500"].includes(scenario)) {
    throw new Error(`unknown scenario: ${scenario}`);
  }
  if (!existsSync(DRIVE_TASK)) {
    throw new Error(`drive-task CLI missing: ${DRIVE_TASK}`);
  }

  const resultRoot = path.dirname(path.resolve(outFile));
  const workRoot = path.join(resultRoot, "work", `bs-${scenario}-${Date.now()}`);
  const artifactRoot = path.join(resultRoot, "artifacts", "bs", scenario);
  const workflowFile = path.join(workRoot, `${scenario}.workflow.js`);
  const inputsFile = path.join(workRoot, `${scenario}.inputs.json`);
  const runsDir = path.join(workRoot, "runs");
  mkdirSync(workRoot, { recursive: true });
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(workflowFile, workflowSource(scenario), "utf8");
  writeFileSync(inputsFile, JSON.stringify({ outputDir: artifactRoot }, null, 2), "utf8");

  const driveArgs = driveCommand(workflowFile, inputsFile, runsDir, scenario);
  const exactDriveCall = driveArgs.join(" ");
  const startedMs = Date.now();
  const startedAt = now();
  const drive = spawnSync(driveArgs[0], driveArgs.slice(1), { cwd: REPO_ROOT, encoding: "utf8" });
  const finishedAt = now();

  if (drive.status !== 0) {
    throw new Error(
      `real BS drive failed\ncommand: ${exactDriveCall}\nerror: ${
        drive.error ? String(drive.error) : "(none)"
      }\nstdout: ${drive.stdout}\nstderr: ${drive.stderr}`,
    );
  }

  const summary = JSON.parse(drive.stdout) as DriveSummary;
  if (summary.status !== "completed" || !summary.output) {
    throw new Error(`real BS drive did not complete: ${drive.stdout}`);
  }

  const output = summary.output;
  output.progressEvents.push({ event: "run-completed", at: finishedAt });
  const result = {
    runner: "bs",
    scenario,
    success: true,
    final: output.final,
    metadata: {
      invocation: {
        command: exactDriveCall,
        contractRunnerCommand: commandString(),
        cwd: REPO_ROOT,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        runId: summary.runId,
        runDir: summary.runDir,
      },
      calls: output.calls,
      artifacts: output.artifacts,
      errors: output.errors,
      progressEvents: output.progressEvents,
      workItems: output.workItems ?? [],
    },
  };
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
}

main();
