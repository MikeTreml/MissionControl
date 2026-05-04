export function getTestSummary(result: unknown): {
  hasTestCases: boolean;
  hasTestRun: boolean;
  passed: boolean | null;
  failedCount: number | null;
  testCount: number | null;
};

export function requireTests(
  ctx: { log?: (level: string, message: string) => void },
  result: unknown,
): Promise<{
  approved: true;
  skipped: true;
  summary: ReturnType<typeof getTestSummary>;
  reasons: string[];
}>;
