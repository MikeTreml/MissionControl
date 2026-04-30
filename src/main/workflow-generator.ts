/**
 * Workflow scaffolding codegen.
 *
 * Takes a structured `WorkflowSpec` and emits a `workflow.js` source file that
 * matches the conventions observed across `library/workflows/**`:
 *
 *   - JSDoc header with @process, @description, @inputs, @outputs, phase list
 *   - `import { defineTask } from '@a5c-ai/babysitter-sdk'`
 *   - `export async function process(inputs, ctx)` with destructured defaults
 *   - Banner-separated phase blocks (sequential / parallel / breakpoint /
 *     retry-with-feedback / conditional)
 *   - Flat task definitions below `process`, each one a `defineTask(...)` call
 *     with `kind: 'agent' | 'shell'`, prompt, outputSchema, io, labels
 *   - Return with `{ success, ...named outputs..., metadata: { processId, timestamp: ctx.now() } }`
 *
 * Scope:
 *   - Generates a runnable scaffold the author can edit. We do NOT try to
 *     re-parse generated files; the workflow.js is the source of truth once
 *     written. (Matches CLAUDE.md rule #4.)
 *   - Conditionals are a single-task gate (`if (cond) await ctx.task(...)`).
 *     Free-form JS branches stay manual.
 *   - `node`-kind tasks and shared-helper imports are left out of v1; they
 *     show up in <10% of existing workflows.
 */

export type WorkflowSpec = {
  processId: string;
  description: string;
  inputs: WorkflowInput[];
  outputs: WorkflowOutput[];
  phases: Phase[];
  tasks: TaskDef[];
};

export type WorkflowInput = {
  name: string;
  jsDocType: string;
  defaultLiteral?: string;
};

export type WorkflowOutput = {
  name: string;
  jsDocType: string;
  expression: string;
};

export type Phase =
  | SequentialPhase
  | ParallelPhase
  | BreakpointPhase
  | RetryPhase
  | ConditionalPhase;

export type SequentialPhase = {
  kind: "sequential";
  title: string;
  logMessage?: string;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
};

export type ParallelPhase = {
  kind: "parallel";
  title: string;
  logMessage?: string;
  resultVars: string[];
  branches: Array<{ taskRef: string; args: Record<string, string> }>;
};

export type BreakpointPhase = {
  kind: "breakpoint";
  title: string;
  question: string;
  options?: string[];
  expert?: string;
  tags?: string[];
};

export type RetryPhase = {
  kind: "retry";
  title: string;
  logMessage?: string;
  maxAttempts: number;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
  question: string;
  bpTitle: string;
  options?: string[];
  expert?: string;
  tags?: string[];
};

export type ConditionalPhase = {
  kind: "conditional";
  title: string;
  condition: string;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
};

export type TaskDef = AgentTask | ShellTask;

export type AgentTask = {
  kind: "agent";
  factoryName: string;
  taskKey: string;
  title: string;
  agentName: string;
  role: string;
  taskDescription: string;
  contextKeys: string[];
  instructions: string[];
  outputFormat: string;
  outputSchema: SchemaProp;
  labels: string[];
};

export type ShellTask = {
  kind: "shell";
  factoryName: string;
  taskKey: string;
  title: string;
  description?: string;
  command: string;
  labels?: string[];
};

export type SchemaProp =
  | { type: "object"; required?: string[]; properties: Record<string, SchemaProp> }
  | { type: "array"; items: SchemaProp }
  | { type: "string"; enum?: string[] }
  | { type: "number"; minimum?: number; maximum?: number }
  | { type: "boolean" };

