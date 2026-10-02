/**
 * C5 — capture cocreate session candidate screenshots.
 * Requires `npm run dev` on DEMO_URL.
 *
 * Usage: node scripts/capture-core-c5.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("docs/qa/core-experience/C5/candidate");

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
      localStorage.removeItem("yueqi.cocreate.session.v1");
      localStorage.removeItem("yueqi.cocreate.artifact.v1");
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

  await page.evaluate(() => {
    document.querySelectorAll("[data-companion-float], .companion-float").forEach((el) => {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    });
  });
}

async function openCocreate(page) {
  // Creator folder / apps page — cocreate is advanced (page 2)
  for (const pageIdx of ["1", "2"]) {
    const dot = page.locator(`[data-home-dot][data-page="${pageIdx}"]`);
    if (await dot.count()) {
      await dot.click();
      await page.waitForTimeout(250);
    }
  }

  const icon = page.locator('[data-app-id="cocreate"]').first();
  if (await icon.count()) {
    await icon.waitFor({ state: "visible", timeout: 8000 });
    await icon.click();
  } else {
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("yueqi:open-phone-app", { detail: { id: "cocreate" } }));
    });
  }
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    if (phone) phone.dataset.phoneView = "app";
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const match = el.dataset.phoneScreen === "cocreate";
      el.hidden = !match;
      el.classList.toggle("is-active", match);
    });
  });
  await page.waitForSelector(".cocreate-app--v2, [data-cocreate-mount]", { state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);
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

  const steps = [];
  try {
    await prepare(page);
    await openCocreate(page);
    await shot(page, dir, "01-entry");
    steps.push("01-entry");

    await page.locator('[data-cc-start="date_scene"]').first().click();
    await page.waitForTimeout(500);
    await shot(page, dir, "02-session-chat");
    steps.push("02-session-chat");

    await page.locator("[data-cc-sample]").first().click();
    await page.waitForTimeout(800);
    await shot(page, dir, "03-proposals");
    steps.push("03-proposals");

    const accept = page.locator("[data-cc-accept]").first();
    if (await accept.count()) {
      await accept.click();
      await page.waitForTimeout(400);
    }

    await page.locator('[data-cc-tab="canvas"]').first().click();
    await page.waitForTimeout(400);
    await shot(page, dir, "04-canvas-tab");
    steps.push("04-canvas-tab");

    await page.locator("[data-cc-open-publish]").first().click();
    await page.waitForTimeout(500);
    await shot(page, dir, "05-publish-diff");
    steps.push("05-publish-diff");

    // Dual-pane: widen briefly if possible
    await page.setViewportSize({ width: 900, height: 900 });
    await page.locator("[data-cc-back-session]").first().click();
    await page.waitForTimeout(400);
    await shot(page, dir, "06-dual-pane");
    steps.push("06-dual-pane");

    await writeFile(
      path.join(dir, "MANIFEST.txt"),
      [
        `viewport: ${vp.name}`,
        `captured: ${new Date().toISOString()}`,
        `steps: ${steps.join(" → ")}`,
        "notes: entry / chat / proposals / canvas / publish diff / dual-pane",
      ].join("\n"),
      "utf8",
    );
  } finally {
    await page.close();
  }
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
  console.log(`Done → ${OUT_ROOT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
