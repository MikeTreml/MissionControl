# Task: Extend `workflow.json` schema with babysitter overlay

## Why

Today's workflow.json is structure-only (steps + lanes). To drive babysitter-
style runs we need the runtime knobs (target quality, max iterations, mode,
breakpoints, quality gates) baked into the schema as defaults the per-run
overlay can override.

## Goal

`workflow.json` gains a `babysitter` block + per-step `breakpoint` and
`qualityGate` fields. MC's loader validates the new shape via Zod. Run-time
behavior reads the values; the Run Settings panel exposes them per run.

## Scope

- Extend `WorkflowSchema` in `src/shared/models.ts` to match the schema in
  `mc-workflow-guide.md` §3
- Update `agent-loader.ts` (or wherever workflows load) to validate via Zod
- Update each existing `workflow.json` (`F-feature`, `X-brainstorm`,
  `M-maintenance-forever`) with sensible defaults for the new fields
- Add a per-run merge function: `mergeRunSettings(workflow, overrides) → effectiveWorkflow`
- Persist the merged result into `<task>/manifest.json.runSettings`

## Out of scope

- The Run Settings UI — that's a separate task (#04 below)
- Implementing `parallel` / `fanOut` execution — schema only; runtime support comes later
- Implementing `qualityGate` enforcement at run-time — schema only; reviewer
  step still works "manually" today

## Files involved

- `src/shared/models.ts` — extend `WorkflowSchema`
- `src/main/agent-loader.ts` — Zod parse on load
- `src/main/run-manager.ts` (per smokes list) — read effective workflow
- `src/main/workflows.smoke.ts` — extend smoke to load each workflow + merge
  fake overrides
- `workflows/F-feature/workflow.json` — add `babysitter` defaults
- `workflows/X-brainstorm/workflow.json` — same
- `workflows/M-maintenance-forever/workflow.json` — same

## Schema highlights

See `mc-workflow-guide.md` §3 for the full schema. Key Zod additions:

```ts
const QualityGateSchema = z.object({
  field: z.string(),
  minimum: z.number().optional(),
  equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  maximum: z.number().optional(),
});

const BabysitterBlockSchema = z.object({
  targetQuality: z.number().min(0).max(100).default(80),
  maxIterations: z.number().min(1).max(10).default(3),
  mode: z.enum(['sequential', 'parallel', 'pipeline']).default('sequential'),
  logLevel: z.enum(['info', 'debug', 'error']).default('info'),
  stopOnFirstFailure: z.boolean().default(false),
});

// extend StepSchema:
const StepSchema = z.object({
  id: z.string(),
  agent: z.string(),
  lane: z.string().optional(),
  outputCode: z.string().min(1).max(4),
  parallel: z.boolean().default(false),
  modelOverride: z.string().nullable().default(null),
  breakpoint: z.boolean().default(false),
  breakpointReason: z.string().optional(),
  qualityGate: QualityGateSchema.optional(),
  onFail: z.object({
    action: z.enum(['loopBackTo', 'escalate', 'abort']),
    target: z.string().optional(),
    maxCycles: z.number().default(3),
  }).optional(),
  runWhen: z.string().optional(),
});
```

## Acceptance criteria

- All three existing workflow.json files load + validate with the new schema
- `npm run smoke` (specifically `workflows.smoke.ts`) passes
- `mergeRunSettings({...}, { targetQuality: 90 })` returns an object where the
  override is applied
- Adding a deliberately invalid workflow.json (e.g. `mode: "foo"`) fails the
  smoke with a Zod error pointing at the offending field

## Gotchas

- Don't break older workflow.json files — every new field has a Zod default
- Keep the merge function pure (no IO) so it's trivially testable
- Don't forget to surface the new fields through preload — renderer needs them
  in the `Workflow` IPC payload