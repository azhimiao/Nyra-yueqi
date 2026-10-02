/**
 * C0 — capture baseline screenshots for Core Experience V2.
 * Does NOT change product behavior. Requires `npm run dev` on DEMO_URL.
 *
 * Usage: node scripts/capture-core-experience.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("docs/qa/core-experience/C0/baseline");

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "1440x900", width: 1440, height: 900 },
];

const SURFACES = ["home", "sidewrite", "cocreate", "scenario"];

async function preparePage(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
      localStorage.setItem("yueqi.app.mode", "phone");
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
      gate.setAttribute("aria-hidden", "true");
      gate.style.display = "none";
    }
    document.querySelector("[data-set-locale='zh-CN']")?.click();
    document.body.dataset.appMode = "phone";
    const root = document.querySelector("[data-small-phone-root]");
    if (root) {
      root.hidden = false;
      root.removeAttribute("hidden");
    }
    document.querySelectorAll("[data-app-mode]").forEach((btn) => {
      const active = btn.dataset.appMode === "phone";
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  });

  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    if (!phone) return;
    phone.dataset.phoneLocked = "false";
    phone.dataset.phoneView = "home";
    document.querySelector("[data-phone-lock]")?.setAttribute("hidden", "");
    const lock = document.querySelector("[data-phone-lock]");
    if (lock) lock.style.display = "none";
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const isHome = el.dataset.phoneScreen === "home";
      el.hidden = !isHome;
      el.classList.toggle("is-active", isHome);
    });
  });
  await page.waitForTimeout(200);
}

async function showSurface(page, surface) {
  await page.evaluate((id) => {
    const phone = document.querySelector(".mini-phone");
    if (!phone) return;
    phone.dataset.phoneLocked = "false";
    if (id === "home") {
      phone.dataset.phoneView = "home";
      document.querySelectorAll("[data-phone-screen]").forEach((el) => {
        const isHome = el.dataset.phoneScreen === "home";
        el.hidden = !isHome;
        el.classList.toggle("is-active", isHome);
      });
      return;
    }
    phone.dataset.phoneView = "app";
    // Prefer clicking real icon if present
    const icon = document.querySelector(`[data-app-id="${id}"]`);
    if (icon) {
      icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    // Force target screen visible for baseline (even if openApp didn't run)
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const match = el.dataset.phoneScreen === id;
      el.hidden = !match;
      el.classList.toggle("is-active", match);
    });
  }, surface);
  await page.waitForTimeout(500);
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    note: "C0 baseline only — not product acceptance evidence",
    files: [],
    issues: [],
  };

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await preparePage(page);
    } catch (error) {
      manifest.issues.push({ viewport: vp.name, error: String(error) });
      continue;
    }

    for (const surface of SURFACES) {
      try {
        await showSurface(page, surface);
        const dir = path.join(OUT_ROOT, vp.name);
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${surface}.png`);
        const phone = page.locator(".mini-phone");
        if (await phone.count()) {
          await phone.screenshot({ path: file });
        } else {
          await page.screenshot({ path: file });
        }
        manifest.files.push(path.relative(process.cwd(), file).replace(/\\/g, "/"));
      } catch (error) {
        manifest.issues.push({ viewport: vp.name, surface, error: String(error) });
      }
    }
  }

  await writeFile(path.join(OUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await browser.close();
  console.log(`C0 baselines → ${OUT_ROOT}`);
  console.log(`captured ${manifest.files.length}; issues ${manifest.issues.length}`);
  if (manifest.issues.length) console.log(JSON.stringify(manifest.issues, null, 2));
  if (manifest.files.length < 8) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
