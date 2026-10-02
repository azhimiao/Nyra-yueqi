
async function revealSettingsControl(control) {
  const category = control.locator('xpath=ancestor::details[@data-settings-group]');
  if (await category.count() && await category.getAttribute("open") === null) {
    await category.locator(":scope > summary").click();
  }
  return control;
}
/** Isolated usability evidence: real shells, dark theme, long text and keyboard.
 * Browser resizing models a reduced viewport; it is not Android keyboard proof.
 * All writes use visible UI in a fresh browser context; no user data is touched.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer as createPortProbe } from "node:net";
import { chromium } from "playwright";
import { createServer } from "vite";

async function expandDetails(panel, selector) {
  const details = panel.locator(selector);
  if (!(await details.getAttribute("open"))) {
    if (!(await details.evaluate((node) => node.open))) await details.locator(":scope > summary").click();
  }
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "docs/qa/authoring-usability");
await mkdir(evidenceDir, { recursive: true });
const results = [], runtimeErrors = [], nativeDialogs = [], observations = [];
const startedAt = Date.now();
const longTitle = "与你一起收集的晨光与海边来信——这是较长的记忆标题，用于检查小屏幕阅读。";
const longBody = "风从海上来，我们把今天的心情写进一封信里。\n".repeat(90) + "https://example.invalid/" + "longunbrokentext".repeat(18);
const port = await new Promise((resolve, reject) => {
  const probe = createPortProbe(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const candidate = probe.address().port; probe.close((error) => error ? reject(error) : resolve(candidate)); });
});
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-authoring-usability"), server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null } });
let browser, page;
try {
  await vite.listen();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
  page.on("dialog", async (dialog) => { nativeDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.addInitScript(() => {
    if (localStorage.getItem("authoring-usability-fixture")) return;
    localStorage.setItem("authoring-usability-fixture", "1");
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", "app"); localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
    localStorage.setItem("yueqi.firstLight.v2", JSON.stringify({ schemaVersion: 2, stage: "COMPLETED", done: true, paused: false }));
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
    localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: false, token: "", authMode: "offline", productMode: "developer" }));
    localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
    localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
  });
  const bootReady = async () => { await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready") && window.__yueqiPhone, null, { timeout: 60000 }); };
  const screenshot = (name) => page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false, animations: "disabled" });
  const appBack = () => page.locator("[data-settings-back]").click();
  const appHome = async () => {
    if (!(await page.locator('[data-panel="me"]').evaluate((el) => el.classList.contains("is-active")))) {
      await page.locator("[data-nav-hub-toggle]:visible").click(); await page.locator('[data-nav-hub] [data-tab="me"]').click();
    }
    for (let i = 0; i < 5; i++) { if (!(await page.locator("[data-settings-shell]").getAttribute("data-settings-route"))) return; await appBack(); }
    throw new Error("Cannot reach App settings home");
  };
  const openApp = async (route) => {
    await appHome();
    await page.locator(`[data-settings-nav] [data-settings-route="${route === "prompt" ? "identity" : route}"]`).click();
    if (route === "prompt") await page.locator("[data-open-prompt-editor]").click();
    const panel = page.locator(`[data-settings-view="${route}"] .author-editor`); await panel.waitFor(); return panel;
  };
  const phoneBack = async () => { await page.locator('[data-phone-screen].is-active > .mini-appbar [data-phone-back]').click(); await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-closing")); };
  const phoneSettings = async () => {
    for (let i = 0; i < 5; i++) {
      const view = await page.locator(".mini-phone").getAttribute("data-phone-view");
      if (view === "settings") return;
      if (view === "home") await page.locator('[data-app-id="settings"]:visible').first().click(); else await phoneBack();
    }
    throw new Error("Cannot reach phone settings");
  };
  const openPhone = async (route) => {
    await phoneSettings();
    await (await revealSettingsControl(page.locator(`[data-phone-screen="settings"] [data-phone-open="${route}"]`))).click();
    const panel = page.locator(`[data-phone-screen="${route}"] .author-editor`); await panel.waitFor(); return panel;
  };
  const switchMode = async (mode) => {
    await page.evaluate((next) => window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: next } })), mode);
    await page.waitForFunction((next) => document.body.dataset.appMode === next, mode);
  };
  const run = async (name, task) => {
    const at = Date.now();
    try { const detail = await task(); results.push({ name, pass: true, durationMs: Date.now() - at, detail }); console.log(`PASS ${name}`); }
    catch (error) {
      const image = `failure-${results.length + 1}.png`; await screenshot(image.slice(0, -4)).catch(() => {});
      results.push({ name, pass: false, durationMs: Date.now() - at, error: error.stack, image }); console.error(`FAIL ${name}: ${error.message}`);
      // Discard only this isolated failing fixture. Closing the test page avoids
      // accepting a product beforeunload dialog merely to continue the suite.
      await page.close(); page = await context.newPage(); page.setDefaultTimeout(8000);
      page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
      page.on("dialog", async (dialog) => { nativeDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 }); await bootReady();
    }
  };
  const inspect = async (panel, name) => {
    const info = await panel.evaluate((root) => {
      function bg(el) { for (let node = el; node; node = node.parentElement) { const color = getComputedStyle(node).backgroundColor; if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color; } return "rgb(255, 255, 255)"; }
      function luminance(color) { const srgb = color.startsWith("color(srgb "); const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { const n = srgb ? x : x / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
      const visible = (el) => {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") return false;
        for (let node = el.parentElement; node; node = node.parentElement) if (node.matches("details:not([open])") && !node.querySelector(":scope > summary")?.contains(el)) return false;
        return true;
      };
      const readingControls = root.matches(".worldbook-editor,.memory-editor") ? ", button, summary, select" : "";
      const texts = [...root.querySelectorAll('.author-muted, small, .memory-editor__source, .author-status, [data-i18n^="nav."]' + readingControls)].filter((el) => visible(el) && !el.disabled && el.textContent.trim()).map((el) => {
        const style = getComputedStyle(el), background = bg(el), a = luminance(style.color), b = luminance(background);
        return { text: el.textContent.trim().slice(0, 100), color: style.color, background, fontSize: style.fontSize, contrast: Math.round(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)) * 100) / 100 };
      });
      const controls = [...root.querySelectorAll("button, input:not([type=hidden]), select, textarea, summary")].filter(visible).map((el) => {
        const area = el.matches('input[type="checkbox"]') ? el.closest("label") || el : el;
        const rect = area.getBoundingClientRect(); const style = getComputedStyle(el);
        return { tag: el.tagName, type: el.type, name: el.getAttribute("aria-label") || el.name || el.textContent.trim().slice(0, 70), width: rect.width, height: rect.height, outline: style.outlineStyle, disabled: el.disabled || false };
      });
      const rect = root.getBoundingClientRect();
      return { viewport: { width: innerWidth, height: innerHeight }, bounds: { left: rect.left, right: rect.right, scroll: root.scrollWidth, client: root.clientWidth }, documentWidth: document.documentElement.scrollWidth, texts, controls };
    });
    observations.push({ name, ...info });
    assert(info.bounds.left >= -1 && info.bounds.right <= info.viewport.width + 1 && info.bounds.scroll <= info.bounds.client + 1 && info.documentWidth <= info.viewport.width + 1, `${name}: horizontal overflow`);
    return info;
  };
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 }); await bootReady();

  await run("empty memory and no-result states are visible", async () => {
    const panel = await openApp("memory"); await panel.locator(".memory-editor__empty").waitFor();
    await screenshot("app-memory-empty-390"); await inspect(panel, "app-memory-empty");
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("找不到的记忆");
    await panel.locator(".memory-editor__empty").filter({ hasText: "没有匹配" }).waitFor();
    await screenshot("app-memory-no-results-390");
  });
  await run("long memory survives UI save, wrap and detail viewing at 360/390/412", async () => {
    const panel = await openApp("memory"); await panel.locator('[data-memory-action="add"]').click();
    await panel.locator('[data-memory-field="title"]').fill(longTitle); await panel.locator('[data-memory-field="rawText"]').fill(longBody);
    const bodyHeight = await panel.locator('[data-memory-field="rawText"]').evaluate((el) => el.getBoundingClientRect().height);
    assert(bodyHeight <= 480, `long memory must retain a bounded editing window, got ${bodyHeight}px`);
    await screenshot("app-memory-long-form-390");
    await panel.locator('[data-memory-form] [type="submit"]').click(); await panel.locator(".author-status").filter({ hasText: "已保存" }).waitFor();
    assert.equal(await panel.locator(".memory-editor__body").textContent(), longBody);
    for (const width of [360, 390, 412]) { await page.setViewportSize({ width, height: 844 }); await inspect(panel, `app-memory-long-${width}`); }
    await page.setViewportSize({ width: 390, height: 844 }); await screenshot("app-memory-long-detail-390");
  });
  await run("worldbook new form, long content and keyboard save remain reachable", async () => {
    const panel = await openApp("worldbook"); await panel.locator('[data-wb-action="new"]').click();
    await panel.locator('[name="title"]').fill(longTitle); await panel.locator('[name="content"]').fill(longBody); await expandDetails(panel, ".wb-form-usage"); await panel.locator('[name="keys"]').fill("晨光\n海边");
    const bodyHeight = await panel.locator('[name="content"]').evaluate((el) => el.getBoundingClientRect().height);
    assert(bodyHeight <= 480, `long worldbook must retain a bounded editing window, got ${bodyHeight}px`);
    await inspect(panel, "app-worldbook-form"); await screenshot("app-worldbook-long-form-390");
    await page.setViewportSize({ width: 360, height: 420 });
    const baselineFocus = await panel.locator('[name="binding"]').evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderColor }));
    await panel.locator('[name="content"]').focus(); await page.keyboard.press("Tab");
    const keyboard = await page.evaluate(() => {
      const el = document.activeElement, rect = el.getBoundingClientRect(), style = getComputedStyle(el), outlineRules = [];
      const scan = (rules) => { for (const rule of rules || []) { if (rule.selectorText && rule.style && (rule.style.outline || rule.style.outlineStyle)) { try { if (el.matches(rule.selectorText)) outlineRules.push({ selector: rule.selectorText, outline: rule.style.outline, style: rule.style.outlineStyle, priority: rule.style.getPropertyPriority("outline") }); } catch {} } if (rule.cssRules) scan(rule.cssRules); } };
      for (const sheet of document.styleSheets) { try { scan(sheet.cssRules); } catch {} }
      return { tag: el.tagName, name: el.name, top: rect.top, bottom: rect.bottom, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, shadow: style.boxShadow, border: style.borderColor, focusVisible: el.matches(":focus-visible"), outlineRules };
    });
    assert(keyboard.tag !== "BODY" && keyboard.bottom > 0 && keyboard.top < 420, "keyboard focus must remain visible in reduced viewport");
    assert((keyboard.outlineStyle !== "none" && parseFloat(keyboard.outlineWidth) >= 2) || (keyboard.shadow !== "none" && keyboard.shadow !== baselineFocus.shadow) || keyboard.border !== baselineFocus.border, `keyboard focus indicator must be visible: ${JSON.stringify({ keyboard, baselineFocus })}`);
    await screenshot("app-worldbook-reduced-viewport-focus-360"); await inspect(panel, "app-worldbook-reduced-viewport");
    await panel.locator('[type="submit"]').click(); await panel.locator(".author-status").filter({ hasText: "已保存" }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 }); return keyboard;
  });
  await run("dark theme: all four App editors, form targets and contrast evidence", async () => {
    let panel = await openApp("theme"); await panel.locator('[data-appearance-theme="ink"]').click(); await panel.locator("[data-appearance-save]").click();
    await panel.locator(".author-status").filter({ hasText: "已保存" }).waitFor();
    await inspect(page.locator(".nyra-dock"), "dark-app-bottom-navigation");
    for (const route of ["theme", "memory", "worldbook", "prompt"]) {
      panel = await openApp(route); await inspect(panel, `dark-app-${route}`); await screenshot(`dark-app-${route}-390`);
      if (route === "memory") { await panel.locator("[data-memory-open]").first().click(); await panel.locator(".memory-editor__source > summary").click(); await inspect(panel, "dark-app-memory-source"); await screenshot("dark-app-memory-source-390"); }
      if (route === "prompt") { await panel.locator('[data-prompt-action="tab"][data-tab="layout"]').click(); await inspect(panel, "dark-app-prompt-layout"); await screenshot("dark-app-prompt-layout-390"); }
    }
  });
  await run("dark theme: all four phone editors at 360/390/412", async () => {
    await switchMode("phone");
    for (const route of ["memory", "worldbook", "prompt", "beautify"]) {
      const panel = await openPhone(route);
      for (const width of [360, 390, 412]) { await page.setViewportSize({ width, height: 844 }); await inspect(panel, `dark-phone-${route}-${width}`); }
      await page.setViewportSize({ width: 390, height: 844 }); await screenshot(`dark-phone-${route}-390`);
      if (route === "beautify") {
        await page.setViewportSize({ width: 360, height: 420 });
        const slider = panel.locator('[name="fontSize"]'); await slider.focus(); await slider.press("Home"); await slider.press("ArrowRight");
        const saveVisibility = await panel.locator("[data-appearance-save]").evaluate((el) => { const rect = el.getBoundingClientRect(); const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return { top: rect.top, bottom: rect.bottom, inView: rect.top >= 0 && rect.bottom <= innerHeight, hittable: Boolean(at && (el === at || el.contains(at))) }; });
        assert(saveVisibility.inView && saveVisibility.hittable, `save must remain visible while adjusting appearance: ${JSON.stringify(saveVisibility)}`);
        await screenshot("dark-phone-appearance-save-visible-360");
        await panel.locator("[data-appearance-save]").click(); await panel.locator(".author-status").filter({ hasText: "已保存" }).waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
      }
    }
  });
  await run("English labels fit all four phone editors at 360", async () => {
    await phoneSettings();
    await (await revealSettingsControl(page.locator('[data-phone-screen="settings"] [data-phone-locales] [data-segment-id="en"]'))).click();
    await page.setViewportSize({ width: 360, height: 844 });
    for (const route of ["memory", "worldbook", "prompt", "beautify"]) {
      const panel = await openPhone(route); await inspect(panel, `english-phone-${route}`); await screenshot(`english-phone-${route}-360`);
      const heading = await page.locator(`[data-phone-screen="${route}"] > .mini-appbar`).textContent();
      assert(!/[\u3400-\u9fff]/u.test(heading), `English shell header must follow locale: ${heading.trim()}`);
    }
  });
  await run("all audited text contrast and control hit areas meet mobile minimum", async () => {
    const small = observations.flatMap((item) => item.controls.filter((control) => !control.disabled && (control.width < 43.5 || control.height < 43.5)).map((control) => ({ page: item.name, ...control })));
    const lowContrast = observations.flatMap((item) => item.texts.filter((text) => text.contrast < 4.5).map((text) => ({ page: item.name, ...text })));
    assert.deepEqual(small, [], `Controls below 44px: ${JSON.stringify(small)}`);
    assert.deepEqual(lowContrast, [], `Supporting text below 4.5:1: ${JSON.stringify(lowContrast)}`);
  });
  await run("no runtime errors or unexpected native dialogs", async () => { assert.deepEqual(runtimeErrors, []); assert.deepEqual(nativeDialogs, []); });
} catch (error) { results.push({ name: "browser setup/completion", pass: false, error: error.stack }); console.error(error); }
finally {
  await browser?.close(); await vite.close();
  const report = { script: "scripts/verify-authoring-usability-browser.mjs", isolated: true, at: new Date().toISOString(), durationMs: Date.now() - startedAt, passed: results.filter((x) => x.pass).length, failed: results.filter((x) => !x.pass).length, results, observations, runtimeErrors, nativeDialogs, limitation: "Chromium browser evidence. Reduced viewport is not real Android IME or device evidence." };
  await writeFile(path.join(evidenceDir, "USABILITY_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Usability browser: ${report.passed}/${results.length}; ${(report.durationMs / 1000).toFixed(1)}s`);
  if (report.failed) process.exitCode = 1;
}
