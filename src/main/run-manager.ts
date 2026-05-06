/**
 * RunManager — owns task run state transitions.
 *
 * Single tasks: Start opens one pi session driven by /babysit, agent_end
 * flips the task to idle. Pause/Resume are MC-level only (they don't
 * touch the pi session) — pi has no first-class pause primitive.
 *
 * Campaign tasks (`task.kind === "campaign"`): Start kicks off the
 * iteration. Each item gets its own pi session — when one finishes the
 * next pending item starts automatically. Task.runState stays "running"
 * across the whole campaign; flips to "idle" only when every item is
 * done OR the user stops. Stop marks any "running" item as "failed".
 *
 * Curated path (Phase 5, updated 2026-05-06): when a task has a
 * libraryWorkflow.diskPath in its run config, RunManager stages the run
 * via `babysitter run:create --entry <path>#process` and then drives
 * `run:iterate` in MC itself, dispatching each pending agent effect to a
 * headless `claude -p` call and posting results via `task:post`. See
 * `startCuratedWorkflow` + `driveCuratedRun`. The previous
 * `harness:create-run --process` argv was empirically broken in SDK
 * 0.0.187 (Phase-2 path-undefined crash when Phase 1 is skipped).
 */
import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import type { TaskStore } from "./store.ts";
import type { ProjectStore } from "./project-store.ts";
import type { PiSessionManager } from "./pi-session-manager.ts";
import type { SettingsStore } from "./settings-store.ts";
import { JournalReader } from "./journal-reader.ts";
import { renderPromptFile } from "./render-prompt.ts";
import { writeLatestRunMetricsArtifact } from "./run-cost-tracker.ts";
import { prepareBabysitterRuntime } from "./babysitter-runtime-prep.ts";
import type { CampaignItem, MCSettings, RunState, Task } from "../shared/models.ts";

/**
 * Resolve the path to the babysitter SDK CLI (`bin/babysitter`).
 * Goes through Node's resolver so it works in dev and packaged builds.
 */
function resolveBabysitterCliPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@a5c-ai/babysitter-sdk/package.json");
    return path.join(path.dirname(pkgPath), "dist/cli/main.js");
  } catch {
    return null;
  }
}

export type StopReason = "user" | "completed" | "failed";

// Shape of `babysitter run:iterate --json` output (relevant subset).
interface PendingAction {
  effectId: string;
  invocationKey?: string;
  kind: string;
  label?: string;
  taskDef: {
    kind?: string;
    title?: string;
    agent?: {
      name?: string;
      prompt?: {
        role?: string;
        task?: string;
        context?: unknown;
        instructions?: string[];
        outputFormat?: string;
      };
      outputSchema?: unknown;
    };
    shell?: {
      command?: string;
      cwd?: string;
    };
    execution?: { model?: string; harness?: string };
  };
}

interface IterateResult {
  iteration: number;
  status: "executed" | "waiting" | "completed" | "failed" | "none";
  action?: string;
  reason?: string;
  nextActions?: PendingAction[];
  error?: string;
}

interface ParallelStepState {
  stepId: string;
  cycle: number;
  agents: string[];
  expected: number;
  completed: number;
  failed: number;
  seen: Set<string>;
  ended: boolean;
  stopOnFirstFailure: boolean;
}

export class RunManager {
  private readonly tasks: TaskStore;
  private readonly projects: ProjectStore | null;
  private readonly pi: PiSessionManager | null;
  private readonly settings: SettingsStore | null;
  private readonly libraryRoot: string | null;
  /** Active journal readers per task. Stopped on completeRun. */
  private readonly journalReaders = new Map<string, JournalReader>();

  constructor(
    tasks: TaskStore,
    pi?: PiSessionManager | null,
    _legacyAgents?: unknown,
    projects?: ProjectStore | null,
    settings?: SettingsStore | null,
    libraryRoot?: string | null,
  ) {
    this.tasks = tasks;
    this.pi = pi ?? null;
    this.projects = projects ?? null;
    this.settings = settings ?? null;
    this.libraryRoot = libraryRoot ?? null;
  }

  /**
   * Start streaming the SDK journal at <runPath>/journal/*.jsonl into
   * the task's events.jsonl. Idempotent per task — calling twice with
   * the same task replaces the prior reader. Stops automatically when
   * `stopJournalReader(taskId)` is called from completeRun.
   */
  private startJournalReader(taskId: string, runPath: string): void {
    this.stopJournalReader(taskId);
    const reader = new JournalReader(runPath, (event) => {
      // Forward every journal event to the task journal as
      // `bs:journal:<lowercased-type>` so RightBar can dispatch on it.
      const type = `bs:journal:${event.type.toLowerCase()}`;
      void this.tasks.appendEvent(taskId, {
        type,
        ...(event.seq !== undefined ? { seq: event.seq } : {}),
        ...(event.ulid ? { ulid: event.ulid } : {}),
        ...(event.recordedAt ? { recordedAt: event.recordedAt } : {}),
        ...(event.data ? { data: event.data } : {}),
      });
    });
    this.journalReaders.set(taskId, reader);
    reader.start();
  }

  private stopJournalReader(taskId: string): void {
    const existing = this.journalReaders.get(taskId);
    if (existing) {
      existing.stop();
      this.journalReaders.delete(taskId);
    }
  }

