import assert from 'node:assert/strict';

import { requireConfidence } from '../library/core/workflow-guards/confidence-gate.js';
import { requireTests } from '../library/core/workflow-guards/test-gate.js';
import { autoFix } from '../library/core/workflow-guards/auto-fix.js';
import { retryTask } from '../library/core/workflow-guards/retry-strategy.js';
import { createNextTaskEvent, shouldCreateNextTask } from '../library/core/workflow-guards/task-chain.js';

async function main() {
  let breakpointCalled = false;
  const logs: string[] = [];

  const ctx = {
    runId: 'smoke-run',
    breakpoint: async () => {
      breakpointCalled = true;
      return { approved: true };
    },
    log: (_level: string, message: string) => logs.push(message),
    task: async (_taskRef: unknown, args?: unknown) => ({
      status: 'ok',
      fixed: true,
      args,
    }),
  };

  const confidence = await requireConfidence(ctx, { confidence: 98 });
  assert.equal(confidence.approved, true);
  assert.equal(breakpointCalled, false);

  const lowConfidence = await requireConfidence(ctx, { confidence: 40 });
  assert.equal(lowConfidence.approved, true);
  assert.equal(breakpointCalled, true);

  const tests = await requireTests(ctx, { failedTests: 2 });
  assert.equal(tests.approved, true);
  assert.equal(tests.reasons.length, 2);

  const fixed = await autoFix(ctx, { status: 'failed' }, 'fixTask');
  assert.equal(fixed.fixed, true);

  const retry = await retryTask(ctx, 'retryTask', {}, { maxAttempts: 2 });
  assert.equal(retry.ok, true);

  assert.equal(shouldCreateNextTask({ commit: 'abc123' }), true);
  const chain = await createNextTaskEvent(ctx, { commitSha: 'abc123' });
  assert.equal(chain.created, true);

  console.log('workflow guard smoke tests passed');
}

void main();
