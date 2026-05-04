import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/main/workflow-generator.ts';
let text = readFileSync(file, 'utf8');
const original = text;

function replaceOnce(find, replace, label) {
  if (text.includes(replace)) return;
  if (!text.includes(find)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  text = text.replace(find, replace);
}

replaceOnce(
  `  headerNote?: string;\n};\n`,
  `  headerNote?: string;\n  confidenceGate?: {\n    enabled?: boolean;\n    threshold?: number;\n    taskRefs?: string[];\n  };\n  testGate?: {\n    enabled?: boolean;\n    requireTestRun?: boolean;\n    taskRefs?: string[];\n  };\n};\n`,
  'WorkflowSpec guard fields',
);

replaceOnce(
  `  parts.push("import { defineTask } from '@a5c-ai/babysitter-sdk';");\n  for (const imp of spec.extraImports ?? []) {\n`,
  `  parts.push("import { defineTask } from '@a5c-ai/babysitter-sdk';");\n  if (spec.confidenceGate?.enabled) {\n    parts.push("import { requireConfidence } from 'core/workflow-guards/confidence-gate.js';");\n  }\n  if (spec.testGate?.enabled) {\n    parts.push("import { requireTests } from 'core/workflow-guards/test-gate.js';");\n  }\n  for (const imp of spec.extraImports ?? []) {\n`,
  'generated guard imports',
);

replaceOnce(
  `    out.push(indentBlock(renderPhase(phase), 2));\n`,
  `    out.push(indentBlock(renderPhase(phase, spec), 2));\n`,
  'renderPhase spec argument',
);

replaceOnce(
  `function renderPhase(phase: Phase): string {\n`,
  `function renderPhase(phase: Phase, spec: WorkflowSpec): string {\n`,
  'renderPhase signature',
);

replaceOnce(
  `      return renderSequential(phase);\n`,
  `      return renderSequential(phase, spec);\n`,
  'renderSequential caller',
);

replaceOnce(
  `      return renderConditionalBlock(phase);\n`,
  `      return renderConditionalBlock(phase, spec);\n`,
  'renderConditionalBlock caller',
);

replaceOnce(
  `function renderSequential(phase: SequentialPhase): string {\n  const lines: string[] = [];\n  if (phase.logMessage) lines.push(\`ctx.log('info', \${jsString(phase.logMessage)});\`);\n  const decl = phase.mutable ? "let" : "const";\n  lines.push(\`\${decl} \${phase.resultVar} = await ctx.task(\${phase.taskRef}, \${renderArgs(phase.args)});\`);\n  return lines.join("\\n");\n}\n`,
  `function renderSequential(phase: SequentialPhase, spec: WorkflowSpec): string {\n  const lines: string[] = [];\n  if (phase.logMessage) lines.push(\`ctx.log('info', \${jsString(phase.logMessage)});\`);\n  const decl = phase.mutable ? "let" : "const";\n  lines.push(\`\${decl} \${phase.resultVar} = await ctx.task(\${phase.taskRef}, \${renderArgs(phase.args)});\`);\n  lines.push(...renderResultGuardCalls(spec, phase.taskRef, phase.resultVar));\n  return lines.join("\\n");\n}\n`,
  'renderSequential guards',
);

replaceOnce(
  `function renderConditionalBlock(phase: ConditionalBlockPhase): string {\n  const body = indentBlock(renderPhase(phase.body), 2);\n  return \`if (\${phase.condition}) {\\n\${body}\\n}\`;\n}\n`,
  `function renderConditionalBlock(phase: ConditionalBlockPhase, spec: WorkflowSpec): string {\n  const body = indentBlock(renderPhase(phase.body, spec), 2);\n  return \`if (\${phase.condition}) {\\n\${body}\\n}\`;\n}\n\nfunction renderResultGuardCalls(spec: WorkflowSpec, taskRef: string, resultVar: string): string[] {\n  const lines: string[] = [];\n\n  if (\n    spec.confidenceGate?.enabled &&\n    (!spec.confidenceGate.taskRefs || spec.confidenceGate.taskRefs.includes(taskRef))\n  ) {\n    const threshold = spec.confidenceGate.threshold ?? 90;\n    lines.push(\`await requireConfidence(ctx, \${resultVar}, { threshold: \${threshold} });\`);\n  }\n\n  if (\n    spec.testGate?.enabled &&\n    (!spec.testGate.taskRefs || spec.testGate.taskRefs.includes(taskRef))\n  ) {\n    const requireTestRun = spec.testGate.requireTestRun ?? false;\n    lines.push(\`await requireTests(ctx, \${resultVar}, { requireTestRun: \${requireTestRun} });\`);\n  }\n\n  return lines;\n}\n`,
  'renderConditionalBlock guards',
);

if (text !== original) {
  writeFileSync(file, text, 'utf8');
  console.log(`Patched ${file}`);
} else {
  console.log(`${file} already has workflow guard wiring`);
}
