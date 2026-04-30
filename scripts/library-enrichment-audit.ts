#!/usr/bin/env node
/**
 * Two-phase library enrichment helper (no LLM — filesystem + index only).
 *
 * Pass 1: Load `library/_index.json` (or rebuild via LibraryWalker) and flag
 * gaps (missing README / DESCRIPTION.md, thin frontmatter description).
 * Optionally skim the first N bytes of each entry file for keywords.
 *
 * Pass 2 queue: items that still need human or agent follow-up (gaps and/or
 * keyword hits). Output is sharded by library subtree for splitting work
 * across several pi sessions or MC campaign items.
 *
 *   npm run library:enrichment-audit
 *   npm run library:enrichment-audit -- --rebuild --keywords=security,pii,todo
 *   npm run library:enrichment-audit -- --min-desc=80 --skim-bytes=8000
 *   npm run library:enrichment-audit -- --include-description-md-gap
 *
 * Campaign exports (Mission Control `CampaignItem` shape, validated with Zod):
 *   out/library-enrichment-campaign-items.json       — flat items[] for paste / tooling
 *   out/library-enrichment-campaign-by-shard.json    — { [shard]: items[] }
 *   out/library-enrichment-campaign-import.json      — { title, description, kind, items } stub for tooling / future import
 *   out/library-enrichment-campaign-item-lines.txt   — one /babysit prompt per line (paste into MC Create Task → campaign textarea)
 *
 *   npm run library:enrichment-audit -- --shard=methodologies/cog-second-brain --max-items=80
 *   npm run library:enrichment-audit -- --emit-shard-files   (one JSON file per shard under out/library-enrichment-shards/)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LibraryWalker, type LibraryIndex, type LibraryIndexItem } from "../src/main/library-walker.ts";
import { CampaignItemSchema, type CampaignItem } from "../src/shared/models.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "library");
const INDEX_PATH = path.join(LIBRARY_ROOT, "_index.json");
const OUT_DIR = path.join(REPO_ROOT, "out");
const OUT_SHARDS_DIR = path.join(OUT_DIR, "library-enrichment-shards");
const OUT_AUDIT = path.join(OUT_DIR, "library-enrichment-audit.json");
const OUT_PASS2 = path.join(OUT_DIR, "library-enrichment-pass2.json");
const OUT_CAMPAIGN_ITEMS = path.join(OUT_DIR, "library-enrichment-campaign-items.json");
const OUT_CAMPAIGN_BY_SHARD = path.join(OUT_DIR, "library-enrichment-campaign-by-shard.json");
const OUT_CAMPAIGN_IMPORT = path.join(OUT_DIR, "library-enrichment-campaign-import.json");
const OUT_CAMPAIGN_LINES = path.join(OUT_DIR, "library-enrichment-campaign-item-lines.txt");

type GapFlags = {
  missingReadme: boolean;
  missingDescriptionMd: boolean;
  thinSummary: boolean;
};

type Pass1Row = {
  id: string;
  kind: LibraryIndexItem["kind"];
  logicalPath: string;
  diskPath: string;
  shard: string;
  gaps: GapFlags;
  keywordHits: string[];
};

type Pass2Row = Pass1Row & {
  reasons: string[];
  suggestedPrompt: string;
};

function parseArgs(argv: string[]): {
  rebuild: boolean;
  minDesc: number;
  skimBytes: number;
  keywords: string[];
  includeDescriptionMdGap: boolean;
  shardPrefix: string | null;
  maxItems: number | null;
  emitShardFiles: boolean;
} {
  let rebuild = false;
  let minDesc = 50;
  let skimBytes = 6000;
  let includeDescriptionMdGap = false;
  let shardPrefix: string | null = null;
  let maxItems: number | null = null;
  let emitShardFiles = false;
  const keywords: string[] = [];
  for (const a of argv) {
    if (a === "--rebuild") rebuild = true;
    else if (a === "--include-description-md-gap") includeDescriptionMdGap = true;
    else if (a === "--emit-shard-files") emitShardFiles = true;
    else if (a.startsWith("--shard=")) shardPrefix = a.slice("--shard=".length).trim().replace(/\\/g, "/") || null;
    else if (a.startsWith("--max-items=")) {
      const n = Number(a.slice("--max-items=".length));
      maxItems = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    } else if (a.startsWith("--min-desc=")) minDesc = Math.max(0, Number(a.split("=")[1]) || 50);
    else if (a.startsWith("--skim-bytes=")) skimBytes = Math.max(256, Number(a.split("=")[1]) || 6000);
    else if (a.startsWith("--keywords=")) {
      keywords.push(
        ...a
          .slice("--keywords=".length)
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
    }
  }
  return { rebuild, minDesc, skimBytes, keywords, includeDescriptionMdGap, shardPrefix, maxItems, emitShardFiles };
}

function shardFor(logicalPath: string): string {
  const parts = logicalPath.split("/").filter(Boolean);
  if (
    parts.length >= 2 &&
    ["methodologies", "specializations", "cradle", "contrib", "core"].includes(parts[0]!)
  ) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? "unknown";
}

function gapsFor(item: LibraryIndexItem, minDesc: number): GapFlags {
  const missingReadme =
    item.kind === "workflow" ? !item.companionDoc : !item.readmeMdPath;
  const missingDescriptionMd = !item.descriptionMdPath;
  const thinSummary =
    !item.description || item.description.trim().length < minDesc;
  return { missingReadme, missingDescriptionMd, thinSummary };
}

function reasonsFrom(g: GapFlags, keywordHits: string[]): string[] {
  const r: string[] = [];
  if (g.missingReadme) r.push("missingReadme");
  if (g.missingDescriptionMd) r.push("missingDescriptionMd");
  if (g.thinSummary) r.push("thinSummary");
  if (keywordHits.length) r.push(`keywords:${keywordHits.join("+")}`);
  return r;
}

function matchesShardFilter(row: Pass2Row, shardPrefix: string | null): boolean {
  if (!shardPrefix) return true;
  const p = shardPrefix.replace(/\/+$/, "");
  return row.shard === p || row.logicalPath === p || row.logicalPath.startsWith(`${p}/`);
}

function pass2RowToCampaignItem(row: Pass2Row): CampaignItem {
  const notes = row.reasons.join("; ").slice(0, 2000);
  const raw = {
    id: row.id,
    description: row.suggestedPrompt,
    status: "pending" as const,
    notes,
  };
  return CampaignItemSchema.parse(raw);
}

function buildPrompt(item: LibraryIndexItem, reasons: string[]): string {
  const bits = [
    `Library entry: ${item.logicalPath} (${item.kind}).`,
    `Disk file: ${item.diskPath}`,
    `Gaps / flags: ${reasons.join(", ")}.`,
    "Improve metadata on disk: enrich YAML frontmatter (description, tags, summary as appropriate);",
    "if missingReadme, add README.md beside the entry file explaining purpose and usage;",
    "if missingDescriptionMd, optionally add DESCRIPTION.md for longer prose.",
    "Do not edit library/_index.json — run npm run build-library-index after changes.",
  ];
  return bits.join(" ");
}

async function skimKeywords(absPath: string, maxBytes: number, keywords: string[]): Promise<string[]> {
  if (!keywords.length) return [];
  const buf = Buffer.alloc(maxBytes);
  const fh = await fs.open(absPath, "r");
  try {
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    const text = buf.subarray(0, bytesRead).toString("utf8").toLowerCase();
    return keywords.filter((k) => text.includes(k));
  } finally {
    await fh.close();
  }
}

async function loadIndex(rebuild: boolean): Promise<LibraryIndex> {
  if (rebuild) {
    const walker = new LibraryWalker(LIBRARY_ROOT);
    return walker.buildIndex();
  }
  const raw = await fs.readFile(INDEX_PATH, "utf8");
  return JSON.parse(raw) as LibraryIndex;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const {
    rebuild,
    minDesc,
    skimBytes,
    keywords,
    includeDescriptionMdGap,
    shardPrefix,
    maxItems,
    emitShardFiles,
  } = parseArgs(argv);

  const index = await loadIndex(rebuild);
  const pass1: Pass1Row[] = [];

  for (const item of index.items) {
    const gaps = gapsFor(item, minDesc);
    const keywordHits = await skimKeywords(item.diskPath, skimBytes, keywords);
    pass1.push({
      id: item.id,
      kind: item.kind,
      logicalPath: item.logicalPath,
      diskPath: item.diskPath,
      shard: shardFor(item.logicalPath),
      gaps,
      keywordHits,
    });
  }

  const pass2Queue: Pass2Row[] = [];
  for (const row of pass1) {
    const descMdGap = includeDescriptionMdGap && row.gaps.missingDescriptionMd;
    const anyGap =
      row.gaps.missingReadme || row.gaps.thinSummary || descMdGap;
    if (!anyGap && row.keywordHits.length === 0) continue;
    const reasons = reasonsFrom(row.gaps, row.keywordHits);
    const item = index.items.find((i) => i.id === row.id)!;
    pass2Queue.push({
      ...row,
      reasons,
      suggestedPrompt: buildPrompt(item, reasons),
    });
  }

  const pass2ByShard: Record<string, number> = {};
  for (const row of pass2Queue) {
    pass2ByShard[row.shard] = (pass2ByShard[row.shard] ?? 0) + 1;
  }

  let pass2Filtered = pass2Queue.filter((row) => matchesShardFilter(row, shardPrefix));
  const pass2TotalBeforeCap = pass2Filtered.length;
  if (maxItems !== null && pass2Filtered.length > maxItems) {
    pass2Filtered = pass2Filtered.slice(0, maxItems);
  }

  const campaignItems = pass2Filtered.map(pass2RowToCampaignItem);
  const byShard: Record<string, CampaignItem[]> = {};
  for (let i = 0; i < pass2Filtered.length; i += 1) {
    const row = pass2Filtered[i]!;
    const ci = campaignItems[i]!;
    (byShard[row.shard] ??= []).push(ci);
  }

  const importStub = {
    _comment:
      "Stub for a Mission Control campaign task. Set project / workflow in the UI when creating the task; paste `items` into the campaign editor if your build supports it.",
    title: "Library enrichment (pass 2)",
    description:
      "Each item is one library entry: improve frontmatter, add README where missing, then run npm run build-library-index in repo root.",
    kind: "campaign" as const,
    items: campaignItems,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    source: rebuild ? "LibraryWalker" : INDEX_PATH,
    options: {
      minDescriptionChars: minDesc,
      skimBytes,
      keywords,
      includeDescriptionMdGap,
      shardPrefix,
      maxItems,
      emitShardFiles,
    },
    summary: {
      totalItems: index.items.length,
      pass1Rows: pass1.length,
      pass2Count: pass2Queue.length,
      pass2ByShard,
      pass2ExportCount: campaignItems.length,
      pass2ExportTotalBeforeCap: pass2TotalBeforeCap,
    },
    pass1,
    pass2Queue,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_AUDIT, JSON.stringify(payload, null, 2));
  await fs.writeFile(OUT_PASS2, JSON.stringify(pass2Queue, null, 2));
  await fs.writeFile(OUT_CAMPAIGN_ITEMS, JSON.stringify(campaignItems, null, 2));
  await fs.writeFile(OUT_CAMPAIGN_BY_SHARD, JSON.stringify(byShard, null, 2));
  await fs.writeFile(OUT_CAMPAIGN_IMPORT, JSON.stringify(importStub, null, 2));

  const lineText = campaignItems
    .map((c) => c.description.replace(/\r?\n/g, " ").trim())
    .join("\n");
  await fs.writeFile(OUT_CAMPAIGN_LINES, `${lineText}\n`);

  if (emitShardFiles && Object.keys(byShard).length > 0) {
    await fs.mkdir(OUT_SHARDS_DIR, { recursive: true });
    for (const [shard, items] of Object.entries(byShard)) {
      const safe = shard.replace(/[/\\]+/g, "__");
      const base = path.join(OUT_SHARDS_DIR, safe);
      await fs.writeFile(`${base}.json`, JSON.stringify(items, null, 2));
      const shardLines = items.map((c) => c.description.replace(/\r?\n/g, " ").trim()).join("\n");
      await fs.writeFile(`${base}.txt`, `${shardLines}\n`);
    }
  }

  console.log(
    `[library-enrichment-audit] wrote ${OUT_AUDIT} + ${OUT_PASS2} ` +
      `(pass2=${pass2Queue.length} of ${index.items.length}; shards=${Object.keys(pass2ByShard).length})`,
  );
  console.log(
    `[library-enrichment-audit] campaign: ${OUT_CAMPAIGN_ITEMS} + ${OUT_CAMPAIGN_LINES} (${campaignItems.length} items` +
      (maxItems !== null && pass2TotalBeforeCap > campaignItems.length
        ? `, capped from ${pass2TotalBeforeCap}`
        : "") +
      ")" +
      (emitShardFiles ? `; shard files → ${OUT_SHARDS_DIR}` : ""),
  );
}

main().catch((err) => {
  console.error("[library-enrichment-audit] failed:", err);
  process.exit(1);
});
