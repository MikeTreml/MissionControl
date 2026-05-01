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
  /**
   * JS expression assigned to the returned `success` field. If omitted,
   * defaults to `'true'`. Existing workflows usually wire this to the
   * final task result (e.g. `'prResult.success'` or `'converged'`).
   */
  successExpression?: string;
  /**
   * Additional named imports to emit alongside the SDK import. Used by
   * curated workflows that pull shared task helpers from
   * `methodologies/shared/...`. Names declared here are also accepted as
   * valid `taskRef`s in phases (no need to redeclare them in `tasks[]`).
   */
  extraImports?: ImportSpec[];
  /**
   * Free-text block rendered between `@description` and the phase list
   * in the JSDoc header. Multi-line is fine — newlines become ` * `
   * comment lines. Useful for "Bug Report Contribution Process"-style
   * separator text seen in cradle/* workflows.
   */
  headerNote?: string;
};

export type ImportSpec = {
  source: string;
  named: string[];
};

/**
 * A breakpoint's question text. Two forms:
 *   - A string literal (single or multi-line).
 *   - `{ call: "fnName(arg1)" }` — a JS expression rendered verbatim,
 *     letting the workflow call a helper that builds a context-rich
 *     prompt at runtime (e.g. `diagnosisBreakpointQuestion(diagnosis)`).
 *     The function must be declared in the workflow scope, typically
 *     via `extraImports`.
 */
export type BreakpointQuestion = string | { call: string };

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
  | ConditionalPhase
  | ConditionalBlockPhase
  | ConfirmLoopPhase;

export type SequentialPhase = {
  kind: "sequential";
  title: string;
  /** Optional one-liner shown in the JSDoc header phase list. */
  description?: string;
  logMessage?: string;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
  /** Emit `let` instead of `const` — required when a later phase reassigns this var. */
  mutable?: boolean;
};

export type ParallelPhase = {
  kind: "parallel";
  title: string;
  description?: string;
  logMessage?: string;
  resultVars: string[];
  branches: Array<{ taskRef: string; args: Record<string, string> }>;
};

export type BreakpointPhase = {
  kind: "breakpoint";
  title: string;
  description?: string;
  question: BreakpointQuestion;
  options?: string[];
  expert?: string;
  tags?: string[];
};

export type RetryPhase = {
  kind: "retry";
  title: string;
  description?: string;
  logMessage?: string;
  maxAttempts: number;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
  question: BreakpointQuestion;
  bpTitle: string;
  options?: string[];
  expert?: string;
  tags?: string[];
  /**
   * When `'every-iteration'` (default) the task runs every loop pass.
   * When `'retry-only'` it only runs after a "request changes" feedback —
   * use this when a prior phase already produced an initial result and
   * we just want to gate / refine it. Pair with `initialValue`.
   */
  runTaskOn?: "every-iteration" | "retry-only";
  /** JS expression used to seed `resultVar` before the loop. Defaults to `'null'`. */
  initialValue?: string;
};

export type ConditionalPhase = {
  kind: "conditional";
  title: string;
  description?: string;
  condition: string;
  resultVar: string;
  taskRef: string;
  args: Record<string, string>;
};

/**
 * Conditional that wraps another phase (typically a retry loop). Models the
 * `if (cond) { for (let attempt ...) { ... } }` pattern observed in
 * cradle/bug-report's duplicate-issue branch.
 */
export type ConditionalBlockPhase = {
  kind: "conditional-block";
  title: string;
  description?: string;
  condition: string;
  body: Phase;
};

/**
 * Retry-shaped breakpoint loop with no task body — pure confirmation gate
 * with feedback collection. Used by cradle/bug-report Phase 6 and the final
 * submit confirmation in cradle/bugfix.
 */
export type ConfirmLoopPhase = {
  kind: "confirm-loop";
  title: string;
  description?: string;
  logMessage?: string;
  maxAttempts: number;
  question: BreakpointQuestion;
  bpTitle: string;
  feedbackVar: string;
  options?: string[];
  expert?: string;
  tags?: string[];
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
  for (const imp of spec.extraImports ?? []) {
    parts.push(`import { ${imp.named.join(", ")} } from ${jsString(imp.source)};`);
  }
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

  // Unique factory names — duplicates would emit duplicate `export const`s.
  const taskKeys = new Set<string>();
  for (const task of spec.tasks) {
    if (taskKeys.has(task.factoryName)) {
      throw new Error(`Duplicate task factoryName "${task.factoryName}" is not allowed`);
    }
    taskKeys.add(task.factoryName);
  }

  // Names from extraImports are also valid task refs (shared helpers).
  for (const imp of spec.extraImports ?? []) {
    for (const name of imp.named) {
      if (!isValidJsIdentifier(name)) {
        throw new Error(`extraImports: "${name}" is not a valid JS identifier`);
      }
      if (taskKeys.has(name)) {
        throw new Error(
          `extraImports: "${name}" collides with a task factoryName`,
        );
      }
      taskKeys.add(name);
    }
  }

  for (const phase of spec.phases) {
    validatePhase(phase, taskKeys);
  }

  // Output schema property names are also rendered as bare identifiers.
  for (const task of spec.tasks) {
    if (task.kind === "agent") {
      validateSchemaIdentifiers(task.outputSchema, `${task.factoryName}.outputSchema`);
    }
  }
}

