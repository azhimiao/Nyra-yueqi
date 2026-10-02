/**
 * C4 — capture scenario theater candidate screenshots + stage frames.
 * Requires `npm run dev` on DEMO_URL.
 *
 * Usage: node scripts/capture-core-c4.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("docs/qa/core-experience/C4/candidate");

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
];

async function prepare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
      localStorage.setItem("yueqi.app.mode", "phone");
      const raw = localStorage.getItem("yueqi.phone.os.v1");
      let prefs = {};
      try {
        prefs = raw ? JSON.parse(raw) : {};
      } catch {
        prefs = {};
      }
      prefs.passcodeEnabled = false;
      localStorage.setItem("yueqi.phone.os.v1", JSON.stringify(prefs));
      localStorage.removeItem("yueqi.scenario.v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-small-phone-root]", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(800);

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
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    document.querySelector("[data-lock-to-passcode]")?.click();
  });
  await page.waitForFunction(() => {
    const phone = document.querySelector(".mini-phone");
    return phone && phone.dataset.phoneLocked === "false";
  }, { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function openScenario(page) {
  const appsDot = page.locator('[data-home-dot][data-page="1"]');
  if (await appsDot.count()) {
    await appsDot.click();
    await page.waitForTimeout(300);
  }

  const icon = page.locator('[data-app-id="scenario"]').first();
  await icon.waitFor({ state: "visible", timeout: 8000 });
  await icon.click();
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    if (phone) phone.dataset.phoneView = "app";
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const match = el.dataset.phoneScreen === "scenario";
      el.hidden = !match;
      el.classList.toggle("is-active", match);
    });
  });
  await page.waitForSelector(".mini-scenario", { state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);

  // Companion float often covers the stage bottom — hide for capture
  await page.evaluate(() => {
    document.querySelectorAll("[data-companion-float], .companion-float").forEach((el) => {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    });
  });
}

async function shot(page, dir, name) {
  const phone = page.locator(".mini-phone").first();
  const target = (await phone.count()) ? phone : page.locator("body");
  await target.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function captureViewport(browser, vp) {
  const dir = path.join(OUT_ROOT, vp.name);
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: Math.max(vp.width, 420), height: Math.max(vp.height, 900) },
    deviceScaleFactor: 2,
  });

  const frames = [];
  try {
    await prepare(page);
    await openScenario(page);
    await shot(page, dir, "01-lobby");
    frames.push("01-lobby");

    await page.locator("[data-scenario-pick]").click();
    await page.waitForTimeout(350);
    await shot(page, dir, "02-bookshelf");
    frames.push("02-bookshelf");

    await page.locator('[data-pick-script="script-rain-station"]').click();
    await page.waitForTimeout(450);
    await shot(page, dir, "03-curtain");
    frames.push("03-curtain");

    await page.locator("[data-scenario-open]").click();
    // Opening + first advance — capture enter sense within ~3s
    await page.waitForSelector(".scenario-stage-pose", { state: "visible", timeout: 10000 });
    await page.waitForTimeout(700);
    await shot(page, dir, "04-opening-enter");
    frames.push("04-opening-enter");

    await page.waitForSelector("[data-scenario-choice]", { state: "visible", timeout: 12000 });
    await page.waitForTimeout(400);
    await shot(page, dir, "05-turn1-choices");
    frames.push("05-turn1-choices");

    const actionAt = async (label) => {
      const el = page.locator("[data-stage-figure]");
      return el.getAttribute("data-action");
    };

    const a1 = await actionAt();
    await page.locator("[data-scenario-choice]").first().click({ force: true });
    await page.waitForTimeout(900);
    await shot(page, dir, "06-turn2-action");
    frames.push("06-turn2-action");
    const a2 = await actionAt();

    await page.locator("[data-scenario-choice]").nth(1).click({ force: true });
    await page.waitForTimeout(900);
    await shot(page, dir, "07-turn3-action");
    frames.push("07-turn3-action");
    const a3 = await actionAt();

    // Free say
    await page.locator("[data-scenario-input]").fill("今晚雨好大");
    await page.locator("[data-scenario-form] button[type='submit']").click({ force: true });
    await page.waitForTimeout(900);
    await shot(page, dir, "08-free-say");
    frames.push("08-free-say");
    const a4 = await actionAt();

    await page.locator("[data-scenario-pause]").click({ force: true });
    await page.waitForTimeout(500);
    await shot(page, dir, "09-paused-lobby");
    frames.push("09-paused-lobby");

    await page.locator("[data-scenario-continue]").click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, dir, "10-resumed-stage");
    frames.push("10-resumed-stage");

    await page.locator("[data-scenario-finale]").click({ force: true });
    await page.waitForTimeout(500);
    await shot(page, dir, "11-finale");
    frames.push("11-finale");

    const manifest = [
      `viewport: ${vp.name}`,
      `frames: ${frames.join(", ")}`,
      `actions: ${[a1, a2, a3, a4].filter(Boolean).join(" → ")}`,
      `note: storyboard frames stand in for 30–60s recording if video unavailable`,
      `capturedAt: ${new Date().toISOString()}`,
    ].join("\n");
    await writeFile(path.join(dir, "MANIFEST.txt"), `${manifest}\n`, "utf8");
    console.log(`captured ${vp.name}: ${frames.length} frames; actions ${a1}->${a2}->${a3}->${a4}`);
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      await captureViewport(browser, vp);
    }
  } finally {
    await browser.close();
  }
  console.log(`C4 candidate screenshots → ${OUT_ROOT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
