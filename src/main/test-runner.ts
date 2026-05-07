import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

export type TestPresetKind = "command" | "server";

export interface TestPreset {
  id: string;
  name: string;
  group: string;
  description: string;
  cwd: string;
  command: string;
  args: string[];
  kind: TestPresetKind;
  expectedReportPath?: string;
  cwdExists?: boolean;
}

export interface TestRunSnapshot {
  id: string;
  presetId: string;
  status: "running" | "passed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  cwd: string;
  commandLine: string;
  output: string;
}

export type TestRunnerEvent =
  | { type: "started"; run: TestRunSnapshot }
  | { type: "output"; runId: string; stream: "stdout" | "stderr"; text: string }
  | { type: "finished"; run: TestRunSnapshot };

interface ActiveRun {
  snapshot: TestRunSnapshot;
  child: ChildProcessWithoutNullStreams;
}

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCmd(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function quoteArg(arg: string): string {
  return /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(" ");
}

function spawnCommandForPlatform(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) {
    return { command, args };
  }
  return {
    command: process.env["ComSpec"] || "cmd.exe",
    args: ["/d", "/s", "/c", commandLine(command, args)],
  };
}

export class TestRunner extends EventEmitter {
  private readonly presets: TestPreset[];
  private readonly active = new Map<string, ActiveRun>();
  private readonly history: TestRunSnapshot[] = [];

  constructor(appRoot: string) {
    super();
    const babysitterRoot = process.env["BABYSITTER_REPO"] ?? join(dirname(appRoot), "babysitter");
    const sdkRoot = join(babysitterRoot, "packages", "sdk");
    const observerRoot = join(babysitterRoot, "packages", "observer-dashboard");
    const e2eReport = join(babysitterRoot, "e2e-artifacts", "test-results.json");

    this.presets = [
      {
        id: "mc-typecheck",
        name: "MC typecheck",
        group: "Mission Control",
        description: "Runs all MC TypeScript projects.",
        cwd: appRoot,
        command: npmCmd(),
        args: ["run", "typecheck"],
        kind: "command",
      },
      {
        id: "mc-smoke",
        name: "MC smoke",
        group: "Mission Control",
        description: "Runs main-process smoke tests.",
        cwd: appRoot,
        command: npmCmd(),
        args: ["run", "smoke"],
        kind: "command",
      },
      {
        id: "mc-canary-skill-prep",
        name: "Skill canary prep",
        group: "Mission Control",
        description: "Checks MC skill materialization and workflow rewrite without spending a model run.",
        cwd: appRoot,
        command: npmCmd(),
        args: ["run", "canary:skill"],
        kind: "command",
      },
      {
        id: "mc-canary-skill-real",
        name: "Skill canary real run",
        group: "Mission Control",
        description: "Runs the salted skill canary through Babysitter/Pi with OpenAI Codex.",
        cwd: appRoot,
        command: npmCmd(),
        args: ["run", "canary:skill", "--", "--run", "--harness=internal", "--model=openai-codex/gpt-5.4"],
        kind: "command",
      },
      {
        id: "bs-sdk-vitest",
        name: "Babysitter SDK Vitest",
        group: "Babysitter",
        description: "Runs Babysitter SDK local Vitest tests.",
        cwd: babysitterRoot,
        command: npmCmd(),
        args: ["run", "test:sdk"],
        kind: "command",
      },
      {
        id: "bs-e2e-vitest",
        name: "Babysitter e2e Vitest",
        group: "Babysitter",
        description: "Runs the existing Babysitter e2e Vitest target from its repo.",
        cwd: babysitterRoot,
        command: npmCmd(),
        args: ["run", "test:e2e:docker"],
        kind: "command",
        expectedReportPath: e2eReport,
      },
      {
        id: "bs-observer-vitest",
        name: "Observer dashboard Vitest",
        group: "Babysitter",
        description: "Runs Observer Dashboard local Vitest/jsdom tests.",
        cwd: observerRoot,
        command: npmCmd(),
        args: ["run", "test"],
        kind: "command",
      },
      {
        id: "bs-sdk-vitest-ui",
        name: "SDK Vitest UI",
        group: "Vitest UI",
        description: "Starts Vitest UI for Babysitter SDK tests at http://localhost:51204/__vitest__/.",
        cwd: sdkRoot,
        command: npxCmd(),
        args: ["vitest", "--ui"],
        kind: "server",
      },
    ];
  }

  listPresets(): TestPreset[] {
    return this.presets.map((preset) => ({
      ...preset,
      cwdExists: existsSync(preset.cwd),
    }));
  }

  listRuns(): TestRunSnapshot[] {
    return [...this.history].reverse();
  }

  start(presetId: string): TestRunSnapshot {
    const preset = this.presets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      throw new Error(`Unknown test preset: ${presetId}`);
    }
    if (!existsSync(preset.cwd)) {
      throw new Error(`Preset cwd does not exist: ${preset.cwd}`);
    }

    const id = randomUUID();
    const snapshot: TestRunSnapshot = {
      id,
      presetId,
      status: "running",
      startedAt: new Date().toISOString(),
      cwd: preset.cwd,
      commandLine: commandLine(preset.command, preset.args),
      output: "",
    };
    const spawnSpec = spawnCommandForPlatform(preset.command, preset.args);
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: preset.cwd,
      env: { ...process.env },
      shell: false,
    });
    this.active.set(id, { snapshot, child });
    this.history.push(snapshot);
    this.trimHistory();
    this.emit("event", { type: "started", run: { ...snapshot } } satisfies TestRunnerEvent);

    child.stdout.on("data", (chunk: Buffer) => this.appendOutput(id, "stdout", chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => this.appendOutput(id, "stderr", chunk.toString()));
    child.on("error", (err) => {
      this.appendOutput(id, "stderr", `${err.message}\n`);
      this.finish(id, 1);
    });
    child.on("close", (code) => this.finish(id, code));

    return { ...snapshot };
  }

  cancel(runId: string): TestRunSnapshot | null {
    const active = this.active.get(runId);
    if (!active) return null;
    active.snapshot.status = "cancelled";
    active.child.kill();
    return { ...active.snapshot };
  }

  private appendOutput(runId: string, stream: "stdout" | "stderr", text: string): void {
    const active = this.active.get(runId);
    if (!active) return;
    active.snapshot.output += text;
    this.emit("event", { type: "output", runId, stream, text } satisfies TestRunnerEvent);
  }

  private finish(runId: string, code: number | null): void {
    const active = this.active.get(runId);
    if (!active) return;
    this.active.delete(runId);
    if (active.snapshot.status !== "cancelled") {
      active.snapshot.status = code === 0 ? "passed" : "failed";
    }
    active.snapshot.exitCode = code;
    active.snapshot.finishedAt = new Date().toISOString();
    this.emit("event", { type: "finished", run: { ...active.snapshot } } satisfies TestRunnerEvent);
  }

  private trimHistory(): void {
    if (this.history.length <= 50) return;
    this.history.splice(0, this.history.length - 50);
  }
}
