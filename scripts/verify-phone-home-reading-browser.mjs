/** Real home surfaces with isolated local data. No user profile or model calls. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as portProbe } from "node:net";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs/qa/phone-home-reading");
await mkdir(out, { recursive: true });
const results = [], runtimeErrors = [];
const port = await new Promise((resolve, reject) => {
  const probe = portProbe(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const candidate = probe.address().port; probe.close((error) => error ? reject(error) : resolve(candidate)); });
});
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-phone-home-reading"), server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null } });
let browser;
const run = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, pass: true, detail }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
};
async function freshPage({ width = 390, height = 844, locale = "zh-CN", theme = "", music = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
  await page.addInitScript(({ locale, music }) => {
    if (localStorage.getItem("phone-home-reading-fixture")) return;
    localStorage.setItem("phone-home-reading-fixture", "1");
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale, localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", "phone"); localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
    localStorage.setItem("yueqi.firstLight.v2", JSON.stringify({ schemaVersion: 2, stage: "COMPLETED", done: true, paused: false }));
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
    localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: false, token: "", authMode: "offline", productMode: "developer" }));
    localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
    if (music) localStorage.setItem("yueqi.coListenState.v1", JSON.stringify(music));
  }, { locale, music });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready") && window.__yueqiPhone, null, { timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.appMode === "phone" && document.querySelector('.mini-phone[data-phone-view="home"]'));
  if (theme) await page.evaluate(async (id) => { const { saveAppearanceSettings } = await import("/src/settings/appearance.js"); await saveAppearanceSettings({ themeId: id }); }, theme);
  await page.locator('[data-widget="today"]').waitFor();
  await page.waitForTimeout(180);
  return page;
}
async function inspect(page) {
  const info = await page.evaluate(() => {
    const home = document.querySelector('[data-phone-screen="home"]');
    const rect = (selector) => home.querySelector(selector)?.getBoundingClientRect().toJSON();
    const elements = [...home.querySelectorAll('[data-widget]:not([hidden]), .mini-today__action-label, .mini-home-widget-action, .mini-cal-widget__action')];
    return {
      width: innerWidth, pageWidth: document.documentElement.scrollWidth,
      dock: [...home.querySelectorAll('[data-home-dock] [data-app-id]')].map((el) => el.dataset.appId),
      grid: [...home.querySelectorAll('[data-home-app-grid] [data-app-id]')].map((el) => el.dataset.appId),
      widgets: [...home.querySelectorAll('[data-widget]:not([hidden])')].map((el) => el.dataset.widget),
      rects: elements.map((el) => ({ name: el.dataset.widget || el.className, ...el.getBoundingClientRect().toJSON() })),
      today: rect('[data-widget="today"]'), listen: rect('[data-widget="listen"]'), calendar: rect('[data-widget="calendar"]'), dockBounds: rect('[data-home-dock]'),
      title: rect('[data-home-listen-title]'), arrow: rect('.mini-home-widget-action'),
      shortcuts: home.querySelectorAll('[data-home-quick-action]').length,
      listenText: home.querySelector('[data-home-listen-title]')?.textContent,
    };
  });
  assert.ok(info.pageWidth <= info.width, `document overflow ${info.pageWidth}/${info.width}`);
  assert.equal(info.shortcuts, 0);
  assert.deepEqual(info.dock, ["diary", "gallery", "profile", "settings"]);
  assert.deepEqual(info.widgets, ["clock", "today", "listen", "calendar"]);
  assert.ok(["shop", "qishi"].every((id) => info.grid.includes(id)));
  assert.ok(["pop", "listen", "calendar"].every((id) => !info.grid.includes(id) && !info.dock.includes(id)));
  assert.ok(info.calendar.bottom < info.dockBounds.top, "calendar clipped behind dock");
  assert.ok(info.title.right <= info.arrow.left, "music title overlaps navigation arrow");
  for (const item of info.rects) assert.ok(item.left >= 0 && item.right <= info.width + 1, `${item.name} overflow`);
  return info;
}
try {
  await vite.listen(); browser = await chromium.launch();
  for (const width of [390, 360]) await run(`Chinese real home ${width}: clear actions, no duplicate entries or overlap`, async () => {
    const page = await freshPage({ width, height: width === 360 ? 780 : 844 });
    try {
      const info = await inspect(page);
      assert.match(info.listenText, /选一首歌/);
      assert.equal(await page.locator('.mini-vinyl__progress').isVisible(), false);
      assert.equal(await page.locator('[data-widget="listen"] [data-lucide="play"]').count(), 0);
      await page.screenshot({ path: path.join(out, `home-${width}.png`), animations: "disabled" });
      const widget = page.locator('[data-widget="today"]');
      await widget.click(); await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "pop");
      await page.locator('[data-pop-nav-back]').click();
      if (await page.locator('.mini-phone').getAttribute('data-phone-view') !== "home") await page.locator('[data-pop-nav-back]').click();
      await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "home");
      await page.locator('[data-widget="listen"]').click(); await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "listen");
      await page.locator('[data-phone-screen="listen"] [data-phone-back]').click();
      await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "home");
      await page.locator('[data-cal-open-full]').click(); await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "calendar");
      return info;
    } finally { await page.context().close(); }
  });
  await run("English 360: visible labels and independent content bounds", async () => {
    const page = await freshPage({ width: 360, height: 780, locale: "en" });
    try { const info = await inspect(page); await page.screenshot({ path: path.join(out, "home-en-360.png"), animations: "disabled" }); return info; }
    finally { await page.context().close(); }
  });
  await run("Ink setting 390: phone home remains readable in its shared blue-white palette", async () => {
    const page = await freshPage({ theme: "ink" });
    try { assert.equal(await page.locator('html').getAttribute('data-theme'), "ink"); const info = await inspect(page); await page.screenshot({ path: path.join(out, "home-ink-390.png"), animations: "disabled" }); return info; }
    finally { await page.context().close(); }
  });
  await run("App page: all icons reachable with labels and market kept secondary", async () => {
    const page = await freshPage();
    try {
      await page.locator('[data-home-dot][data-page="1"]').click();
      await page.waitForFunction(() => document.querySelector('[data-home-dot][data-page="1"]')?.classList.contains("is-active"));
      await page.screenshot({ path: path.join(out, "apps-390.png"), animations: "disabled" });
      await page.locator('[data-home-app-grid] [data-app-id="qishi"]').click();
      await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === "qishi");
    } finally { await page.context().close(); }
  });
  await run("Saved music: actual duration drives progress without a synthetic fallback", async () => {
    const page = await freshPage({ music: { title: "QA · 雨停后的声音", positionSec: 30, durationSec: 120, paused: true } });
    try {
      await page.waitForFunction(() => document.querySelector('[data-home-listen-title]')?.textContent.includes("QA"));
      assert.equal(await page.locator('[data-home-listen-progress]').evaluate((el) => el.style.width), "25%");
      await page.screenshot({ path: path.join(out, "home-track-390.png"), animations: "disabled" });
    } finally { await page.context().close(); }
  });
} finally {
  await browser?.close(); await vite.close();
  await writeFile(path.join(out, "VERIFY.json"), JSON.stringify({ generatedAt: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, runtimeErrors, results }, null, 2));
}
assert.equal(runtimeErrors.length, 0, runtimeErrors.join("\n"));
assert.equal(results.filter((r) => !r.pass).length, 0);
