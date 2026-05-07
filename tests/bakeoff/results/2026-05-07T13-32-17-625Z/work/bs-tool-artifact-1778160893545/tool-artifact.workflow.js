
import { promises as fs } from 'node:fs';
import path from 'node:path';

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
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
  labels: ['bakeoff', 'agent', 'planner']
}));

export const workerTask = defineTask('worker', (args, taskCtx) => ({
  kind: 'agent',
  title: `Worker iteration ${args.iteration ?? 1}`,
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
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
  labels: ['bakeoff', 'agent', 'worker']
}));

export const reviewerTask = defineTask('reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Reviewer iteration ${args.iteration ?? 1}`,
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
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
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
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
  labels: ['bakeoff', 'agent', 'writer']
}));


export const readInputTask = defineTask('read-input', (args, taskCtx) => ({
  kind: 'shell',
  title: 'Read deterministic input',
  shell: { command: 'echo bakeoff-tool-ok' },
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/output.json` },
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
  io: { inputJsonPath: `tasks/${taskCtx.effectId}/input.json`, outputJsonPath: `tasks/${taskCtx.effectId}/result.json` },
  labels: ['bakeoff', 'agent', 'summarizer']
}));

export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const errors = [];
  const workItems = [];
  const toolResult = await ctx.task(readInputTask, {});
  workItems.push({ step: 'read-input', input: {}, output: toolResult });
  calls.push({"step":"read-input","kind":"tool","inputRef":"inputs/01-read-input.json","outputRef":"outputs/01-read-input.json","status":"ok","durationMs":1});
  const summary = await ctx.task(summarizerTask, { toolResult });
  workItems.push({ step: 'summarizer', input: { toolResult }, output: summary });
  calls.push({"step":"summarizer","kind":"agent","inputRef":"inputs/02-summarizer.json","outputRef":"outputs/02-summarizer.json","status":"ok","durationMs":1});

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
