/**
 * Tiny git metadata sniffer. Given a project folder path, returns:
 *   - kind: "github" | "azure-devops" | "gitlab" | "git" | "none"
 *   - label: human-readable summary like "GitHub: owner/repo"
 *   - remoteUrl: the raw `origin` URL if present
 *
 * No spawning git, no network — just parse `.git/config` (INI-ish text).
 * Resilient to missing files: returns kind:"none" instead of throwing.
 *
 * We only support reading the `[remote "origin"]` section, which is the 99%
 * case. Multi-remote projects can add support later.
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

import type { GitInfo } from "../shared/models.ts";

export type { GitInfo };

export async function detectGit(projectPath: string): Promise<GitInfo> {
  if (!projectPath) return noGit("");

  const gitDir = path.join(projectPath, ".git");
  if (!existsSync(gitDir)) {
    return noGit(projectPath);
  }

  const configPath = path.join(gitDir, "config");
  if (!existsSync(configPath)) {
    return { kind: "git", label: "Local git (no config)", remoteUrl: "" };
  }

  const text = await fs.readFile(configPath, "utf8");
  const remoteUrl = extractOriginUrl(text);

  if (!remoteUrl) {
    return { kind: "git", label: "Local git (no origin)", remoteUrl: "" };
  }

  return classifyRemote(remoteUrl);
}

function noGit(_projectPath: string): GitInfo {
  return { kind: "none", label: "(not a git repo)", remoteUrl: "" };
}

/**
 * Extract the URL from the `[remote "origin"]` section. Handles both
 *   [remote "origin"]
 *       url = git@github.com:owner/repo.git
 * and the HTTP form.
 */
function extractOriginUrl(iniText: string): string {
  const lines = iniText.split(/\r?\n/);
  let inOrigin = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line);
      continue;
    }
    if (!inOrigin) continue;
    const m = /^url\s*=\s*(.+)$/.exec(line);
    if (m) return m[1]!.trim();
  }
  return "";
}

/** Sniff GitHub / Azure DevOps / GitLab / generic git from a remote URL. */
function classifyRemote(url: string): GitInfo {
  // Normalize: git@host:owner/repo(.git) and https://host/owner/repo(.git)
  // Extract host + path suffix for matching.
  const ghMatch = url.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ghMatch) {
    return {
      kind: "github",
      label: `GitHub: ${ghMatch[1]}/${ghMatch[2]}`,
      remoteUrl: url,
    };
  }

  const adoMatch = url.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/i)
    ?? url.match(/(?:[^/@]+@)?ssh\.dev\.azure\.com[:/]v\d+\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (adoMatch) {
    return {
      kind: "azure-devops",
      label: `Azure DevOps: ${adoMatch[1]}/${adoMatch[2]} (${adoMatch[3]})`,
      remoteUrl: url,
    };
  }

  const glMatch = url.match(/gitlab\.(?:com|[^/]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (glMatch) {
    return {
      kind: "gitlab",
      label: `GitLab: ${glMatch[1]}/${glMatch[2]}`,
      remoteUrl: url,
    };
  }

  return { kind: "git", label: `Git: ${url}`, remoteUrl: url };
}
