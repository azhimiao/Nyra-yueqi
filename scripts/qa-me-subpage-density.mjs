/**
 * Visual + computed-style QA for App / Me detail routes.
 * This intentionally uses the real settings router and a mobile Chromium viewport.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const VIEWPORT = {
  width: Number(process.env.QA_WIDTH) || 390,
  height: Number(process.env.QA_HEIGHT) || 844,
};
const OUT_DIR = path.resolve("docs/qa/me-subpage-density", `${VIEWPORT.width}x${VIEWPORT.height}`);
const ROUTES = [
  "account",
  "identity",
  "prompt",
  "behavior",
  "diary",
  "theme",
  "language",
  "interface",
  "memory",
  "cloud",
  "external",
  "worldbook",
  "presets",
  "regex",
  "assist",
  "update",
  "community",
];

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

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".app-shell", { state: "attached", timeout: 45_000 });
  await page.addStyleTag({
    content:
      "[data-first-light],[data-onboard-gate],[data-boot-screen],.lang-gate{display:none!important;pointer-events:none!important}",
  });
  await page.evaluate(() => {
    document
      .querySelectorAll("[data-first-light],[data-onboard-gate],[data-boot-screen],.lang-gate")
      .forEach((node) => {
        node.hidden = true;
        node.setAttribute("aria-hidden", "true");
        node.style.display = "none";
        node.style.pointerEvents = "none";
      });
    document.documentElement.classList.add("is-compact-shell", "app-boot-ready");
    document.body.dataset.appMode = "app";
    delete document.body.dataset.phoneReady;
    const phone = document.querySelector("[data-small-phone-root]");
    if (phone) phone.style.display = "none";
  });
  await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready", {
    timeout: 60_000,
  });
  await page.waitForTimeout(250);
}

async function openMe(page) {
  const visibleTab = page.locator('[data-tab="me"]:visible').first();
  if (await visibleTab.count()) {
    await visibleTab.click();
  } else {
    await page.evaluate(() => {
      document
        .querySelector('[data-tab="me"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
  await page.waitForSelector('.app-page[data-panel="me"].is-active', {
    state: "visible",
    timeout: 10_000,
  });
}

async function openRoute(page, route) {
  const shell = page.locator("[data-settings-shell]");
  for (let depth = 0; depth < 3; depth += 1) {
    const currentRoute = (await shell.getAttribute("data-settings-route")) || "";
    if (!currentRoute) break;
    await page.locator("[data-settings-back]:visible").dispatchEvent("click");
    await page.waitForFunction(
      (previousRoute) =>
        document.querySelector("[data-settings-shell]")?.dataset.settingsRoute !== previousRoute,
      currentRoute,
    );
  }
  if (route === "prompt") {
    await page
      .locator('[data-settings-nav] [data-settings-route="identity"]')
      .dispatchEvent("click");
    await page.waitForSelector('[data-settings-view="identity"].is-active', {
      state: "visible",
      timeout: 10_000,
    });
    await page.locator("[data-open-prompt-editor]").dispatchEvent("click");
  } else {
    await page
      .locator(`[data-settings-nav] [data-settings-route="${route}"]`)
      .dispatchEvent("click");
  }
  await page.waitForSelector(`[data-settings-view="${route}"].is-active`, {
    state: "visible",
    timeout: 10_000,
  });
  if (route === "assist") {
    await page.waitForSelector('[data-settings-view="assist"] .assist-shell', {
      state: "attached",
      timeout: 10_000,
    });
  }
  await page.waitForTimeout(150);
}

async function readRouteMetrics(page, route) {
  return page.evaluate((routeId) => {
    const panel = document.querySelector(`[data-settings-view="${routeId}"]`);
    const shell = document.querySelector("[data-settings-shell]");
    const editor = document.querySelector("[data-settings-stage] .settings-editor");
    const visible = (node) => {
      if (!node) return false;
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return css.display !== "none" && css.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const inspect = (node) => {
      if (!visible(node)) return null;
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName.toLowerCase(),
        className: String(node.className || ""),
        text: String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        display: css.display,
        minHeight: css.minHeight,
        padding: css.padding,
        gap: css.gap,
        borderRadius: css.borderRadius,
        background: css.backgroundColor,
        fontSize: css.fontSize,
      };
    };
    const inspectAll = (selector) =>
      [...panel.querySelectorAll(selector)].filter(visible).map(inspect);
    const matchingRules = (node) => {
      if (!node) return [];
      const matches = [];
      const walk = (rules, source, active = true) => {
        for (const rule of rules) {
          if ("conditionText" in rule && rule.cssRules) {
            const conditionActive =
              rule.constructor?.name === "CSSMediaRule"
                ? window.matchMedia(rule.conditionText).matches
                : true;
            walk(rule.cssRules, source, active && conditionActive);
            continue;
          }
          if (!active || !rule.selectorText || !node.matches(rule.selectorText)) continue;
          const declarations = {};
          for (const property of [
            "width",
            "max-width",
            "flex",
            "flex-basis",
            "min-height",
            "height",
            "padding",
            "border",
            "background",
            "background-color",
            "box-shadow",
          ]) {
            const value = rule.style.getPropertyValue(property);
            if (value) {
              declarations[property] = `${value}${rule.style.getPropertyPriority(property) ? " !important" : ""}`;
            }
          }
          if (Object.keys(declarations).length) {
            matches.push({ source, selector: rule.selectorText, declarations });
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules, sheet.href || "inline");
        } catch {
          // Cross-origin font stylesheet.
        }
      }
      return matches;
    };
    const viewportControls = [
      ...panel.querySelectorAll("button, input:not([type='hidden']), select:not(.me-visually-hidden), textarea"),
    ].filter((node) => {
      if (!visible(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });

    return {
      route: routeId,
      viewport: { width: innerWidth, height: innerHeight },
      appMode: document.body.dataset.appMode,
      shell: {
        className: shell?.className || "",
        route: shell?.dataset.settingsRoute || "",
        subpageRow: getComputedStyle(document.body).getPropertyValue("--subpage-row").trim(),
      },
      editor: inspect(editor),
      panel: inspect(panel),
      detailBar: inspect(document.querySelector(".me-detail-bar")),
      sectionHeads: inspectAll(".section-head, .editor-head"),
      sectionTitles: inspectAll(".me-section-title"),
      segments: inspectAll(".me-segment"),
      segmentButtons: inspectAll(".me-segment button"),
      chips: inspectAll(".me-chips button"),
      rows: inspectAll(
        ".edit-field, .workflow-toggle, .settings-feature-switches > label, .status-grid > label",
      ),
      mcpCards: inspectAll(".mcp-card"),
      themeOptions: inspectAll(".theme-option"),
      presetCards: inspectAll(".preset-card"),
      regexCards: inspectAll(".regex-card"),
      textareas: inspectAll("textarea"),
      assistShell: inspect(panel.querySelector(".assist-shell")),
      textInputs: inspectAll(
        "input:not([type='checkbox']):not([type='range']):not([type='hidden']), select:not(.me-visually-hidden)",
      ),
      visibleControlCount: viewportControls.length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      cascadeProbe:
        routeId === "identity"
          ? matchingRules(panel.querySelector("[data-status-sleep-at]"))
          : [],
    };
  }, route);
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
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await bootApp(page);
    await openMe(page);
    const routes = {};
    for (const route of ROUTES) {
      await openRoute(page, route);
      routes[route] = await readRouteMetrics(page, route);
      await page.screenshot({
        path: path.join(OUT_DIR, `${route}.png`),
        fullPage: false,
      });
    }
    const heightsWithin = (items, min, max) =>
      items.length > 0 && items.every((item) => item.height >= min && item.height <= max);
    const checks = [
      {
        name: "language segments render at compact height",
        pass: heightsWithin(routes.language.segmentButtons, 40, 44),
      },
      {
        name: "diary style chips render as pills",
        pass: heightsWithin(routes.diary.chips, 32, 38),
      },
      {
        name: "identity setting rows stay compact",
        pass: heightsWithin(routes.identity.rows, 50, 60),
      },
      {
        name: "identity inline values are not form-sized",
        pass: routes.identity.textInputs
          .filter((item) => item.className !== "me-date-field__native")
          .every((item) => item.height <= 42),
      },
      {
        name: "prompt remains a long-form editor",
        pass: heightsWithin(routes.prompt.textareas, 180, 260),
      },
      {
        name: "permission cards fit one row",
        pass: heightsWithin(routes.external.mcpCards, 56, 64),
      },
      {
        name: "theme choices stay compact",
        pass: heightsWithin(routes.theme.themeOptions, 50, 60),
      },
      {
        name: "no Me route overflows horizontally",
        pass: Object.values(routes).every((route) => !route.horizontalOverflow),
      },
      {
        name: "assist keeps its dedicated workspace",
        pass:
          routes.assist.assistShell?.height >= Math.round(VIEWPORT.height * 0.7) &&
          routes.assist.assistShell?.width >= VIEWPORT.width - 32,
      },
    ];
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: VIEWPORT,
      consoleErrors,
      checks,
      routes,
    };
    await writeFile(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (checks.some((check) => !check.pass)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
