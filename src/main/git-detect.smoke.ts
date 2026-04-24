/**
 * Standalone smoke test for detectGit.
 *   node --experimental-strip-types src/main/git-detect.smoke.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectGit } from "./git-detect.ts";

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-git-smoke-"));
  console.log(`[smoke] tmp=${tmp}`);

  // ── empty path → none ───────────────────────────────────────────────
  assert((await detectGit("")).kind === "none", "empty path → none");

  // ── non-existent path → none ────────────────────────────────────────
  assert((await detectGit("/does/not/exist/anywhere")).kind === "none", "missing path → none");

  // ── plain folder (no .git) → none ───────────────────────────────────
  const plainDir = path.join(tmp, "plain");
  await fs.mkdir(plainDir);
  assert((await detectGit(plainDir)).kind === "none", "plain folder → none");

  // ── .git folder but no config → git ─────────────────────────────────
  const gitOnly = path.join(tmp, "git-only");
  await fs.mkdir(path.join(gitOnly, ".git"), { recursive: true });
  assert((await detectGit(gitOnly)).kind === "git", "bare .git → git");

  // ── .git with config but no origin → git ────────────────────────────
  const noOrigin = path.join(tmp, "no-origin");
  await fs.mkdir(path.join(noOrigin, ".git"), { recursive: true });
  await fs.writeFile(path.join(noOrigin, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");
  assert((await detectGit(noOrigin)).kind === "git", "no origin → git");

  // ── GitHub (ssh) ────────────────────────────────────────────────────
  await makeRepo(path.join(tmp, "gh-ssh"), "git@github.com:owner/cool-repo.git");
  const gh = await detectGit(path.join(tmp, "gh-ssh"));
  assert(gh.kind === "github", `expected github, got ${gh.kind}`);
  assert(gh.label === "GitHub: owner/cool-repo", `label: ${gh.label}`);

  // ── GitHub (https) ──────────────────────────────────────────────────
  await makeRepo(path.join(tmp, "gh-https"), "https://github.com/owner/cool-repo");
  assert((await detectGit(path.join(tmp, "gh-https"))).kind === "github", "https github");

  // ── Azure DevOps ────────────────────────────────────────────────────
  await makeRepo(path.join(tmp, "ado"), "https://dev.azure.com/myorg/MyProject/_git/MyRepo");
  const ado = await detectGit(path.join(tmp, "ado"));
  assert(ado.kind === "azure-devops", `expected azure-devops, got ${ado.kind}`);
  assert(ado.label.startsWith("Azure DevOps"), `label: ${ado.label}`);

  // ── GitLab ──────────────────────────────────────────────────────────
  await makeRepo(path.join(tmp, "gl"), "git@gitlab.com:group/project.git");
  assert((await detectGit(path.join(tmp, "gl"))).kind === "gitlab", "gitlab ssh");

  // ── generic git (self-hosted) ───────────────────────────────────────
  await makeRepo(path.join(tmp, "generic"), "git@internal.local:team/repo.git");
  assert((await detectGit(path.join(tmp, "generic"))).kind === "git", "generic git");

  console.log(`[smoke] classifications OK (github, azure-devops, gitlab, git)`);

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("GREEN");
}

async function makeRepo(dir: string, originUrl: string): Promise<void> {
  await fs.mkdir(path.join(dir, ".git"), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".git", "config"),
    [
      "[core]",
      "\trepositoryformatversion = 0",
      "[remote \"origin\"]",
      `\turl = ${originUrl}`,
      "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      "",
    ].join("\n"),
  );
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
}

main().catch((err) => { console.error("RED:", err); process.exit(1); });
