/**
 * Release-stage mobile UI smoke audit.
 *
 * Covers both product shells at phone widths. The checks deliberately avoid
 * mutating user content: they only navigate, scroll, open/close chrome, and
 * probe hit targets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { installPhoneFixture } from "../e2e/helpers/phone.mjs";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const VIEWPORT = {
  width: Number(process.env.QA_WIDTH) || 390,
  height: Number(process.env.QA_HEIGHT) || 844,
};
const OUT_DIR = path.resolve("docs/qa/mobile-release", `${VIEWPORT.width}x${VIEWPORT.height}`);
const findings = [];

function note(surface, name, pass, detail = "") {
  const item = { surface, name, pass: Boolean(pass), detail: String(detail || "") };
  findings.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"}  [${surface}] ${name}${item.detail ? ` - ${item.detail}` : ""}`);
}

async function installCommonPrefs(page, mode) {
  await page.addInitScript((initialMode) => {
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", initialMode);
    localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem(
      "yueqi.onboarding.v1",
      JSON.stringify({ done: true, accountMode: "offline", uiModeChosen: true }),
    );
    localStorage.setItem(
      "yueqi.firstLight.v1",
      JSON.stringify({ completed: true, skipped: true, version: 1 }),
    );
  }, mode);
}

async function hideStartupLayers(page) {
  await page.addStyleTag({
    content: "[data-first-light],[data-onboard-gate],[data-boot-screen],.lang-gate{display:none!important;pointer-events:none!important}",
  });
  await page.evaluate(() => {
    document.querySelectorAll("[data-first-light],[data-onboard-gate],[data-boot-screen],.lang-gate").forEach((node) => {
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      node.style.display = "none";
      node.style.pointerEvents = "none";
    });
    document.documentElement.classList.add("is-compact-shell", "app-boot-ready");
  });
}

async function bootApp(page) {
  await installCommonPrefs(page, "app");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".app-shell", { state: "attached", timeout: 45000 });
  await hideStartupLayers(page);
  await page.evaluate(() => {
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
  await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready", { timeout: 60000 });
  await page.waitForTimeout(180);
}

async function bootPhone(page) {
  await installPhoneFixture(page);
  await installCommonPrefs(page, "phone");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 45000 });
  await hideStartupLayers(page);
  await page.evaluate(() => {
    document.documentElement.classList.add("is-native-app");
    document.body.dataset.appMode = "phone";
    document.body.dataset.phoneReady = "1";
    delete document.body.dataset.phoneBooting;
    const root = document.querySelector("[data-small-phone-root]");
    if (root) {
      root.hidden = false;
      root.style.display = "block";
      root.style.visibility = "visible";
    }
    const app = document.querySelector(".app-shell");
    if (app) app.style.display = "none";
  });
  await page.waitForSelector(".mini-phone", { state: "visible", timeout: 15000 });
  await page.evaluate(() => {
    const target = document.querySelector("[data-lock-to-passcode]") || document.querySelector('[data-lock-pane="TIME"]');
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => (
    document.querySelector(".mini-phone")?.dataset.phoneLocked === "false" && Boolean(window.__yueqiPhone?.openApp)
  ), { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function activeAudit(page, rootSelector, activeSelector) {
  return page.evaluate(({ rootSelector: rootSel, activeSelector: activeSel }) => {
    const root = document.querySelector(rootSel);
    const active = document.querySelector(activeSel);
    if (!root || !active) return { found: false };
    const rootRect = root.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const visible = (node) => {
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const closedDetails = node.closest("details:not([open])");
      if (closedDetails && !node.closest("summary")) return false;
      return !node.hidden
        && node.getAttribute("aria-hidden") !== "true"
        && css.display !== "none"
        && css.visibility !== "hidden"
        && Number(css.opacity || 1) > 0.01
        && css.pointerEvents !== "none"
        && rect.width > 1
        && rect.height > 1;
    };
    const ancestors = [];
    for (let node = active; node; node = node.parentElement) {
      ancestors.push(node);
      if (node === root) break;
    }
    const scrollables = [...ancestors, ...active.querySelectorAll("*")].filter((node) => {
      if (!visible(node)) return false;
      const css = getComputedStyle(node);
      return /(auto|scroll)/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 8;
    });
    const scrollable = scrollables[0] || null;
    const bottomOverlays = [...document.querySelectorAll(".nyra-dock,.bottom-nav,.mini-home-indicator")]
      .filter(visible)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.top > 0 && rect.bottom >= innerHeight - 4);
    const usableBottom = bottomOverlays.length
      ? Math.min(innerHeight, ...bottomOverlays.map((rect) => rect.top))
      : innerHeight;
    const controls = [...active.querySelectorAll('button:not([disabled]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"]')]
      .filter((node) => visible(node) && String(node.getAttribute("type") || "").toLowerCase() !== "file")
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const type = String(node.getAttribute("type") || "").toLowerCase();
        const label = node.closest("label");
        const switchRow = node.matches('[role="switch"]') ? node.closest(".mini-switch-row") : null;
        const labelRect = label?.getBoundingClientRect();
        const nodeArea = Math.max(0, rect.width * rect.height);
        const labelArea = labelRect ? Math.max(0, labelRect.width * labelRect.height) : 0;
        const effective = switchRow
          || (label && node.matches("input,select,textarea") && labelArea >= nodeArea ? label : node);
        const effectiveRect = effective.getBoundingClientRect();
        const expandedDayTarget = effective.matches?.(".memory-week__day") ? 2 : 0;
        const expandedCalendarTarget = effective.matches?.(".mini-cal-day") ? 4 : 0;
        const cx = Math.max(0, Math.min(innerWidth - 1, effectiveRect.left + effectiveRect.width / 2));
        const cy = Math.max(0, Math.min(usableBottom - 1, effectiveRect.top + effectiveRect.height / 2));
        const centerY = effectiveRect.top + effectiveRect.height / 2;
        const inViewport = rect.bottom > 0
          && centerY > 0
          && centerY < usableBottom
          && rect.right > 0
          && rect.left < innerWidth;
        const hit = inViewport ? document.elementFromPoint(cx, cy) : null;
        const hitSelf = !inViewport || hit === effective || effective.contains(hit) || hit?.contains(effective);
        return {
          label: (node.getAttribute("aria-label") || node.textContent || node.className || node.tagName).trim().replace(/\s+/g, " ").slice(0, 48),
          tag: node.tagName.toLowerCase(),
          className: String(node.className || "").trim().replace(/\s+/g, ".").slice(0, 80),
          cssHeight: getComputedStyle(node).height,
          cssMinHeight: getComputedStyle(node).minHeight,
          cssMaxHeight: getComputedStyle(node).maxHeight,
          w: Math.round(effectiveRect.width + expandedDayTarget),
          h: Math.round(effectiveRect.height + expandedCalendarTarget),
          inViewport,
          hitSelf,
          hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className || "").trim().replace(/\s+/g, ".").slice(0, 60)}` : "",
        };
      });
    const smallTargets = controls.filter((item) => item.inViewport && (item.w < 40 || item.h < 40));
    const blockedTargets = controls.filter((item) => item.inViewport && !item.hitSelf);
    const overflowX = active.scrollWidth > Math.max(active.clientWidth, root.clientWidth) + 2
      || document.documentElement.scrollWidth > innerWidth + 2;
    const outside = activeRect.left < rootRect.left - 3 || activeRect.right > rootRect.right + 3;
    let scrollMoved = true;
    if (scrollable) {
      const before = scrollable.scrollTop;
      scrollable.scrollTop = Math.min(before + 80, scrollable.scrollHeight - scrollable.clientHeight);
      scrollMoved = scrollable.scrollTop !== before || before > 0;
      scrollable.scrollTop = before;
    }
    return {
      found: true,
      overflowX,
      outside,
      smallTargets: smallTargets.slice(0, 8),
      blockedTargets: blockedTargets.slice(0, 8),
      controlCount: controls.length,
      hasScrollableOverflow: Boolean(scrollable),
      scrollMoved,
    };
  }, { rootSelector, activeSelector });
}

async function auditApp(page) {
  const routes = ["chat", "companion", "world", "library", "me", "api"];
  for (const route of routes) {
    const visibleTab = page.locator(`[data-tab="${route}"]:visible`);
    if (await visibleTab.count()) {
      await visibleTab.last().click();
    } else {
      await page.evaluate((panel) => {
        const tab = document.querySelector(`[data-tab="${panel}"]`);
        if (tab) {
          tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return;
        }
        document.querySelector(`[data-drawer-nav="${panel}"]`)
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, route);
    }
    await page.waitForSelector(`.app-page[data-panel="${route}"].is-active:not([hidden])`, { timeout: 12000 });
    await page.waitForTimeout(180);
    const unique = await page.locator(".app-page.is-active:not([hidden])").count();
    const audit = await activeAudit(page, ".app-shell", `.app-page[data-panel="${route}"].is-active:not([hidden])`);
    if (route === "chat") {
      const chrome = await page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          const box = node?.getBoundingClientRect();
          return node && box ? {
            top: Math.round(box.top),
            bottom: Math.round(box.bottom),
            height: Math.round(box.height),
            display: getComputedStyle(node).display,
            paddingTop: getComputedStyle(node).paddingTop,
          } : null;
        };
        return {
          activePanel: document.body.dataset.activePanel,
          app: rect(".app-shell"),
          header: rect(".mobile-header"),
          content: rect(".content-shell"),
          page: rect('.app-page[data-panel="chat"]'),
          sticky: rect(".chat-sticky"),
        };
      });
      note("app:chat", "single top bar starts at the viewport edge", chrome.sticky?.top === 0, JSON.stringify(chrome));
    }
    note(`app:${route}`, "exactly one active page", unique === 1, `active=${unique}`);
    note(`app:${route}`, "content stays within viewport", audit.found && !audit.overflowX && !audit.outside, JSON.stringify({ overflowX: audit.overflowX, outside: audit.outside }));
    note(`app:${route}`, "visible controls are hittable", audit.blockedTargets?.length === 0, JSON.stringify(audit.blockedTargets || []));
    note(`app:${route}`, "visible touch targets are at least 40px", audit.smallTargets?.length === 0, JSON.stringify(audit.smallTargets || []));
    note(`app:${route}`, "overflow content can scroll", audit.scrollMoved !== false, JSON.stringify({ hasOverflow: audit.hasScrollableOverflow }));
    await page.screenshot({ path: path.join(OUT_DIR, `app-${route}.png`) });
  }

  await page.locator('[data-tab="companion"]').last().click();
  for (const tab of ["memory", "character"]) {
    await page.locator(`[data-companion-tab="${tab}"]`).click();
    await page.waitForTimeout(120);
    const audit = await activeAudit(page, ".app-shell", `[data-companion-section="${tab}"].is-active:not([hidden])`);
    note(`app:companion:${tab}`, "section fits and controls work", audit.found && !audit.overflowX && !audit.outside && audit.blockedTargets.length === 0, JSON.stringify(audit));
    await page.screenshot({ path: path.join(OUT_DIR, `app-companion-${tab}.png`) });
  }

  await page.evaluate(() => document.querySelector('[data-tab="library"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  for (const tab of ["music", "reading", "album"]) {
    await page.locator(`[data-library-tab="${tab}"]`).click();
    await page.waitForTimeout(120);
    const activeTab = await page.locator(`[data-library-tab="${tab}"].is-active`).count();
    const audit = await activeAudit(page, ".app-shell", '.app-page[data-panel="library"].is-active:not([hidden])');
    note(`app:library:${tab}`, "tab activates without layout failure", activeTab === 1 && !audit.overflowX && audit.blockedTargets.length === 0, JSON.stringify(audit));
    await page.screenshot({ path: path.join(OUT_DIR, `app-library-${tab}.png`) });
  }

  await page.evaluate(() => document.querySelector('[data-tab="me"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const settingsRoutes = await page.locator("[data-settings-nav] [data-settings-route]").evaluateAll((nodes) => (
    [...new Set(nodes
      .filter((node) => !node.hidden && getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden")
      .map((node) => node.getAttribute("data-settings-route"))
      .filter(Boolean))]
  ));
  for (const route of settingsRoutes) {
    await page.locator(`[data-settings-nav] [data-settings-route="${route}"]`).first().click();
    await page.waitForSelector(`[data-settings-view="${route}"]:not([hidden])`, { timeout: 10000 });
    await page.waitForTimeout(80);
    const audit = await activeAudit(page, ".app-shell", `[data-settings-view="${route}"]:not([hidden])`);
    note(`app:settings:${route}`, "detail is visible, scrollable and hittable", audit.found && !audit.overflowX && !audit.outside && audit.blockedTargets.length === 0 && audit.scrollMoved !== false, JSON.stringify(audit));
    await page.screenshot({ path: path.join(OUT_DIR, `app-settings-${route}.png`) });
    await page.locator("[data-settings-back]").click();
  }
}

async function auditPhone(page) {
  const pageSwipe = async (fromX, toX) => {
    const box = await page.locator("[data-home-pager]").boundingBox();
    if (!box) throw new Error("home pager is not visible");
    const y = box.y + Math.min(box.height * 0.56, 360);
    const startX = box.x + Math.min(box.width - 24, Math.max(24, fromX));
    const endX = box.x + Math.min(box.width - 24, Math.max(24, toX));
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(endX, y + 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(460);
  };

  const touchSwipeOn = async (selector, direction = "left") => {
    const target = page.locator(selector).first();
    const box = await target.boundingBox();
    const pagerBox = await page.locator("[data-home-pager]").boundingBox();
    if (!box) throw new Error(`touch swipe target is not visible: ${selector}`);
    if (!pagerBox) throw new Error("home pager is not visible");
    const session = await page.context().newCDPSession(page);
    const startX = box.x + box.width * 0.5;
    const endX = direction === "left" ? pagerBox.x + 24 : pagerBox.x + pagerBox.width - 24;
    const y = box.y + Math.min(box.height * 0.5, Math.max(18, box.height - 18));
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y, radiusX: 7, radiusY: 7, force: 0.7 }],
    });
    for (let step = 1; step <= 12; step += 1) {
      const x = startX + ((endX - startX) * step) / 12;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + 1, radiusX: 7, radiusY: 7, force: 0.7 }],
      });
      await page.waitForTimeout(9);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
    await page.waitForTimeout(420);
  };

  const pagerMetrics = () => page.locator("[data-home-pager]").evaluate((pager) => {
    const track = pager.querySelector("[data-home-track]");
    const pages = [...pager.querySelectorAll("[data-home-page]")];
    const css = getComputedStyle(pager);
    return {
      clientWidth: pager.clientWidth,
      scrollWidth: pager.scrollWidth,
      scrollLeft: Math.round(pager.scrollLeft),
      overflowX: css.overflowX,
      touchAction: css.touchAction,
      snap: css.scrollSnapType,
      pageIndex: pager.closest(".mini-home")?.dataset.homePageIndex || "",
      trackTransform: getComputedStyle(track).transform,
      trackWidth: Math.round(track?.getBoundingClientRect().width || 0),
      pageWidths: pages.map((node) => Math.round(node.getBoundingClientRect().width)),
    };
  });

  const topChrome = await page.evaluate(() => {
    const control = document.querySelector(".mini-controlbar");
    const homePage = document.querySelector('[data-home-page="0"]');
    const controlRect = control?.getBoundingClientRect();
    const homeRect = homePage?.getBoundingClientRect();
    const visible = (node) => Boolean(node) && !node.hidden && getComputedStyle(node).display !== "none";
    return {
      hasSwitch: visible(document.querySelector("[data-phone-switch-ui='app']")),
      hasNotifications: visible(document.querySelector("[data-phone-notifications]")),
      hasFakeTime: Boolean(document.querySelector(".mini-statusbar [data-phone-time]")),
      hasFakeSystemIcons: Boolean(document.querySelector(".mini-statusbar [data-lucide='signal'], .mini-statusbar [data-lucide='wifi'], .mini-statusbar [data-lucide^='battery']")),
      controlBottom: Math.round(controlRect?.bottom || 0),
      homeTop: Math.round(homeRect?.top || 0),
    };
  });
  note(
    "phone:home",
    "top chrome keeps App switch and notifications without fake system status",
    topChrome.hasSwitch && topChrome.hasNotifications && !topChrome.hasFakeTime && !topChrome.hasFakeSystemIcons,
    JSON.stringify(topChrome),
  );
  note(
    "phone:home",
    "home content starts below the product control bar",
    topChrome.homeTop >= topChrome.controlBottom + 6,
    JSON.stringify(topChrome),
  );

  await page.locator('[data-home-dot][data-page="0"]').click();
  const beforeSwipe = await pagerMetrics();
  await pageSwipe(VIEWPORT.width - 44, 52);
  const reachedSecond = await page.locator('[data-home-dot][data-page="1"].is-active').count() === 1;
  const afterForward = await pagerMetrics();
  await pageSwipe(52, VIEWPORT.width - 44);
  const returnedFirst = await page.locator('[data-home-dot][data-page="0"].is-active').count() === 1;
  const afterBackward = await pagerMetrics();
  note("phone:home", "desktop swipes naturally in both directions", reachedSecond && returnedFirst, JSON.stringify({
    reachedSecond,
    returnedFirst,
    beforeSwipe,
    afterForward,
    afterBackward,
  }));

  await page.locator('[data-home-dot][data-page="0"]').click();
  await touchSwipeOn("[data-home-companion-chat]", "left");
  const touchReachedSecond = await page.locator('[data-home-dot][data-page="1"].is-active').count() === 1;
  await touchSwipeOn('[data-home-app-grid="1"] .mini-app-icon', "right");
  const touchReturnedFirst = await page.locator('[data-home-dot][data-page="0"].is-active').count() === 1;
  note(
    "phone:home",
    "real touch stream pages from a widget and back from an app icon",
    touchReachedSecond && touchReturnedFirst,
    JSON.stringify({ touchReachedSecond, touchReturnedFirst, metrics: await pagerMetrics() }),
  );

  const apps = [
    "pop", "moments", "listen", "shop", "explore", "assist", "diary", "gallery",
    "calendar", "read", "games", "memory", "beautify", "profile", "settings", "qishi", "pet",
  ];
  for (const app of apps) {
    await page.evaluate((id) => window.__yueqiPhone?.openApp(id), app);
    await page.waitForSelector(`[data-phone-screen="${app}"].is-active:not([hidden])`, { timeout: 12000 });
    await page.waitForTimeout(160);
    const unique = await page.locator('.mini-phone [data-phone-screen].is-active:not([hidden])').count();
    const audit = await activeAudit(page, ".mini-phone", `[data-phone-screen="${app}"].is-active:not([hidden])`);
    note(`phone:${app}`, "exactly one active screen", unique === 1, `active=${unique}`);
    note(`phone:${app}`, "screen stays within phone", audit.found && !audit.overflowX && !audit.outside, JSON.stringify({ overflowX: audit.overflowX, outside: audit.outside }));
    note(`phone:${app}`, "visible controls are hittable", audit.blockedTargets?.length === 0, JSON.stringify(audit.blockedTargets || []));
    note(`phone:${app}`, "visible touch targets are at least 40px", audit.smallTargets?.length === 0, JSON.stringify(audit.smallTargets || []));
    note(`phone:${app}`, "overflow content can scroll", audit.scrollMoved !== false, JSON.stringify({ hasOverflow: audit.hasScrollableOverflow }));
    await page.locator(".mini-phone").screenshot({ path: path.join(OUT_DIR, `phone-${app}.png`) });
    if (app === "pop") {
      await page.locator('[data-pop-tab="me"]').click();
      await page.waitForSelector('[data-pop-panel="me"]:not([hidden])', { timeout: 10000 });
      const meAudit = await activeAudit(page, ".mini-phone", '[data-pop-panel="me"]:not([hidden])');
      note("phone:pop:me", "profile uses a complete, hittable grouped layout", meAudit.found && !meAudit.overflowX && !meAudit.outside && meAudit.blockedTargets.length === 0, JSON.stringify(meAudit));
      await page.locator(".mini-phone").screenshot({ path: path.join(OUT_DIR, "phone-pop-me.png") });
    }
    await page.evaluate(() => window.__yueqiPhone?.openApp("home"));
    await page.waitForSelector('[data-phone-screen="home"].is-active:not([hidden])', { timeout: 10000 });
  }
}

async function runShell(name, boot, audit) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "zh-CN",
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  try {
    await boot(page);
    await audit(page);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}-final.png`) });
  } catch (error) {
    note(name, "audit completed", false, error.stack || error.message);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}-FAIL.png`) }).catch(() => {});
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const scope = String(process.env.QA_SHELL || "all").toLowerCase();
  if (scope === "all" || scope === "app") await runShell("app", bootApp, auditApp);
  if (scope === "all" || scope === "phone") await runShell("phone", bootPhone, auditPhone);
  const report = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    baseUrl: BASE_URL,
    pass: findings.filter((item) => item.pass).length,
    fail: findings.filter((item) => !item.pass).length,
    findings,
  };
  await writeFile(path.join(OUT_DIR, "REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nPASS ${report.pass} / FAIL ${report.fail}`);
  if (report.fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
