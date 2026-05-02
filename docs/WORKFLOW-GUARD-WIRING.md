# Workflow Guard Wiring

Goal: wire generated workflows to optionally use the shared guards:

- `library/core/workflow-guards/confidence-gate.js`
- `library/core/workflow-guards/test-gate.js`

This should be opt-in by default until existing workflow specs are validated.

## Add WorkflowSpec fields

```ts
confidenceGate?: {
  enabled?: boolean;
  threshold?: number;
  taskRefs?: string[];
};

testGate?: {
  enabled?: boolean;
  requireTestRun?: boolean;
  taskRefs?: string[];
};
```

## Generated imports

After the Babysitter SDK import, emit these only when enabled:

```ts
if (spec.confidenceGate?.enabled) {
  parts.push("import { requireConfidence } from 'core/workflow-guards/confidence-gate.js';");
}

if (spec.testGate?.enabled) {
  parts.push("import { requireTests } from 'core/workflow-guards/test-gate.js';");
}
```

## Sequential task guard calls

After a generated task call:

```ts
const result = await ctx.task(myTask, args);
```

Emit:

```ts
await requireConfidence(ctx, result, { threshold: spec.confidenceGate.threshold ?? 90 });
await requireTests(ctx, result, { requireTestRun: spec.testGate.requireTestRun ?? false });
```

Only emit for matching taskRefs:

```ts
!spec.confidenceGate.taskRefs || spec.confidenceGate.taskRefs.includes(taskRef)
!spec.testGate.taskRefs || spec.testGate.taskRefs.includes(taskRef)
```

## Helper to add inside workflow-generator.ts

```ts
function renderResultGuardCalls(spec: WorkflowSpec, taskRef: string, resultVar: string): string[] {
  const lines: string[] = [];

  if (
    spec.confidenceGate?.enabled &&
    (!spec.confidenceGate.taskRefs || spec.confidenceGate.taskRefs.includes(taskRef))
  ) {
    const threshold = spec.confidenceGate.threshold ?? 90;
    lines.push(`await requireConfidence(ctx, ${resultVar}, { threshold: ${threshold} });`);
  }

  if (
    spec.testGate?.enabled &&
    (!spec.testGate.taskRefs || spec.testGate.taskRefs.includes(taskRef))
  ) {
    const requireTestRun = spec.testGate.requireTestRun ?? false;
    lines.push(`await requireTests(ctx, ${resultVar}, { requireTestRun: ${requireTestRun} });`);
  }

  return lines;
}
```

## Modify renderSequential

Before:

```ts
function renderSequential(phase: SequentialPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  const decl = phase.mutable ? "let" : "const";
  lines.push(`${decl} ${phase.resultVar} = await ctx.task(${phase.taskRef}, ${renderArgs(phase.args)});`);
  return lines.join("\n");
}
```

After:

```ts
function renderSequential(phase: SequentialPhase, spec: WorkflowSpec): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  const decl = phase.mutable ? "let" : "const";
  lines.push(`${decl} ${phase.resultVar} = await ctx.task(${phase.taskRef}, ${renderArgs(phase.args)});`);
  lines.push(...renderResultGuardCalls(spec, phase.taskRef, phase.resultVar));
  return lines.join("\n");
}
```

## Required signature changes

- `renderPhase(phase)` -> `renderPhase(phase, spec)`
- `renderSequential(phase)` -> `renderSequential(phase, spec)`
- `renderConditionalBlock(phase)` -> `renderConditionalBlock(phase, spec)`
- recursive `renderPhase(phase.body)` -> `renderPhase(phase.body, spec)`

## Validation

Generate one workflow with:

```ts
confidenceGate: { enabled: true, threshold: 90 },
testGate: { enabled: true, requireTestRun: false }
```

Expected output includes imports and guard calls immediately after sequential task results.
