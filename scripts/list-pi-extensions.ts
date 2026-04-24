#!/usr/bin/env node
/**
 * Fast probe — spin up a pi session with full discovery and report every
 * extension that loads along with its commands, flags, tools, and skills.
 * No prompt is sent, so this returns in a few seconds.
 *
 * Use after installing a new pi extension (e.g. `pi install npm:foo`)
 * to confirm MC's programmatic-session path actually picks it up.
 *
 * Usage:  npm run list-pi-extensions
 */
import { createAgentSession, getAgentDir } from "@mariozechner/pi-coding-agent";

async function main(): Promise<void> {
  console.log(`agentDir: ${getAgentDir()}`);
  console.log("creating session…");
  const { session, extensionsResult } = await createAgentSession({
    cwd: process.cwd(),
  });

  const exts = extensionsResult?.extensions ?? [];
  const errors = extensionsResult?.errors ?? [];

  console.log("");
  console.log(`Extensions loaded: ${exts.length}`);
  console.log("─".repeat(72));
  for (let i = 0; i < exts.length; i++) {
    const ext = exts[i]!;
    const label = ext.name || `(unnamed #${i})`;
    console.log(`• ${label}`);
    if (ext.commands.size > 0) {
      console.log(`    commands: ${[...ext.commands.keys()].sort().join(", ")}`);
    }
    if (ext.flags.size > 0) {
      console.log(`    flags:    ${[...ext.flags.keys()].sort().join(", ")}`);
    }
  }

  if (errors.length > 0) {
    console.log("");
    console.log("Load errors:");
    for (const err of errors) console.log(`  • ${err.path}: ${err.error}`);
  }

  // Heuristic grouping by prefix so new installs are easy to eyeball.
  console.log("");
  console.log("By vendor prefix:");
  const groups = new Map<string, string[]>();
  for (const ext of exts) {
    for (const cmd of ext.commands.keys()) {
      const prefix = cmd.includes(":") ? cmd.split(":")[0]! : cmd.split(/[-_]/)[0]!;
      const bucket = groups.get(prefix) ?? [];
      bucket.push(cmd);
      groups.set(prefix, bucket);
    }
  }
  for (const [prefix, cmds] of [...groups.entries()].sort()) {
    console.log(`  ${prefix.padEnd(20)} ${cmds.length} commands`);
  }

  session.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
