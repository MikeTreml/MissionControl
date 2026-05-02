/**
 * Test gate helper for Babysitter workflows.
 *
 * Use this after planning, implementation, or validation tasks when the workflow
 * should not continue unless test cases exist and/or test results pass.
 *
 * MissionControl remains the UI. This helper uses ctx.breakpoint so MC can
 * surface the pending decision and answer through Babysitter task:post.
 */

export const DEFAULT_TEST_GATE_OPTIONS = {
  requireTestCases: true,
  requireTestRun: false,
  requirePassingTests: true,
  throwOnReject: true,
};

export function getTestSummary(result) {
  if (!result || typeof result !== 'object') {
    return {
      hasTestCases: false,
      hasTestRun: false,
      passed: null,
      failedCount: null,
      testCount: null,
    };
  }

  const testCases = Array.isArray(result.testCases)
    ? result.testCases
    : Array.isArray(result.tests)
      ? result.tests
      : [];

  const testResults = result.testResults && typeof result.testResults === 'object'
    ? result.testResults
    : result.test_result && typeof result.test_result === 'object'
      ? result.test_result
      : null;

  const passed = typeof result.testsPassed === 'boolean'
    ? result.testsPassed
    : typeof result.passed === 'boolean'
      ? result.passed
      : typeof testResults?.passed === 'boolean'
        ? testResults.passed
        : null;

  const failedCount = typeof result.failedTests === 'number'
    ? result.failedTests
    : typeof testResults?.failed === 'number'
      ? testResults.failed
      : null;

  const testCount = testCases.length > 0
    ? testCases.length
    : typeof result.testCount === 'number'
      ? result.testCount
      : typeof testResults?.total === 'number'
        ? testResults.total
        : null;

  return {
    hasTestCases: testCases.length > 0 || (typeof testCount === 'number' && testCount > 0),
    hasTestRun: passed !== null || failedCount !== null || testResults !== null,
    passed,
    failedCount,
    testCount,
  };
}

export async function requireTests(ctx, result, options = {}) {
  const config = {
    ...DEFAULT_TEST_GATE_OPTIONS,
    ...options,
  };

  const summary = getTestSummary(result);
  const reasons = [];

  if (config.requireTestCases && !summary.hasTestCases) {
    reasons.push('No test cases were found.');
  }

  if (config.requireTestRun && !summary.hasTestRun) {
    reasons.push('No test run result was found.');
  }

  if (
    config.requirePassingTests &&
    summary.hasTestRun &&
    summary.passed === false
  ) {
    reasons.push('Tests did not pass.');
  }

  if (
    config.requirePassingTests &&
    typeof summary.failedCount === 'number' &&
    summary.failedCount > 0
  ) {
    reasons.push(`${summary.failedCount} test(s) failed.`);
  }

  if (reasons.length === 0) {
    return {
      approved: true,
      skipped: true,
      summary,
      reasons,
    };
  }

  const approval = await ctx.breakpoint({
    title: config.title ?? 'Test review required',
    question:
      config.question ??
      `${reasons.join(' ')} Review before continuing?`,
    options: config.options ?? ['Approve', 'Reject'],
    tags: config.tags ?? ['test-gate'],
    context: {
      runId: ctx.runId,
      summary,
      reasons,
      result,
      ...(config.context ?? {}),
    },
  });

  if (!approval.approved && config.throwOnReject !== false) {
    throw new Error(`Stopped by user: ${reasons.join(' ')}`);
  }

  return {
    ...approval,
    skipped: false,
    summary,
    reasons,
  };
}
