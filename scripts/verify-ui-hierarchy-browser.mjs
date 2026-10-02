import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = resolve(root, "docs/qa/ui-hierarchy");
await mkdir(out, { recursive: true });
const server = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 5198, strictPort: true, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
await context.route("https://fonts.gstatic.com/**", route => route.abort());
await context.addInitScript(() => {
  const entries = {
    "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
    "yueqi.firstLight.v1": { done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 },
    "yueqi.firstLight.v2": { schemaVersion: 2, stage: "COMPLETED", done: true, paused: false },
    "yueqi.onboarding.v1": { done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true },
    "yueqi.ecosystem.v1": { loggedIn: false, token: "", authMode: "offline", productMode: "developer" },
    "yueqi.autonomy.v1": { onboardingComplete: true, preset: "quiet" },
    "yueqi.phone.os.v1": { passcodeEnabled: false },
  };
  for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem("yueqi.app.mode", "phone");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log("PASS", name); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error("FAIL", name, error.message); }
}
const settings = page.locator('[data-phone-screen="settings"]');
const group = id => settings.locator(`[data-settings-group="${id}"]`);
async function expand(id) {
  if (await group(id).getAttribute("open") === null) await group(id).locator(":scope > summary").click();
}
async function shot(name) { await page.screenshot({ path: resolve(out, `${name}.png`), animations: "disabled" }); }
try {
  await page.goto("http://127.0.0.1:5198/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready" && window.__yueqiPhone, null, { timeout: 150000 });
  await page.locator('[data-app-id="settings"]:visible').first().click();
  await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-expanding"));
  await check("Five categories fit at 360 and 390; forms start collapsed", async () => {
    assert.equal(await settings.locator("[data-settings-group]").count(), 5);
    assert.equal(await settings.locator("[data-settings-group][open]").count(), 0);
    assert.equal(await settings.locator("[data-phone-auth-email]").isVisible(), false);
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const rects = await settings.locator(".mini-settings-group__summary").evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, bottom: r.bottom, height: r.height }; }));
      assert(rects.every(r => r.x >= -1 && r.right <= width + 1 && r.bottom < 844 && r.height >= 44), JSON.stringify(rects));
      await shot(`settings-${width}`);
    }
  });
  await check("Account auth modes show only their own fields and keep the draft", async () => {
    await expand("account-service");
    assert(await settings.locator("[data-phone-auth-email]").isVisible());
    assert.equal(await settings.locator("[data-phone-auth-phone]").isVisible(), false);
    await settings.locator('[data-phone-auth-type="phone"]').click();
    assert(await settings.locator("[data-phone-auth-phone]").isVisible());
    assert.equal(await settings.locator("[data-phone-auth-email]").isVisible(), false);
    await settings.locator("[data-phone-auth-phone]").fill("13800138000");
    await settings.locator("[data-phone-auth-password]").fill("local-ui-fixture");
    await page.setViewportSize({ width: 360, height: 844 });
    const geometry = await settings.locator(".mini-auth-phone").evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    assert(geometry.scroll <= geometry.client + 1);
    await shot("settings-account-360");
    await expand("phone-appearance");
    assert.equal(await settings.locator("[data-settings-group][open]").count(), 1);
    await settings.locator('[data-phone-locales] [data-segment-id="en"]').click();
    assert.notEqual(await group("phone-appearance").getAttribute("open"), null);
    await expand("account-service");
    assert.equal(await settings.locator("[data-phone-auth-phone]").inputValue(), "13800138000");
    assert.equal(await settings.locator("[data-phone-auth-password]").inputValue(), "local-ui-fixture");
    assert(await settings.locator("[data-phone-auth-phone]").isVisible());
  });
  await check("Back closes the category before leaving settings", async () => {
    await settings.locator(".mini-appbar [data-phone-back]").click();
    assert.equal(await settings.locator("[data-settings-group][open]").count(), 0);
    assert(await settings.isVisible());
    await shot("settings-en-360");
  });
  await check("Profile distinguishes identity from companion behavior controls", async () => {
    await expand("phone-appearance");
    await settings.locator('[data-phone-locales] [data-segment-id="zh-CN"]').click();
    await expand("role-conversation");
    await settings.locator('[data-phone-open="profile"]').click();
    const profile = page.locator('[data-phone-screen="profile"]');
    await profile.locator("[data-profile-toggle]").first().waitFor();
    assert.equal(await profile.locator(".mini-profile-fold-card[open]").count(), 0);
    await shot("profile-360");
    await profile.locator("[data-profile-toggle]").first().click();
    await profile.locator('[name="name"]:visible').waitFor();
    assert.equal(await profile.locator('[name="promptSystem"]').first().isVisible(), false);
    await shot("profile-editor-360");
  });
  await check("App music destination works from mobile drawer and desktop sidebar", async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: "app" } })));
    await page.locator('[data-drawer-open]:visible').first().click();
    await page.locator('[data-drawer-nav="library"]').click();
    await page.waitForFunction(() => document.body.dataset.activePanel === "library");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.side-tabs [data-tab="chat"]').click();
    await page.locator('.side-tabs [data-tab="library"]').click();
    assert(await page.locator('[data-panel="library"]').isVisible());
  });
  assert.deepEqual(errors, [], "browser runtime errors");
} finally {
  await writeFile(resolve(out, "BROWSER_VERIFY.json"), JSON.stringify({ checkedAt: new Date().toISOString(), results, runtimeErrors: errors }, null, 2));
  await browser.close(); await server.close();
}
if (results.some(r => !r.passed)) process.exitCode = 1;
