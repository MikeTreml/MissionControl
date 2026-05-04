export function retryTask(
  ctx: { task: (taskRef: unknown, args?: unknown) => Promise<unknown> },
  taskRef: unknown,
  args?: Record<string, unknown>,
  options?: { maxAttempts?: number },
): Promise<{ ok: boolean; attempt?: number; attempts?: number; result: unknown }>;
