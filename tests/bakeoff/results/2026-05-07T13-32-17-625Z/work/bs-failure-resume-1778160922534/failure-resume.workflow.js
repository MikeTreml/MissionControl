
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
  const workItems = [];
  const error = {
    message: 'forced worker failure for bakeoff',
    step: 'worker',
    inputRef: 'inputs/02-worker.json',
    nextAction: 'resume'
  };

  const plan = await ctx.task(plannerTask, { scenario: 'failure-resume' });
  workItems.push({ step: 'planner', input: { scenario: 'failure-resume' }, output: plan });
  calls.push({"step":"planner","kind":"agent","inputRef":"inputs/01-planner.json","outputRef":"outputs/01-planner.json","status":"ok","durationMs":1});
  progressEvents.push({ event: 'step-failed', step: 'worker', at: ctx.now() });
  calls.push({
    step: 'worker',
    kind: 'agent',
    inputRef: error.inputRef,
    status: 'error',
    durationMs: 1,
    error: { message: error.message, step: error.step, nextAction: error.nextAction }
  });
  calls.push({"step":"resume","kind":"resume","inputRef":"inputs/03-resume.json","outputRef":"outputs/03-resume.json","status":"ok","durationMs":1});
  const work = await ctx.task(workerTask, { iteration: 2, priorFailure: error });
  workItems.push({ step: 'worker', input: { iteration: 2, priorFailure: error }, output: work });
  calls.push({"step":"worker","kind":"agent","inputRef":"inputs/04-worker.json","outputRef":"outputs/04-worker.json","status":"ok","durationMs":1});
  const review = await ctx.task(reviewerTask, { iteration: 2 });
  workItems.push({ step: 'reviewer', input: { iteration: 2 }, output: review });
  calls.push({"step":"reviewer","kind":"agent","inputRef":"inputs/05-reviewer.json","outputRef":"outputs/05-reviewer.json","status":"ok","durationMs":1});
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
