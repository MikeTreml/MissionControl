export const VERY_LOW_CONFIDENCE_THRESHOLD: number;

export function getConfidencePercent(result: unknown): number | null;

export function requireConfidence(
  ctx: {
    runId?: string;
    breakpoint: (input: unknown) => Promise<{ approved?: boolean; [key: string]: unknown }>;
  },
  result: unknown,
  options?: {
    veryLowThreshold?: number;
    title?: string;
    question?: string;
    options?: string[];
    tags?: string[];
    context?: Record<string, unknown>;
    throwOnReject?: boolean;
  },
): Promise<{ approved?: boolean; confidence: number | null; threshold: number; skipped: boolean; [key: string]: unknown }>;
