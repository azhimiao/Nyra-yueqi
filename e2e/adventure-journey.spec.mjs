import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { BASE_URL, installPhoneFixture, openPhoneApp, openPhoneHome } from "./helpers/phone.mjs";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const page = await context.newPage();
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

try {
  await installPhoneFixture(page, { experienceStub: false });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("adventure-e2e-initialized")) {
      localStorage.removeItem("yueqi.adventure.v2");
      sessionStorage.setItem("adventure-e2e-initialized", "1");
    }
  });
  await openPhoneHome(page);
  await openPhoneApp(page, "adventure");
  await page.locator('[data-adv-view="library"].is-active').waitFor({ state: "visible" });

  check("adventure opens on world library", await page.locator("[data-adv-package-list] [data-adv-package]").count() >= 2);
  check("tutorial is separated and honestly labelled", await page.locator('[data-adv-tutorial-list] [data-adv-package="adventure-field-guide"]').isVisible());
  const libraryFits = await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    const app = document.querySelector("[data-adventure-mount]");
    return Boolean(phone && app && app.scrollWidth <= phone.clientWidth + 2);
  });
  check("adventure library has no horizontal overflow", libraryFits);

  await page.locator('[data-adv-package="adventure-field-guide"]').click();
  await page.locator('[data-adv-view="setup"].is-active').waitFor({ state: "visible" });
  check("setup exposes opening and character role", await page.locator("[data-adv-opening]").count() >= 1 && await page.locator("[data-adv-archetype]").count() === 3);
  await page.locator("[data-adv-character-name]").fill("岚");
  await page.locator('[data-adv-archetype="observer"]').click();
  await page.locator("[data-adv-start-run]").click();
  await page.locator('[data-adv-view="game"].is-active').waitFor({ state: "visible" });
  check("game HUD exposes objective stats and archive", await page.locator("[data-adv-objective-band]").isVisible() && await page.locator("[data-adv-status-strip] button").count() === 4);
  check("three action semantics are distinct", await page.locator("[data-adv-mode]").count() === 3);

  const stateBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.[0]?.state);
  await page.locator('[data-adv-mode="do"]').click();
  await page.locator("[data-adv-input]").fill("检查门锁并尝试打开安全门。");
  await page.locator("[data-adv-form]").evaluate((form) => form.requestSubmit());
  await page.locator("[data-adv-candidate]").waitFor({ state: "visible" });
  const stateStaged = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.[0]?.state);
  check("candidate preview does not mutate world", JSON.stringify(stateBefore) === JSON.stringify(stateStaged));
  check("candidate names checks and effects before acceptance", await page.locator(".adv-check-preview").isVisible() && await page.locator(".adv-effect-preview").isVisible());

  await page.locator("[data-adv-accept-candidate]").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.[0]?.turns?.length === 2);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.[0]);
  check("acceptance persists a resolved turn", after.turns.at(-1)?.resolution?.checks?.length === 1);
  check("acceptance advances world state", after.state.locationId === "service-corridor" && after.state.clock.hour > stateBefore.clock.hour);

  await page.locator('[data-adv-open-drawer="map"]').first().click();
  await page.locator("[data-adv-drawer]").waitFor({ state: "visible" });
  check("map drawer shows current location", await page.locator(".adv-map-node.is-current").count() === 1);
  await page.locator('[data-adv-drawer-tab="quests"]').click();
  check("quest drawer shows objective progress", await page.locator(".adv-quest-row").count() >= 1);
  await page.locator('[data-adv-drawer-tab="bag"]').click();
  check("inventory is a real persisted surface", await page.locator(".adv-bag-list article").count() >= 1);
  await page.locator("[data-adv-close-drawer]").last().click();

  await page.locator("[data-adv-branch]").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.length === 2);
  check("branch action creates a second world line", await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.adventure.v2") || "{}").runs?.length === 2));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".mini-phone").waitFor({ state: "visible" });
  const unlock = page.locator("[data-lock-to-passcode]");
  if (await unlock.isVisible().catch(() => false)) await unlock.click();
  await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
  await openPhoneApp(page, "adventure");
  check("refresh preserves resumable world lines", await page.locator("[data-adv-resume-band] [data-adv-open-run]").count() >= 1);

  await mkdir("docs/qa", { recursive: true });
  await page.screenshot({ path: "docs/qa/creative-modes-adventure-mobile.png", fullPage: true });
} catch (error) {
  console.error(error);
  check("adventure e2e has no fatal exception", false, error?.message || error);
} finally {
  await context.close();
  await browser.close();
}

const failed = checks.filter((item) => !item.pass);
console.log(`\ne2e:adventure ${checks.length - failed.length}/${checks.length}${failed.length ? " RED" : " GREEN"} @ ${BASE_URL}`);
if (failed.length) process.exitCode = 1;
