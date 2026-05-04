export function shouldCreateNextTask(result) {
  if (!result || typeof result !== 'object') return false;
  return !!(result.commit || result.commitSha);
}

export async function createNextTaskEvent(ctx, result, options = {}) {
  if (!shouldCreateNextTask(result)) return { created: false };

  const commit = result.commit || result.commitSha;

  ctx.log?.('info', `Next task ready after commit ${commit}`);

  return {
    created: true,
    event: {
      type: 'next-task-ready',
      commit,
      autoStart: options.autoStart ?? false,
    },
  };
}