function validatePhase(phase: Phase, taskKeys: Set<string>): void {
  const refs = collectTaskRefs(phase);
  for (const ref of refs) {
    if (!taskKeys.has(ref)) {
      throw new Error(`Phase "${phase.title}" references unknown task "${ref}"`);
    }
  }
  if (phase.kind === "parallel" && phase.resultVars.length !== phase.branches.length) {
    throw new Error(
      `Parallel phase "${phase.title}" must define exactly one resultVar per branch ` +
        `(got ${phase.resultVars.length} vars / ${phase.branches.length} branches)`,
    );
  }
  if (
    (phase.kind === "retry" || phase.kind === "confirm-loop") &&
    (!Number.isInteger(phase.maxAttempts) || phase.maxAttempts < 1)
  ) {
    throw new Error(
      `${phase.kind} phase "${phase.title}" maxAttempts must be a positive integer (got ${phase.maxAttempts})`,
    );
  }
  if (phase.kind === "retry" && phase.runTaskOn === "retry-only" && !phase.initialValue) {
    throw new Error(
      `Retry phase "${phase.title}" with runTaskOn='retry-only' must set initialValue ` +
        `(the prior task result the loop is gating)`,
    );
  }
  if (phase.kind === "confirm-loop" && !isValidJsIdentifier(phase.feedbackVar)) {
    throw new Error(
      `confirm-loop phase "${phase.title}" feedbackVar "${phase.feedbackVar}" is not a valid JS identifier`,
    );
  }
  // Phase args become bare identifiers in the emitted JS — guard the keys.
  for (const argSet of collectPhaseArgs(phase)) {
    for (const key of Object.keys(argSet)) {
      if (!isValidJsIdentifier(key)) {
        throw new Error(`Phase "${phase.title}" arg key "${key}" is not a valid JS identifier`);
      }
    }
  }
  if (phase.kind === "conditional-block") {
    validatePhase(phase.body, taskKeys);
  }
}

function collectPhaseArgs(phase: Phase): Array<Record<string, string>> {
  switch (phase.kind) {
    case "sequential":
    case "retry":
    case "conditional":
      return [phase.args];
    case "parallel":
      return phase.branches.map((b) => b.args);
    case "breakpoint":
    case "confirm-loop":
      return [];
    case "conditional-block":
      return collectPhaseArgs(phase.body);
  }
}

