/**
 * Confidence gate helper for Babysitter workflows.
 *
 * Run-first behavior:
 * - High/normal confidence never interrupts.
 * - Only very low or missing confidence asks for review.
 */

export const VERY_LOW_CONFIDENCE_THRESHOLD = 60;

export function getConfidencePercent(result) {
  if (!result || typeof result !== 'object') return null;

  const candidates = [
    result.confidence,
    result.confidencePercent,
    result.confidence_percent,
    result.score,
  ];

  for (const value of candidates) {
    if (typeof value !== 'number' || Number.isNaN(value)) continue;

    // Support either 0-1 or 0-100 values.
    if (value >= 0 && value <= 1) return Math.round(value * 100);
    if (value >= 0 && value <= 100) return Math.round(value);
  }

  return null;
}

export async function requireConfidence(ctx, result, options = {}) {
  const threshold = options.veryLowThreshold ?? VERY_LOW_CONFIDENCE_THRESHOLD;
  const confidence = getConfidencePercent(result);

  if (confidence === null || confidence < threshold) {
    const approval = await ctx.breakpoint({
      title: options.title ?? 'Very low confidence',
      question:
        options.question ??
        (confidence === null
          ? 'No confidence value returned. Continue?'
          : `Confidence ${confidence}%. Continue?`),
      options: options.options ?? ['Continue', 'Stop'],
      tags: options.tags ?? ['confidence-gate'],
      context: {
        runId: ctx.runId,
        confidence,
        threshold,
        result,
        ...(options.context ?? {}),
      },
    });

    if (!approval.approved && options.throwOnReject === true) {
      throw new Error('Stopped by user: very low confidence.');
    }

    return {
      ...approval,
      confidence,
      threshold,
      skipped: false,
    };
  }

  return {
    approved: true,
    confidence,
    threshold,
    skipped: true,
  };
}
