#!/usr/bin/env node
/**
 * Audit workflow -> skill references against library/_index.skill.json.
 *
 * Curated workflow starts fail fast when a declared skill cannot be
 * materialized into .a5c/skills/<name>/SKILL.md. This script gives the
 * catalog-level report before users discover broken refs one run at a time.
 *
 *   npm run library:skill-audit
 *   npm run library:skill-audit -- --json
 *   npm run library:skill-audit -- --workflow=business/finance-accounting
 *   npm run library:skill-audit -- --fail-on-missing
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractSkillNames } from "../src/main/babysitter-runtime-prep.ts";
import { INDEX_FILES, type LibraryIndexItem } from "../src/main/library-walker.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "library");
const OUT_DIR = path.join(REPO_ROOT, "out");
const OUT_FILE = path.join(OUT_DIR, "library-skill-audit.json");

type Args = {
  json: boolean;
  workflowFilter: string | null;
  failOnMissing: boolean;
};

type MissingSkill = {
  name: string;
  suggestions: string[];
};

type WorkflowAuditRow = {
  workflow: string;
  skills: string[];
  missing: MissingSkill[];
};

function parseArgs(argv: string[]): Args {
  let json = false;
  let workflowFilter: string | null = null;
  let failOnMissing = false;
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--fail-on-missing") failOnMissing = true;
    else if (arg.startsWith("--workflow=")) {
      workflowFilter = arg.slice("--workflow=".length).trim().replace(/\\/g, "/") || null;
    }
  }
  return { json, workflowFilter, failOnMissing };
}

async function readSkillIndex(): Promise<LibraryIndexItem[]> {
  const raw = await fs.readFile(path.join(LIBRARY_ROOT, INDEX_FILES.skill), "utf8");
  const parsed = JSON.parse(raw) as { items?: LibraryIndexItem[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function walkJsFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(full);
      }
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function skillNamesFromIndex(items: LibraryIndexItem[]): Set<string> {
  const names = new Set<string>();
  for (const item of items) {
    if (item.name) names.add(item.name);
    const leaf = item.logicalPath.split("/").filter(Boolean).at(-1);
    if (leaf) names.add(leaf);
  }
  return names;
}

function relativeLibraryPath(absPath: string): string {
  return path.relative(LIBRARY_ROOT, absPath).replace(/\\/g, "/");
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j < curr.length; j += 1) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

function nearest(name: string, candidates: string[], limit = 5): string[] {
  const lower = name.toLowerCase();
  return candidates
    .map((candidate) => {
      const c = candidate.toLowerCase();
      const substringBias = c.includes(lower) || lower.includes(c) ? -3 : 0;
      return { candidate, score: levenshtein(lower, c) + substringBias };
    })
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map((x) => x.candidate);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const skillItems = await readSkillIndex();
  const validNames = skillNamesFromIndex(skillItems);
  const candidateNames = [...validNames].sort((a, b) => a.localeCompare(b));
  const workflowFiles = await walkJsFiles(LIBRARY_ROOT);

  const rows: WorkflowAuditRow[] = [];
  for (const file of workflowFiles) {
    const workflow = relativeLibraryPath(file);
    if (args.workflowFilter && !workflow.startsWith(args.workflowFilter)) continue;

    const src = await fs.readFile(file, "utf8");
    const skills = extractSkillNames(src).all;
    if (skills.length === 0) continue;

    const missingNames = skills.filter((name) => !validNames.has(name));
    if (missingNames.length === 0) continue;

    rows.push({
      workflow,
      skills,
      missing: missingNames.map((name) => ({
        name,
        suggestions: nearest(name, candidateNames),
      })),
    });
  }

  const totalMissingRefs = rows.reduce((sum, row) => sum + row.missing.length, 0);
  const uniqueMissing = [...new Set(rows.flatMap((row) => row.missing.map((m) => m.name)))].sort();
  const result = {
    generatedAt: new Date().toISOString(),
    libraryRoot: LIBRARY_ROOT,
    summary: {
      workflowsWithMissingSkills: rows.length,
      totalMissingRefs,
      uniqueMissingSkills: uniqueMissing.length,
    },
    uniqueMissingSkills: uniqueMissing,
    workflows: rows,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(result, null, 2), "utf8");

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `[library-skill-audit] ${rows.length} workflow(s), ${totalMissingRefs} missing reference(s), ` +
      `${uniqueMissing.length} unique missing skill name(s).`,
  );
  console.log(`[library-skill-audit] wrote ${OUT_FILE}`);
  for (const row of rows.slice(0, 20)) {
    const missing = row.missing.map((m) => `${m.name}${m.suggestions.length ? ` -> ${m.suggestions.join(", ")}` : ""}`);
    console.log(`- ${row.workflow}: ${missing.join("; ")}`);
  }
  if (rows.length > 20) {
    console.log(`[library-skill-audit] showing first 20 rows; see JSON for the full report.`);
  }

  if (args.failOnMissing && rows.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[library-skill-audit] failed:", err);
  process.exit(1);
});
