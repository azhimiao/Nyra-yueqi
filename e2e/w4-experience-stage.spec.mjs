/**
 * W4 Experience Stage E2E — real clicks; uses openPhoneHome (phone mode).
 * Evidence under docs/qa/open-experience/W4/
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
  enterScenarioStage,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/open-experience/W4/evidence");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    recordVideo: { dir: path.join(OUT, "video"), size: { width: 390, height: 844 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  await installPhoneFixture(page);

  try {
    await openPhoneHome(page);
    check("phone home unlocked", await page.locator('[data-phone-screen="home"].is-active').isVisible());

    await openPhoneApp(page, "scenario");
    check(
      "scenario screen active",
      await page.locator('[data-phone-screen="theater"].is-active, [data-phone-screen="scenario"].is-active').first().isVisible(),
    );

    await page.locator('[data-scenario-view="select"].is-active [data-pick-work], [data-scenario-view="select"].is-active [data-scenario-select-char]').first().waitFor({
      state: "visible",
      timeout: 12000,
    });
    const work = page.locator('[data-pick-work="script-rain-station"], [data-pick-work]').first();
    await work.waitFor({ state: "visible", timeout: 8000 });
    await work.click();
    await page.waitForSelector('[data-scenario-view="chapters"].is-active', { timeout: 12000 });
    const openings = page.locator("[data-opening-enter]");
    await openings.first().waitFor({ state: "visible", timeout: 8000 });
    const count = await openings.count();
    check("opening map shows ≥3 openings", count >= 3, `count=${count}`);
    await openings.nth(0).click();
    await page.waitForSelector('[data-scenario-view="stage"].is-active', { timeout: 15000 });
    check("entered immersive stage", true);

    await page.locator(".mini-phone").screenshot({ path: path.join(OUT, "390x844-stage.png") });

    const branchBtn = page.locator("[data-scenario-branches]");
    await branchBtn.waitFor({ state: "visible", timeout: 8000 });
    await branchBtn.click();
    const openHost = page.locator("[data-scenario-branch-host].is-open, [data-scenario-branch-host]:not([hidden])");
    await openHost.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const panel = page.locator("[data-branch-sheet]");
    check("branch panel opens", await panel.isVisible().catch(() => false));
    const close = page.locator("[data-branch-close]").first();
    if (await close.isVisible().catch(() => false)) await close.click();
    await page.waitForTimeout(200);

    await homeFromAnywhere(page);
    check("return home", await page.locator('[data-phone-screen="home"].is-active').isVisible());

    // Re-open scenario — state preserve soft check
    await openPhoneApp(page, "scenario");
    check("reopen scenario", await page.locator('[data-phone-screen="scenario"].is-active').isVisible());
  } catch (err) {
    check("journey fatal", false, String(err.message || err));
    await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true }).catch(() => {});
  }

  try {
    await context.tracing.stop({ path: path.join(OUT, "trace.zip") });
  } catch {
    /* ignore */
  }
  await context.close();
  await browser.close();

  const failed = checks.filter((c) => !c.pass);
  console.log(`\ne2e:w4-stage ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
