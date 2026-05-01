/**
 * Tiny assertion helper for tests/ smokes.
 *
 * Mirrors the inline `assert()` used by src/main/*.smoke.ts so the tests/ layer
 * follows MC's convention: standalone scripts, no test framework, exit on first
 * failure. CLAUDE.md rule: don't add Jest/Mocha/Vitest deps.
 */
export function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}

export function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    console.error(`  FAIL: ${msg}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}

export function assertDeepEqual(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`  FAIL: ${msg}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
    process.exit(1);
  }
  console.log(`[smoke] ${msg}`);
}
