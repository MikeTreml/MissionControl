/**
 * @process M-maintenance-forever/missioncontrol-forever-improver
 * @description Continuous Mission Control improvement loop: read plans, pick one bounded task, implement, validate, assess usefulness/layout/orchestration UX, commit, sleep, repeat.
 * @inputs { repoPath: string, docsPath: string, loopMinutes?: number, maxPolishPasses?: number }
 * @outputs { never completes; each loop writes docs/FOREVER-RUN-LOG.md updates and may commit one bounded change }
 *
 * Structure: 8 phases per loop
 *   Phase 1: Scan docs + repo state
 *   Phase 2: Select exactly one bounded task
 *   Phase 3: Implement the selected task
 *   Phase 4: Run normalized validation commands
 *   Phase 5: Assess usefulness, layout, and orchestration UX
 *   Phase 6: Apply at most one bounded polish pass if needed
 *   Phase 7: Record the loop result and commit when ready
 *   Phase 8: Sleep until the next loop window and repeat forever
 *
 * Priorities:
 *   1. unfinished or broken feature-plan item
 *   2. layout/usability issue affecting usefulness
 *   3. orchestration UX improvement
 *   4. test/build/typecheck failure
 *   5. code-quality improvement directly supporting planned work
 *
 * Validation policy:
 *   Allowed commands: npm run typecheck, npm run smoke, npm run build,
 *   npm run verify-ui, npm run doctor.
 *   If doctor is selected, it replaces narrower validation commands.
 *
 * Commit policy:
 *   One commit per successful loop using <type>(mc): <summary> format.
 *   If commitReady is false or the loop fails, record the outcome and continue later.
 *
 * Notes:
 * - Uses real babysitter tasks via defineTask(...), not direct ctx.task("slug").
 * - Uses shell only for existing repo commands and git operations.
 * - Never completes; always sleeps and continues.
 */
import { defineTask } from "@a5c-ai/babysitter-sdk";

const DEFAULT_LOOP_MINUTES = 30;
const DEFAULT_MAX_POLISH_PASSES = 1;
const ALLOWED_VALIDATION_COMMANDS = new Set([
  "npm run typecheck",
  "npm run smoke",
  "npm run build",
  "npm run verify-ui",
  "npm run doctor",
]);

