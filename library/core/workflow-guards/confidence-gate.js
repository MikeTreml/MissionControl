/**
 * Confidence gate helper for Babysitter workflows.
 *
 * Use this after an agent/task result when the workflow should continue only
 * when the result is likely correct enough. The helper uses ctx.breakpoint,
 * so MissionControl can render the approval card and answer through
 * Babysitter's native pending-effect/task:post flow.
 */

export const DEFAULT_CONFIDENCE_THRESHOLD = 90;

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
  const threshold = options.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const confidence = getConfidencePercent(result);
  const shouldAsk = confidence === null || confidence < threshold;

  if (!shouldAsk) {
    return {
      approved: true,
      confidence,
      threshold,
      skipped: true,
    };
  }

  const approval = await ctx.breakpoint({
    title: options.title ?? 'Confidence review required',
    question:
      options.question ??
      (confidence === null
        ? `The task did not return a confidence value. Review before continuing?`
        : `The task returned ${confidence}% confidence. Required threshold is ${threshold}%. Continue?`),
    options: options.options ?? ['Approve', 'Reject'],
    tags: options.tags ?? ['confidence-gate'],
    context: {
      runId: ctx.runId,
      confidence,
      threshold,
      result,
      ...(options.context ?? {}),
    },
  });

  if (!approval.approved && options.throwOnReject !== false) {
    throw new Error(
      confidence === null
        ? 'Stopped by user: missing confidence value.'
        : `Stopped by user: confidence ${confidence}% is below threshold ${threshold}%.`,
    );
  }

  return {
    ...approval,
    confidence,
    threshold,
    skipped: false,
  };
}
