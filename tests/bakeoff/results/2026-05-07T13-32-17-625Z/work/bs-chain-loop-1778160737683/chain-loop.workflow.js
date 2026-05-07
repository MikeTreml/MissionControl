
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


export async function process(inputs, ctx) {
  const progressEvents = [{ event: 'run-started', at: ctx.now() }];
  const calls = [];
  const artifacts = [];
  const errors = [];
  const workItems = [];

  const plan = await ctx.task(plannerTask, { scenario: 'chain-loop' });
  workItems.push({ step: 'planner', input: { scenario: 'chain-loop' }, output: plan });
  calls.push({"step":"planner","kind":"agent","inputRef":"inputs/01-planner.json","outputRef":"outputs/01-planner.json","status":"ok","durationMs":1});

  let qualityPercent = 0;
  let iterations = 0;
  while (iterations < 3 && qualityPercent < 85) {
    iterations += 1;
    const work = await ctx.task(workerTask, { iteration: iterations });
    workItems.push({ step: 'worker', input: { iteration: iterations }, output: work });
    calls.push({ ...{"step":"worker","kind":"agent","inputRef":"inputs/02-worker.json","outputRef":"outputs/02-worker.json","status":"ok","durationMs":1}, inputRef: `inputs/0${iterations + 1}-worker.json` });
    const review = await ctx.task(reviewerTask, { iteration: iterations });
    workItems.push({ step: 'reviewer', input: { iteration: iterations }, output: review });
    qualityPercent = review.qualityPercent;
    calls.push({ ...{"step":"reviewer","kind":"agent","inputRef":"inputs/03-reviewer.json","outputRef":"outputs/03-reviewer.json","status":"ok","durationMs":1}, inputRef: `inputs/0${iterations + 2}-reviewer.json` });
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
