# Mobile Optimization Skill

Improve mobile game performance with concrete profiling and optimization loops.

## What this skill covers

- capture CPU/GPU/memory/frame-time baselines on representative devices
- identify bottlenecks (render thread, overdraw, shader cost, physics spikes)
- reduce thermal build-up and throttle risk for longer play sessions
- tune dynamic quality (resolution, shadows, particles, post-processing)
- optimize loading, texture streaming, and memory churn

## Typical workflow

1. Profile baseline (target FPS tiers, p95 frame time, device temperature).
2. Rank hotspots by user impact and expected implementation cost.
3. Apply changes in small batches and re-measure each batch.
4. Lock device-specific quality presets and fallback behavior.
5. Document gains and residual risk (battery, heat, hitching).

## Deliverables

- optimization findings summary
- prioritized fix list with expected gain
- validated before/after metrics
- rollout guidance for low/mid/high-end devices
