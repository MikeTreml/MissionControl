#!/usr/bin/env node
/**
 * Bakeoff contract smoke for Mission Control orchestration candidates.
 *
 * This test intentionally compares normalized behavior, not implementation
 * details. Each candidate runner must write a result JSON file with the same
 * contract shape so BS and AA/Python can be evaluated by observable behavior.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Scenario = "chain-loop" | "tool-artifact" | "failure-resume" | "story-500";

type BakeoffResult = {
  runner: "bs" | "aa";
  scenario: Scenario;
  success: boolean;
  final: {
    qualityPercent: number;
    iterations: number;
    status: "passed" | "failed";
    wordCount?: number;
  };
  metadata: {
    invocation: {
      command: string;
      cwd: string;
      startedAt: string;
      finishedAt: string;
      durationMs: number;
    };
    calls: Array<{
      step: string;
      kind: "agent" | "tool" | "breakpoint" | "resume";
      inputRef?: string;
      outputRef?: string;
      status: "ok" | "error";
      durationMs: number;
      error?: {
        message: string;
        step: string;
        nextAction: "retry" | "resume" | "abort";
      };
    }>;
    artifacts: Array<{ path: string; kind: "json" | "text" }>;
    errors: Array<{
      message: string;
      step: string;
      inputRef?: string;
      nextAction: "retry" | "resume" | "abort";
    }>;
    progressEvents: Array<{ event: string; step?: string; at: string }>;
    workItems?: Array<{ step: string; input: unknown; output: unknown }>;
  };
};

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, "..", ".."));
const ATOMIC_AGENTS_ROOT = "C:\\Users\\Treml\\source\\repos\\atomic-agents";
const ATOMIC_AGENTS_PYTHON = path.join(ATOMIC_AGENTS_ROOT, ".venv", "Scripts", "python.exe");
const RESULTS_ROOT = process.env.BAKEOFF_RESULTS_DIR
  ? path.resolve(process.env.BAKEOFF_RESULTS_DIR)
  : path.join(REPO_ROOT, "tests", "bakeoff", "results");
const RUNNERS = {
  bs: path.join(REPO_ROOT, "tests", "bakeoff", "runners", "bs-contract-runner.ts"),
  aa: path.join(REPO_ROOT, "tests", "bakeoff", "runners", "aa_contract_runner.py"),
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function runCandidate(runner: "bs" | "aa", scenario: Scenario, resultsDir: string): BakeoffResult {
  const outFile = path.join(resultsDir, `${scenario}-${runner}.json`);
  const command =
    runner === "bs"
      ? `node --experimental-strip-types ${RUNNERS.bs} --scenario ${scenario} --out ${outFile}`
      : `${ATOMIC_AGENTS_PYTHON} ${RUNNERS.aa} --scenario ${scenario} --out ${outFile}`;

  const exe = runner === "bs" ? "node" : ATOMIC_AGENTS_PYTHON;
  const args =
    runner === "bs"
      ? ["--experimental-strip-types", RUNNERS.bs, "--scenario", scenario, "--out", outFile]
      : [RUNNERS.aa, "--scenario", scenario, "--out", outFile];
  const result = spawnSync(exe, args, { cwd: REPO_ROOT, encoding: "utf8" });
  assert(
    result.status === 0,
    `${runner} ${scenario} failed\ncommand: ${command}\nerror: ${
      result.error ? String(result.error) : "(none)"
    }\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  assert(existsSync(outFile), `${runner} ${scenario} did not write ${outFile}`);
  return JSON.parse(readFileSync(outFile, "utf8")) as BakeoffResult;
}

function archiveResult(result: BakeoffResult, resultsDir: string): void {
  const fileName = `${result.scenario}-${result.runner}.json`;
  writeFileSync(path.join(resultsDir, fileName), JSON.stringify(result, null, 2), "utf8");
}

function assertCommonContract(result: BakeoffResult, runner: "bs" | "aa", scenario: Scenario): void {
  assert(result.runner === runner, `${runner} result.runner mismatch`);
  assert(result.scenario === scenario, `${runner} result.scenario mismatch`);
  assert(result.success === true, `${runner} ${scenario} should succeed`);
  assert(result.metadata.invocation.command.length > 0, `${runner} must record exact command string`);
  assert(result.metadata.invocation.durationMs >= 0, `${runner} must record duration`);
  assert(result.metadata.calls.length > 0, `${runner} must record calls`);
  assert(result.metadata.progressEvents.length > 0, `${runner} must record progress events`);
  assert((result.metadata.workItems ?? []).length > 0, `${runner} must record step input/output evidence`);
  for (const artifact of result.metadata.artifacts) {
    assert(existsSync(artifact.path), `${runner} artifact must exist after run: ${artifact.path}`);
  }
}

function assertScenarioContract(result: BakeoffResult): void {
  if (result.scenario === "chain-loop") {
    assert(result.final.status === "passed", `${result.runner} chain-loop final status`);
    assert(result.final.qualityPercent >= 85, `${result.runner} chain-loop quality`);
    assert(result.final.iterations === 2, `${result.runner} chain-loop iterations`);
    assert(
      result.metadata.calls.some((call) => call.step === "reviewer" && call.kind === "agent"),
      `${result.runner} chain-loop must call reviewer agent`,
    );
  }

  if (result.scenario === "tool-artifact") {
    assert(result.metadata.calls.some((call) => call.kind === "tool"), `${result.runner} must record tool call`);
    assert(result.metadata.artifacts.length >= 1, `${result.runner} must record artifact`);
  }

  if (result.scenario === "failure-resume") {
    assert(result.metadata.errors.length === 1, `${result.runner} must capture one forced error`);
    assert(result.metadata.errors[0]?.step === "worker", `${result.runner} forced error step`);
    assert(result.metadata.errors[0]?.nextAction === "resume", `${result.runner} forced error next action`);
    assert(
      result.metadata.calls.some((call) => call.kind === "resume" && call.status === "ok"),
      `${result.runner} must record resume marker`,
    );
  }

  if (result.scenario === "story-500") {
    const wordCount = result.final.wordCount ?? 0;
    assert(result.final.status === "passed", `${result.runner} story-500 final status`);
    assert(wordCount >= 450 && wordCount <= 550, `${result.runner} story-500 word count ${wordCount}`);
    assert(result.metadata.artifacts.length >= 1, `${result.runner} story-500 must record story artifact`);
    assert(
      (result.metadata.workItems ?? []).some((item) => item.step === "writer"),
      `${result.runner} story-500 must record writer output`,
    );
  }
}

function compare(bs: BakeoffResult, aa: BakeoffResult): void {
  assert(bs.final.status === aa.final.status, `status differs: bs=${bs.final.status}, aa=${aa.final.status}`);
  if (bs.scenario === "story-500") return;
  assert(
    bs.final.qualityPercent === aa.final.qualityPercent,
    `quality differs: bs=${bs.final.qualityPercent}, aa=${aa.final.qualityPercent}`,
  );
  assert(bs.final.iterations === aa.final.iterations, `iterations differ: bs=${bs.final.iterations}, aa=${aa.final.iterations}`);
}

function main(): void {
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsDir = path.join(RESULTS_ROOT, runStamp);
  mkdirSync(resultsDir, { recursive: true });
  const scenarios: Scenario[] = ["chain-loop", "tool-artifact", "failure-resume", "story-500"];
  const summary: Array<{
    scenario: Scenario;
    bs: BakeoffResult["final"] & { durationMs: number; command: string };
    aa: BakeoffResult["final"] & { durationMs: number; command: string };
  }> = [];

  try {
    for (const scenario of scenarios) {
      const bs = runCandidate("bs", scenario, resultsDir);
      const aa = runCandidate("aa", scenario, resultsDir);

      assertCommonContract(bs, "bs", scenario);
      assertCommonContract(aa, "aa", scenario);
      assertScenarioContract(bs);
      assertScenarioContract(aa);
      compare(bs, aa);
      archiveResult(bs, resultsDir);
      archiveResult(aa, resultsDir);
      summary.push({
        scenario,
        bs: { ...bs.final, durationMs: bs.metadata.invocation.durationMs, command: bs.metadata.invocation.command },
        aa: { ...aa.final, durationMs: aa.metadata.invocation.durationMs, command: aa.metadata.invocation.command },
      });

      process.stdout.write(
        `[bakeoff] ${scenario}: bs=${bs.metadata.invocation.durationMs}ms aa=${aa.metadata.invocation.durationMs}ms\n`,
      );
      process.stdout.write(`[bakeoff] bs call: ${bs.metadata.invocation.command}\n`);
      process.stdout.write(`[bakeoff] aa call: ${aa.metadata.invocation.command}\n`);
    }
  } finally {
    writeFileSync(
      path.join(resultsDir, "summary.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), resultsDir, scenarios: summary }, null, 2),
      "utf8",
    );
  }

  process.stdout.write(`[bakeoff] results: ${resultsDir}\n`);
  process.stdout.write("orchestration bakeoff contract smoke OK\n");
}

main();