const scanContextTask = defineTask("mc-forever-scan-context", (args, taskCtx) => ({
  kind: "agent",
  title: `Scan docs and repo state for ${args.repoPath}`,
  execution: {
    harness: "pi",
    model: "claude-sonnet-4",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Mission Control repo analyst",
      task: "Read the project plans, inspect the repository state, and summarize the best areas to focus on next.",
      context: {
        repoPath: args.repoPath,
        docsPath: args.docsPath,
        loopNumber: args.loopNumber,
        requiredDocs: args.requiredDocs,
      },
      instructions: [
        "Inspect the repo status and key documentation first.",
        "Read HANDOFF, FEATURE-PLANS, FEATURE-PLANS-REVIEW, IDEAS-WORTH-BORROWING, and WORKFLOW-EXECUTION.",
        "Identify unfinished or high-value items.",
        "Call out layout/usability, feature usefulness, and orchestration UX opportunities.",
        "Return concise structured JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["repoState", "candidateAreas", "notes"],
      properties: {
        repoState: { type: "string" },
        candidateAreas: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } },
        blockers: { type: "array", items: { type: "string" } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const selectLoopTask = defineTask("mc-forever-select-loop-task", (args, taskCtx) => ({
  kind: "agent",
  title: `Select one bounded task for loop ${args.loopNumber}`,
  execution: {
    harness: "pi",
    model: "claude-opus-4-6",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Autonomous maintenance planner",
      task: "Choose exactly one bounded Mission Control improvement for this loop.",
      context: {
        repoPath: args.repoPath,
        docsPath: args.docsPath,
        loopNumber: args.loopNumber,
        scan: args.scan,
        priorities: [
          "unfinished or broken feature-plan item",
          "layout/usability issue affecting usefulness",
          "orchestration UX improvement",
          "test/build/typecheck failure",
          "code-quality improvement directly supporting planned work",
        ],
        validationOptions: [...ALLOWED_VALIDATION_COMMANDS],
      },
      instructions: [
        "Pick exactly one bounded task.",
        "Prefer work that is high-value, testable, and likely completable in one loop.",
        "Avoid giant rewrites or speculative architecture.",
        "Choose validation commands only from the allowed list.",
        "Return JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: [
        "selectedTask",
        "whyNow",
        "successCriteria",
        "validationCommands",
        "commitType",
        "commitSummary",
      ],
      properties: {
        selectedTask: { type: "string" },
        whyNow: { type: "string" },
        successCriteria: { type: "array", items: { type: "string" } },
        validationCommands: { type: "array", items: { type: "string" } },
        commitType: { type: "string" },
        commitSummary: { type: "string" },
        focusFiles: { type: "array", items: { type: "string" } },
        skipLoop: { type: "boolean" },
        skipReason: { type: "string" },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const implementTask = defineTask("mc-forever-implement", (args, taskCtx) => ({
  kind: "agent",
  title: `Implement: ${args.selectedTask}`,
  execution: {
    harness: "pi",
    model: "gpt-5-codex",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Mission Control implementation agent",
      task: "Implement the selected bounded improvement in the Mission Control repo.",
      context: {
        repoPath: args.repoPath,
        docsPath: args.docsPath,
        selectedTask: args.selectedTask,
        whyNow: args.whyNow,
        successCriteria: args.successCriteria,
        focusFiles: args.focusFiles,
        scan: args.scan,
      },
      instructions: [
        "Stay tightly within scope.",
        "Prefer existing Mission Control conventions and architecture.",
        "If the task touches UI, make the information more useful and the layout more coherent.",
        "If the task touches orchestration, favor Babysitter-compatible patterns and explicit state handling.",
        "Do not invent unrelated cleanup.",
        "Return JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["summary", "filesTouched"],
      properties: {
        summary: { type: "string" },
        filesTouched: { type: "array", items: { type: "string" } },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const assessTask = defineTask("mc-forever-assess", (args, taskCtx) => ({
  kind: "agent",
  title: `Assess usefulness, layout, and orchestration for: ${args.selectedTask}`,
  execution: {
    harness: "pi",
    model: "claude-opus-4-6",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Mission Control product and architecture reviewer",
      task: "Review the change for usefulness, layout quality, and orchestration UX.",
      context: {
        repoPath: args.repoPath,
        selectedTask: args.selectedTask,
        implementResult: args.implementResult,
        validationCommands: args.validationCommands,
        extraFocus: [
          "Does the feature or view now produce more useful operator information?",
          "Is the layout clearer and easier to use?",
          "Would per-task terminal access or orchestrator interaction be improved?",
          "Are there Babysitter ideas worth reusing here?",
        ],
      },
      instructions: [
        "Review only the current bounded change and its nearby implications.",
        "Identify must-fix issues vs nice-to-have follow-ups.",
        "Recommend a single bounded polish pass only if it materially improves the loop result.",
        "Return JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["summary", "mustFixItems", "followUps", "applyPolishNow", "commitReady"],
      properties: {
        summary: { type: "string" },
        mustFixItems: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
        babysitterReuseIdeas: { type: "array", items: { type: "string" } },
        applyPolishNow: { type: "boolean" },
        commitReady: { type: "boolean" },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const polishTask = defineTask("mc-forever-polish", (args, taskCtx) => ({
  kind: "agent",
  title: `Apply one bounded polish pass for: ${args.selectedTask}`,
  execution: {
    harness: "pi",
    model: "qwen2.5-coder",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Mission Control surgical fixer",
      task: "Apply one bounded polish/fix pass based on review findings.",
      context: {
        repoPath: args.repoPath,
        selectedTask: args.selectedTask,
        implementResult: args.implementResult,
        assessment: args.assessment,
      },
      instructions: [
        "Fix only must-fix items that are small and directly related to the current task.",
        "Do not broaden scope into a new feature.",
        "Prefer polish, cleanup, or targeted correctness fixes.",
        "Return JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string" },
        filesTouched: { type: "array", items: { type: "string" } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const recordLoopTask = defineTask("mc-forever-record-loop", (args, taskCtx) => ({
  kind: "agent",
  title: `Record forever-loop summary for iteration ${args.loopNumber}`,
  execution: {
    harness: "pi",
    model: "claude-sonnet-4",
  },
  agent: {
    name: "general-purpose",
    prompt: {
      role: "Mission Control loop historian",
      task: "Write or update docs/FOREVER-RUN-LOG.md with a concise record of this loop.",
      context: {
        repoPath: args.repoPath,
        docsPath: args.docsPath,
        loopNumber: args.loopNumber,
        selectedTask: args.selectedTask,
        implementResult: args.implementResult,
        assessment: args.assessment,
        validationCommands: args.validationCommands,
        commitMessage: args.commitMessage,
        status: args.status,
      },
      instructions: [
        "Update docs/FOREVER-RUN-LOG.md in the repo.",
        "Append one concise timestamped entry.",
        "Include selected task, validations, commit message, next candidates, and notes.",
        "Do not rewrite the whole document unnecessarily.",
        "Return JSON only.",
      ],
      outputFormat: "JSON",
    },
    outputSchema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string" },
        updatedFiles: { type: "array", items: { type: "string" } },
      },
    },
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
  },
}));

const shellCommandTask = defineTask("mc-forever-shell-command", (args, taskCtx) => ({
  kind: "shell",
  title: args.title,
  shell: {
    command: args.cwd
      ? `cd ${shellQuoteSingle(args.cwd)} && ${args.command}`
      : args.command,
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/output.json`,
    stdoutPath: `tasks/${taskCtx.effectId}/stdout.log`,
    stderrPath: `tasks/${taskCtx.effectId}/stderr.log`,
  },
}));

function nextWakeIso(loopMinutes = DEFAULT_LOOP_MINUTES) {
  const now = new Date();
  const targetEpochMs = now.getTime() + loopMinutes * 60 * 1000;
  return {
    iso: new Date(targetEpochMs).toISOString(),
    targetEpochMs,
  };
}

function normalizeValidationCommands(requested) {
  const picked = Array.isArray(requested)
    ? requested.filter((cmd) => typeof cmd === "string" && ALLOWED_VALIDATION_COMMANDS.has(cmd))
    : [];

  if (picked.includes("npm run doctor")) {
    return ["npm run doctor"];
  }
  if (picked.length > 0) {
    return Array.from(new Set(picked));
  }
  return ["npm run typecheck", "npm run smoke", "npm run build"];
}

function normalizeCommitType(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["feat", "fix", "refactor", "docs", "chore"].includes(raw)) {
    return raw;
  }
  return "chore";
}

function normalizeCommitSummary(value, defaultSummary) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > 0 ? raw : defaultSummary;
}

function shellQuoteSingle(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function buildCommitMessage(selection) {
  const type = normalizeCommitType(selection.commitType);
  const summary = normalizeCommitSummary(selection.commitSummary, selection.selectedTask || "forever loop update");
  return `${type}(mc): ${summary}`;
}

async function runValidationSuite(ctx, repoPath, commands, loopNumber) {
  for (const command of commands) {
    await ctx.task(shellCommandTask, {
      title: `[loop ${loopNumber}] Validate: ${command}`,
      command,
      cwd: repoPath,
    });
  }
}

export async function process(inputs, ctx) {
  const repoPath = inputs.repoPath;
  const docsPath = inputs.docsPath;
  const loopMinutes = Number.isFinite(inputs.loopMinutes) ? inputs.loopMinutes : DEFAULT_LOOP_MINUTES;
  const maxPolishPasses = Number.isFinite(inputs.maxPolishPasses)
    ? inputs.maxPolishPasses
    : DEFAULT_MAX_POLISH_PASSES;

  if (typeof repoPath !== "string" || !repoPath.length) {
    throw new Error("missioncontrol forever process requires inputs.repoPath");
  }
  if (typeof docsPath !== "string" || !docsPath.length) {
    throw new Error("missioncontrol forever process requires inputs.docsPath");
  }

  let loopNumber = 0;

  while (true) {
    loopNumber += 1;
    const requiredDocs = [
      "HANDOFF.md",
      "FEATURE-PLANS.md",
      "FEATURE-PLANS-REVIEW.md",
      "IDEAS-WORTH-BORROWING.md",
      "WORKFLOW-EXECUTION.md",
    ];

    let selectedTask = "";
    let commitMessage = "";
    let validationCommands = [];
    let implementResult = null;
    let assessment = null;

    try {
      const scan = await ctx.task(scanContextTask, {
        repoPath,
        docsPath,
        loopNumber,
        requiredDocs,
      });

      const selection = await ctx.task(selectLoopTask, {
        repoPath,
        docsPath,
        loopNumber,
        scan,
      });

      if (selection?.skipLoop) {
        await ctx.task(recordLoopTask, {
          repoPath,
          docsPath,
          loopNumber,
          selectedTask: selection.skipReason || "No bounded task selected",
          implementResult: { summary: "Skipped loop", filesTouched: [] },
          assessment: { summary: selection.skipReason || "Planner chose to skip", mustFixItems: [], followUps: [] },
          validationCommands: [],
          commitMessage: "",
          status: "skipped",
        });

        const next = nextWakeIso(loopMinutes);
        await ctx.sleepUntil(next.iso, { label: `missioncontrol-forever-sleep-${loopNumber}` });
        continue;
      }

      selectedTask = selection.selectedTask;
      commitMessage = buildCommitMessage(selection);
      validationCommands = normalizeValidationCommands(selection.validationCommands);

      implementResult = await ctx.task(implementTask, {
        repoPath,
        docsPath,
        selectedTask,
        whyNow: selection.whyNow,
        successCriteria: selection.successCriteria,
        focusFiles: selection.focusFiles || [],
        scan,
      });

      await runValidationSuite(ctx, repoPath, validationCommands, loopNumber);

      assessment = await ctx.task(assessTask, {
        repoPath,
        selectedTask,
        implementResult,
        validationCommands,
      });

      let polishPasses = 0;
      while (assessment?.applyPolishNow && polishPasses < maxPolishPasses) {
        polishPasses += 1;
        await ctx.task(polishTask, {
          repoPath,
          selectedTask,
          implementResult,
          assessment,
        });
        await runValidationSuite(ctx, repoPath, validationCommands, `${loopNumber}.${polishPasses}`);
        assessment = await ctx.task(assessTask, {
          repoPath,
          selectedTask,
          implementResult,
          validationCommands,
        });
      }

      await ctx.task(recordLoopTask, {
        repoPath,
        docsPath,
        loopNumber,
        selectedTask,
        implementResult,
        assessment,
        validationCommands,
        commitMessage,
        status: assessment?.commitReady ? "ready-to-commit" : "reviewed",
      });

      if (assessment?.commitReady !== false) {
        await ctx.task(shellCommandTask, {
          title: `[loop ${loopNumber}] Commit changes`,
          cwd: repoPath,
          command: [
            "git add -A",
            "if ! git diff --cached --quiet; then",
            `  git commit -m ${shellQuoteSingle(commitMessage)}`,
            "else",
            '  echo "No staged changes to commit"',
            "fi",
          ].join("; "),
        });
      }
    } catch (error) {
      const errorSummary = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      try {
        await ctx.task(recordLoopTask, {
          repoPath,
          docsPath,
          loopNumber,
          selectedTask: selectedTask || "loop failed before selection completed",
          implementResult: implementResult || { summary: "Implementation incomplete", filesTouched: [] },
          assessment: assessment || {
            summary: errorSummary,
            mustFixItems: [errorSummary],
            followUps: ["Re-enter this area in a later loop after investigating the failure."],
          },
          validationCommands,
          commitMessage,
          status: "failed",
        });
      } catch {
        // Ignore secondary logging failures so the forever loop keeps living.
      }
    }

    const next = nextWakeIso(loopMinutes);
    await ctx.sleepUntil(next.iso, { label: `missioncontrol-forever-sleep-${loopNumber}` });
  }
}

export default process;
