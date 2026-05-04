export async function retryTask(ctx, taskRef, args = {}, options = {}) {
  const maxAttempts = options.maxAttempts ?? 2;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await ctx.task(taskRef, { ...args, attempt });
      lastResult = result;
      if (!result || result.status !== 'retry') {
        return { ok: true, attempt, result };
      }
    } catch {}
  }

  return { ok: false, attempts: maxAttempts, result: lastResult };
}
