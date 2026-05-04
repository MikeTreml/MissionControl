/**
 * Test gate helper for Babysitter workflows.
 *
 * Run-first behavior:
 * - Never blocks execution
 * - Logs warnings only
 */

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

export async function requireTests(ctx, result) {
  const summary = getTestSummary(result);
  const reasons = [];

  if (!summary.hasTestCases) reasons.push('No test cases were found.');
  if (summary.passed === false) reasons.push('Tests did not pass.');
  if (typeof summary.failedCount === 'number' && summary.failedCount > 0) {
    reasons.push(`${summary.failedCount} test(s) failed.`);
  }

  if (reasons.length > 0) {
    ctx.log?.('warn', `Test gate warning: ${reasons.join(' ')}`);
  }

  return {
    approved: true,
    skipped: true,
    summary,
    reasons,
  };
}
