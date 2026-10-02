/**
 * App-mode mobile density QA.
 * Captures the chat, navigation drawer and memory/diary surface at one viewport.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const VIEWPORT = {
  width: Number(process.env.QA_WIDTH) || 390,
  height: Number(process.env.QA_HEIGHT) || 844,
};
const OUT_DIR = path.resolve("docs/qa/app-density", `${VIEWPORT.width}x${VIEWPORT.height}`);

async function bootApp(page) {
  await page.addInitScript(() => {
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", "app");
    localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem(
      "yueqi.onboarding.v1",
      JSON.stringify({ done: true, accountMode: "offline", uiModeChosen: true }),
    );
    localStorage.setItem(
      "yueqi.firstLight.v1",
      JSON.stringify({ completed: true, skipped: true, version: 1 }),
    );
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.addStyleTag({
    content: "[data-first-light],[data-onboard-gate],[data-boot-screen]{display:none!important;pointer-events:none!important}",
  });
  await page.waitForSelector(".app-shell", { state: "attached", timeout: 45000 });
  await page.evaluate(() => {
    document.querySelectorAll("[data-onboard-gate], [data-boot-screen], [data-first-light], .lang-gate").forEach((node) => {
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      node.style.display = "none";
      node.style.pointerEvents = "none";
    });
    document.documentElement.classList.add("is-compact-shell", "app-boot-ready");
    document.body.dataset.appMode = "app";
    delete document.body.dataset.phoneReady;
    const app = document.querySelector(".app-shell");
    if (app) {
      app.style.display = "";
      app.style.visibility = "visible";
      app.style.pointerEvents = "";
    }
    const phone = document.querySelector("[data-small-phone-root]");
    if (phone) phone.style.display = "none";
  });
  await page.waitForSelector('.app-page[data-panel="chat"].is-active', { state: "visible", timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), {
    timeout: 30000,
  }).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    document.querySelectorAll("[data-first-light], [data-onboard-gate], [data-boot-screen]").forEach((node) => {
      node.hidden = true;
      node.classList.remove("is-open");
      node.setAttribute("aria-hidden", "true");
      node.style.display = "none";
      node.style.pointerEvents = "none";
    });
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

async function metrics(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node || getComputedStyle(node).display === "none") return null;
      const rect = node.getBoundingClientRect();
      const css = getComputedStyle(node);
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fontSize: Number.parseFloat(css.fontSize) || 0,
        radius: css.borderRadius,
      };
    };
    const allHeights = (selector) => [...document.querySelectorAll(selector)]
      .filter((node) => getComputedStyle(node).display !== "none")
      .map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      header: box(".mobile-header"),
      chatSticky: box(".chat-sticky"),
      quickAction: box(".chat-quick-action"),
      composer: box(".composer"),
      composerTool: box(".composer-tool"),
      dock: box(".nyra-dock"),
      drawer: box(".drawer-panel"),
      drawerRows: allHeights(".drawer-nav button"),
      memoryTitle: box(".memory-relation-head h2"),
      memoryWeek: box(".memory-week"),
      memoryDays: allHeights(".memory-week__day"),
      journalCard: box(".editorial-journal-card"),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "zh-CN",
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await bootApp(page);

  await page.waitForSelector("[data-companion-orb]", { state: "attached", timeout: 10000 });
  const floatTouch = await page.evaluate(async () => {
    const root = document.querySelector("[data-companion-float]");
    const orb = document.querySelector("[data-companion-orb]");
    if (!root || !orb) return { found: false, opens: false, dragging: false };
    root.classList.remove("is-system-overlay-hidden");
    const rect = orb.getBoundingClientRect();
    const x = rect.left + Math.max(8, rect.width / 2);
    const y = rect.top + Math.max(8, rect.height / 2);
    const fire = (type, dx = 0, dy = 0, buttons = 1) => {
      orb.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 77,
        pointerType: "touch",
        isPrimary: true,
        clientX: x + dx,
        clientY: y + dy,
        buttons,
      }));
    };
    fire("pointerdown");
    // Below the 9px drag threshold: this must remain a tap on real touchscreens.
    fire("pointermove", 4, 3);
    fire("pointerup", 4, 3, 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      found: true,
      opens: root.classList.contains("is-open") && !root.querySelector("[data-companion-float-panel]")?.hidden,
      dragging: root.classList.contains("is-dragging"),
    };
  });

  await screenshot(page, "01-chat");
  const chat = await metrics(page);

  await page.locator("[data-drawer-open]").click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const drawer = document.querySelector("#featureDrawer");
    if (!drawer?.classList.contains("is-open")) {
      drawer?.classList.add("is-open");
      drawer?.setAttribute("aria-hidden", "false");
    }
  });
  await page.waitForSelector(".drawer.is-open", { timeout: 10000 });
  await page.waitForTimeout(200);
  await screenshot(page, "02-drawer");
  const drawer = await metrics(page);

  await page.evaluate(() => {
    const drawer = document.querySelector("#featureDrawer");
    drawer?.classList.remove("is-open");
    drawer?.setAttribute("aria-hidden", "true");
  });
  await page.evaluate(() => {
    const target = document.querySelector('.app-page[data-panel="companion"]');
    document.querySelectorAll(".app-page[data-panel]").forEach((page) => {
      const active = page === target;
      page.classList.toggle("is-active", active);
      page.hidden = !active;
      page.setAttribute("aria-hidden", String(!active));
    });
    document.querySelectorAll("[data-companion-section]").forEach((section) => {
      const active = section.dataset.companionSection === "memory";
      section.classList.toggle("is-active", active);
      section.hidden = !active;
    });
    document.querySelectorAll("[data-companion-tab]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.companionTab === "memory");
    });
    document.body.dataset.activePanel = "companion";
  });
  await page.waitForSelector('.app-page[data-panel="companion"].is-active', { timeout: 10000 });
  await page.waitForSelector(".memory-week__day", { state: "attached", timeout: 10000 });
  await page.waitForSelector(".editorial-journal-card", { state: "attached", timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const target = document.querySelector('.app-page[data-panel="companion"]');
    document.querySelectorAll(".app-page[data-panel]").forEach((panel) => {
      const active = panel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
      panel.setAttribute("aria-hidden", String(!active));
    });
    document.querySelectorAll("[data-companion-section]").forEach((section) => {
      const active = section.dataset.companionSection === "memory";
      section.classList.toggle("is-active", active);
      section.hidden = !active;
    });
    document.body.dataset.activePanel = "companion";
  });
  await page.waitForTimeout(100);
  await screenshot(page, "03-memory-diary");
  const memory = await metrics(page);

  const checks = [
    ["desktop pet opens after tap jitter below drag threshold", floatTouch.found && floatTouch.opens && !floatTouch.dragging],
    ["header <= 54", chat.header?.height <= 54],
    ["chat sticky <= 56", chat.chatSticky?.height <= 56],
    ["quick action touch >= 44", chat.quickAction?.height >= 44 && chat.quickAction?.width >= 44],
    ["composer <= 56", chat.composer?.height <= 56],
    ["composer tool touch >= 44", chat.composerTool?.height >= 44 && chat.composerTool?.width >= 44],
    ["dock <= 70", chat.dock?.height <= 70],
    ["drawer <= 316", drawer.drawer?.width <= 316],
    ["drawer rows 44..50", drawer.drawerRows.every((height) => height >= 44 && height <= 50)],
    ["memory title <= 22", memory.memoryTitle?.fontSize <= 22],
    ["memory week 1..60", memory.memoryWeek?.height > 0 && memory.memoryWeek?.height <= 60],
    ["memory days 44..48", memory.memoryDays.length === 7 && memory.memoryDays.every((height) => height >= 44 && height <= 48)],
    ["journal card 1..184", memory.journalCard?.height > 0 && memory.journalCard?.height <= 184],
    ["chat no horizontal overflow", !chat.horizontalOverflow],
    ["drawer no horizontal overflow", !drawer.horizontalOverflow],
    ["memory no horizontal overflow", !memory.horizontalOverflow],
  ].map(([name, pass]) => ({ name, pass: Boolean(pass) }));
  const report = { generatedAt: new Date().toISOString(), viewport: VIEWPORT, checks, chat, drawer, memory };
  await writeFile(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (checks.some((check) => !check.pass)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
