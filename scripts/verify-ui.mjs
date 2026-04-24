#!/usr/bin/env node
/**
 * UI smoke — drives the built Electron app with Playwright and verifies the
 * main flows without human clicks.
 *
 * Usage:
 *   npm run build              # produce out/main/index.js etc.
 *   node scripts/verify-ui.mjs
 *
 * Prerequisites:
 *   - Playwright installed (globally is fine): npm install -g playwright
 *   - `npm run build` has produced out/ at least once
 *
 * Output:
 *   - scripts/screenshots/NN-<label>.png — one per step
 *   - console log with GREEN/FAILED per assertion
 *   - exit code 0 on all-green, 1 on first failure
 *
 * Golden path covered:
 *   1. Topbar + bridge ok
 *   2. Create project (sidebar +)
 *   3. Open Project Detail
 *   4. Edit modal opens with populated fields (and Cancel)
 *   5. Create Task via Topbar
 *   6. Click task card → Task Detail
 *   7. Back to dashboard
 *   8. Delete project via Edit modal (two-step confirm)
 *   9. Settings → Models → Load defaults
 *
 * The script wipes its own scratch state in `<userData>/projects/ui-smoke-test/`,
 * `<userData>/tasks/TST-*`, and `<userData>/models.json` before launching so it's
 * idempotent.
 */
