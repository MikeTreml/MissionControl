#!/usr/bin/env node
/**
 * Spike — can MC drive Planner→Developer→Reviewer orchestration through
 * the `@a5c-ai/babysitter-pi` pi extension?
 *
 * The pi extension (installed via `pi install npm:@a5c-ai/babysitter-pi`)
 * registers slash commands — `/babysit`, `/plan`, `/resume`, `/doctor`,
 * `/yolo`, `/call` — that forward to Babysitter's SDK inside the session.
 *
 * This script answers three questions without touching any MC code:
 *
 *   1. Is the extension installed under `~/.pi/agent/extensions/`?
 *   2. When MC opens a pi session with FULL discovery (no isolation), does
 *      pi actually load the extension, and what commands/tools does it
 *      register?
 *   3. If we prompt the session to invoke `/babysit`, does pi route it
 *      through the extension, or does pi just treat the text as a user
 *      message (meaning slash commands are TUI-only)?
 *
 * Usage:
 *   node --experimental-strip-types scripts/babysitter-pi-spike.ts
 *
 * Output is verbose on purpose — we want to see everything that fires.
 */
import {
  createAgentSession,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function line(s = ""): void {
  console.log(s);
}
function header(s: string): void {
  line("");
  line("═".repeat(72));
  line(s);
  line("═".repeat(72));
}

async function main(): Promise<void> {
  // ── Question 1: is @a5c-ai/babysitter-pi registered in pi settings? ──
  // Pi stores packages in ~/npm/node_modules/ and records the reference
  // in ~/.pi/agent/settings.json under `packages`. We don't care about
  // the disk layout — just that pi thinks it's installed.
  header("1. Is @a5c-ai/babysitter-pi registered in pi settings?");
  const settingsPath = join(getAgentDir(), "settings.json");
  line(`   agentDir:      ${getAgentDir()}`);
  line(`   settings:      ${settingsPath}`);
  let listed = false;
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        packages?: string[];
      };
      const pkgs = settings.packages ?? [];
      line(`   packages:      ${pkgs.length ? pkgs.join(", ") : "(none)"}`);
      listed = pkgs.some((p) => p.includes("babysitter-pi"));
    } catch (e) {
      line(`   ⚠ could not read settings.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!listed) {
    line("");
    line("   ❌ @a5c-ai/babysitter-pi not listed. Install:");
    line("       pi install npm:@a5c-ai/babysitter-pi");
    process.exit(2);
  }
  line(`   ✅ registered`);

  // ── Workspace — use a temp dir so babysitter/pi can't touch MC's repo.
  const workspace = mkdtempSync(join(tmpdir(), "mc-babysitter-spike-"));
  line("");
  line(`   workspace:     ${workspace}`);

  // ── Question 2: does pi load it when we open a session? ──────────────
  header("2. Does pi load the extension into a programmatic session?");
  line("   Calling createAgentSession() with no isolation…");
  const { session, extensionsResult } = await createAgentSession({
    cwd: workspace,
  });

  const exts = extensionsResult?.extensions ?? [];
  const errors = extensionsResult?.errors ?? [];
  line(`   extensions loaded: ${exts.length}`);
  for (let i = 0; i < exts.length; i++) {
    const ext = exts[i]!;
    const label = ext.name || `(unnamed #${i})`;
    line(`     • ${label}`);
    if (ext.commands.size > 0) {
      line(`         commands: ${[...ext.commands.keys()].join(", ")}`);
    }
    if (ext.flags.size > 0) {
      line(`         flags:    ${[...ext.flags.keys()].join(", ")}`);
    }
  }
  if (errors.length > 0) {
    line("");
    line(`   ⚠ load errors:`);
    for (const err of errors) {
      line(`     • ${err.path}: ${err.error}`);
    }
  }

  // Find by command, not by name (ext.name is undefined in this build).
  const babysitterExt = exts.find((e) => e.commands.has("babysit"));
  if (!babysitterExt) {
    line("");
    line("   ❌ babysitter commands not registered on any loaded extension.");
    session.dispose();
    process.exit(1);
  }
  line(`   ✅ extension registered /babysit (${babysitterExt.commands.size} commands total)`);

  // ── Question 3: does `/babysit <task>` in a prompt trigger the skill? ─
  header("3. Does sending `/babysit …` as a prompt route through the extension?");
  line("   Subscribing to session events and prompting…");

  const events: string[] = [];
  const eventTypeCounts = new Map<string, number>();
  let finalText: string | null = null;
  let sawToolCall = false;
  let ended = false;
  const unsubscribe = session.subscribe((e) => {
    events.push(e.type);
    eventTypeCounts.set(e.type, (eventTypeCounts.get(e.type) ?? 0) + 1);
    if (e.type === "agent_end") ended = true;
    if (String(e.type).includes("tool_call")) sawToolCall = true;
    if (e.type === "message_end") {
      const msg = (e as unknown as Record<string, unknown>).message as
        | Record<string, unknown>
        | undefined;
      const content = msg?.content as Array<Record<string, unknown>> | undefined;
      if (content && msg?.role === "assistant") {
        const text = content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        if (text) finalText = text;
      }
    }
    // Suppress per-event noise; summary is printed at the end.
  });

  // Smallest-possible real orchestration: write one file, no review loop.
  // Pi's AgentSession.prompt() is fire-and-forget — it returns after
  // queueing. The real end signal is the `agent_end` event from the
  // subscription. We wait on that (with a timeout cap).
  const prompt = `/babysit Write a file called hello.txt in the current directory containing just the word "hello". Then stop.`;
  const TIMEOUT_MS = 5 * 60_000;
  const startedAt = Date.now();
  line(`   → prompt: "${prompt}"`);
  line(`   → timeout: ${TIMEOUT_MS / 1000}s`);
  try {
    session.prompt(prompt);
    line(`   → prompt() queued — waiting for agent_end event…`);
  } catch (err) {
    line(`   ❌ prompt queue threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Poll for agent_end. Log a heartbeat every 10s so we know pi is alive.
  let lastHeartbeat = Date.now();
  while (!ended && Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 500));
    if (Date.now() - lastHeartbeat >= 10_000) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      line(`   … ${elapsed}s elapsed · ${events.length} events · pending`);
      lastHeartbeat = Date.now();
    }
  }
  const totalMs = Date.now() - startedAt;
  line(`   → ${ended ? "✅ agent_end fired" : "❌ timed out"} after ${(totalMs / 1000).toFixed(1)}s`);
  unsubscribe();

  line("");
  line(`   total events: ${events.length}, agent_end fired: ${ended}`);
  line(`   event-type histogram:`);
  for (const [t, n] of [...eventTypeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    line(`     ${String(n).padStart(4)} × ${t}`);
  }
  line("");
  line(`   tool_call observed?   ${sawToolCall ? "✅ yes" : "❌ no"}`);
  line("");
  line(`   final assistant text:`);
  line("   " + (finalText ?? "(none)").split("\n").join("\n   "));

  // ── Did babysitter/pi actually write anything in the workspace? ──────
  header("4. What ended up in the workspace?");
  const paths = walk(workspace, 3);
  if (paths.length === 0) {
    line("   (empty — no files created)");
  } else {
    for (const p of paths) {
      const rel = p.slice(workspace.length + 1);
      const sz = statSync(p).size;
      line(`   ${rel.padEnd(60)}  ${sz} bytes`);
    }
  }
  // Show the target file's content if present.
  const hello = join(workspace, "hello.txt");
  if (existsSync(hello)) {
    line("");
    line("   hello.txt contents:");
    line("   " + readFileSync(hello, "utf8").split("\n").join("\n   "));
  }

  header("Findings");
  line(`   • babysitter-pi on disk:       ✅`);
  line(`   • loaded as pi extension:      ✅`);
  line(`   • commands registered:         ${babysitterExt.commands.size > 0 ? "✅ " + [...babysitterExt.commands.keys()].join(", ") : "❌ (TUI-only?)"}`);
  line(`   • event types during prompt:   ${uniqueTypes(events).join(", ")}`);
  line("");
  line("   Interpretation:");
  line("   - If `tool_call` or `extension_command` appeared in events,");
  line("     babysitter is reachable from programmatic sessions → Option A is viable.");
  line("   - If the agent just emitted `text_delta` with a normal response,");
  line("     slash commands are TUI-only → we'd need babysitter-sdk directly");
  line("     (Option B with @a5c-ai/babysitter-sdk as a dep) OR MC-side chaining.");

  session.dispose();
}

function summarizeEvent(event: { type: string } & Record<string, unknown>): string {
  const rec = event;
  if (rec.type === "text_delta" && typeof rec.delta === "string") {
    return rec.delta.length > 60 ? `${rec.delta.slice(0, 57)}…` : rec.delta;
  }
  if (rec.type === "tool_call" && typeof rec.name === "string") {
    return `name=${rec.name}`;
  }
  const m = rec.message as Record<string, unknown> | undefined;
  if (m && typeof m.model === "string") return `model=${m.model}`;
  return "";
}

function uniqueTypes(events: string[]): string[] {
  const set = new Set(events.map((e) => e.split(" · ")[0]));
  return [...set];
}

function walk(root: string, depth: number): string[] {
  if (depth < 0 || !existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(p, depth - 1));
    } else {
      out.push(p);
    }
  }
  return out;
}

main().catch((err) => {
  console.error("[spike] threw:", err);
  process.exit(1);
});
