export async function autoFix(ctx, result, fixTask, options = {}) {
  if (!result || !fixTask) return result;

  const failedTests = typeof result.failedTests === 'number' ? result.failedTests : 0;

  const hasIssue =
    result.error ||
    result.status === 'failed' ||
    failedTests > 0;

  if (!hasIssue) return result;

  ctx.log?.('warn', options.message ?? 'Issue detected; attempting auto-fix');

  try {
    const fix = await ctx.task(fixTask, {
      original: result,
      ...(options.args ?? {}),
    });

    return fix ?? result;
  } catch (err) {
    ctx.log?.('warn', `Auto-fix failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
}