import { _electron as electron } from "playwright";
import { mkdir, readFile, access, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SHOTS = path.join(HERE, "screenshots");

const TEST_PREFIX = "TST";
const TEST_NAME = "UI Smoke Test";
const TEST_SLUG = "ui-smoke-test"; // slugify(TEST_NAME)

// PROPOSED: userData resolves per-OS. On Windows this is AppData/Roaming/<app>.
// If you need to reset between runs, delete userData/projects + userData/tasks.
function userDataPath() {
  // Matches Electron's default for development builds on Windows + mac + linux.
  const appName = "mc-v2-electron";
  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Roaming", appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  return path.join(os.homedir(), ".config", appName);
}

/**
 * Wipe any scratch state from a prior smoke run so this one starts clean.
 * Only touches paths this script owns — never deletes real user data.
 */
async function wipeScratch() {
  const root = userDataPath();
  const targets = [
    path.join(root, "projects", TEST_SLUG),
    path.join(root, "models.json"),
  ];
  for (const t of targets) {
    if (existsSync(t)) await rm(t, { recursive: true, force: true });
  }
  // Task folders are named <PREFIX>-NNN<W>. Sweep any owned by TEST_PREFIX.
  const tasksDir = path.join(root, "tasks");
  if (existsSync(tasksDir)) {
    const entries = await readdir(tasksDir);
    for (const e of entries) {
      if (e.startsWith(`${TEST_PREFIX}-`)) {
        await rm(path.join(tasksDir, e), { recursive: true, force: true });
      }
    }
  }
}

async function run() {
  await mkdir(SHOTS, { recursive: true });
  await wipeScratch();

  // Sanity: the app must be built before Playwright can drive it.
  const mainBundle = path.join(REPO_ROOT, "out", "main", "index.js");
  if (!existsSync(mainBundle)) {
    throw new Error(
      `out/main/index.js not found. Run \`npm run build\` first.`,
    );
  }

  console.log("[verify] launching Electron…");
  const app = await electron.launch({
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    // PROPOSED: surface main-process stdout here so pi errors don't hide.
    // If logs get noisy, filter on the consumer side.
    env: { ...process.env, NODE_ENV: "test" },
  });

  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  // Give React a beat to mount.
  await win.waitForTimeout(500);

  const assertions = new AssertionLog();
  let shotN = 0;
  const shoot = (label) =>
    win.screenshot({ path: path.join(SHOTS, `${String(++shotN).padStart(2, "0")}-${label}.png`) });

  try {
    // ── 1. Topbar is correct ────────────────────────────────────────────
    await shoot("dashboard");
    const titleText = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      titleText.trim() === "Mission Control",
      `Topbar title is "Mission Control" (got "${titleText.trim()}")`,
    );

    // CONFIRMED: bridge dot text is either "bridge ok" (preload loaded)
    // or "bridge offline" (preload failed). Red = investigate immediately.
    const bridgeText = await win
      .locator("text=/bridge ok|bridge offline/")
      .first()
      .textContent();
    assertions.check(
      bridgeText === "bridge ok",
      `Preload bridge loaded (got "${bridgeText}")`,
    );

    // ── 2. Sidebar shows + Add Project button ───────────────────────────
    const addBtn = win.getByRole("button", { name: "+", exact: true });
    await addBtn.waitFor({ state: "visible", timeout: 3000 });
    assertions.check(true, "Sidebar + button is visible");

    // ── 3. Create a test project via the modal ──────────────────────────
    await addBtn.click();
    await win.waitForTimeout(200);
    await shoot("add-project-modal");

    await win.locator('input[placeholder="DogApp"]').fill(TEST_NAME);
    await win.locator('input[placeholder="DA"]').fill(TEST_PREFIX);
    // Leave path + icon empty — keeps the smoke fast.

    await win.getByRole("button", { name: "Create Project" }).click();
    await win.waitForTimeout(500);
    await shoot("after-create");

    // ── 4. Verify the project landed in the sidebar ─────────────────────
    const chip = win.locator(`text="${TEST_PREFIX}"`).first();
    assertions.check(
      (await chip.count()) > 0,
      `New project "${TEST_PREFIX}" chip appears in sidebar`,
    );

    // ── 5. Verify persistence on disk ───────────────────────────────────
    const projectJson = path.join(
      userDataPath(),
      "projects",
      TEST_SLUG,
      "project.json",
    );
    try {
      await access(projectJson);
      const data = JSON.parse(await readFile(projectJson, "utf8"));
      assertions.check(
        data.prefix === TEST_PREFIX,
        `Persisted project.json has prefix "${TEST_PREFIX}"`,
      );
      assertions.check(
        data.name === TEST_NAME,
        `Persisted project.json has name "${TEST_NAME}"`,
      );
    } catch (err) {
      assertions.check(
        false,
        `project.json at ${projectJson} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── 6. Open Project Detail by clicking the sidebar row ──────────────
    await win.locator(`text="${TEST_NAME}"`).first().click();
    await win.waitForTimeout(300);
    await shoot("project-detail");
    const projectH1 = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      projectH1.includes(TEST_NAME),
      `Project Detail header shows "${TEST_NAME}" (got "${projectH1.trim()}")`,
    );
    assertions.check(
      projectH1.includes(TEST_PREFIX),
      `Project Detail header shows prefix "${TEST_PREFIX}"`,
    );

    // ── 7. Edit modal opens with populated fields ───────────────────────
    await win.getByRole("button", { name: /Edit/ }).click();
    await win.waitForTimeout(200);
    await shoot("edit-modal");
    const nameInEdit = await win.locator('input[placeholder="DogApp"]').inputValue();
    assertions.check(
      nameInEdit === TEST_NAME,
      `Edit modal pre-fills name ("${nameInEdit}")`,
    );
    const prefixInEdit = await win.locator('input[placeholder="DA"]').inputValue();
    assertions.check(
      prefixInEdit === TEST_PREFIX,
      `Edit modal shows prefix "${TEST_PREFIX}" (immutable)`,
    );
    // Cancel — don't commit anything yet, we'll return to edit later for delete.
    await win.getByRole("button", { name: "Cancel" }).click();
    await win.waitForTimeout(200);

    // ── 8. Back to Dashboard so we can hit "Create Task" in the Topbar ──
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(300);

    // ── 9. Create a task via Topbar ─────────────────────────────────────
    await win.getByRole("button", { name: "Create Task" }).click();
    await win.waitForTimeout(200);
    await shoot("create-task-modal");
    // Title input placeholder starts with "Short, imperative"
    await win.locator('input[placeholder^="Short, imperative"]').fill("First smoke task");
    // The modal submit button is also labelled "Create Task" — it lives inside
    // a <form>, so filter to the form-level submit.
    await win.locator('button[type="submit"]:has-text("Create Task")').click();
    await win.waitForTimeout(500);
    await shoot("after-create-task");

    // ── 10. Verify task appears on the board ────────────────────────────
    const expectedTaskId = `${TEST_PREFIX}-001F`;
    const taskCard = win.locator(`text="${expectedTaskId}"`).first();
    assertions.check(
      (await taskCard.count()) > 0,
      `Task "${expectedTaskId}" appears on the board`,
    );

    // Verify task persisted to disk
    const taskManifest = path.join(
      userDataPath(),
      "tasks",
      expectedTaskId,
      "manifest.json",
    );
    try {
      await access(taskManifest);
      const data = JSON.parse(await readFile(taskManifest, "utf8"));
      assertions.check(
        data.title === "First smoke task" && data.workflow === "F",
        `Persisted task manifest OK (title="${data.title}", workflow="${data.workflow}")`,
      );
    } catch (err) {
      assertions.check(
        false,
        `task manifest.json at ${taskManifest} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── 11. Click the task card → Task Detail page ──────────────────────
    await taskCard.click();
    await win.waitForTimeout(300);
    await shoot("task-detail");
    const taskH1 = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      taskH1.startsWith(expectedTaskId),
      `Task Detail header starts with "${expectedTaskId}" (got "${taskH1.trim()}")`,
    );

    // ── 12. Back to dashboard, then to Project Detail for delete flow ───
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(300);
    await win.locator(`text="${TEST_NAME}"`).first().click();
    await win.waitForTimeout(300);

    // ── 13. Delete project (two-step confirm) ───────────────────────────
    await win.getByRole("button", { name: /Edit/ }).click();
    await win.waitForTimeout(200);
    await win.getByRole("button", { name: "Delete project" }).click();
    await win.waitForTimeout(150);
    await shoot("delete-confirm");
    await win
      .getByRole("button", { name: "Click again to confirm delete" })
      .click();
    await win.waitForTimeout(500);
    await shoot("after-delete");

    // Sidebar chip should be gone
    const chipAfter = win.locator(`text="${TEST_NAME}"`).first();
    assertions.check(
      (await chipAfter.count()) === 0,
      `"${TEST_NAME}" removed from sidebar after delete`,
    );
    // Disk project.json should be gone
    assertions.check(
      !existsSync(path.join(userDataPath(), "projects", TEST_SLUG)),
      `userData/projects/${TEST_SLUG} removed from disk`,
    );

    // ── 14. Settings → Models → Load defaults ───────────────────────────
    await win.getByRole("button", { name: "Settings" }).click();
    await win.waitForTimeout(300);
    // Sub-tab: Models
    await win.getByRole("button", { name: "Models", exact: true }).click();
    await win.waitForTimeout(200);
    await shoot("settings-models-empty");

    await win.getByRole("button", { name: "Load defaults" }).click();
    await win.waitForTimeout(200);
    await shoot("settings-models-loaded");

    // Each row of the roster renders an input holding the model id.
    // The suggested file ships "gpt-5-codex" and "qwen-coder".
    const codexInput = win.locator('input[value="gpt-5-codex"]');
    const qwenInput = win.locator('input[value="qwen-coder"]');
    assertions.check(
      (await codexInput.count()) > 0,
      `Load defaults added "gpt-5-codex" row`,
    );
    assertions.check(
      (await qwenInput.count()) > 0,
      `Load defaults added "qwen-coder" row`,
    );

    // Save and verify disk
    await win.getByRole("button", { name: "Save roster" }).click();
    await win.waitForTimeout(400);
    const modelsFile = path.join(userDataPath(), "models.json");
    try {
      await access(modelsFile);
      const raw = await readFile(modelsFile, "utf8");
      const models = JSON.parse(raw);
      assertions.check(
        Array.isArray(models) && models.some((m) => m.id === "gpt-5-codex"),
        `models.json written to disk contains "gpt-5-codex"`,
      );
    } catch (err) {
      assertions.check(
        false,
        `models.json at ${modelsFile} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── TODO(CC): once pi is wired ──────────────────────────────────────
    // - Start run on a task → task.runState becomes "running", events.jsonl grows
    // - Pause → runState "paused"
    // - Stop → runState "idle", exitReason captured in latest run record
    // - Subagent spawn event appears after Planner's first call
  } finally {
    await app.close();
  }

  assertions.report();
  process.exit(assertions.allPassed() ? 0 : 1);
}

// ── small assertion helper (avoids pulling in node:test or chai) ─────────

class AssertionLog {
  constructor() {
    this.results = [];
  }
  check(cond, label) {
    const passed = Boolean(cond);
    this.results.push({ passed, label });
    const tag = passed ? "  \x1b[32mPASS\x1b[0m" : "  \x1b[31mFAIL\x1b[0m";
    console.log(`${tag}  ${label}`);
  }
  allPassed() {
    return this.results.every((r) => r.passed);
  }
  report() {
    const pass = this.results.filter((r) => r.passed).length;
    const fail = this.results.length - pass;
    console.log();
    console.log(
      `[verify] ${pass}/${this.results.length} assertions passed` +
        (fail > 0 ? ` · ${fail} failed` : ""),
    );
    console.log(`[verify] screenshots: ${SHOTS}`);
  }
}

run().catch((err) => {
  console.error("[verify] threw:", err);
  process.exit(1);
});
