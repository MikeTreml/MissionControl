export function autoFix(
  ctx: {
    log?: (level: string, message: string) => void;
    task: (taskRef: unknown, args?: unknown) => Promise<unknown>;
  },
  result: unknown,
  fixTask: unknown,
  options?: {
    message?: string;
    args?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>>;
