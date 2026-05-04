export function shouldCreateNextTask(result: unknown): boolean;

export function createNextTaskEvent(
  ctx: { log?: (level: string, message: string) => void },
  result: unknown,
  options?: { autoStart?: boolean },
): Promise<{
  created: boolean;
  event?: {
    type: "next-task-ready";
    commit: unknown;
    autoStart: boolean;
  };
}>;
