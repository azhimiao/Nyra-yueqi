/**
 * First Light visual capture — multi-viewport screenshots + CTA flow checks.
 * Usage: DEMO_URL=http://127.0.0.1:5173/ node scripts/capture-first-light.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("artifacts/first-light/screenshots");

const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "393x852", width: 393, height: 852 },
  { name: "412x915", width: 412, height: 915 },
  { name: "430x932", width: 430, height: 932 },
  { name: "360x640", width: 360, height: 640 },
];

const STEPS = [
  "01-welcome",
  "02-purpose",
  "03-relationship",
  "04-lover-start",
  "05-style",
  "06-preview",
  "07-boundaries",
  "08-review",
  "09-first-chat",
];

async function seedFreshFirstLight(page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({
        locale: "zh-CN",
        localeChosen: true,
      }));
      localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
        loggedIn: true,
        token: "local-offline",
        username: "本机",
        productMode: "developer",
        subscriptionStatus: "inactive",
        credits: 0,
      }));
      localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({
        done: true,
        accountMode: "offline",
        productMode: "developer",
        productModeChosen: true,
        uiModeChosen: true,
      }));
      localStorage.setItem("yueqi.app.mode", "app");
      localStorage.setItem("yueqi.app.mode.chosen", "1");
      localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({
        schemaVersion: 1,
        done: false,
        paused: false,
        stage: "WELCOME",
        entryPath: "careful",
        draft: {},
        previewLines: [],
        errorMessage: "",
        updatedAt: new Date().toISOString(),
        committedCharacterId: "",
        migratedFromLegacy: false,
      }));
    } catch {
      /* ignore */
    }
  });
}

async function clickOption(page, id) {
  const btn = page.locator(`.first-light.is-open [data-fl-option="${id}"]`).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(180);
}

async function clickCta(page) {
  const btn = page.locator(".first-light.is-open [data-fl-cta]").first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(220);
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.waitForTimeout(180);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".first-light.is-open");
    const main = host?.querySelector("[data-fl-scroll], .first-run-main");
    const footer = host?.querySelector(".first-run-footer");
    const last = main?.lastElementChild?.getBoundingClientRect();
    const footerBox = footer?.getBoundingClientRect();
    return {
      stage: host?.dataset.flStage || "",
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      footerInViewport: Boolean(footerBox && footerBox.bottom <= innerHeight + 1),
      mainCanScroll: Boolean(main && main.scrollHeight > main.clientHeight + 1),
      lastCoveredByFooter: Boolean(last && footerBox && last.bottom > footerBox.top + 8 && last.top < footerBox.bottom),
    };
  });
}

async function runCarefulFlow(page, dir, collect) {
  await page.waitForSelector(".first-light.is-open", { timeout: 30000 });
  collect.files.push(await shot(page, dir, "01-welcome"));
  collect.layout = collect.layout || [];
  collect.layout.push(await measureLayout(page));

  await clickCta(page);
  await clickOption(page, "careful");
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="PURPOSE"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "02-purpose"));
  await clickOption(page, "romance");
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="RELATIONSHIP_TYPE"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "03-relationship"));
  await clickOption(page, "lover");
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="RELATIONSHIP_START"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "04-lover-start"));
  await clickOption(page, "now");
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="STYLE_SUPPORT"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "05-style"));
  await clickOption(page, "hold");
  await clickCta(page);
  await clickOption(page, "reach");
  await clickCta(page);
  await clickOption(page, "gentle");
  await clickCta(page);
  await clickOption(page, "warm");
  await clickCta(page);
  await clickOption(page, "balanced");
  await clickCta(page);

  await page.waitForSelector(".fl-preview", { timeout: 10000 });
  collect.files.push(await shot(page, dir, "06-preview"));
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="BOUNDARIES_CORE"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "07-boundaries"));
  await clickCta(page);
  await clickCta(page);

  await page.waitForSelector('[data-fl-stage="DRAFT_REVIEW"]', { timeout: 10000 });
  collect.files.push(await shot(page, dir, "08-review"));
  await clickCta(page);

  await page.waitForTimeout(800);
  collect.files.push(await shot(page, dir, "09-first-chat"));

  const evidence = await page.evaluate(async () => {
    const fl = JSON.parse(localStorage.getItem("yueqi.firstLight.v1") || "{}");
    const msgs = [];
    try {
      document.querySelectorAll(".message.ai p, .message.assistant p").forEach((p) => {
        msgs.push(p.textContent || "");
      });
    } catch {
      /* ignore */
    }
    return {
      done: fl.done === true,
      stage: fl.stage,
      characterId: fl.committedCharacterId || "",
      chatSnippets: msgs.slice(0, 4),
      openClawFlag: Boolean(window.__NYRA_OPENCLAW_SLICE_LOADED__),
    };
  });
  collect.evidence = evidence;
}

async function measureMotion(page) {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.querySelector(".first-light") || document.body);
    const scene = document.querySelector(".fl-scene");
    const sceneAnim = scene ? getComputedStyle(scene).animationName : "";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.querySelector(".first-light")?.classList.contains("is-reduced-motion");
    return {
      flInstant: styles.getPropertyValue("--fl-instant").trim(),
      flNormal: styles.getPropertyValue("--fl-normal").trim(),
      sceneAnim,
      reduced,
    };
  });
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: [],
    issues: [],
    motion: null,
    status: [],
  };

  for (const vp of VIEWPORTS) {
    const dir = path.join(OUT_ROOT, vp.name);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    const page = await context.newPage();
    const collect = { viewport: vp.name, files: [], evidence: null };
    try {
      await seedFreshFirstLight(page);
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(700);
      await runCarefulFlow(page, dir, collect);
      if (vp.name === "390x844") {
        report.motion = await measureMotion(page).catch(() => null);
      }
      if (!collect.evidence?.done) {
        report.issues.push({ viewport: vp.name, issue: "first_light_not_done" });
      }
      if (collect.evidence?.openClawFlag) {
        report.issues.push({ viewport: vp.name, issue: "openclaw_loaded_during_first_light_session" });
      }
      for (const layout of collect.layout || []) {
        if (layout.overflowX) report.issues.push({ viewport: vp.name, issue: "horizontal_overflow", layout });
      }
    } catch (error) {
      report.issues.push({ viewport: vp.name, error: String(error?.stack || error) });
      try {
        await page.screenshot({ path: path.join(dir, "ERROR.png") });
      } catch {
        /* ignore */
      }
    }
    report.viewports.push(collect);
    await context.close();
  }

  {
    const dir = path.join(OUT_ROOT, "390x844-reduced-motion");
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const page = await context.newPage();
    try {
      await seedFreshFirstLight(page);
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector(".first-light.is-open", { timeout: 30000 });
      await shot(page, dir, "01-welcome-reduced");
      const motion = await measureMotion(page);
      report.reducedMotion = motion;
    } catch (error) {
      report.issues.push({ viewport: "reduced-motion", error: String(error) });
    }
    await context.close();
  }

  if (!report.issues.length) {
    report.status.push("PASSED_FIRST_LIGHT_BROWSER_VISUAL");
  }
  report.stepsExpected = STEPS;

  const reportPath = path.join(OUT_ROOT, "capture-manifest.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ out: OUT_ROOT, issues: report.issues.length, reportPath }, null, 2));
  await browser.close();
  if (report.issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
