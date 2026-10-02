import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { installPhoneFixture } from "../e2e/helpers/phone.mjs";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT = "docs/qa/mobile-ux-repair";
const WIDGET_APPS = ["pop", "listen", "calendar"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function dragAcross(page, locator, fromRatio, toRatio) {
  const box = await locator.boundingBox();
  assert(box, "gesture target has no bounding box");
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toRatio, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(380);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

await installPhoneFixture(page);
await page.addInitScript(() => {
  if (!localStorage.getItem("yueqi.onboarding.v1")) {
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline" }));
  }
  if (!localStorage.getItem("yueqi.settings.v1")) {
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  }
  if (!localStorage.getItem("yueqi.phone.os.v1")) {
    localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
  }
});
await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__yueqiPhone?.openApp, { timeout: 60000 });
await page.evaluate(() => {
  document.querySelectorAll("[data-onboard-gate], .lang-gate").forEach((el) => {
    el.style.display = "none";
    el.hidden = true;
  });
  document.documentElement.classList.add("is-compact-shell", "is-native-app", "app-boot-ready");
  document.body.dataset.appMode = "phone";
  document.body.dataset.phoneReady = "1";
  delete document.body.dataset.phoneBooting;
  const phoneRoot = document.querySelector("[data-small-phone-root]");
  if (phoneRoot) {
    phoneRoot.hidden = false;
    phoneRoot.style.display = "block";
    phoneRoot.style.visibility = "visible";
  }
  document.querySelector(".app-shell")?.setAttribute("style", "display:none;pointer-events:none");
  window.__yueqiPhone?.setVisible?.(true, { lock: false });
  window.__yueqiPhone?.openApp?.("home");
});
await page.waitForTimeout(800);

const placement = await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem("yueqi.phone.os.v1") || "{}");
  return {
    grid: Array.from(document.querySelectorAll("[data-home-app-grid] [data-app-id]"), (el) => el.dataset.appId),
    dock: Array.from(document.querySelectorAll("[data-home-dock] [data-app-id]"), (el) => el.dataset.appId),
    folders: Object.values(prefs.folders || {}).flatMap((folder) => folder.apps || []),
    widgets: Array.from(document.querySelectorAll("[data-home-widgets] [data-widget]:not([hidden])"), (el) => el.dataset.widget),
  };
});
const duplicateSurfaces = [...placement.grid, ...placement.dock, ...placement.folders];
assert(WIDGET_APPS.every((id) => !duplicateSurfaces.includes(id)), `widget app duplicated: ${JSON.stringify(placement)}`);
assert(new Set([...placement.grid, ...placement.dock]).size === placement.grid.length + placement.dock.length, "grid and dock contain duplicate ids");
await page.screenshot({ path: `${OUT}/31-home-ia-page-one.png`, fullPage: false });

await dragAcross(page, page.locator(".mini-widget--today").first(), 0.82, 0.12);
assert(await page.locator('[data-home-dot][data-page="1"].is-active').count(), "left swipe did not open app page");
await page.screenshot({ path: `${OUT}/32-home-ia-app-page.png`, fullPage: false });

await dragAcross(page, page.locator('[data-home-app-grid="1"]').first(), 0.18, 0.88);
assert(await page.locator('[data-home-dot][data-page="0"].is-active').count(), "right swipe did not return to widget page");

const beforeOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.phone.os.v1") || "{}").widgetOrder || []);
const source = page.locator(".mini-home-greeting").first();
const target = page.locator(".mini-widget--calendar").first();
const sourceBox = await source.boundingBox();
const targetBox = await target.boundingBox();
assert(sourceBox && targetBox, "widget drag targets are unavailable");
await page.mouse.move(sourceBox.x + sourceBox.width * 0.35, sourceBox.y + sourceBox.height * 0.5);
await page.mouse.down();
await page.waitForTimeout(560);
await page.mouse.move(targetBox.x + targetBox.width * 0.5, targetBox.y + targetBox.height - 4, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(450);

const afterOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.phone.os.v1") || "{}").widgetOrder || []);
assert(JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder), `widget order did not change: ${JSON.stringify(afterOrder)}`);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__yueqiPhone?.openApp, { timeout: 60000 });
const persistedOrder = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.phone.os.v1") || "{}").widgetOrder || []);
assert(JSON.stringify(afterOrder) === JSON.stringify(persistedOrder), "widget order was not persisted after reload");

console.log(JSON.stringify({ placement, beforeOrder, afterOrder, persistedOrder }, null, 2));
console.log("PASS phone home IA: unique entries, bidirectional paging, movable page-one widgets");
await browser.close();
