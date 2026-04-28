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
 * Click-every-button coverage:
 *   - Dashboard boot + bridge
 *   - Add Project modal (+ icon picker click + Create)
 *   - Project Detail header
 *   - Edit Project modal (pre-fill + Save with new icon)
 *   - Create Task modal — single kind (default project = currently viewed)
 *   - Task Detail — header + Controls visible + Model picker populated
 *   - Create Task modal — campaign kind (items textarea + persist)
 *   - Task Detail — Campaign Items table renders rows
 *   - Delete Task (two-step confirm)
 *   - All four Settings tabs (Agents / Models / Workflows / Global)
 *       · Models: Load defaults, + Add model, remove (×), Save roster
 *       · Workflows: F-feature default lanes, X-brainstorm custom lanes visible
 *   - Metrics page renders (KPIs + tables, no crash)
 *   - Modal dismiss via Cancel and ✕
 *   - Delete Project (two-step confirm)
 *
 * Not automated (require real pi auth + long wait):
 *   - Start / Pause / Resume / Stop buttons
 *   - Live RightBar events during a run
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
    env: { ...process.env, NODE_ENV: "test" },
  });

  // Forward Electron main-process stdout/stderr so we see crashes + console.log.
  app.process().stdout?.on("data", (d) => process.stdout.write(`  [main] ${d}`));
  app.process().stderr?.on("data", (d) => process.stderr.write(`  [main:err] ${d}`));

  const win = await app.firstWindow();
  // Forward DevTools console too — this catches unhandled renderer errors.
  win.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      console.log(`  [renderer:${type}] ${msg.text()}`);
    }
  });
  win.on("pageerror", (err) => {
    console.log(`  [renderer:pageerror] ${err.message}`);
  });
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

    // Click one icon-picker button — exercises the grid. We pick "🧪"
    // (Testing) since it's semantically right for a smoke test.
    await win.locator('button[title="Testing / experiments"]').click();
    await win.waitForTimeout(100);
    const iconAfterPick = await win.locator('input[placeholder="(empty = prefix)"]').inputValue();
    assertions.check(
      iconAfterPick === "🧪",
      `Icon picker sets icon input to 🧪 (got "${iconAfterPick}")`,
    );

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
    const iconInEdit = await win.locator('input[placeholder="(empty = prefix)"]').inputValue();
    assertions.check(
      iconInEdit === "🧪",
      `Edit modal pre-fills icon (🧪)`,
    );

    // Change icon via picker + Save — verify new icon persists.
    await win.locator('button[title="Tools / devops"]').click();
    await win.waitForTimeout(100);
    await win.getByRole("button", { name: "Save changes" }).click();
    await win.waitForTimeout(500);
    await shoot("after-edit-save");
    try {
      const savedData = JSON.parse(await readFile(projectJson, "utf8"));
      assertions.check(
        savedData.icon === "🔧",
        `Edit save persisted new icon (got "${savedData.icon}")`,
      );
    } catch (err) {
      assertions.check(false, `Re-read project.json after save: ${err.message ?? err}`);
    }

    // Test Modal cancel path: open edit, click Cancel, ensure modal closes
    // without mutating data (same icon stays).
    await win.getByRole("button", { name: /Edit/ }).click();
    await win.waitForTimeout(200);
    await win.getByRole("button", { name: "Cancel" }).click();
    await win.waitForTimeout(200);
    const modalGone = await win.locator('input[placeholder="DogApp"]').count();
    assertions.check(
      modalGone === 0,
      `Edit modal closes on Cancel (no DogApp-placeholder input visible)`,
    );

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

    // Sidebar count badge: the test project should now show "1" open task.
    // The badge is a small accent-colored pill rendered next to the prefix
    // chip when openCount > 0.
    const sidebarRow = win.locator(`.project:has-text("${TEST_PREFIX}")`).first();
    const sidebarCountText = (await sidebarRow.textContent()) ?? "";
    assertions.check(
      sidebarCountText.includes("1"),
      `Sidebar shows "1" open-task count for ${TEST_PREFIX} (got "${sidebarCountText.trim()}")`,
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

    // Task is idle → Start button should be present; Pause/Stop hidden.
    const startVisible = await win.getByRole("button", { name: "Start", exact: true }).count();
    assertions.check(startVisible > 0, `Task Detail Start button renders (task idle)`);

    // Mission + Status log cards (Phase 2). Mission card exists with
    // the task title rendered inside. Status log card exists with the
    // "task created" seed line visible.
    const missionHeader = await win.locator("h3", { hasText: "Mission" }).count();
    assertions.check(missionHeader > 0, `Mission card renders on Task Detail`);
    const missionContainsTitle = await win.locator('pre').filter({
      hasText: "First smoke task",
    }).count();
    assertions.check(
      missionContainsTitle > 0,
      `Mission card contains task title (PROMPT.md content rendered)`,
    );
    const statusHeader = await win.locator("h3", { hasText: "Status log" }).count();
    assertions.check(statusHeader > 0, `Status log card renders`);
    const statusSeed = await win.locator('pre').filter({
      hasText: "task created",
    }).count();
    assertions.check(
      statusSeed > 0,
      `Status log seeded with "task created" entry`,
    );
    const pauseHidden = await win.getByRole("button", { name: "Pause", exact: true }).count();
    assertions.check(pauseHidden === 0, `Pause button hidden when task idle`);

    // Model picker dropdown renders with pi's provider-grouped models.
    // The "(pi default)" option should always exist.
    const modelPickerExists = await win.locator('select option[value=""]').count();
    assertions.check(
      modelPickerExists > 0,
      `Model picker renders with "(pi default)" option`,
    );
    // At least one real model option should appear (pi-ai ships 25+).
    const modelOptionCount = await win.locator('select optgroup option').count();
    assertions.check(
      modelOptionCount > 0,
      `Model picker populated from pi's ModelRegistry (${modelOptionCount} entries)`,
    );

    // Edit modal — change title + description, save, verify persistence.
    await win.getByRole("button", { name: "Edit", exact: true }).click();
    await win.waitForTimeout(200);
    const editTitleInput = win.locator('input[placeholder^="Short, imperative"]');
    await editTitleInput.fill("First smoke task — edited");
    await win.locator('textarea[placeholder^="Optional"]').fill("Now with a description.");
    await win.getByRole("button", { name: "Save changes" }).click();
    await win.waitForTimeout(500);
    try {
      const editedManifest = JSON.parse(await readFile(taskManifest, "utf8"));
      assertions.check(
        editedManifest.title === "First smoke task — edited",
        `Edit modal persisted new title (got "${editedManifest.title}")`,
      );
      assertions.check(
        editedManifest.description === "Now with a description.",
        `Edit modal persisted new description (got "${editedManifest.description}")`,
      );
    } catch (err) {
      assertions.check(false, `Re-read manifest after edit: ${err.message ?? err}`);
    }
    // The Task Detail H1 should now reflect the edited title.
    const h1AfterEdit = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      h1AfterEdit.includes("edited"),
      `Task Detail header reflects edited title (got "${h1AfterEdit.trim()}")`,
    );

    // Waiting-on field renders, accepts text, persists on Enter.
    const waitingLabel = win.locator('strong:has-text("Waiting on:")').first();
    assertions.check(
      (await waitingLabel.count()) === 1,
      `Waiting on label renders on Task Detail`,
    );
    const blockerInput = win.locator('input[placeholder^="What\'s this waiting on?"]');
    assertions.check(
      (await blockerInput.count()) === 1,
      `Waiting on field renders on Task Detail`,
    );
    await blockerInput.fill("Waiting on customer review");
    await blockerInput.press("Enter");
    await win.waitForTimeout(400);
    // Persisted to manifest.json
    try {
      const refreshed = JSON.parse(await readFile(taskManifest, "utf8"));
      assertions.check(
        refreshed.blocker === "Waiting on customer review",
        `Waiting reason persisted to manifest.json (got "${refreshed.blocker}")`,
      );
    } catch (err) {
      assertions.check(false, `Re-read manifest after blocker save: ${err.message ?? err}`);
    }
    // Clear button appears once a blocker is set
    const clearBtnCount = await win.getByRole("button", { name: "Clear", exact: true }).count();
    assertions.check(
      clearBtnCount > 0,
      `Clear button appears when blocker is set`,
    );

    // Seed a synthetic run with one subagent so Run History can derive and expand it.
    await win.evaluate(async (id) => {
      const now = Date.now();
      const at = (ms) => new Date(now + ms).toISOString();
      await window.mc.appendTaskEvent(id, { type: "run-started", timestamp: at(0), agentSlug: "planner" });
      await window.mc.appendTaskEvent(id, {
        type: "pi:subagent_spawn",
        timestamp: at(100),
        spawnId: "spawn-001",
        agentName: "RepoMapper",
        agentSlug: "rmp",
        parentAgentSlug: "planner",
        reason: "map the repo",
      });
      await window.mc.appendTaskEvent(id, {
        type: "pi:subagent_complete",
        timestamp: at(800),
        spawnId: "spawn-001",
        agentName: "RepoMapper",
        exitReason: "completed",
        durationMs: 700,
      });
      await window.mc.appendTaskEvent(id, { type: "run-ended", timestamp: at(1000), reason: "completed" });
    }, expectedTaskId);
    await win.waitForTimeout(600);
    const subagentToggle = win.getByRole("button", { name: /1 subagent/ }).first();
    assertions.check(
      (await subagentToggle.count()) > 0,
      `Run History shows a subagent summary toggle`,
    );
    await subagentToggle.click();
    await win.waitForTimeout(200);
    assertions.check(
      (await win.locator('text="RepoMapper"').count()) > 0,
      `Expanded Run History shows derived subagent details`,
    );

    // ── 11b. Delete THIS task from Task Detail (two-step) ───────────────
    await win.getByRole("button", { name: "Delete", exact: true }).click();
    await win.waitForTimeout(150);
    await win.getByRole("button", { name: "Click again to confirm delete" }).click();
    await win.waitForTimeout(500);
    await shoot("after-task-delete");
    assertions.check(
      !existsSync(taskManifest),
      `Deleted task ${expectedTaskId} removed from disk`,
    );

    // ── 11c. Create a CAMPAIGN task to exercise the kind selector ───────
    // After task delete we're auto-navigated back to Dashboard (the
    // DeleteTaskButton calls setView("dashboard")). The current project's
    // id stays in the router's selectedProjectId, so Create Task will
    // default to TEST_NAME's project.
    await win.getByRole("button", { name: "Create Task" }).click();
    await win.waitForTimeout(200);
    // Kind select — identified by its "Campaign" option text.
    await win.locator('select').filter({ hasText: "Campaign" }).selectOption("campaign");
    await win.waitForTimeout(150);
    // After switching to campaign, two textareas exist: Description (first,
    // rows=4) and Items (second, rows=5). Target by placeholder to avoid
    // ordering dependency.
    await win.locator('textarea[placeholder*="thing-a.dll"]').fill("alpha.dll\nbeta.dll\ngamma.dll");
    await win.locator('input[placeholder^="Short, imperative"]').fill("Campaign smoke");
    await shoot("create-task-campaign");
    await win.locator('button[type="submit"]:has-text("Create Task")').click();
    await win.waitForTimeout(500);

    // TaskStore's counter re-uses TST-001F because the earlier delete freed
    // the slot. Find the card by its title rather than hardcoding the id.
    const campaignTaskCard = win.locator(".task", { hasText: "Campaign smoke" }).first();
    const campaignCount = await campaignTaskCard.count();
    assertions.check(
      campaignCount > 0,
      `Campaign task "Campaign smoke" appears on the board`,
    );

    // Click into Task Detail and verify Campaign Items table.
    await campaignTaskCard.click();
    await win.waitForTimeout(300);
    await shoot("campaign-task-detail");
    const campaignHeader = win.locator("h3", { hasText: "Campaign items" });
    assertions.check(
      (await campaignHeader.count()) > 0,
      `Task Detail shows "Campaign items" section for campaign kind`,
    );
    // 3 item IDs (item-0001..item-0003) should render as <strong>.
    const item1 = await win.locator("text=item-0001").count();
    const item2 = await win.locator("text=item-0002").count();
    const item3 = await win.locator("text=item-0003").count();
    assertions.check(
      item1 > 0 && item2 > 0 && item3 > 0,
      `Campaign items table renders 3 rows (item-0001..item-0003)`,
    );

    // Verify item descriptions made it through.
    const alphaVisible = await win.locator("text=alpha.dll").count();
    assertions.check(alphaVisible > 0, `Campaign item description "alpha.dll" rendered`);

    // ── 11d. Approval gate: push the task to "approval" lane via IPC
    //         (no UI path to flip lane arbitrarily yet), verify the gate
    //         renders + Approve advances the lane to "done".
    // Use the current campaign task since it's on Task Detail.
    const campaignId = await win.evaluate(() => {
      // Grab the id from the h1 — format is "<id> — <title>".
      const h1 = document.querySelector("h1");
      return h1?.textContent?.split(" — ")[0] ?? "";
    });
    await win.evaluate(async (id) => {
      // window.mc is exposed by preload in test mode too.
      const task = await (window).mc.getTask(id);
      if (!task) return;
      await (window).mc.saveTask({ ...task, lane: "approval" });
    }, campaignId);
    await win.waitForTimeout(500);
    await shoot("approval-gate");
    const gateHeader = await win.locator("h3", { hasText: "Awaiting human approval" }).count();
    assertions.check(gateHeader > 0, `Approval gate renders when lane === "approval"`);

    await win.getByRole("button", { name: "✓ Approve" }).click();
    await win.waitForTimeout(500);
    const afterApprove = await win.evaluate(async (id) => {
      const t = await (window).mc.getTask(id);
      return t?.lane ?? "";
    }, campaignId);
    assertions.check(
      afterApprove === "done",
      `Approve advanced lane from "approval" to "done" (got "${afterApprove}")`,
    );

    const toast = win.locator('.toast:has-text("Moved to done")').first();
    assertions.check(
      (await toast.count()) > 0,
      `Lane change shows a toast`,
    );

    // Back to dashboard, then use the toast to jump back into the task.
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(200);
    await toast.click();
    await win.waitForTimeout(300);
    const h1AfterToast = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      h1AfterToast.startsWith(campaignId),
      `Clicking a toast opens the matching task (got "${h1AfterToast.trim()}")`,
    );

    // Back to dashboard for the remaining flows.
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(200);

    // ── 11d. Metrics page — navigate, verify KPI row, back ──────────────
    await win.getByRole("button", { name: "Metrics" }).click();
    await win.waitForTimeout(400);
    await shoot("metrics");
    const metricsH1 = (await win.locator("h1").first().textContent()) ?? "";
    assertions.check(
      metricsH1.trim() === "Metrics",
      `Metrics page renders (h1="${metricsH1.trim()}")`,
    );
    const kpiCards = await win.locator(".kpi").count();
    assertions.check(kpiCards >= 6, `Metrics page shows ≥6 KPI cards (got ${kpiCards})`);
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(200);

    // ── 12. Back to project detail for delete flow ──────────────────────
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

    // Exercise the "+ Add model" button (adds an empty row) then remove it.
    const rowsBeforeAdd = await win.locator('input[placeholder="claude-opus"]').count();
    await win.getByRole("button", { name: "+ Add model" }).click();
    await win.waitForTimeout(100);
    const rowsAfterAdd = await win.locator('input[placeholder="claude-opus"]').count();
    assertions.check(
      rowsAfterAdd === rowsBeforeAdd + 1,
      `+ Add model appends a new row (${rowsBeforeAdd} → ${rowsAfterAdd})`,
    );
    // Click the last × button in that row.
    const removeBtns = win.locator('button:has-text("✕")');
    const removeCount = await removeBtns.count();
    if (removeCount > 0) await removeBtns.nth(removeCount - 1).click();
    await win.waitForTimeout(100);
    const rowsAfterRemove = await win.locator('input[placeholder="claude-opus"]').count();
    assertions.check(
      rowsAfterRemove === rowsBeforeAdd,
      `× remove button drops the row (${rowsAfterAdd} → ${rowsAfterRemove})`,
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

    // ── 15. Settings → Workflows: lane pills (F default, X custom) ──────
    await win.getByRole("button", { name: "Workflows", exact: true }).click();
    await win.waitForTimeout(300);
    await shoot("settings-workflows");
    // F-feature should render "(default)" label — it has no custom lanes.
    const fDefaultLabel = await win.locator('text="Lanes (default):"').count();
    assertions.check(
      fDefaultLabel > 0,
      `F-feature workflow shows "(default)" lane label`,
    );
    // X-brainstorm has lanes=["plan","develop","done"] → "(custom)".
    const xCustomLabel = await win.locator('text="Lanes (custom):"').count();
    assertions.check(
      xCustomLabel > 0,
      `X-brainstorm workflow shows "(custom)" lane label`,
    );

    // ── 16. Settings → Agents tab renders ───────────────────────────────
    await win.getByRole("button", { name: "Agents", exact: true }).click();
    await win.waitForTimeout(300);
    await shoot("settings-agents");
    // Should list primary roles — "Planner" header is always present.
    const plannerHeader = await win.locator('text="Planner"').count();
    assertions.check(
      plannerHeader > 0,
      `Settings → Agents lists "Planner"`,
    );

    // ── 17. Settings → Global tab renders ───────────────────────────────
    await win.getByRole("button", { name: "Global", exact: true }).click();
    await win.waitForTimeout(300);
    await shoot("settings-global");
    const pathsHeader = await win.locator('h3', { hasText: "Paths" }).count();
    assertions.check(pathsHeader > 0, `Settings → Global shows "Paths" section`);

    // Babysitter mode card with three radios (plan / execute / direct).
    const babysitterHeader = await win.locator('h3', { hasText: "Babysitter mode" }).count();
    assertions.check(babysitterHeader > 0, `Settings → Global shows Babysitter mode card`);
    const radios = await win.locator('input[name="babysitter-mode"]').count();
    assertions.check(radios === 3, `All three babysitter-mode radios render (got ${radios})`);

    // ── 18. Modal dismiss via ✕ close button ────────────────────────────
    // Navigate back, open Add Project, close via ✕, verify it dismissed.
    await win.getByRole("button", { name: /Dashboard/ }).click();
    await win.waitForTimeout(200);
    const addBtn2 = win.getByRole("button", { name: "+", exact: true });
    await addBtn2.click();
    await win.waitForTimeout(150);
    // Modal's close button is a ✕ in the Modal header.
    const closeX = win.locator('button:has-text("✕")').first();
    await closeX.click();
    await win.waitForTimeout(200);
    const addModalGone = await win.locator('input[placeholder="DogApp"]').count();
    assertions.check(
      addModalGone === 0,
      `Add Project modal closes on ✕`,
    );

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
