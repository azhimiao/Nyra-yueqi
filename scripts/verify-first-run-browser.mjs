/** Production First Light V2 browser journeys. Uses isolated test storage. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs/qa/first-run-v2");
await mkdir(output, { recursive: true });
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-first-run-v2"), server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
const results = [], errors = [];
let browser;
function seed() {
  if (localStorage.getItem("first-run-v2-fixture")) return;
  localStorage.setItem("first-run-v2-fixture", "1");
  const values = {
    "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
    "yueqi.ecosystem.v1": { loggedIn: false, token: "", authMode: "offline", productMode: "developer" },
    "yueqi.onboarding.v1": { done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true },
    "yueqi.autonomy.v1": { onboardingComplete: false, preset: "quiet" },
  };
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
}
try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  async function makePage(size = { width: 390, height: 844 }, onboarded = true) {
    const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    if (onboarded) await page.addInitScript(seed);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    return { context, page };
  }
  const host = (page) => page.locator(".first-light.is-open");
  const stage = (page) => host(page).getAttribute("data-fl-stage");
  const next = (page) => host(page).locator('[data-fl-action="NEXT"]').click();
  const waitStage = (page, value) => page.locator(`.first-light.is-open[data-fl-stage="${value}"]`).waitFor();
  const choose = (page, field, value) => host(page).locator(`[data-fl-field-wrap="${field}"] [data-fl-option="${value}"]`).click();
  async function careful(page) {
    await host(page).waitFor({ timeout: 60000 });
    for (let i = 0; i < 3 && await stage(page) !== "PATH_SELECT"; i++) await next(page);
    await waitStage(page, "PATH_SELECT");
    await host(page).locator('[data-fl-path="careful"]').click();
    await waitStage(page, "IDENTITY");
  }
  async function identify(page) {
    await careful(page);
    await host(page).locator('[data-fl-field="character.name"]').fill("林间");
    await choose(page, "character.genderIdentity", "unset");
    assert.equal(await stage(page), "IDENTITY", "selection does not auto-advance");
    await next(page); await waitStage(page, "USER_ADDRESS");
    await host(page).locator('[data-fl-field="preference.callUserAs"]').fill("小满");
    await next(page); await waitStage(page, "RELATIONSHIP");
  }
  async function run(name, task) {
    try { await task(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
  }
  await run("fresh language choice confirms before account gate", async () => {
    const { page, context } = await makePage(undefined, false);
    try {
      const gate = page.locator("[data-onboard-gate]");
      await gate.waitFor({ state: "visible", timeout: 60000 });
      assert.equal(await gate.getAttribute("data-onboard-current-step"), "language");
      await gate.locator('[data-set-locale="zh-CN"]').click();
      assert.equal(await gate.getAttribute("data-onboard-current-step"), "language");
      await gate.locator("[data-onboard-language-next]").click();
      assert.equal(await gate.getAttribute("data-onboard-current-step"), "account");
    } finally { await context.close(); }
  });
  await run("identity, address and relationship persist through back and reload", async () => {
    const { page, context } = await makePage();
    try {
      await identify(page);
      await choose(page, "preference.relationshipType", "lover");
      await choose(page, "preference.relationshipType", "friend");
      assert.equal(await stage(page), "RELATIONSHIP");
      await next(page); await waitStage(page, "PURPOSES");
      await host(page).locator('[data-fl-action="BACK"]').click();
      await waitStage(page, "RELATIONSHIP");
      assert.equal(await host(page).locator('[data-fl-option="friend"]').getAttribute("aria-checked"), "true");
      await page.reload({ waitUntil: "domcontentloaded" });
      await host(page).waitFor({ timeout: 60000 }); await waitStage(page, "RELATIONSHIP");
      assert.equal(await host(page).locator('[data-fl-option="friend"]').getAttribute("aria-checked"), "true");
      await host(page).locator('[data-fl-action="BACK"]').click();
      assert.equal(await host(page).locator('[data-fl-field="preference.callUserAs"]').inputValue(), "小满");
      await page.screenshot({ path: path.join(output, "address-390.png") });
    } finally { await context.close(); }
  });
  await run("purpose limit, toggle and unsure exclusivity", async () => {
    const { page, context } = await makePage();
    try {
      await identify(page);
      await choose(page, "preference.relationshipType", "friend"); await next(page);
      for (const value of ["daily", "romance", "listen", "grow"]) await choose(page, "preference.purposes", value);
      assert.equal(await host(page).locator('[data-fl-option="grow"]').getAttribute("aria-checked"), "false");
      await choose(page, "preference.purposes", "listen"); await choose(page, "preference.purposes", "grow");
      assert.equal(await host(page).locator('[data-fl-option="grow"]').getAttribute("aria-checked"), "true");
      await choose(page, "preference.purposes", "unsure");
      assert.equal(await host(page).locator('[data-fl-option="daily"]').getAttribute("aria-checked"), "false");
      await choose(page, "preference.purposes", "daily");
      assert.equal(await host(page).locator('[data-fl-option="unsure"]').getAttribute("aria-checked"), "false");
      assert.equal(await stage(page), "PURPOSES");
    } finally { await context.close(); }
  });
  for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await run(`layout and shortened viewport at ${size.width}`, async () => {
      const { page, context } = await makePage(size);
      try {
        await careful(page);
        await page.screenshot({ path: path.join(output, `identity-${size.width}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.setViewportSize({ width: size.width, height: 480 });
        await host(page).locator('[data-fl-field="character.name"]').fill("林间");
        await choose(page, "character.genderIdentity", "unset"); await next(page);
        await waitStage(page, "USER_ADDRESS");
        await host(page).locator('[data-fl-field="preference.callUserAs"]').fill("小满"); await next(page);
        await waitStage(page, "RELATIONSHIP");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      } finally { await context.close(); }
    });
  }
  await run("no uncaught runtime errors", async () => assert.deepEqual(errors, []));
} finally {
  await browser?.close(); await vite.close();
  const report = { at: new Date().toISOString(), isolated: true, scope: "Current production V2; browser viewport resizing is not native IME evidence", passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results, errors };
  await writeFile(path.join(output, "REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`First-run V2 browser: ${report.passed}/${results.length}`);
  if (report.failed) process.exitCode = 1;
}
