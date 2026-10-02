/**
 * C3 — capture TA phone candidate screenshots (six apps list+detail).
 * Requires `npm run dev` on DEMO_URL.
 *
 * Usage: node scripts/capture-core-c3.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("docs/qa/core-experience/C3/candidate");

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
];

const APPS = [
  { key: "messages", list: "messages-list", detail: "messages-detail" },
  { key: "album", list: "album-list", detail: "album-detail" },
  { key: "calendar", list: "calendar-list", detail: "calendar-detail" },
  { key: "memo", list: "memo-list", detail: "memo-detail" },
  { key: "browser", list: "browser-list", detail: "browser-detail" },
  { key: "orders", list: "orders-list", detail: "orders-detail" },
];

async function prepare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
      localStorage.setItem("yueqi.app.mode", "phone");
      localStorage.setItem(
        "yueqi.sidewrite.boundary.v1",
        JSON.stringify({ "char-xingli": new Date().toISOString() }),
      );
      // Capture: disable passcode so unlock is one tap
      const raw = localStorage.getItem("yueqi.phone.os.v1");
      let prefs = {};
      try {
        prefs = raw ? JSON.parse(raw) : {};
      } catch {
        prefs = {};
      }
      prefs.passcodeEnabled = false;
      localStorage.setItem("yueqi.phone.os.v1", JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-small-phone-root]", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const gate = document.querySelector("[data-lang-gate]");
    if (gate) {
      gate.hidden = true;
      gate.style.display = "none";
    }
    document.querySelector("[data-set-locale='zh-CN']")?.click();
    document.body.dataset.appMode = "phone";
    const root = document.querySelector("[data-small-phone-root]");
    if (root) {
      root.hidden = false;
      root.removeAttribute("hidden");
    }
  });

  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(600);

  // Real unlock (passcode disabled in init)
  await page.evaluate(() => {
    document.querySelector("[data-lock-to-passcode]")?.click();
  });
  await page.waitForFunction(() => {
    const phone = document.querySelector(".mini-phone");
    return phone && phone.dataset.phoneLocked === "false";
  }, { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function openSidewrite(page) {
  // Go to apps page via pager dots
  const appsDot = page.locator('[data-home-dot][data-page="1"]');
  if (await appsDot.count()) {
    await appsDot.click();
    await page.waitForTimeout(350);
  }

  const icon = page.locator('[data-app-id="sidewrite"]').first();
  await icon.waitFor({ state: "visible", timeout: 8000 });
  await icon.click();
  await page.waitForTimeout(900);

  // Ensure sidewrite screen is visible (icon open can race with paint)
  await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    if (phone) phone.dataset.phoneView = "app";
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const match = el.dataset.phoneScreen === "sidewrite";
      el.hidden = !match;
      el.classList.toggle("is-active", match);
    });
  });
  await page.waitForTimeout(400);

  // Prefer already-entered TA layers; picker may remain in DOM but hidden after auto-enter
  for (let i = 0; i < 15; i += 1) {
    const state = await page.evaluate(() => ({
      unlock: Boolean(document.querySelector("[data-ta-unlock]")),
      consent: Boolean(document.querySelector("[data-ta-consent-ok]")),
      desktop: Boolean(document.querySelector("[data-ta-open-app]")),
      pickVisible: Boolean(
        document.querySelector('[data-sw-layer="picker"]:not([hidden]) [data-sw-pick]'),
      ),
    }));
    if (state.unlock || state.consent || state.desktop || state.pickVisible) break;
    await page.waitForTimeout(350);
  }

  if (await page.locator("[data-ta-consent-ok]").isVisible().catch(() => false)) {
    await page.locator("[data-ta-consent-ok]").click();
    await page.waitForTimeout(400);
  } else if (await page.locator('[data-sw-layer="picker"]:not([hidden]) [data-sw-pick]').count()) {
    await page.locator('[data-sw-layer="picker"]:not([hidden]) [data-sw-pick]').first().click({ force: true });
    await page.waitForTimeout(600);
  }
}

async function unlockTa(page) {
  if (await page.locator("[data-ta-unlock]").count()) {
    await page.locator("[data-ta-unlock]").click();
    await page.waitForTimeout(400);
  }
  await page.waitForSelector("[data-ta-open-app='messages']", { timeout: 12000 });
}

async function goDesktop(page) {
  await page.evaluate(() => {
    document.querySelector("[data-ta-home]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await page.waitForTimeout(280);
  await page.waitForSelector("[data-ta-open-app='messages']", { timeout: 8000 });
}

async function shot(page, dir, name) {
  const phone = page.locator(".mini-phone");
  const target = (await phone.count()) ? phone : page.locator("body");
  await target.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function openApp(page, key) {
  await goDesktop(page);
  await page.locator(`[data-ta-open-app="${key}"]`).first().click();
  await page.waitForTimeout(450);
}

async function openFirstDetail(page, appKey) {
  const selectors = [
    "[data-ta-thread]",
    "[data-ta-album]",
    "[data-ta-cal]",
    "[data-ta-memo]",
    "[data-ta-browser]",
    "[data-ta-order]",
  ];
  for (const sel of selectors) {
    const row = page.locator(sel).first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(400);
      break;
    }
  }
  if (appKey === "album") {
    const photo = page.locator("[data-ta-photo]").first();
    if (await photo.count()) {
      await photo.click();
      await page.waitForTimeout(350);
    }
  }
}

async function captureViewport(browser, vp) {
  const dir = path.join(OUT_ROOT, vp.name);
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await prepare(page);
  await openSidewrite(page);
  await shot(page, dir, "01-lock");
  await unlockTa(page);
  await shot(page, dir, "02-desktop");

  for (const app of APPS) {
    await openApp(page, app.key);
    await shot(page, dir, `app-${app.list}`);
    await openFirstDetail(page, app.key);
    await shot(page, dir, `app-${app.detail}`);
  }

  await writeFile(
    path.join(dir, "MANIFEST.txt"),
    `C3 candidate ${vp.name}\n${new Date().toISOString()}\n`,
    "utf8",
  );
  await page.close();
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      console.log(`Capturing ${vp.name}…`);
      await captureViewport(browser, vp);
    }
  } finally {
    await browser.close();
  }
  console.log(`Wrote screenshots under ${OUT_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
