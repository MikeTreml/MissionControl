import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/main/workflow-generator.ts';
let text = readFileSync(file, 'utf8');

function replaceOnce(find, replace, label) {
  if (text.includes(replace)) return;
  if (!text.includes(find)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  text = text.replace(find, replace);
}

replaceOnce(
  "  parts.push(\"import { defineTask } from '@a5c-ai/babysitter-sdk';\");\n",
  "  parts.push(\"import { defineTask } from '@a5c-ai/babysitter-sdk';\");\n  parts.push(\"import { requireConfidence } from 'core/workflow-guards/confidence-gate.js';\");\n  parts.push(\"import { requireTests } from 'core/workflow-guards/test-gate.js';\");\n  parts.push(\"import { autoFix } from 'core/workflow-guards/auto-fix.js';\");\n  parts.push(\"import { createNextTaskEvent } from 'core/workflow-guards/task-chain.js';\");\n",
  'generated guard imports',
);

replaceOnce(
  `function renderSequential(phase: SequentialPhase): string {\n  const lines: string[] = [];\n  if (phase.logMessage) lines.push(\`ctx.log('info', \${jsString(phase.logMessage)});\`);\n  const decl = phase.mutable ? "let" : "const";\n  lines.push(\`\${decl} \${phase.resultVar} = await ctx.task(\${phase.taskRef}, \${renderArgs(phase.args)});\`);\n  return lines.join("\\n");\n}\n`,
  `function renderSequential(phase: SequentialPhase): string {\n  const lines: string[] = [];\n  if (phase.logMessage) lines.push(\`ctx.log('info', \${jsString(phase.logMessage)});\`);\n  const decl = phase.mutable ? "let" : "let";\n  lines.push(\`\${decl} \${phase.resultVar} = await ctx.task(\${phase.taskRef}, \${renderArgs(phase.args)});\`);\n  lines.push(\`\${phase.resultVar} = await autoFix(ctx, \${phase.resultVar}, \${phase.taskRef});\`);\n  lines.push(\`await requireConfidence(ctx, \${phase.resultVar});\`);\n  lines.push(\`await requireTests(ctx, \${phase.resultVar});\`);\n  lines.push(\`await createNextTaskEvent(ctx, \${phase.resultVar});\`);\n  return lines.join("\\n");\n}\n`,
  'renderSequential guards',
);

writeFileSync(file, text, 'utf8');
console.log(`Patched ${file}`);