export function generateWorkflow(spec: WorkflowSpec): string {
  validateSpec(spec);
  const parts: string[] = [];
  parts.push(renderHeader(spec));
  parts.push("");
  parts.push("import { defineTask } from '@a5c-ai/babysitter-sdk';");
  parts.push("");
  parts.push(renderProcess(spec));
  parts.push("");
  parts.push(banner("TASK DEFINITIONS"));
  parts.push("");
  for (const task of spec.tasks) {
    parts.push(renderTask(task));
    parts.push("");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function validateSpec(spec: WorkflowSpec): void {
  if (!spec.processId) throw new Error("WorkflowSpec.processId is required");
  if (!spec.description) throw new Error("WorkflowSpec.description is required");
  const taskKeys = new Set(spec.tasks.map((t) => t.factoryName));
  for (const phase of spec.phases) {
    const refs = collectTaskRefs(phase);
    for (const ref of refs) {
      if (!taskKeys.has(ref)) {
        throw new Error(`Phase "${phase.title}" references unknown task "${ref}"`);
      }
    }
  }
}

function collectTaskRefs(phase: Phase): string[] {
  switch (phase.kind) {
    case "sequential":
    case "retry":
    case "conditional":
      return [phase.taskRef];
    case "parallel":
      return phase.branches.map((b) => b.taskRef);
    case "breakpoint":
      return [];
  }
}

function renderHeader(spec: WorkflowSpec): string {
  const lines: string[] = ["/**"];
  lines.push(` * @process ${spec.processId}`);
  lines.push(` * @description ${spec.description}`);
  if (spec.inputs.length > 0) {
    const inner = spec.inputs
      .map((i) => `${i.name}${i.defaultLiteral !== undefined ? "?" : ""}: ${i.jsDocType}`)
      .join(", ");
    lines.push(` * @inputs { ${inner} }`);
  }
  if (spec.outputs.length > 0) {
    const inner = spec.outputs.map((o) => `${o.name}: ${o.jsDocType}`).join(", ");
    lines.push(` * @outputs { ${inner} }`);
  }
  lines.push(" *");
  lines.push(" * Phases:");
  spec.phases.forEach((phase, i) => {
    lines.push(` * ${i + 1}. ${phase.title}`);
  });
  lines.push(" */");
  return lines.join("\n");
}

function renderProcess(spec: WorkflowSpec): string {
  const out: string[] = [];
  out.push("export async function process(inputs, ctx) {");
  if (spec.inputs.length > 0) {
    out.push("  const {");
    spec.inputs.forEach((input, i) => {
      const trail = i === spec.inputs.length - 1 ? "" : ",";
      const def = input.defaultLiteral !== undefined ? ` = ${input.defaultLiteral}` : "";
      out.push(`    ${input.name}${def}${trail}`);
    });
    out.push("  } = inputs;");
    out.push("");
  }

  spec.phases.forEach((phase, i) => {
    out.push(indentBlock(banner(`PHASE ${i + 1}: ${phase.title.toUpperCase()}`), 2));
    out.push("");
    out.push(indentBlock(renderPhase(phase), 2));
    out.push("");
  });

  out.push("  return {");
  out.push("    success: true,");
  for (const output of spec.outputs) {
    out.push(`    ${output.name}: ${output.expression},`);
  }
  out.push("    metadata: {");
  out.push(`      processId: '${spec.processId}',`);
  out.push("      timestamp: ctx.now()");
  out.push("    }");
  out.push("  };");
  out.push("}");
  return out.join("\n");
}

function renderPhase(phase: Phase): string {
  switch (phase.kind) {
    case "sequential":
      return renderSequential(phase);
    case "parallel":
      return renderParallel(phase);
    case "breakpoint":
      return renderBreakpoint(phase);
    case "retry":
      return renderRetry(phase);
    case "conditional":
      return renderConditional(phase);
  }
}

function renderSequential(phase: SequentialPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  lines.push(`const ${phase.resultVar} = await ctx.task(${phase.taskRef}, ${renderArgs(phase.args)});`);
  return lines.join("\n");
}

function renderParallel(phase: ParallelPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  const dest =
    phase.resultVars.length === 1
      ? `const [${phase.resultVars[0]}]`
      : `const [\n  ${phase.resultVars.join(",\n  ")}\n]`;
  const branches = phase.branches
    .map((b) => `  () => ctx.task(${b.taskRef}, ${renderArgs(b.args)})`)
    .join(",\n");
  lines.push(`${dest} = await ctx.parallel.all([\n${branches}\n]);`);
  return lines.join("\n");
}

function renderBreakpoint(phase: BreakpointPhase): string {
  return `await ctx.breakpoint(${renderBreakpointBody(phase.question, phase.title, phase.options, phase.expert, phase.tags)});`;
}

function renderRetry(phase: RetryPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  lines.push(`let ${phase.resultVar} = null;`);
  lines.push(`let ${phase.resultVar}LastFeedback = null;`);
  lines.push(`for (let attempt = 0; attempt < ${phase.maxAttempts}; attempt++) {`);
  lines.push(`  ${phase.resultVar} = await ctx.task(${phase.taskRef}, {`);
  for (const [k, v] of Object.entries(phase.args)) {
    lines.push(`    ${k}: ${v},`);
  }
  lines.push(`    feedback: ${phase.resultVar}LastFeedback,`);
  lines.push(`    attempt: attempt + 1`);
  lines.push(`  });`);
  lines.push(`  const approval = await ctx.breakpoint(${renderBreakpointBody(phase.question, phase.bpTitle, phase.options, phase.expert, phase.tags, true)});`);
  lines.push(`  if (approval.approved) break;`);
  lines.push(`  ${phase.resultVar}LastFeedback = approval.response || approval.feedback || 'Changes requested';`);
  lines.push(`}`);
  return lines.join("\n");
}

function renderConditional(phase: ConditionalPhase): string {
  const lines: string[] = [];
  lines.push(`let ${phase.resultVar} = null;`);
  lines.push(`if (${phase.condition}) {`);
  lines.push(`  ${phase.resultVar} = await ctx.task(${phase.taskRef}, ${renderArgs(phase.args, 2)});`);
  lines.push(`}`);
  return lines.join("\n");
}

function renderBreakpointBody(
  question: string,
  title: string,
  options?: string[],
  expert?: string,
  tags?: string[],
  inLoop = false,
): string {
  const lines: string[] = ["{"];
  lines.push(`  question: ${renderQuestion(question)},`);
  lines.push(`  title: ${jsString(title)},`);
  if (options && options.length > 0) {
    lines.push(`  options: [${options.map((o) => jsString(o)).join(", ")}],`);
  }
  if (expert) lines.push(`  expert: ${jsString(expert)},`);
  if (tags && tags.length > 0) {
    lines.push(`  tags: [${tags.map((t) => jsString(t)).join(", ")}],`);
  }
  if (inLoop) {
    lines.push(`  attempt: attempt + 1,`);
  }
  lines.push(`  context: { runId: ctx.runId }`);
  lines.push(`}`);
  return lines.join("\n");
}

function renderQuestion(q: string): string {
  if (!q.includes("\n")) return jsString(q);
  const lines = q.split("\n").map((l) => jsString(l));
  return `[\n  ${lines.join(",\n  ")}\n].join('\\n')`;
}

function renderArgs(args: Record<string, string>, indent = 0): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "{}";
  const pad = " ".repeat(indent);
  const lines = entries.map(([k, v]) => `${pad}  ${k}: ${v}`);
  return `{\n${lines.join(",\n")}\n${pad}}`;
}

function renderTask(task: TaskDef): string {
  switch (task.kind) {
    case "agent":
      return renderAgentTask(task);
    case "shell":
      return renderShellTask(task);
  }
}

function renderAgentTask(t: AgentTask): string {
  const ctxLines = t.contextKeys.map((k) => `        ${k}: args.${k}`).join(",\n");
  const instructionLines = t.instructions.map((i) => `        ${jsString(i)}`).join(",\n");
  const labels = t.labels.map((l) => jsString(l)).join(", ");
  return [
    `export const ${t.factoryName} = defineTask('${t.taskKey}', (args, taskCtx) => ({`,
    `  kind: 'agent',`,
    `  title: ${jsString(t.title)},`,
    `  agent: {`,
    `    name: ${jsString(t.agentName)},`,
    `    prompt: {`,
    `      role: ${jsString(t.role)},`,
    `      task: ${jsString(t.taskDescription)},`,
    `      context: {`,
    ctxLines,
    `      },`,
    `      instructions: [`,
    instructionLines,
    `      ],`,
    `      outputFormat: ${jsString(t.outputFormat)}`,
    `    },`,
    `    outputSchema: ${renderSchema(t.outputSchema, 4)}`,
    `  },`,
    `  io: {`,
    `    inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`,`,
    `    outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\``,
    `  },`,
    `  labels: [${labels}]`,
    `}));`,
  ].join("\n");
}

function renderShellTask(t: ShellTask): string {
  const labels = (t.labels ?? []).map((l) => jsString(l)).join(", ");
  return [
    `export const ${t.factoryName} = defineTask('${t.taskKey}', (args, taskCtx) => ({`,
    `  kind: 'shell',`,
    `  title: ${jsString(t.title)},`,
    t.description ? `  description: ${jsString(t.description)},` : null,
    `  shell: {`,
    `    command: ${jsString(t.command)}`,
    `  },`,
    `  io: {`,
    `    inputJsonPath: \`tasks/\${taskCtx.effectId}/input.json\`,`,
    `    outputJsonPath: \`tasks/\${taskCtx.effectId}/result.json\``,
    `  }${labels ? "," : ""}`,
    labels ? `  labels: [${labels}]` : null,
    `}));`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

function renderSchema(schema: SchemaProp, indent: number): string {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  switch (schema.type) {
    case "object": {
      const lines: string[] = [`{`];
      lines.push(`${inner}type: 'object',`);
      if (schema.required && schema.required.length > 0) {
        lines.push(`${inner}required: [${schema.required.map((r) => jsString(r)).join(", ")}],`);
      }
      lines.push(`${inner}properties: {`);
      const entries = Object.entries(schema.properties);
      entries.forEach(([k, v], i) => {
        const trail = i === entries.length - 1 ? "" : ",";
        lines.push(`${inner}  ${k}: ${renderSchema(v, indent + 4)}${trail}`);
      });
      lines.push(`${inner}}`);
      lines.push(`${pad}}`);
      return lines.join("\n");
    }
    case "array":
      return `{ type: 'array', items: ${renderSchema(schema.items, indent + 2)} }`;
    case "string":
      if (schema.enum)
        return `{ type: 'string', enum: [${schema.enum.map((e) => jsString(e)).join(", ")}] }`;
      return `{ type: 'string' }`;
    case "number": {
      const opts: string[] = [`type: 'number'`];
      if (schema.minimum !== undefined) opts.push(`minimum: ${schema.minimum}`);
      if (schema.maximum !== undefined) opts.push(`maximum: ${schema.maximum}`);
      return `{ ${opts.join(", ")} }`;
    }
    case "boolean":
      return `{ type: 'boolean' }`;
  }
}

function banner(label: string): string {
  return [
    "// ============================================================================",
    `// ${label}`,
    "// ============================================================================",
  ].join("\n");
}

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? "" : pad + line))
    .join("\n");
}

function jsString(s: string): string {
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
}
