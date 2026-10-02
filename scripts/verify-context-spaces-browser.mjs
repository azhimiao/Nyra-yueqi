
async function revealSettingsControl(control) {
  const category = control.locator('xpath=ancestor::details[@data-settings-group]');
  if (await category.count() && await category.getAttribute("open") === null) {
    await category.locator(":scope > summary").click();
  }
  return control;
}
/**
 * Context spaces: actual App navigation and phone desktop entry points.
 * Uses a fresh browser context and temporary Vite port. All fixture writes are
 * confined to that origin/profile; no model request or user data is involved.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer as createPortProbe } from "node:net";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.join(root, "docs/qa/context-spaces");
await mkdir(evidence, { recursive: true });
const results = [], runtimeErrors = [], nativeDialogs = [], measures = [], requestFailures = [], consoleErrors = [];
const pendingRequests = new Set();
const startedAt = Date.now();
const fixture = {
  worldTitle: "雨港的最后一班电车",
  worldBody: "雨港沿河的电车在夜里十一点停运。旧钟楼旁留着一个避雨站台，居民会在那里等雨停。\n这是角色生活的背景设定，不是我们已经经历的事情。",
  memoryTitle: "想一起去看海",
  memoryBody: "今天记下一个愿望：等天气晴了，想和你沿着海边慢慢走一段。\n不急着安排，只先把这份期待留下。",
  secondTitle: "下雨天的小提醒",
  secondBody: "出门记得带伞。我们还没有去过雨港，这里只是我写下的提醒。",
};
function seed() {
  if (localStorage.getItem("context-spaces-fixture")) return;
  localStorage.setItem("context-spaces-fixture", "1");
  const values = {
    "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
    "yueqi.firstLight.v1": { done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 },
    "yueqi.firstLight.v2": { schemaVersion: 2, stage: "COMPLETED", done: true, paused: false },
    "yueqi.onboarding.v1": { done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true },
    "yueqi.ecosystem.v1": { loggedIn: false, token: "", authMode: "offline", productMode: "developer" },
    "yueqi.autonomy.v1": { onboardingComplete: true, preset: "quiet" },
    "yueqi.phone.os.v1": { passcodeEnabled: false },
  };
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
}
const port = await new Promise((resolve, reject) => {
  const probe = createPortProbe(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const candidate = probe.address().port; probe.close((error) => error ? reject(error) : resolve(candidate)); });
});
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-context-spaces"), server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null } });
let browser, context, page;
let activeCharacterId = "";
const baseUrl = `http://127.0.0.1:${port}/`;
try {
  await vite.listen();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, hasTouch: true });
  // External font availability must not determine the result of this local UI
  // regression. Product stacks fall back to installed fonts in this fixture.
  await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await context.addInitScript(seed);
  const newPage = async () => {
    page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000);
    page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
    page.on("request", (request) => pendingRequests.add(request.url()));
    page.on("requestfinished", (request) => pendingRequests.delete(request.url()));
    page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("dialog", async (dialog) => { nativeDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  };
  await newPage();
  const boot = () => page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready") && window.__yueqiPhone && window.__yueqiFullBootstrapState === "ready", null, { timeout: 150000 });
  const shot = (name) => page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: false, animations: "disabled" });
  const run = async (name, work) => {
    const at = Date.now();
    try { const detail = await work(); results.push({ name, pass: true, durationMs: Date.now() - at, detail }); console.log(`PASS ${name}`); }
    catch (error) {
      const image = `failure-${results.length + 1}.png`; await shot(image.slice(0, -4)).catch(() => {});
      results.push({ name, pass: false, durationMs: Date.now() - at, error: error.stack, image }); console.error(`FAIL ${name}: ${error.message}`);
      const viewport = page.viewportSize();
      await page.close(); await newPage(); if (viewport) await page.setViewportSize(viewport);
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" }); await boot();
    }
  };
  const mode = async (value) => {
    if (await page.locator("body").getAttribute("data-app-mode") === value) return;
    await page.evaluate((next) => window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: next } })), value);
    await page.waitForFunction((next) => document.body.dataset.appMode === next, value);
  };
  const app = async (route) => {
    await mode("app");
    const desktop = page.locator(`.side-tabs [data-context-route="${route}"]`);
    if (await desktop.isVisible()) await desktop.click();
    else {
      await page.locator("[data-drawer-open]:visible").first().click();
      await page.locator(`#featureDrawer [data-context-route="${route}"]`).click();
    }
    const editor = page.locator(`[data-settings-view="${route}"] .author-editor`); await editor.waitFor();
    assert.equal(await page.locator("body").getAttribute("data-context-space"), route);
    assert(await page.locator("[data-settings-shell]").evaluate((node) => node.classList.contains("is-context-space")));
    assert(!(await page.locator("[data-settings-nav]").isVisible()), "content spaces must not retain a visible settings menu");
    return editor;
  };
  const phoneHome = async () => {
    await mode("phone");
    for (let i = 0; i < 6; i++) {
      const currentView = await page.locator(".mini-phone").getAttribute("data-phone-view");
      if (currentView === "home") return;
      await page.locator(`[data-phone-screen="${currentView}"] > .mini-appbar :is([data-phone-back],[data-phone-home])`).click();
      await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-closing"));
    }
    throw new Error("phone back did not return to home");
  };
  const phone = async (route) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await phoneHome();
    const icon = page.locator(`[data-app-id="${route}"]`).first();
    const pageIndex = await icon.evaluate((node) => node.closest("[data-home-page]")?.dataset.homePage || "0");
    await page.locator(`[data-home-dot][data-page="${pageIndex}"]`).click();
    await icon.click();
    await page.waitForFunction((route) => document.querySelector(".mini-phone")?.dataset.phoneView === route, route);
    await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-expanding"));
    const editor = page.locator(`[data-phone-screen="${route}"] .author-editor`); await editor.waitFor(); return editor;
  };
  const openDetailsFor = async (control) => {
    const summaries = await control.evaluate((el) => { const result = []; for (let node = el.parentElement; node; node = node.parentElement) if (node.matches("details:not([open])")) result.unshift(node.querySelector(":scope > summary")?.textContent || ""); return result; });
    for (const text of summaries) await page.locator("summary:visible").filter({ hasText: text }).first().click();
  };
  const addMemory = async (editor, title, rawText) => {
    await editor.locator('[data-memory-action="add"]').first().click();
    await editor.locator('[data-memory-field="title"]').fill(title);
    await editor.locator('[data-memory-field="rawText"]').fill(rawText);
    await editor.locator('[data-memory-form] [type="submit"]').click();
    await editor.locator('[data-memory-open]').filter({ hasText: title }).waitFor();
  };
  const expandMemory = async (editor, title) => {
    const row = editor.locator("[data-memory-open]").filter({ hasText: title });
    if (await row.getAttribute("aria-expanded") !== "true") await row.click();
    return row;
  };
  const expandWorld = async (editor) => {
    if (!(await editor.locator("[data-wb-search]").isVisible())) await editor.locator('[data-wb-action="search"]').click();
    await editor.locator("[data-wb-search]").fill(fixture.worldTitle);
    const entry = editor.locator("[data-wb-open]").filter({ hasText: fixture.worldTitle });
    if (await entry.getAttribute("aria-expanded") !== "true") await entry.click();
    await editor.locator(".wb-reading-copy:visible").waitFor();
  };
  const inspect = async (editor, name) => {
    const info = await editor.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const visible = (node) => { if (!node.getClientRects().length || getComputedStyle(node).visibility === "hidden") return false; for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor.matches("details:not([open])") && !ancestor.querySelector(":scope > summary")?.contains(node)) return false; return true; };
      const controls = [...el.querySelectorAll("button,input:not([type=hidden]),select,textarea,summary")].filter(visible).filter((node) => !node.disabled).map((node) => { const target = node.matches('input[type="checkbox"]') ? node.closest("label") || node : node; const r = target.getBoundingClientRect(); return { tag: node.tagName, name: node.getAttribute("aria-label") || node.name || node.textContent.trim().slice(0, 65), width: r.width, height: r.height }; });
      return { width: innerWidth, document: document.documentElement.scrollWidth, left: rect.left, right: rect.right, client: el.clientWidth, scroll: el.scrollWidth, controls };
    });
    measures.push({ name, ...info });
    assert(info.document <= info.width + 1 && info.left >= -1 && info.right <= info.width + 1 && info.scroll <= info.client + 1, `${name}: horizontal overflow ${JSON.stringify(info)}`);
    for (const target of info.controls) assert(target.width >= 43.5 && target.height >= 43.5, `${name}: small touch target ${JSON.stringify(target)}`);
    return info;
  };
  await page.goto(baseUrl, { waitUntil: "commit" }); await boot();
  activeCharacterId = await page.evaluate(async () => (await import("/src/characters/store.js")).getActiveCharacterId());

  await run("App sidebar opens an independent empty memory space", async () => {
    const editor = await app("memory");
    await editor.locator(".memory-editor__empty").waitFor();
    assert.equal(await editor.locator("[data-memory-open]").count(), 0, "empty memory must not fabricate shared history");
    assert.equal(await editor.locator("textarea").count(), 0, "browse view must not start as an editor");
    await shot("app-memory-empty-desktop"); await inspect(editor, "empty-memory-desktop");
  });
  await run("World detail is created by UI and read inline with honest usage semantics", async () => {
    const editor = await app("worldbook");
    assert.equal(await editor.locator("textarea").count(), 0);
    await editor.locator('[data-wb-action="new"]').click();
    await editor.locator('[name="title"]').fill(fixture.worldTitle);
    await editor.locator('[name="content"]').fill(fixture.worldBody);
    await openDetailsFor(editor.locator('[name="category"]'));
    await editor.locator('[name="category"]').fill("地点");
    await editor.locator('[data-wb-form] [type="submit"]').click();
    await expandWorld(editor);
    assert.equal((await editor.locator(".wb-reading-copy:visible").textContent()).trim(), fixture.worldBody);
    assert.equal(await editor.locator("[data-wb-form]").count(), 0);
    await editor.locator("details.wb-usage:visible > summary").click();
    assert.match(await editor.locator("details.wb-usage:visible").textContent(), /设定|条件|配置|对话/);
    await shot("app-worldbook-reading-desktop"); await inspect(editor, "worldbook-reading-desktop");
  });
  await run("Saved memories remain one stream with inline provenance and management", async () => {
    const editor = await app("memory");
    await addMemory(editor, fixture.memoryTitle, fixture.memoryBody);
    await addMemory(editor, fixture.secondTitle, fixture.secondBody);
    await expandMemory(editor, fixture.memoryTitle);
    assert.equal(await editor.locator("[data-memory-open]").count(), 2, "expanding one memory must retain the stream");
    assert((await editor.locator(".memory-editor__body").textContent()).includes(fixture.memoryBody));
    await editor.locator("details[data-memory-source] > summary").click();
    assert.match(await editor.locator("details[data-memory-source]").textContent(), /手动|未关联/);
    assert.equal(await editor.locator("[data-memory-form]").count(), 0);
    await shot("app-memory-reading-desktop"); await inspect(editor, "memory-reading-desktop");
  });
  await run("Mobile sidebar navigation protects a dirty memory draft", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const editor = await app("memory");
    await editor.locator('[data-memory-action="add"]').first().click();
    await editor.locator('[data-memory-field="rawText"]').fill("尚未保存的独立草稿");
    await page.locator("[data-drawer-open]:visible").first().click();
    await page.locator('#featureDrawer [data-context-route="worldbook"]').click();
    await editor.locator('[data-memory-action="confirm-cancel"]').click();
    assert.equal(await editor.locator('[data-memory-field="rawText"]').inputValue(), "尚未保存的独立草稿");
    assert.equal(await page.locator("body").getAttribute("data-context-space"), "memory");
    await editor.locator('[data-memory-action="cancel-edit"]').click();
    await editor.locator('[data-memory-action="confirm-accept"]').click();
    assert.equal(await editor.locator("[data-memory-form]").count(), 0);
  });
  await run("Phone desktop has two child apps that share saved content and return home", async () => {
    let editor = await phone("worldbook"); await expandWorld(editor);
    assert.equal((await editor.locator(".wb-reading-copy:visible").textContent()).trim(), fixture.worldBody);
    await shot("phone-worldbook-reading-390"); await inspect(editor, "phone-worldbook");
    await phoneHome();
    assert.equal(await page.locator(".mini-phone").getAttribute("data-phone-view"), "home");
    await shot("phone-context-app-icons-390");
    editor = await phone("memory"); await expandMemory(editor, fixture.memoryTitle);
    assert((await editor.locator(".memory-editor__body").textContent()).includes(fixture.memoryBody));
    await shot("phone-memory-reading-390"); await inspect(editor, "phone-memory");
    await phoneHome();
  });
  await run("Context-to-context navigation returns to the most recent main destination", async () => {
    await page.setViewportSize({ width: 1280, height: 900 }); await mode("app");
    await page.locator('.side-tabs [data-tab="chat"]').click();
    await app("worldbook"); await app("memory");
    await page.locator("[data-settings-back]").click();
    assert.equal(await page.locator("body").getAttribute("data-active-panel"), "chat");
    await page.locator('.side-tabs [data-tab="world"]').click();
    await app("memory"); await page.locator("[data-settings-back]").click();
    assert.equal(await page.locator("body").getAttribute("data-active-panel"), "world");
    await page.setViewportSize({ width: 390, height: 844 });
  });
  await run("Phone edits persist and are visible through the App sidebar after reload", async () => {
    let editor = await phone("worldbook"); await expandWorld(editor);
    await editor.locator("[data-wb-edit]:visible").click();
    await editor.locator('[name="content"]').fill(`${fixture.worldBody}\n站台旁有一盏蓝色的灯。`);
    await editor.locator('[data-wb-form] [type="submit"]').click();
    await editor.locator("[data-wb-open]").filter({ hasText: fixture.worldTitle }).waitFor();
    editor = await phone("memory"); await expandMemory(editor, fixture.memoryTitle);
    await editor.locator("details[data-memory-management] > summary").click();
    await editor.locator('[data-memory-action="edit"]').click();
    await editor.locator('[data-memory-field="rawText"]').fill(`${fixture.memoryBody}\n补记：等周末再商量。`);
    await editor.locator('[data-memory-form] [type="submit"]').click();
    await editor.locator("[data-memory-open]").filter({ hasText: fixture.memoryTitle }).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" }); await boot();
    editor = await app("worldbook"); await expandWorld(editor); assert.match(await editor.locator(".wb-reading-copy:visible").textContent(), /蓝色的灯/);
    editor = await app("memory"); await expandMemory(editor, fixture.memoryTitle); assert.match(await editor.locator(".memory-editor__body").textContent(), /等周末再商量/);
  });
  await run("Both reading spaces fit 360, 390 and 412 pixel viewports with usable targets", async () => {
    for (const shell of ["app", "phone"]) for (const route of ["worldbook", "memory"]) {
      const editor = await (shell === "app" ? app(route) : phone(route));
      if (route === "worldbook") await expandWorld(editor); else await expandMemory(editor, fixture.memoryTitle);
      for (const width of [360, 390, 412]) { await page.setViewportSize({ width, height: 844 }); await inspect(editor, `${shell}-${route}-${width}`); }
      await page.setViewportSize({ width: 390, height: 844 }); await shot(`${shell}-${route}-reading-390`);
    }
  });
  await run("Old settings links open the same child apps and back returns to settings", async () => {
    await phoneHome(); await page.locator('[data-app-id="settings"]:visible').first().click();
    for (const route of ["worldbook", "memory"]) {
      await (await revealSettingsControl(page.locator(`[data-phone-screen="settings"] [data-phone-open="${route}"]`))).click();
      await page.locator(`[data-phone-screen="${route}"] .author-editor`).waitFor();
      await page.locator(`[data-phone-screen="${route}"] > .mini-appbar [data-phone-back]`).click();
      await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneView === "settings");
    }
  });
  await run("Chinese and English first screens expose a recognizable action and readable content", async () => {
    const observations = [];
    const chooseLocale = async (locale) => {
      await phoneHome();
      await page.locator('[data-app-id="settings"]:visible').first().click();
      await (await revealSettingsControl(page.locator(`[data-phone-screen="settings"] [data-phone-locales] [data-segment-id="${locale}"]`))).click();
      const state = await page.locator('[data-phone-screen="settings"]').evaluate((el) => ({ active: el.classList.contains("is-active"), hidden: el.hidden }));
      assert(state.active && !state.hidden, "locale refresh must preserve the active settings screen");
    };
    for (const locale of ["zh-CN", "en"]) {
      await chooseLocale(locale);
      for (const shell of ["app", "phone"]) for (const route of ["worldbook", "memory"]) for (const width of [360, 390]) {
        await page.setViewportSize({ width, height: 844 });
        if (shell === "app") await app(route === "worldbook" ? "memory" : "worldbook");
        const editor = await (shell === "app" ? app(route) : phone(route));
        await page.setViewportSize({ width, height: 844 });
        const primary = route === "worldbook" ? '[data-wb-action="new"]' : '[data-memory-action="add"]';
        const row = route === "worldbook" ? "[data-wb-open]" : "[data-memory-open]";
        await editor.locator(row).first().waitFor();
        await editor.evaluate((el) => {
          for (let node = el.parentElement; node; node = node.parentElement) if (node.scrollHeight > node.clientHeight) node.scrollTop = 0;
        });
        const visual = await editor.evaluate((el, selectors) => {
          const action = [...el.querySelectorAll(selectors.primary)].find((node) => node.getClientRects().length);
          const item = el.querySelector(selectors.row);
          const actionBox = action.getBoundingClientRect(), itemBox = item.getBoundingClientRect();
          const s = getComputedStyle(action), p = getComputedStyle(action.parentElement);
          const transparent = (value) => value === "transparent" || value === "rgba(0, 0, 0, 0)";
          const outline = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none" && !transparent(s[`border${side}Color`]));
          return { label: action.textContent.trim(), fontSize: parseFloat(s.fontSize), actionTop: actionBox.top, actionBottom: actionBox.bottom,
            firstContentTop: itemBox.top, firstContentBottom: itemBox.bottom, outlinedOrFilled: outline || (!transparent(s.backgroundColor) && s.backgroundColor !== p.backgroundColor),
            background: s.backgroundColor, border: s.border, availableHeight: innerHeight, heading: el.querySelector("h2")?.textContent || "" };
        }, { primary, row });
        const name = `${locale}-${shell}-${route}-${width}`;
        observations.push({ name, ...visual });
        assert(visual.label.replace(/[+＋\s]/g, "").length >= 2, `${name}: primary action needs a clear label`);
        assert(visual.actionTop >= 0 && visual.actionBottom < visual.availableHeight - 70, `${name}: primary action must be available on the first screen: ${JSON.stringify(visual)}`);
        assert(visual.outlinedOrFilled, `${name}: primary action must be distinguishable from explanatory text: ${JSON.stringify(visual)}`);
        await inspect(editor, `readability-${name}`);
        await shot(`first-screen-${name}`);
      }
    }
    await chooseLocale("zh-CN");
    measures.push({ name: "first-screen-readability", observations });
    return observations;
  });
  await run("Dark theme preserves legible reading in both shells", async () => {
    await page.evaluate(async () => { const theme = await import("/src/ui/theme.js"); theme.saveThemeId("ink"); theme.applyTheme("ink"); });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "ink");
    for (const shell of ["app", "phone"]) for (const route of ["worldbook", "memory"]) {
      const editor = await (shell === "app" ? app(route) : phone(route));
      if (route === "worldbook") await expandWorld(editor); else await expandMemory(editor, fixture.memoryTitle);
      await inspect(editor, `dark-${shell}-${route}`); await shot(`dark-${shell}-${route}-390`);
      if (shell === "phone") {
        const chrome = await page.locator(`[data-phone-screen="${route}"] > .mini-appbar`).evaluate((el) => {
          const bg = (node) => { for (let p = node; p; p = p.parentElement) { const value = getComputedStyle(p).backgroundColor; if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") return value; } return "rgb(255,255,255)"; };
          const luma = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { const n = x / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          return [...el.querySelectorAll("strong, button svg")].filter((node) => node.getClientRects().length).map((node) => { const color = getComputedStyle(node).color, background = bg(node), a = luma(color), b = luma(background); return { tag: node.tagName, text: node.textContent, color, background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
        });
        for (const item of chrome) assert(item.contrast >= (item.tag === "STRONG" ? 4.5 : 3), `dark phone ${route} header illegible: ${JSON.stringify(item)}`);
        measures.push({ name: `dark-phone-${route}-chrome`, chrome });
      }
    }
  });
  await run("Worldbook desktop migration preserves layout, respects removal and handles full pages", async () => {
    const isolated = await browser.newContext();
    const migration = await isolated.newPage();
    try {
      await migration.route("**/__context_migration", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Isolated migration fixture</title>" }));
      await migration.goto(`${baseUrl}__context_migration`);
      const scenarios = await migration.evaluate(async () => {
        const m = await import("/src/phone-shell/os-prefs.js");
        const { LAYOUT_VERSION_C1 } = await import("/src/phone-shell/home-layout.js");
        const checks = [];
        const record = (name, pass, detail) => checks.push({ name, pass, detail });
        const base = m.buildC1HomePrefs();
        const raw = { ...base, contextAppsVersion: 0, layoutVersion: LAYOUT_VERSION_C1, iconOrder: base.iconOrder.filter((id) => id !== "worldbook"), wallpaper: { lockScreen: "ink", homeScreen: "mist" } };
        [raw.iconOrder[0], raw.iconOrder[1]] = [raw.iconOrder[1], raw.iconOrder[0]];
        while (raw.iconOrder.length < 24) raw.iconOrder.push(null);
        localStorage.setItem("yueqi.phone.os.v1", JSON.stringify(raw));
        const loaded = m.loadPhoneOsPrefs();
        record("old icon order and wallpaper preserved", raw.iconOrder.filter(Boolean).every((id, index) => loaded.iconOrder[index] === id) && JSON.stringify(loaded.wallpaper) === JSON.stringify(raw.wallpaper), { before: raw.iconOrder, after: loaded.iconOrder });
        record("added once and persisted", loaded.iconOrder.filter((id) => id === "worldbook").length === 1 && loaded.contextAppsVersion === 1 && m.loadPhoneOsPrefs().iconOrder.filter((id) => id === "worldbook").length === 1);
        m.removeAppIconFromHome("worldbook");
        const removed = m.loadPhoneOsPrefs();
        record("explicit removal survives subsequent loads", !removed.iconOrder.includes("worldbook") && removed.contextAppsVersion === 1);
        const dock = m.migrateContextApps({ ...base, contextAppsVersion: 0, iconOrder: Array(24).fill(null), dockOrder: ["worldbook", null, null, null] }, 0);
        record("dock presence is not duplicated", !dock.iconOrder.includes("worldbook") && dock.dockOrder[0] === "worldbook");
        const folders = m.migrateContextApps({ ...base, contextAppsVersion: 0, iconOrder: ["folder:saved", ...Array(23).fill(null)], dockOrder: [], folders: { saved: { name: "自己的位置", apps: ["worldbook"] } } }, 0);
        record("folder presence is not duplicated", !folders.iconOrder.includes("worldbook") && folders.folders.saved.apps.includes("worldbook"));
        const full = Array.from({ length: 24 }, (_, i) => `ext:fixture-${i}`);
        const grow = m.migrateContextApps({ ...base, iconOrder: full, iconPageCount: 1, pageCount: 2, dockOrder: [], folders: {} }, 0);
        record("full page grows without replacing icons", grow.iconPageCount === 2 && full.every((id, i) => grow.iconOrder[i] === id) && grow.iconOrder[24] === "worldbook");
        const max = Array.from({ length: 96 }, (_, i) => `ext:fixture-${i}`);
        const capped = m.migrateContextApps({ ...base, iconOrder: max, iconPageCount: 4, pageCount: 5, dockOrder: [], folders: {} }, 0);
        record("four full pages never overwrite existing icons", capped.iconPageCount === 4 && JSON.stringify(capped.iconOrder) === JSON.stringify(max));
        return checks;
      });
      for (const check of scenarios) assert(check.pass, `${check.name}: ${JSON.stringify(check.detail)}`);
      return scenarios;
    } finally { await isolated.close(); }
  });
  await run("No uncaught runtime errors or unexpected native confirmations", async () => {
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(nativeDialogs, []);
  });
} catch (error) {
  results.push({ name: "Suite setup or teardown", pass: false, error: error.stack, pendingRequests: [...pendingRequests], startupState: await page?.evaluate(() => ({ ready: document.readyState, html: document.documentElement.className, bootstrap: window.__yueqiFullBootstrapState, splash: document.querySelector("[data-boot-screen]")?.dataset.splashState })).catch(() => null) });
  await page?.screenshot({ path: path.join(evidence, "startup-failure.png") }).catch(() => {});
  console.error(error.stack);
} finally {
  const report = { at: new Date().toISOString(), durationMs: Date.now() - startedAt, activeCharacterId, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results, runtimeErrors, nativeDialogs, requestFailures, consoleErrors, measures, scope: "Isolated browser evidence using installed fallback fonts; not Android hardware or live model evidence." };
  await writeFile(path.join(evidence, "BROWSER_VERIFY.json"), JSON.stringify(report, null, 2));
  await browser?.close(); await vite.close();
}
if (results.some((r) => !r.pass) || runtimeErrors.length || nativeDialogs.length) process.exitCode = 1;