function validateSchemaIdentifiers(schema: SchemaProp, path: string): void {
  if (schema.type === "object") {
    for (const key of Object.keys(schema.properties)) {
      if (!isValidJsIdentifier(key)) {
        throw new Error(`${path}: property key "${key}" is not a valid JS identifier`);
      }
      validateSchemaIdentifiers(schema.properties[key]!, `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    validateSchemaIdentifiers(schema.items, `${path}[]`);
  }
}

function isValidJsIdentifier(s: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);
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
    case "confirm-loop":
      return [];
    case "conditional-block":
      return collectTaskRefs(phase.body);
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
  // Optional free-text block between @description and the phase list.
  // Used by cradle/* workflows to carry a "Bug Report Contribution
  // Process"-style separator label.
  if (spec.headerNote) {
    lines.push(" *");
    for (const noteLine of spec.headerNote.split("\n")) {
      lines.push(noteLine.length > 0 ? ` * ${noteLine}` : " *");
    }
  }
  lines.push(" *");
  lines.push(" * Phases:");
  spec.phases.forEach((phase, i) => {
    const desc = (phase as { description?: string }).description;
    if (desc) {
      lines.push(` * ${i + 1}. ${phase.title} - ${desc}`);
    } else {
      lines.push(` * ${i + 1}. ${phase.title}`);
    }
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
  out.push(`    success: ${spec.successExpression ?? "true"},`);
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
    case "conditional-block":
      return renderConditionalBlock(phase);
    case "confirm-loop":
      return renderConfirmLoop(phase);
  }
}

function renderSequential(phase: SequentialPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  const decl = phase.mutable ? "let" : "const";
  lines.push(`${decl} ${phase.resultVar} = await ctx.task(${phase.taskRef}, ${renderArgs(phase.args)});`);
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
  const feedbackVar = `${phase.resultVar}LastFeedback`;
  const runTaskOn = phase.runTaskOn ?? "every-iteration";
  const initial = phase.initialValue ?? "null";

  // For 'retry-only' the var was usually populated by a prior phase — but we
  // still emit `let ... = initialValue` here so the loop is self-contained
  // and the caller doesn't need to know whether to use let/const externally.
  // When the resultVar matches a prior var the caller should set `mutable` on
  // that prior phase and either skip the redeclaration here or rename. We
  // assume distinct vars; for the bug-report Phase 5 case the spec uses a
  // fresh resultVar (e.g. `currentIssueComposition`).
  lines.push(`let ${phase.resultVar} = ${initial};`);
  lines.push(`let ${feedbackVar} = null;`);
  lines.push(`for (let attempt = 0; attempt < ${phase.maxAttempts}; attempt++) {`);

  if (runTaskOn === "retry-only") {
    lines.push(`  if (${feedbackVar}) {`);
    lines.push(`    ${phase.resultVar} = await ctx.task(${phase.taskRef}, {`);
    for (const [k, v] of Object.entries(phase.args)) {
      lines.push(`      ${k}: ${v},`);
    }
    lines.push(`      feedback: ${feedbackVar},`);
    lines.push(`      attempt: attempt + 1`);
    lines.push(`    });`);
    lines.push(`  }`);
  } else {
    lines.push(`  ${phase.resultVar} = await ctx.task(${phase.taskRef}, {`);
    for (const [k, v] of Object.entries(phase.args)) {
      lines.push(`    ${k}: ${v},`);
    }
    lines.push(`    feedback: ${feedbackVar},`);
    lines.push(`    attempt: attempt + 1`);
    lines.push(`  });`);
  }

  // Breakpoint inside the retry loop. Matches bugfix/workflow.js exactly:
  // previousFeedback wires the last "request changes" message into the gate,
  // and `attempt` is omitted on the first iteration.
  const bpLines: string[] = ["{"];
  bpLines.push(`    question: ${renderQuestion(phase.question)},`);
  bpLines.push(`    previousFeedback: ${feedbackVar} || undefined,`);
  bpLines.push(`    attempt: attempt > 0 ? attempt + 1 : undefined,`);
  bpLines.push(`    title: ${jsString(phase.bpTitle)},`);
  if (phase.options && phase.options.length > 0) {
    bpLines.push(`    options: [${phase.options.map((o) => jsString(o)).join(", ")}],`);
  }
  if (phase.expert) bpLines.push(`    expert: ${jsString(phase.expert)},`);
  if (phase.tags && phase.tags.length > 0) {
    bpLines.push(`    tags: [${phase.tags.map((t) => jsString(t)).join(", ")}],`);
  }
  bpLines.push(`    context: { runId: ctx.runId }`);
  bpLines.push(`  }`);
  lines.push(`  const approval = await ctx.breakpoint(${bpLines.join("\n  ")});`);

  lines.push(`  if (approval.approved) break;`);
  lines.push(`  ${feedbackVar} = approval.response || approval.feedback || 'Changes requested';`);
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

function renderConditionalBlock(phase: ConditionalBlockPhase): string {
  const body = indentBlock(renderPhase(phase.body), 2);
  return `if (${phase.condition}) {\n${body}\n}`;
}

function renderConfirmLoop(phase: ConfirmLoopPhase): string {
  const lines: string[] = [];
  if (phase.logMessage) lines.push(`ctx.log('info', ${jsString(phase.logMessage)});`);
  lines.push(`let ${phase.feedbackVar} = null;`);
  lines.push(`for (let attempt = 0; attempt < ${phase.maxAttempts}; attempt++) {`);
  const bpLines: string[] = ["{"];
  bpLines.push(`    question: ${renderQuestion(phase.question)},`);
  bpLines.push(`    previousFeedback: ${phase.feedbackVar} || undefined,`);
  bpLines.push(`    attempt: attempt > 0 ? attempt + 1 : undefined,`);
  bpLines.push(`    title: ${jsString(phase.bpTitle)},`);
  if (phase.options && phase.options.length > 0) {
    bpLines.push(`    options: [${phase.options.map((o) => jsString(o)).join(", ")}],`);
  }
  if (phase.expert) bpLines.push(`    expert: ${jsString(phase.expert)},`);
  if (phase.tags && phase.tags.length > 0) {
    bpLines.push(`    tags: [${phase.tags.map((t) => jsString(t)).join(", ")}],`);
  }
  bpLines.push(`    context: { runId: ctx.runId }`);
  bpLines.push(`  }`);
  lines.push(`  const approval = await ctx.breakpoint(${bpLines.join("\n  ")});`);
  lines.push(`  if (approval.approved) break;`);
  lines.push(`  ${phase.feedbackVar} = approval.response || approval.feedback || 'Changes requested';`);
  lines.push(`}`);
  return lines.join("\n");
}

function renderBreakpointBody(
  question: BreakpointQuestion,
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

function renderQuestion(q: BreakpointQuestion): string {
  // Function-call form — emit the JS expression verbatim. The function
  // must be available in scope (typically via WorkflowSpec.extraImports).
  if (typeof q === "object" && q !== null && "call" in q) {
    return q.call;
  }
  if (typeof q !== "string") return "''";
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
  return (
    "'" +
    s
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029") +
    "'"
  );
}
