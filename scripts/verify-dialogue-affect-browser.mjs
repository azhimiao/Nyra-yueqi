
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
const evidenceDir = path.join(root, "docs/qa/dialogue-repair/ui");
await mkdir(evidenceDir, { recursive: true });
const results = [], runtimeErrors = [], nativeDialogs = [], observations = [];
const startedAt = Date.now();
const longTitle = "与你一起收集的晨光与海边来信——这是较长的记忆标题，用于检查小屏幕阅读。";
const longBody = "风从海上来，我们把今天的心情写进一封信里。\n".repeat(90) + "https://example.invalid/" + "longunbrokentext".repeat(18);
const port = await new Promise((resolve, reject) => {
  const probe = createPortProbe(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const candidate = probe.address().port; probe.close((error) => error ? reject(error) : resolve(candidate)); });
});
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-dialogue-affect-ui"), server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null } });
let browser, page;
try {
  await vite.listen();
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', route => route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000);
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
  const bootReady = async () => { await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready") && window.__yueqiPhone, null, { timeout: 150000 }); };
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
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "commit", timeout: 60000 }); await bootReady();
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
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "commit", timeout: 60000 }); await bootReady();


  await run("V2 projection recovers a failed cache write and inner voice changes immediately", async () => {
    const seeded = await page.evaluate(async () => {
      const { getChatFocus } = await import('/src/characters/session-context.js');
      const { writeCompanionTurn } = await import('/src/conversation/companion-write.js');
      const prefs = await import('/src/settings/preferences.js');
      const focus = getChatFocus();
      const options = { companionId: focus.characterId, chatSessionId: focus.sessionId, userId: 'local', saveChatMessage: async () => { throw new Error('synthetic_idb_write_failure'); } };
      const u = await writeCompanionTurn({ ...options, role: 'user', text: '只听我说一会儿。', messageId: 'affect-ui-user' });
      const a = await writeCompanionTurn({ ...options, role: 'assistant', text: '行，你说，我听着。', messageId: 'affect-ui-assistant', meta: { turnActivity: { state: 'complete', innerState: '差点又多嘴了，先听你说完。' } } });
      window.__affectProjectionFixture = { sessionId: focus.sessionId, conversationSessionId: a.conversationSessionId };
      prefs.savePromptSettings({ innerStateDisplay: 'natural' });
      return { userOk: u.ok, assistantOk: a.ok, pending: a.projectionPending };
    });
    assert.deepEqual(seeded, { userOk: true, assistantOk: true, pending: true });
    await page.waitForFunction(() => document.querySelector('#messageList')?.textContent.includes('差点又多嘴了，先听你说完。'));
    const assertProjection = () => page.evaluate(async () => {
      const { getMessagesBySession } = await import('/src/storage/db.js');
      const { getSharedHistory } = await import('/src/conversation/index.js');
      const f = window.__affectProjectionFixture;
      return { mirror: (await getMessagesBySession(f.sessionId)).filter(m => m.content === '行，你说，我听着。').length, authority: getSharedHistory(f.conversationSessionId).filter(m => m.content === '行，你说，我听着。').length };
    });
    assert.deepEqual(await assertProjection(), { mirror: 1, authority: 1 });
    await page.evaluate(async () => (await import('/src/settings/preferences.js')).savePromptSettings({ innerStateDisplay: 'off' }));
    await page.waitForFunction(() => !document.querySelector('#messageList')?.textContent.includes('差点又多嘴了，先听你说完。'));
    await page.evaluate(async () => (await import('/src/settings/preferences.js')).savePromptSettings({ innerStateDisplay: 'natural' }));
    await page.waitForFunction(() => document.querySelector('#messageList')?.textContent.includes('差点又多嘴了，先听你说完。'));
    assert.deepEqual(await assertProjection(), { mirror: 1, authority: 1 });
  });
  await run("App: draft preview, save and reload inner voice preference", async () => {
    const panel = await openApp("prompt");
    const control = panel.locator("[data-inner-state-display]");
    assert.equal(await control.inputValue(), "natural");
    await control.selectOption("off");
    assert.equal(await page.evaluate(async () => (await import('/src/settings/preferences.js')).getPromptSettings().innerStateDisplay), "natural", "draft must not change saved preference");
    await panel.locator('[data-tab="preview"]').click();
    await panel.locator('[data-preview-query]').fill('你好，今天在干嘛呢？');
    await panel.locator('[data-prompt-action="preview"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-settings-view="prompt"] [data-prompt-action="preview"]').disabled);
    assert.match(await panel.locator('[data-prompt-preview]').textContent(), /本轮不展示内心独白/);
    await panel.locator('[data-tab="character"]').click();
    await control.scrollIntoViewIfNeeded();
    await inspect(panel, "app-off-draft"); await screenshot('app-inner-preference-390');
    await panel.locator('[data-prompt-action="save"]').click();
    await panel.getByText('已保存，下轮对话生效。', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async () => (await import('/src/settings/preferences.js')).getPromptSettings().innerStateDisplay), "off");
    await page.reload({ waitUntil: 'commit' }); await bootReady();
    const reopened = await openApp('prompt');
    assert.equal(await reopened.locator('[data-inner-state-display]').inputValue(), 'off');
  });
  await run("Mini-phone: same preference, reachable control and responsive layout", async () => {
    await switchMode('phone');
    const panel = await openPhone('prompt');
    const control = panel.locator('[data-inner-state-display]');
    assert.equal(await control.inputValue(), 'off');
    await control.selectOption('expanded');
    await panel.locator('[data-prompt-action="save"]').click();
    await panel.getByText('已保存，下轮对话生效。', { exact: true }).waitFor();
    for (const [width, height] of [[360,800], [390,844], [412,915]]) {
      await page.setViewportSize({ width, height });
      await control.scrollIntoViewIfNeeded();
      const info = await inspect(panel, `phone-inner-${width}`);
      const bounds = await control.boundingBox(); assert(bounds.height >= 44);
      await screenshot(`phone-inner-preference-${width}`);
    }
    assert.equal(await page.evaluate(async () => (await import('/src/settings/preferences.js')).getPromptSettings().innerStateDisplay), 'expanded');
    await phoneBack();
    const reopened = await openPhone('prompt');
    assert.equal(await reopened.locator('[data-inner-state-display]').inputValue(), 'expanded');
  });
  await run("Shared chat renderer: no placeholder, immediate text, hidden mode", async () => {
    const checks = await page.evaluate(async () => {
      const view = await import('/src/chat/turn-activity.js');
      const prefs = await import('/src/settings/preferences.js');
      const host = document.createElement('article');
      host.innerHTML = '<p data-message-body></p>'; document.body.append(host);
      const controller = view.createTurnActivityView(host, { messageId: 'affect-ui-test', sessionId: 'fixture' });
      controller.setPhase('thinking', 'active');
      const noFake = controller.element.hidden;
      controller.setInnerState('差点又多嘴了，先听你说完。', { complete: true });
      const received = controller.element.querySelector('.message-turn-activity__copy').textContent;
      controller.finish();
      prefs.savePromptSettings({ innerStateDisplay: 'off' });
      const noSaved = view.renderTurnActivityHtml(controller.getSnapshot()) === '';
      const noLive = view.renderLiveTurnActivityHtml({ phase: 'thinking', innerState: received }) === '';
      host.remove();
      return { noFake, received, noSaved, noLive };
    });
    assert.equal(checks.noFake, true);
    assert.equal(checks.received, '差点又多嘴了，先听你说完。');
    assert.equal(checks.noSaved, true); assert.equal(checks.noLive, true);
    return checks;
  });
} finally {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results, runtimeErrors, nativeDialogs, observations, elapsedMs: Date.now()-startedAt, platform: 'Chromium responsive browser; not Android evidence' }, null, 2));
  await browser?.close(); await vite.close();
}
assert.deepEqual(results.filter(row => !row.pass), []);
assert.deepEqual(runtimeErrors, []);
console.log(`PASS ${results.length} dialogue inner-voice UI checks`);
