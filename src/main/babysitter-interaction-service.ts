import { spawn } from "node:child_process";

function runCli(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => (stdout += c.toString()));
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(stdout);
      }
    });
  });
}

export async function listPendingEffects(runPath: string) {
  return runCli(["babysitter", "task:list", runPath, "--pending", "--json"]);
}

export async function showPendingEffect(runPath: string, effectId: string) {
  return runCli(["babysitter", "task:show", runPath, effectId, "--json"]);
}

export async function answerPendingEffect(
  runPath: string,
  effectId: string,
  value: any,
) {
  return runCli([
    "babysitter",
    "task:post",
    runPath,
    effectId,
    "--status",
    "ok",
    "--value-inline",
    JSON.stringify(value),
    "--json",
  ]);
}