  /**
   * Latest `<runPath>` MC has detected for this task, derived from
   * `babysitter-run-detected` events in events.jsonl. Returns null when
   * the task hasn't started a curated run yet.
   */
  private async latestRunPath(taskId: string): Promise<string | null> {
    const events = await this.tasks.readEvents(taskId);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i] as unknown as Record<string, unknown>;
      if (ev.type === "babysitter-run-detected" && typeof ev.runPath === "string") {
        return ev.runPath;
      }
    }
    return null;
  }

  /**
   * Run an SDK CLI sub-command and return its stdout as parsed JSON.
   * Throws when the CLI exits non-zero or stdout isn't valid JSON.
   */
  private async runSdkCli(args: string[]): Promise<unknown> {
    const cliPath = resolveBabysitterCliPath();
    if (!cliPath) throw new Error("babysitter SDK not installed");
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c) => { stdout += c.toString(); });
      child.stderr?.on("data", (c) => { stderr += c.toString(); });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`SDK CLI exited ${code}: ${stderr.trim() || stdout.trim()}`));
          return;
        }
        try { resolve(JSON.parse(stdout)); }
        catch (e) { reject(new Error(`SDK CLI returned non-JSON: ${(e as Error).message}\n${stdout.slice(0, 200)}`)); }
      });
    });
  }

  /**
   * Authoritative run state from the SDK's state cache. Returns null
   * when the task has no detected run path (auto-gen tasks before
   * babysitter-pi spins up a run). See docs/SDK-PRIMITIVES.md.
   */
  async runStatus(taskId: string): Promise<unknown | null> {
    const runPath = await this.latestRunPath(taskId);
    if (!runPath) return null;
    return await this.runSdkCli(["run:status", runPath, "--json"]);
  }

  /**
   * Authoritative pending-effects list (breakpoints, sleeps, custom
   * kinds) from the SDK's effect index. Replaces our event-pair walk
   * for cases where MC needs the truth — most importantly the approval
   * card and any future "this run is stuck" detection.
   */
  async listPendingEffects(taskId: string): Promise<unknown | null> {
    const runPath = await this.latestRunPath(taskId);
    if (!runPath) return null;
    return await this.runSdkCli(["task:list", runPath, "--pending", "--json"]);
  }

  /**
   * POST a breakpoint response to a running babysitter session via the
   * SDK CLI: `babysitter task:post <runPath> <effectId> --status ok
   * --value-inline '{"approved":<bool>,"response":"..."}'`. Per the SDK
   * docs, breakpoint REJECTIONS still use `--status ok` (status=error
   * signals task-execution failure, not user rejection).
   */
  async respondBreakpoint(input: {
    taskId: string;
    runPath: string;
    effectId: string;
    approved: boolean;
    response?: string;
    feedback?: string;
  }): Promise<void> {
    const cliPath = resolveBabysitterCliPath();
    if (!cliPath) {
      await this.tasks.appendStatus(input.taskId, "Breakpoint response failed: babysitter SDK not installed");
      throw new Error("babysitter SDK not installed");
    }
    const valueInline = JSON.stringify({
      approved: input.approved,
      ...(input.response ? { response: input.response } : {}),
      ...(input.feedback ? { feedback: input.feedback } : {}),
    });
    const args = [
      cliPath,
      "task:post",
      input.runPath,
      input.effectId,
      "--status", "ok",
      "--value-inline", valueInline,
      "--json",
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr?.on("data", (c) => { stderr += c.toString(); });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`task:post exited ${code}: ${stderr.trim()}`));
      });
    });
    await this.tasks.appendEvent(input.taskId, {
      type: "breakpoint-responded-by-user",
      effectId: input.effectId,
      approved: input.approved,
      ...(input.response ? { response: input.response } : {}),
    });
    await this.tasks.appendStatus(
      input.taskId,
      `Breakpoint ${input.effectId} ${input.approved ? "approved" : "rejected"}${input.response ? `: ${input.response}` : ""}`,
    );
  }

  async start(input: {
    taskId: string;
    agentSlug?: string;
    model?: string;
  }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "idle", "start");

    const queueState = await this.shouldQueueStart(task.id);
    if (queueState.shouldQueue) {
      if (!this.queuedTaskIds.has(task.id)) {
        this.startQueue.push({ ...input });
        this.queuedTaskIds.add(task.id);
      }
      const position = this.startQueue.findIndex((q) => q.taskId === task.id) + 1;
      await this.tasks.appendEvent(task.id, {
        type: "run-queued",
        position,
        cap: queueState.cap,
        running: queueState.running,
      });
      await this.tasks.appendStatus(task.id, `Queued — waiting for open run slot (${queueState.running}/${queueState.cap} running)`);
      return task;
    }
    return this.startNow(task, input);
  }

  private async startNow(
    task: Task,
    input: {
      taskId: string;
      agentSlug?: string;
      model?: string;
    },
  ): Promise<Task> {
    // Per-task active model — held in memory so completeRun can pass it
    // to the next campaign item without the renderer needing to re-send.
    if (input.model) this.activeModel.set(task.id, input.model);

    // Curated library workflow takes precedence over the auto-gen
    // /babysit path. The runConfig sidecar is written by RunWorkflowModal
    // when the user picks a workflow from the library.
    const curatedPath = await this.curatedWorkflowPath(task);
    if (curatedPath) {
      return this.startCuratedWorkflow(task, curatedPath, input);
    }

    if (task.kind === "campaign") {
      return this.startCampaign(task, input);
    }
    return this.startSingle(task, input);
  }

  /**
   * If the task's run config sidecar names a library workflow with a
   * resolvable disk path, return that path. Otherwise null = take the
   * legacy auto-gen path.
   */
  private async curatedWorkflowPath(task: Task): Promise<string | null> {
    const cfg = await this.tasks.readRunConfig(task.id);
    if (!cfg) return null;
    const lw = (cfg as { libraryWorkflow?: { diskPath?: string } }).libraryWorkflow;
    if (!lw?.diskPath) return null;
    if (!existsSync(lw.diskPath)) return null;
    return lw.diskPath;
  }

  /**
   * Spawn `babysitter harness:create-run --process <path>` directly.
   * Phase 1 (auto-gen) is skipped because we supply the workflow.js. The
   * CLI emits JSON lines on stdout (phase markers, errors); we forward
   * them into the task's events.jsonl as `bs:*` events so the live-
   * events bridge picks them up.
   */
  private async startCuratedWorkflow(
    task: Task,
    processPath: string,
    input: { model?: string },
  ): Promise<Task> {
    const cliPath = resolveBabysitterCliPath();
    if (!cliPath) {
      await this.tasks.appendStatus(task.id, "Curated workflow start failed: babysitter SDK not installed");
      return task;
    }

    const cwd = await this.resolveCwd(task);
    const runsDir = path.join(cwd, ".a5c", "runs");
    await fs.mkdir(runsDir, { recursive: true });
    const beforeRuns = await snapshotBabysitterRuns(cwd);

    // Materialize referenced SKILL.md into <cwd>/.a5c/skills/ and (if the
    // workflow uses the legacy singular `skill: { name }` shape) emit a
    // rewritten copy under <cwd>/.a5c/mc-generated/. The SDK's prompt
    // builder only reads `metadata.skills` + .a5c/skills/<name>/SKILL.md,
    // so without this step skills are silently dropped at runtime.
    //
    // Failure policy: fail fast. A prep exception or any unresolved skill
    // aborts the start so an "operational"-looking run can't ship without
    // the SKILL.md context the workflow declared. If the library is
    // missing references the fix is in the library (or skip the workflow);
    // a half-prepped run papers over that and is harder to debug later.
    // // OPEN: surface a per-task "allow degraded run" opt-in if Michael
    // wants to ship workflows known to reference future skills.
    if (!this.libraryRoot) {
      await this.tasks.appendStatus(task.id, "Curated workflow start failed: library root not configured");
      return task;
    }
    let effectiveProcessPath: string;
    try {
      const prep = await prepareBabysitterRuntime({
        workspaceCwd: cwd,
        libraryRoot: this.libraryRoot,
        workflowDiskPath: processPath,
        runId: task.id,
      });
      await this.tasks.appendEvent(task.id, {
        type: "bs:prep",
        rewritten: prep.rewritten,
        materialized: prep.skills.filter((s) => s.status === "materialized").map((s) => s.name),
        missing: prep.missingSkills,
        processPath: prep.generatedWorkflowPath,
      });
      if (prep.missingSkills.length > 0) {
        await this.tasks.appendEvent(task.id, {
          type: "bs:prep-error",
          message: `Unresolved skills: ${prep.missingSkills.join(", ")}`,
          missing: prep.missingSkills,
        });
        await this.tasks.appendStatus(
          task.id,
          `Curated workflow start aborted — workflow references unresolved skills: ${prep.missingSkills.join(", ")}. Add them to library/ or pick another workflow.`,
        );
        return task;
      }
      effectiveProcessPath = prep.generatedWorkflowPath;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.tasks.appendEvent(task.id, { type: "bs:prep-error", message });
      await this.tasks.appendStatus(task.id, `Curated workflow start failed during prep: ${message}`);
      return task;
    }

    // CONFIRMED 2026-05-06: switched from `harness:create-run --process`
    // to `run:create --entry` + MC-driven `run:iterate` loop.
    // `harness:create-run` Phase 2 reads a path Phase 1 normally produces;
    // when Phase 1 is `status: "skipped"` (because we supply a curated
    // workflow file directly) that path is undefined and Phase 2 crashes
    // with `The "path" argument must be of type string. Received undefined`.
    // The README and ORCHESTRATION_GUIDE.md both document `run:create`
    // + skill-driven `run:iterate` as the supported curated path.
    void beforeRuns; // existing parameter retained for future "stale-run sweep" — currently unused

    // Build inputs.json from the task's RUN_CONFIG when present, else a
    // minimal stub. // OPEN: surface a per-workflow "Inputs" UI so this
    // isn't a single-field placeholder.
    const cfg = await this.tasks.readRunConfig(task.id);
    const lwInputs = (cfg as { libraryWorkflow?: { inputs?: unknown } } | null)
      ?.libraryWorkflow?.inputs;
    const inputsObj =
      lwInputs && typeof lwInputs === "object" ? lwInputs : { projectName: task.title };
    const inputsPath = path.join(runsDir, `.mc-inputs-${task.id}.json`);
    await fs.writeFile(inputsPath, JSON.stringify(inputsObj, null, 2), "utf8");

    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      mode: "curated",
      processPath,
      cwd,
      // CONFIRMED 2026-05-06: emit the active model on run-started so the
      // Task Detail hero can render a "Model: <id>" chip via event replay
      // without a new IPC channel. Falls back to the per-task active-model
      // map (set just above in startNow) and finally null when neither is
      // present (pi default).
      model: input.model ?? this.activeModel.get(task.id) ?? null,
    });
    await this.tasks.appendStatus(
      task.id,
      `Started — curated workflow ${path.basename(path.dirname(processPath))}`,
    );

    // Phase 1: stage the run via `run:create` (does NOT execute).
    let created: { runId: string; runDir: string };
    try {
      created = (await this.runSdkCli([
        "run:create",
        "--process-id", `mc/curated/${path.basename(processPath, ".js")}`,
        "--entry",      `${effectiveProcessPath}#process`,
        "--inputs",     inputsPath,
        "--prompt",     task.title,
        "--run-id",     task.id,
        "--runs-dir",   runsDir,
        "--json",
      ])) as { runId: string; runDir: string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.tasks.appendEvent(task.id, { type: "bs:error", message: msg });
      await this.tasks.appendStatus(task.id, `Curated workflow start failed at run:create: ${msg}`);
      return task;
    }

    // Reuse the existing detection event shape so RightBar / live-events
    // pick the run up the same way the legacy spawn path did.
    await this.tasks.appendEvent(task.id, {
      type: "babysitter-run-detected",
      babysitterRunId: created.runId,
      runPath: created.runDir,
    });
    this.startJournalReader(task.id, created.runDir);

    const next: Task = { ...task, runState: "running" };
    await this.tasks.saveTask(next);

    // Phase 2: drive `run:iterate` to completion. Fire-and-forget — the
    // driver calls completeRun(reason) when it finishes or errors.
    void this.driveCuratedRun(task.id, created.runDir, cwd, input.model);

    return next;
  }

  /**
   * Drive a curated run by repeatedly calling `run:iterate`, dispatching
   * each pending agent task to a one-shot harness invocation, posting the
   * result via `task:post`, and looping until the SDK reports a terminal
   * status. Replaces the in-CLI loop that `harness:create-run` was supposed
   * to provide (broken in SDK 0.0.187 when --process is supplied).
   *
   * Per-task model selection is honored via `taskDef.execution.model`.
   * // PROPOSED 2026-05-06: extend dispatch to switch on
   * `taskDef.execution.harness` so codex / oh-my-pi can take per-task work.
   * For now everything routes through `claude -p` headless.
   */
  private async driveCuratedRun(
    taskId: string,
    runDir: string,
    cwd: string,
    runLevelModel: string | undefined,
  ): Promise<void> {
    const MAX_ITER = 100;
    let iteration = 0;
    let stopReason: StopReason = "user";

    try {
      while (iteration < MAX_ITER) {
        iteration += 1;

        const result = (await this.runSdkCli([
          "run:iterate", runDir, "--json", "--iteration", String(iteration),
        ])) as IterateResult;

        await this.tasks.appendEvent(taskId, {
          type: "bs:phase",
          phase: "iterate",
          iteration,
          status: result.status,
          ...(result.action ? { action: result.action } : {}),
          ...(result.reason ? { reason: result.reason } : {}),
        });

        if (result.status === "completed") { stopReason = "completed"; break; }
        if (result.status === "failed")    { stopReason = "failed";    break; }
        if (result.status === "waiting") {
          // Soft pause — leave runState=running so the user sees it's
          // blocked. Anything that needs a response (breakpoint UI, sleep
          // timer) lives outside this loop. // PROPOSED: route
          // `breakpoint-waiting` through respondBreakpoint once the UI
          // surface for in-flight curated runs is wired.
          await this.tasks.appendStatus(
            taskId,
            `Run waiting: ${result.reason ?? "unknown"}`,
          );
          return;
        }

        const pending = result.nextActions ?? [];
        if (pending.length === 0) continue;

        for (const action of pending) {
          if (action.kind === "agent") {
            const value = await this.dispatchCuratedAgentTask(action, cwd, runLevelModel);
            await this.runSdkCli([
              "task:post", runDir, action.effectId,
              "--status", "ok",
              "--value-inline", JSON.stringify(value),
              "--json",
            ]);
            await this.tasks.appendEvent(taskId, {
              type: "bs:effect-resolved",
              effectId: action.effectId,
              ...(action.label ? { label: action.label } : {}),
            });
          } else if (action.kind === "shell") {
            // Shell effects: spawn the declared command, capture stdout/stderr/
            // exitCode, post the result. We always post --status ok with the
            // captured shape — workflows decide what exitCode means (a TS gate
            // expects exitCode===0, but other shells may intentionally tolerate
            // non-zero). // CONFIRMED 2026-05-06: design choice for the
            // continue-mission-control-with-quality flow.
            const result = await this.dispatchCuratedShellTask(action, cwd);
            await this.runSdkCli([
              "task:post", runDir, action.effectId,
              "--status", "ok",
              "--value-inline", JSON.stringify(result),
              "--json",
            ]);
            await this.tasks.appendEvent(taskId, {
              type: "bs:effect-resolved",
              effectId: action.effectId,
              shellExitCode: result.exitCode,
              ...(action.label ? { label: action.label } : {}),
            });
          } else {
            // breakpoint / sleep / custom kinds remain out of scope for this
            // driver. Mark errored so the run doesn't silently hang.
            // // OPEN: route breakpoint-waiting through respondBreakpoint when
            // the curated-run UI surface is ready.
            await this.tasks.appendEvent(taskId, {
              type: "bs:error",
              message: `Effect kind '${action.kind}' not yet handled by RunManager driver`,
              effectId: action.effectId,
            });
            await this.runSdkCli([
              "task:post", runDir, action.effectId,
              "--status", "error",
              "--error-inline", JSON.stringify({
                message: `Effect kind '${action.kind}' not handled by MC RunManager driver`,
              }),
              "--json",
            ]).catch(() => undefined);
            stopReason = "failed";
            return;
          }
        }
      }
      if (iteration >= MAX_ITER) {
        stopReason = "failed";
        await this.tasks.appendEvent(taskId, {
          type: "bs:error",
          message: `Curated run hit max iterations (${MAX_ITER}) — aborting`,
        });
      }
    } catch (e) {
      stopReason = "failed";
      await this.tasks.appendEvent(taskId, {
        type: "bs:error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await this.completeRun(taskId, stopReason);
    }
  }

  /**
   * Execute a single pending agent task by invoking `claude` headless and
   * parsing its JSON envelope. Per-task model (taskDef.execution.model)
   * overrides the run-level default. // PROPOSED: switch on
   * `execution.harness` to route codex / oh-my-pi tasks to their CLIs.
   */
  /**
   * Execute a single pending shell task by spawning its declared command and
   * capturing stdout/stderr/exitCode. Returns a structured result the workflow
   * can read in subsequent agent tasks (e.g., a typecheck gate that consumes
   * `result.exitCode`). The orchestrator never throws on non-zero exit — the
   * result is posted with `--status ok` so the workflow controls what failure
   * means; the orchestrator only fails on actual spawn errors.
   */
  private async dispatchCuratedShellTask(
    action: PendingAction,
    fallbackCwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const shell = action.taskDef?.shell;
    const command = shell?.command;
    if (!command || typeof command !== "string") {
      throw new Error(`Shell task ${action.effectId} has no shell.command`);
    }
    const cwd = typeof shell?.cwd === "string" && shell.cwd.trim().length > 0
      ? shell.cwd
      : fallbackCwd;

    return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      // shell: true so workflows can use `npm run X`, chained commands, etc.
      // The command string is sourced from a curated workflow file checked into
      // the project, not user input — shell-injection risk is the same as for
      // any package.json script.
      const child = spawn(command, {
        cwd,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c: Buffer) => { stdout += c.toString(); });
      child.stderr?.on("data", (c: Buffer) => { stderr += c.toString(); });
      child.on("error", reject);
      child.on("exit", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }

  private async dispatchCuratedAgentTask(
    action: PendingAction,
    cwd: string,
    runLevelModel: string | undefined,
  ): Promise<unknown> {
    const taskDef = action.taskDef;
    const agent = taskDef?.agent;
    if (!agent) {
      throw new Error(`Agent task ${action.effectId} has no agent definition`);
    }
    const model = taskDef.execution?.model ?? runLevelModel;
    const promptObj = agent.prompt ?? {};

    const promptText = [
      `Role: ${promptObj.role ?? "Assistant"}.`,
      `Task: ${promptObj.task ?? "Execute the requested work."}`,
      promptObj.context !== undefined
        ? `Context:\n${JSON.stringify(promptObj.context, null, 2)}`
        : "",
      Array.isArray(promptObj.instructions) && promptObj.instructions.length > 0
        ? `Instructions:\n${(promptObj.instructions as string[])
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n")}`
        : "",
      `Output format: ${promptObj.outputFormat ?? "JSON"}.`,
      "Return ONLY the JSON object that satisfies the schema. No prose, no fences.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const args = ["-p", promptText, "--output-format", "json"];
    if (model) args.push("--model", model);

    return await new Promise<unknown>((resolve, reject) => {
      const child = spawn("claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c) => { stdout += c.toString(); });
      child.stderr?.on("data", (c) => { stderr += c.toString(); });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(
            `claude exited ${code} for effect ${action.effectId}: ${stderr.trim() || stdout.slice(0, 200)}`,
          ));
          return;
        }
        // Claude headless emits a JSON envelope { result: "<agent stdout>" }.
        // Try to parse the result as JSON; otherwise wrap it.
        try {
          const envelope = JSON.parse(stdout) as { result?: string };
          if (typeof envelope.result === "string") {
            try { resolve(JSON.parse(envelope.result)); return; }
            catch { resolve({ raw: envelope.result }); return; }
          }
          resolve(envelope);
        } catch {
          resolve({ raw: stdout });
        }
      });
    });
  }

  /** Single-task path: one /babysit run, agent_end flips task to idle. */
  private async startSingle(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    const chosenAgent = input.agentSlug ?? null;
    if (this.pi) {
      const cwd = await this.resolveCwd(task);
      const mode = task.babysitterMode ?? "plan";
      await this.tasks.writePromptFile(task.id, renderPromptFile(task, chosenAgent));
      const beforeRuns = await snapshotBabysitterRuns(cwd);
      await this.pi.start(task.id, {
        prompt: buildBabysitPrompt(task, chosenAgent, mode),
        cwd,
        ...(input.model ? { model: input.model } : {}),
      });
      void this.detectBabysitterRun(task.id, cwd, beforeRuns);
    }
    const next: Task = {
      ...task,
      runState: "running",
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      ...(chosenAgent ? { agentSlug: chosenAgent } : {}),
      // CONFIRMED 2026-05-06: emit the active model on run-started so the
      // Task Detail hero can render a "Model: <id>" chip via event replay.
      model: input.model ?? this.activeModel.get(task.id) ?? null,
    });
    await this.tasks.appendStatus(
      task.id,
      `Started — cycle ${next.cycle}${chosenAgent ? ` · agent: ${chosenAgent}` : ""}`,
    );
    return next;
  }

  /**
   * Campaign path: kick off the first pending item. Subsequent items are
   * started by `completeRun` as each finishes. The task stays in
   * runState="running" across the whole campaign.
   */
  private async startCampaign(task: Task, input: { agentSlug?: string; model?: string }): Promise<Task> {
    const chosenAgent = input.agentSlug ?? null;
    const pendingIdx = task.items.findIndex((i) => i.status === "pending");
    if (pendingIdx === -1) {
      // Nothing to do — flip to idle so the UI doesn't get stuck.
      await this.tasks.appendStatus(task.id, "Campaign has no pending items");
      return task;
    }

    // Mark the chosen item as running, save, then start pi for it.
    const items = task.items.slice();
    items[pendingIdx] = { ...items[pendingIdx]!, status: "running" };
    const next: Task = {
      ...task,
      runState: "running",
      items,
    };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-started",
      ...(chosenAgent ? { agentSlug: chosenAgent } : {}),
      // CONFIRMED 2026-05-06: emit the active model on run-started so the
      // Task Detail hero can render a "Model: <id>" chip via event replay.
      model: input.model ?? this.activeModel.get(task.id) ?? null,
    });
    await this.tasks.appendStatus(
      task.id,
      `Campaign started — cycle ${next.cycle} · ${pendingItemCount(next)} of ${next.items.length} pending`,
    );
    await this.startCampaignItem(next, items[pendingIdx]!, input.model);
    return next;
  }

  /** Open a pi session focused on a single campaign item. */
  private async startCampaignItem(task: Task, item: CampaignItem, model?: string): Promise<void> {
    if (!this.pi) return;
    const cwd = await this.resolveCwd(task);
    const m = model ?? this.activeModel.get(task.id);
    const mode = task.babysitterMode ?? "plan";
    await this.tasks.writePromptFile(task.id, renderPromptFile(task, null));
    await this.tasks.appendEvent(task.id, { type: "item-started", itemId: item.id });
    await this.tasks.appendStatus(task.id, `Item ${item.id} started — cycle ${task.cycle} · ${item.description}`);
    await this.pi.start(task.id, {
      prompt: buildItemBabysitPrompt(task, item, mode),
      cwd,
      ...(m ? { model: m } : {}),
    });
  }

  /**
   * Called by PiSessionManager when pi completes (or errors) a prompt.
   *
   * Single tasks: flip to idle with the exit reason.
   *
   * Campaign tasks: mark the running item as done/failed; if more pending
   * items remain, kick off the next one and STAY in running. Otherwise
   * flip the whole task to idle.
   */
  async completeRun(
    taskId: string,
    reason: StopReason,
  ): Promise<void> {
    const task = await this.tasks.getTask(taskId);
    if (!task || task.runState === "idle") return;

    if (task.kind === "campaign") {
      await this.completeCampaignItem(task, reason);
      return;
    }

    // Single task — original behavior.
    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason,
    });
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(task.id, `Run ended — cycle ${task.cycle} · ${reason}`);
    this.activeModel.delete(task.id);
    this.stopJournalReader(taskId);
    await this.startQueuedIfCapacity();
  }

  private async completeCampaignItem(task: Task, reason: StopReason): Promise<void> {
    // Find the running item; mark it done or failed based on exit reason.
    const idx = task.items.findIndex((i) => i.status === "running");
    if (idx === -1) {
      // Defensive: no running item to close out. Treat as fully done.
      await this.finalizeCampaign(task, reason);
      return;
    }

    const items = task.items.slice();
    const finishedItem = items[idx]!;
    const newStatus: CampaignItem["status"] = reason === "completed" ? "done" : "failed";
    items[idx] = {
      ...finishedItem,
      status: newStatus,
      notes: reason === "completed" ? finishedItem.notes : `${finishedItem.notes}\n[run reason: ${reason}]`.trim(),
    };

    const updated: Task = { ...task, items };
    await this.tasks.saveTask(updated);
    await this.tasks.appendEvent(task.id, {
      type: "item-ended",
      itemId: finishedItem.id,
      reason,
    });
    await this.tasks.appendStatus(
      task.id,
      `Item ${finishedItem.id} ${newStatus} — cycle ${task.cycle} · ${pendingItemCount(updated)} pending`,
    );

    // More items pending? Start the next one. Else finalize.
    const nextPending = items.find((i) => i.status === "pending");
    if (nextPending) {
      const items2 = items.slice();
      const nextIdx = items2.findIndex((i) => i.id === nextPending.id);
      items2[nextIdx] = { ...nextPending, status: "running" };
      const stepped: Task = { ...updated, items: items2 };
      await this.tasks.saveTask(stepped);
      await this.startCampaignItem(stepped, items2[nextIdx]!);
      return;
    }

    await this.finalizeCampaign(updated, reason);
  }

  private async finalizeCampaign(task: Task, _reason: StopReason): Promise<void> {
    const failed = task.items.filter((i) => i.status === "failed").length;
    const done = task.items.filter((i) => i.status === "done").length;
    const finalReason: StopReason = failed > 0 && done === 0 ? "failed" : "completed";
    const next: Task = { ...task, runState: "idle" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-ended", reason: finalReason });
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(
      task.id,
      `Campaign ended — cycle ${task.cycle} · ${done}/${task.items.length} done, ${failed} failed`,
    );
    this.activeModel.delete(task.id);
    this.stopJournalReader(task.id);
    await this.startQueuedIfCapacity();
  }

  async pause(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "running", "pause");

    if (this.pi) {
      await this.pi.steer(task.id, "[paused by user — wait for resume signal]");
      await this.tasks.appendEvent(task.id, {
        type: "pi:steer-sent",
        reason: "pause",
        message: "[paused by user — wait for resume signal]",
      });
    }

    const next: Task = { ...task, runState: "paused" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-paused" });
    await this.tasks.appendStatus(task.id, `Paused — cycle ${task.cycle}`);
    await this.startQueuedIfCapacity();
    return next;
  }

  async resume(input: { taskId: string }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    this.assertTransition(task.runState, "paused", "resume");

    if (this.pi) {
      await this.pi.followUp(task.id, "[resumed — continue from where you left off]");
      await this.tasks.appendEvent(task.id, {
        type: "pi:steer-sent",
        reason: "resume",
        message: "[resumed — continue from where you left off]",
      });
    }

    const next: Task = { ...task, runState: "running", blocker: "" };
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, { type: "run-resumed" });
    await this.tasks.appendStatus(task.id, task.blocker ? `Resumed — cycle ${task.cycle} · cleared waiting reason` : `Resumed — cycle ${task.cycle}`);
    return next;
  }

  async stop(input: { taskId: string; reason?: StopReason }): Promise<Task> {
    const task = await this.requireTask(input.taskId);
    if (task.runState === "idle") {
      throw new Error(`Task "${task.id}" is already idle`);
    }

    // For campaigns: mark any running item as failed before the state flip,
    // so the UI doesn't show an item stuck in "running" after a Stop click.
    let next: Task;
    if (task.kind === "campaign") {
      const items = task.items.map((i) =>
        i.status === "running"
          ? { ...i, status: "failed" as const, notes: `${i.notes}\n[stopped by user]`.trim() }
          : i,
      );
      next = { ...task, runState: "idle", items };
    } else {
      next = { ...task, runState: "idle" };
    }
    await this.tasks.saveTask(next);
    await this.tasks.appendEvent(task.id, {
      type: "run-ended",
      reason: input.reason ?? "user",
    });
    await this.recordMetricsArtifact(task.id, "run", task.cycle);
    await this.tasks.appendStatus(task.id, `Stopped — cycle ${task.cycle} (${input.reason ?? "user"})`);

    // Best-effort pi cleanup — don't let a dispose failure undo the state
    // flip the UI already relied on.
    if (this.pi) {
      await this.pi.stop(task.id);
    }
    this.activeModel.delete(task.id);
    this.parallelSteps.delete(task.id);
    this.stopJournalReader(task.id);
    await this.startQueuedIfCapacity();
    return next;
  }

  async startParallelStep(input: {
    taskId: string;
    stepId: string;
    agents: string[];
    cycle?: number;
    stopOnFirstFailure?: boolean;
  }): Promise<void> {
    const task = await this.requireTask(input.taskId);
    const agents = [...new Set(input.agents.map((a) => a.trim()).filter(Boolean))];
    if (agents.length === 0) throw new Error(`Parallel step "${input.stepId}" needs at least one agent`);
    const key = stepKey(input.stepId, input.cycle ?? task.cycle);
    const byTask = this.parallelSteps.get(task.id) ?? new Map<string, ParallelStepState>();
    if (byTask.has(key)) throw new Error(`Parallel step "${input.stepId}" already active for cycle ${input.cycle ?? task.cycle}`);
    byTask.set(key, {
      stepId: input.stepId,
      cycle: input.cycle ?? task.cycle,
      agents,
      expected: agents.length,
      completed: 0,
      failed: 0,
      seen: new Set(),
      ended: false,
      stopOnFirstFailure: input.stopOnFirstFailure ?? false,
    });
    this.parallelSteps.set(task.id, byTask);
    await this.tasks.appendEvent(task.id, {
      type: "step:start",
      stepId: input.stepId,
      cycle: input.cycle ?? task.cycle,
      expected: agents.length,
      agents,
    });
  }

  async recordParallelAgentEnd(input: {
    taskId: string;
    stepId: string;
    agent: string;
    status: "ok" | "failed";
    cycle?: number;
    outputPath?: string;
    error?: string;
  }): Promise<{ done: boolean; status?: "ok" | "partial" | "aborted"; completed: number; failed: number; expected: number }> {
    const task = await this.requireTask(input.taskId);
    const cycle = input.cycle ?? task.cycle;
    const key = stepKey(input.stepId, cycle);
    const byTask = this.parallelSteps.get(task.id);
    const state = byTask?.get(key);
    if (!state) throw new Error(`Parallel step "${input.stepId}" is not active for cycle ${cycle}`);
    if (state.ended) {
      return { done: true, status: state.failed === 0 ? "ok" : state.stopOnFirstFailure ? "aborted" : "partial", completed: state.completed, failed: state.failed, expected: state.expected };
    }
    if (state.seen.has(input.agent)) {
      throw new Error(`Parallel step "${input.stepId}" already recorded agent "${input.agent}" for cycle ${cycle}`);
    }
    state.seen.add(input.agent);
    if (input.status === "ok") state.completed += 1;
    else state.failed += 1;

    await this.tasks.appendEvent(task.id, {
      type: "step:agent-end",
      stepId: input.stepId,
      cycle,
      agent: input.agent,
      status: input.status,
      completed: state.completed,
      failed: state.failed,
      expected: state.expected,
      ...(input.outputPath ? { outputPath: input.outputPath } : {}),
      ...(input.error ? { error: input.error } : {}),
    });

    const total = state.completed + state.failed;
    const shouldAbort = input.status === "failed" && state.stopOnFirstFailure;
    if (!shouldAbort && total < state.expected) {
      return { done: false, completed: state.completed, failed: state.failed, expected: state.expected };
    }

    const endStatus: "ok" | "partial" | "aborted" =
      state.failed === 0 ? "ok" : state.stopOnFirstFailure ? "aborted" : "partial";
    state.ended = true;
    await this.tasks.appendEvent(task.id, {
      type: "step:end",
      stepId: input.stepId,
      cycle,
      status: endStatus,
      completed: state.completed,
      failed: state.failed,
      expected: state.expected,
    });
    byTask?.delete(key);
    if (byTask && byTask.size === 0) this.parallelSteps.delete(task.id);
    return { done: true, status: endStatus, completed: state.completed, failed: state.failed, expected: state.expected };
  }

  // ── internals ────────────────────────────────────────────────────────

  /** Per-task model selection, kept in memory across campaign items. */
  private readonly activeModel = new Map<string, string>();
  private readonly parallelSteps = new Map<string, Map<string, ParallelStepState>>();
  private readonly startQueue: Array<{ taskId: string; agentSlug?: string; model?: string }> = [];
  private readonly queuedTaskIds = new Set<string>();

  private async shouldQueueStart(taskId: string): Promise<{ shouldQueue: boolean; running: number; cap: number }> {
    const cap = await this.getRunConcurrencyCap();
    const running = await this.countRunningTasks();
    const alreadyQueued = this.queuedTaskIds.has(taskId);
    return { shouldQueue: !alreadyQueued && running >= cap, running, cap };
  }

  private async startQueuedIfCapacity(): Promise<void> {
    // Start as many queued tasks as free slots allow.
    while (this.startQueue.length > 0) {
      const running = await this.countRunningTasks();
      const cap = await this.getRunConcurrencyCap();
      if (running >= cap) return;
      const next = this.startQueue.shift();
      if (!next) return;
      this.queuedTaskIds.delete(next.taskId);
      try {
        await this.start(next);
      } catch (error) {
        await this.tasks.appendEvent(next.taskId, {
          type: "run-queue-error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async countRunningTasks(): Promise<number> {
    const all = await this.tasks.listTasks();
    return all.filter((t) => t.runState === "running").length;
  }

  private async getRunConcurrencyCap(): Promise<number> {
    const cap = (await this.settings?.get())?.runConcurrencyCap;
    return typeof cap === "number" && Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 10;
  }

  private async recordMetricsArtifact(taskId: string, fallbackStep: string, cycle: number): Promise<void> {
    try {
      const absPath = await writeLatestRunMetricsArtifact(this.tasks, taskId, fallbackStep, cycle);
      if (absPath) {
        await this.tasks.appendEvent(taskId, {
          type: "metrics:recorded",
          path: absPath,
        });
      }
    } catch (error) {
      await this.tasks.appendEvent(taskId, {
        type: "metrics:error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.tasks.getTask(id);
    if (!task) throw new Error(`Task "${id}" not found`);
    return task;
  }


  /**
   * Resolve workspace cwd. Prefer project.path when set so pi can see
   * the real codebase; otherwise use the per-task scratch workspace.
   */
  private async resolveCwd(task: Task): Promise<string> {
    const project = this.projects ? await this.projects.getProject(task.project) : null;
    const projectPath = project?.path?.trim();
    if (projectPath && existsSync(projectPath)) return projectPath;
    return this.tasks.ensureWorkspace(task.id);
  }

  private assertTransition(
    current: RunState,
    expected: RunState,
    action: string,
  ): void {
    if (current !== expected) {
      throw new Error(
        `Cannot ${action} task in runState "${current}" (expected "${expected}")`,
      );
    }
  }

  private async detectBabysitterRun(taskId: string, cwd: string, beforeRuns: Set<string>): Promise<void> {
    const runsRoot = path.join(cwd, ".a5c", "runs");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(250);
      const afterRuns = await snapshotBabysitterRuns(cwd);
      const newRunId = [...afterRuns].find((id) => !beforeRuns.has(id));
      if (!newRunId) continue;
      const runPath = path.join(runsRoot, newRunId);
      await this.tasks.appendEvent(taskId, {
        type: "babysitter-run-detected",
        babysitterRunId: newRunId,
        runPath,
      });
      await this.tasks.appendStatus(taskId, `Babysitter run detected — ${newRunId}`);
      this.startJournalReader(taskId, runPath);
      return;
    }
  }
}

async function snapshotBabysitterRuns(cwd: string): Promise<Set<string>> {
  const runsRoot = path.join(cwd, ".a5c", "runs");
  if (!existsSync(runsRoot)) return new Set();
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pendingItemCount(task: Task): number {
  return task.items.filter((i) => i.status === "pending").length;
}

function stepKey(stepId: string, cycle: number): string {
  return `${stepId}@c${cycle}`;
}

/**
 * Build the `/babysit` prompt — a short task brief that babysitter-pi's
 * skill ingests and turns into an orchestrated multi-agent run
 * (workflow-defined, not a fixed roster — the babysitter SDK generates
 * a process.js per task that may include any library agents and the
 * shape of loopbacks / mandatory stops they declare). The generated
 * process.js lands in `.a5c/processes/` in the session's cwd.
 *
 * Kept concise: babysitter reads `tasks/<id>/PROMPT.md` (written by
 * RunManager.start via writePromptFile) for the full mission, so we
 * don't need to duplicate the description inline.
 */
function buildBabysitPrompt(
  task: Task,
  agentSlug: string | null,
  mode: Task["babysitterMode"] = "plan",
): string {
  // Per babysitter-pi's skill files (read 2026-04-26):
  //   /plan    — author process.js, do NOT execute it
  //   /babysit — author + execute INTERACTIVELY (breakpoints prompt the user;
  //              only useful from a real pi TUI; in MC's programmatic
  //              session breakpoints have no surface to land on)
  //   /yolo    — author + execute NON-interactively (no breakpoints)
  //   "direct" — no slash command; pi runs as a single agent on the brief
  //              alone. Skips babysitter authoring + execution entirely.
  const prefix =
    mode === "execute" ? "/yolo " :
    mode === "plan"    ? "/plan "  :
    "";  // direct
  const lines = [
    `${prefix}${task.title}`,
    "",
    task.description || "(no description)",
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Cycle: ${task.cycle}`,
    `Suggested starting agent: ${agentSlug ?? "(none)"}`,
    "",
    "Orchestrate the full workflow: plan, implement, review, finalize.",
    "Loop back on review rejection; stop at human approval gates.",
    "",
    "## File naming convention",
    "",
    `When phase agents produce artifacts, save them in this folder using the`,
    `task-id + agent-code suffix convention so Mission Control's UI can`,
    `link them automatically:`,
    "",
    ...artifactExampleLines(task.id, task.cycle),
    "",
    `Babysitter's own scaffolding (process.js, run journals) can stay`,
    `under .a5c/ — that's expected. The convention applies to per-agent`,
    `MARKDOWN deliverables that humans read.`,
  ];
  return lines.join("\n");
}

/**
 * Per-item /babysit prompt for a campaign task. Each item gets its own
 * pi session — RunManager loops items[] in completeRun and calls this
 * for the next pending one. Item description is the user prompt;
 * task.title gives shared context for cross-item lessons.
 */
function buildItemBabysitPrompt(
  task: Task,
  item: CampaignItem,
  mode: Task["babysitterMode"] = "plan",
): string {
  const prefix =
    mode === "execute" ? "/yolo " :
    mode === "plan"    ? "/plan "  :
    "";  // direct
  const total = task.items.length;
  const idx = task.items.findIndex((i) => i.id === item.id);
  return [
    `${prefix}${task.title} — item ${item.id} (${idx + 1}/${total})`,
    "",
    item.description,
    "",
    `Task id: ${task.id}`,
    `Project: ${task.project}`,
    `Campaign cycle: ${task.cycle}`,
    `Item index: ${idx + 1} of ${total}`,
    "",
    ...artifactExampleLines(task.id, task.cycle),
    "",
    "Process this single item. When done, summarize what you produced.",
    "The orchestrator iterates the remaining items after this one ends.",
  ].join("\n");
}

function artifactExampleLines(_taskId: string, _cycle: number): string[] {
  return [
    "  - Per-agent output → <task-id>-<agent-code>-c<cycle>.md",
    "  - Subagent output  → <task-id>-<2-4 char code>-c<cycle>.md",
  ];
}

