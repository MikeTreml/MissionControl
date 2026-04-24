/**
 * Standalone smoke test for ModelRosterStore.
 *   node --experimental-strip-types src/main/model-roster.smoke.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ModelRosterStore } from "./model-roster.ts";

async function main(): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mc-model-smoke-"));
  console.log(`[smoke] tmp=${tmp}`);

  const store = new ModelRosterStore(tmp);
  await store.init();

  // ── empty on first run ──────────────────────────────────────────────
  assert((await store.listModels()).length === 0, "empty roster");

  // ── save + load ─────────────────────────────────────────────────────
  await store.saveModels([
    { id: "claude-opus", label: "Claude Opus 4.6", kind: "anthropic", model: "claude-opus-4-6", endpoint: "", notes: "" },
    { id: "gpt-5-codex", label: "GPT-5 Codex",     kind: "openai",    model: "gpt-5-codex",     endpoint: "", notes: "" },
    { id: "qwen-coder",  label: "Qwen 2.5 Coder",  kind: "ollama",    model: "qwen2.5-coder",   endpoint: "http://localhost:11434", notes: "local" },
  ]);
  const roster = await store.listModels();
  assert(roster.length === 3, `expected 3, got ${roster.length}`);
  console.log(`[smoke] roster saved + loaded`);

  // ── duplicate id rejected ───────────────────────────────────────────
  await assertThrows(
    () => store.saveModels([
      { id: "dup", label: "A", kind: "x", model: "", endpoint: "", notes: "" },
      { id: "dup", label: "B", kind: "y", model: "", endpoint: "", notes: "" },
    ]),
    /Duplicate model id "dup"/,
    "duplicate id",
  );
  console.log(`[smoke] duplicate id rejected`);

  await fs.rm(tmp, { recursive: true, force: true });
  console.log("GREEN");
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
}
async function assertThrows(
  fn: () => Promise<unknown>,
  messagePattern: RegExp,
  label: string,
): Promise<void> {
  let threw = false;
  try { await fn(); }
  catch (err) {
    threw = true;
    const message = err instanceof Error ? err.message : String(err);
    assert(messagePattern.test(message), `${label}: expected ${messagePattern}, got: ${message}`);
  }
  assert(threw, `${label}: expected an error, got none`);
}

main().catch((err) => { console.error("RED:", err); process.exit(1); });
