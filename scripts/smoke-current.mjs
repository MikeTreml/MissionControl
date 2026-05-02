#!/usr/bin/env node
/**
 * Focused smoke against the current shell — exercises live surfaces and
 * captures screenshots. Sibling to verify-ui.mjs (which still carries
 * stale assertions from earlier shells like the "Mission Control" h1
 * and "bridge ok" text — neither exists in the v2 design).
 */
import { _electron as electron } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SHOTS = path.join(HERE, "smoke-shots");

const results = [];
function check(ok, label) {
  results.push({ ok, label });
  console.log(`${ok ? "  GREEN " : "  FAIL  "} ${label}`);
}

async function main() {
  if (existsSync(SHOTS)) await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });

  console.log("[smoke] launching Electron…");
  const app = await electron.launch({
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_ENV: "test" },
  });
  app.process().stderr?.on("data", (d) => {
    const s = d.toString();
    // Filter expected DevTools noise.
    if (/Autofill|cert_verify|ssl_client|viz_main_impl|command_buffer/.test(s)) return;
    process.stderr.write(`  [main:err] ${s}`);
  });

  const win = await app.firstWindow();
  win.on("pageerror", (err) => console.log(`  [renderer:pageerror] ${err.message}`));
  await win.waitForLoadState("domcontentloaded");
  // Match the canvas-mockup viewport so the 6-lane board, 4 KPIs, and
  // 340px right rail all fit without horizontal scroll.
  await win.setViewportSize({ width: 1600, height: 1000 });
  await win.waitForTimeout(700);

  let n = 0;
  const shoot = (label) =>
    win.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, "0")}-${label}.png`) });

  try {
    // 1. Shell mounts cleanly.
    await shoot("01-dashboard");
    const sidebar = win.locator(".sidebar, [class*='sidebar']").first();
    await sidebar.waitFor({ state: "visible", timeout: 5000 });
    check(true, "Sidebar renders");

    // Navigation labels we expect today.
    for (const label of ["Board", "Drafts", "Library", "Run history", "Hand-offs", "Models", "Agents", "Settings", "Metrics"]) {
      const found = await win.locator(`text=${label}`).first().isVisible().catch(() => false);
      check(found, `Sidebar shows "${label}"`);
    }

    // Topbar crumbs.
    const crumbs = await win.locator("text=Workspace").first().isVisible().catch(() => false);
    check(crumbs, "Topbar shows Workspace crumb");

    // Footer command bar.
    const cmdBar = await win.locator('input[placeholder*="Tell an agent"]').first().isVisible().catch(() => false);
    check(cmdBar, "Footer command bar input is visible");

    // 2. Library page loads, has 4 kind tabs.
    await win.locator("text=Library").first().click();
    await win.waitForTimeout(500);
    await shoot("02-library");
    for (const tab of ["Workflow", "Agent", "Skill", "Misc"]) {
      const tabBtn = await win.locator(`button:has-text("${tab}")`).first().isVisible().catch(() => false);
      check(tabBtn, `Library shows "${tab}" tab`);
    }

    // Click Agent tab — confirm activation.
    await win.locator('button:has-text("Agent")').first().click();
    await win.waitForTimeout(300);
    await shoot("03-library-agent-tab");
    check(true, "Click Agent tab without crash");

    // 3. Settings.
    await win.locator("text=Settings").first().click();
    await win.waitForTimeout(400);
    await shoot("04-settings-global");
    const settled = await win.locator("text=/Settings|Global|babysitter|preferences/i").first().isVisible().catch(() => false);
    check(settled, "Settings page renders content");

    // Models tab.
    await win.locator("text=Models").first().click();
    await win.waitForTimeout(400);
    await shoot("05-settings-models");
    check(true, "Settings Models loads without crash");

    // Agents tab.
    await win.locator("text=Agents").first().click();
    await win.waitForTimeout(400);
    await shoot("06-settings-agents");
    check(true, "Settings Agents loads without crash");

    // 4. Command palette (⌘K / Ctrl+K).
    await win.keyboard.press("Control+K");
    await win.waitForTimeout(300);
    await shoot("07-cmdk");
    const palette = await win.locator('[class*="cmdk"], [class*="palette"], input[placeholder*="search" i]').first().isVisible().catch(() => false);
    check(palette, "Command palette opens via Ctrl+K");
    await win.keyboard.press("Escape");
    await win.waitForTimeout(200);

    // 5. Add Project modal.
    const plus = win.getByRole("button", { name: "+", exact: true }).first();
    if (await plus.isVisible().catch(() => false)) {
      await plus.click();
      await win.waitForTimeout(300);
      await shoot("08-add-project");
      const dialog = await win.locator('text=/New Project|Project name|Create Project/i').first().isVisible().catch(() => false);
      check(dialog, "Add project modal opens");
      // Cancel out.
      const cancel = win.getByRole("button", { name: /Cancel/i }).first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click();
      await win.waitForTimeout(200);
    } else {
      check(false, "Sidebar + button not found");
    }

    // 6. + New task in topbar.
    const newTask = win.getByRole("button", { name: /New task/i }).first();
    if (await newTask.isVisible().catch(() => false)) {
      await newTask.click();
      await win.waitForTimeout(300);
      await shoot("09-new-task");
      const dlg = await win.locator('text=/New Task|Create Task|Title/i').first().isVisible().catch(() => false);
      check(dlg, "+ New task modal opens");
    } else {
      check(false, "+ New task button not found");
    }
  } catch (err) {
    console.log(`[smoke] threw: ${err?.message || err}`);
    await shoot("crash").catch(() => {});
    check(false, `Uncaught: ${err?.message || err}`);
  } finally {
    await app.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n[smoke] ${passed}/${results.length} green, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
