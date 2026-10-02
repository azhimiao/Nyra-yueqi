/** Isolated browser evidence for navigation, configuration and empty diary state. */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = path.join(root, "docs/qa/ui-logic");
await mkdir(evidence, { recursive: true });
const vite = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-ui-logic"), server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
const results = [], runtimeErrors = [];
let browser, context, page;
let scopeFixture;
const startedAt = Date.now();
try {
  await vite.listen();
  const address = vite.httpServer.address();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: "Asia/Shanghai" });
  await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await context.route("**/model/chat", (route) => route.abort());
  await context.addInitScript(() => {
    const state = {
      "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
      "yueqi.firstLight.v1": { done: true, stage: "COMPLETED", migratedFromLegacy: true, version: 1 },
      "yueqi.firstLight.v2": { schemaVersion: 2, stage: "COMPLETED", done: true },
      "yueqi.onboarding.v1": { done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true },
      "yueqi.ecosystem.v1": { loggedIn: false, authMode: "offline", modelSource: "byok" },
      "yueqi.autonomy.v1": { onboardingComplete: true, preset: "quiet" },
      "yueqi.phone.os.v1": { passcodeEnabled: false },
    };
    for (const [key, value] of Object.entries(state)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem("yueqi.app.mode", "app");
    localStorage.setItem("yueqi.app.mode.chosen", "1");
  });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready" && window.__yueqiPhone, null, { timeout: 150000 });
  const run = async (name, work) => {
    try { const detail = await work(); results.push({ name, pass: true, detail }); console.log(`PASS ${name}`); }
    catch (error) {
      const image = `failure-${results.length + 1}.png`;
      await page.screenshot({ path: path.join(evidence, image) }).catch(() => {});
      results.push({ name, pass: false, error: error.stack, image }); console.error(`FAIL ${name}: ${error.message}`);
    }
  };
  const mode = async (value) => {
    await page.evaluate((mode) => window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode } })), value);
    await page.waitForFunction((mode) => document.body.dataset.appMode === mode, value);
  };

  await run("fresh App diary has no fabricated relationship day", async () => {
    await page.locator('[data-tab="companion"]:visible').click();
    const badge = page.locator('[data-panel="companion"] [data-memory-together-label]');
    assert.equal(await badge.isVisible(), false);
    assert.equal(await badge.textContent(), "");
    assert.equal(await badge.getAttribute("data-i18n"), null);
    await page.screenshot({ path: path.join(evidence, "app-empty-diary.png") });
  });
  await run("App relationship evidence stays scoped when the active role changes", async () => {
    scopeFixture = await page.evaluate(async () => {
      const chars = await import('/src/characters/store.js');
      const { storeRecord } = await import('/src/storage/db.js');
      const original = chars.getActiveCharacterId();
      const a = await chars.createCharacter({ name: 'Evidence fixture A' });
      const b = await chars.createCharacter({ name: 'Evidence fixture B' });
      await storeRecord('memories', { id: 'isolated-lived', characterId: a.id, companionId: a.id, source: 'chat.memory', rawText: 'Isolated browser evidence', createdAt: new Date().toISOString() });
      await storeRecord('memories', { id: 'isolated-origin', characterId: b.id, source: 'chat.memory', sourceType: 'chat', sourceRef: { sourceType: 'authored_origin_memory' }, rawText: 'Author backstory fixture', createdAt: '2020-01-01' });
      await storeRecord('memories', { id: 'isolated-undated', characterId: b.id, source: 'chat.memory', rawText: 'No timestamp fixture' });
      chars.setActiveCharacterId(a.id);
      return { original, a: a.id, b: b.id };
    });
    const badge = page.locator('[data-panel="companion"] [data-memory-together-label]');
    await badge.waitFor({ state: 'visible' });
    assert.match(await badge.textContent(), /第\s*1\s*天/);
    await page.evaluate(async (id) => (await import('/src/characters/store.js')).setActiveCharacterId(id), scopeFixture.b);
    await badge.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[data-panel="companion"] [data-memory-together-label]').textContent === '');
    await page.evaluate(async (id) => (await import('/src/characters/store.js')).setActiveCharacterId(id), scopeFixture.original);
  });
  await run("visible App role avatar opens identity without selecting the pet tab", async () => {
    await page.locator('[data-global-character-entry]:visible').click();
    await page.waitForFunction(() => document.querySelector('[data-settings-shell]')?.dataset.settingsRoute === "identity");
    assert(await page.locator('[data-settings-view="identity"]').isVisible());
    assert(!(await page.locator('[data-companion-section="character"]').isVisible()));
    await page.screenshot({ path: path.join(evidence, "app-role-identity.png") });
  });
  await run("actual model form and runtime agree on incomplete and complete BYOK", async () => {
    await page.locator('[data-tab="chat"]:visible').click();
    await page.locator('[data-drawer-open]:visible').first().click();
    await page.locator('#featureDrawer [data-drawer-nav="api"]').click();
    await page.locator('[data-api-open="model"]').click();
    assert.equal(await page.locator('[data-provider-model]').count(), 1);
    const set = async (kind, base, key, model) => {
      await page.locator('[data-provider-kind]').selectOption({ label: kind });
      await page.locator('[data-provider-base-url]').fill(base);
      await page.locator('[data-provider-api-key]').fill(key);
      await page.locator('[data-provider-model]').fill(model);
      return page.evaluate(async () => {
        const { collectProviderConfig } = await import('/src/model/client.js');
        const config = collectProviderConfig({ providerKind: document.querySelector('[data-provider-kind]'), providerBaseUrl: document.querySelector('[data-provider-base-url]'), providerApiKey: document.querySelector('[data-provider-api-key]'), providerModel: document.querySelector('[data-provider-model]') });
        return { ready: Boolean(config.baseUrl && config.apiKey && config.model), displayed: document.querySelector('[data-api-status="model"]').classList.contains('is-ready') };
      });
    };
    for (const [fields, expected] of [
      [["自定义反代", "https://example.invalid/v1", "", ""], false],
      [["自定义反代", "", "isolated-test-placeholder", ""], false],
      [["自定义反代", "", "isolated-test-placeholder", "fixture-model"], false],
      [["自定义反代", "https://example.invalid/v1", "isolated-test-placeholder", "fixture-model"], true],
      [["OpenAI Compatible", "", "isolated-test-placeholder", "fixture-model"], true],
    ]) {
      const value = await set(...fields);
      assert.deepEqual(value, { ready: expected, displayed: expected });
    }
    await set("自定义反代", "", "", "");
    await page.locator('[data-api-detail="model"] [data-api-back]').click();
    assert.match(await page.locator('[data-api-status="model"]').textContent(), /待补全/);
  });
  await run("Hosted hides BYOK configuration and refreshes status without a local key", async () => {
    await page.evaluate(async () => (await import('/src/account/product-access.js')).writeProductAccess({ modelSource: 'hosted' }));
    assert(await page.locator('[data-api-status="model"]').evaluate((node) => node.classList.contains('is-ready')));
    assert.equal(await page.locator('body').getAttribute('data-model-source'), 'hosted');
    assert(await page.locator('[data-provider-api-key]').evaluate((node) => node.closest('[data-provider-byok-only]').hidden));
    assert.equal(await page.locator('[data-api-workbench] [data-provider-managed-only]').evaluate((node) => node.hidden), false);
    // Billing deliberately leaves the BYOK-only page on a source switch.
    assert(!(await page.locator('[data-panel="api"]').isVisible()));
    await page.evaluate(async () => (await import('/src/account/product-access.js')).writeProductAccess({ modelSource: 'byok' }));
    await page.locator('[data-drawer-open]:visible').first().click();
    await page.locator('#featureDrawer [data-drawer-nav="api"]').click();
    await page.locator('[data-api-open="model"]').click();
    assert(await page.locator('[data-provider-api-key]').isVisible());
  });
  await run("gallery clears a previous relationship badge on null and survives translation", async () => {
    const value = await page.evaluate(async () => {
      const { createMemoryDiaryGallery } = await import('/src/ui/memory-diary-gallery.js');
      const { applyI18n } = await import('/src/i18n/index.js');
      const fixture = document.createElement('section');
      fixture.innerHTML = '<p data-memory-together-label data-i18n="memoryGallery.togetherDayOne">在一起第1天</p>';
      document.body.append(fixture);
      const gallery = createMemoryDiaryGallery(fixture);
      const badge = fixture.querySelector('[data-memory-together-label]');
      gallery.render([], { togetherDays: 3 }); applyI18n(fixture);
      const before = { text: badge.textContent, hidden: badge.hidden };
      gallery.render([], { togetherDays: null }); applyI18n(fixture);
      const after = { text: badge.textContent, hidden: badge.hidden, display: getComputedStyle(badge).display };
      fixture.remove();
      return { before, after };
    });
    assert.match(value.before.text, /3/);
    assert.equal(value.before.hidden, false);
    assert.deepEqual(value.after, { text: "", hidden: true, display: "none" });
  });
  await run("fresh phone diary also hides the relationship badge", async () => {
    await mode('phone');
    await page.evaluate(() => window.__yueqiPhone.openApp('diary'));
    await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === 'diary');
    const badge = page.locator('[data-phone-screen="diary"] [data-memory-together-label]');
    assert(!(await badge.isVisible()));
    assert.equal(await badge.textContent(), '');
    await page.screenshot({ path: path.join(evidence, 'phone-empty-diary.png') });
  });
  await run("phone relationship evidence refreshes without carrying another role's date", async () => {
    const badge = page.locator('[data-phone-screen="diary"] [data-memory-together-label]');
    await page.evaluate(async (id) => (await import('/src/characters/store.js')).setActiveCharacterId(id), scopeFixture.a);
    await badge.waitFor({ state: 'visible' });
    assert.match(await badge.textContent(), /第\s*1\s*天/);
    await page.evaluate(async (id) => (await import('/src/characters/store.js')).setActiveCharacterId(id), scopeFixture.b);
    await badge.waitFor({ state: 'hidden' });
    await page.evaluate(async (id) => (await import('/src/characters/store.js')).setActiveCharacterId(id), scopeFixture.original);
  });
  await run("Pop system Back closes the actual game picker before leaving the thread", async () => {
    await page.evaluate(async () => {
      const { getActiveCharacterId } = await import('/src/characters/store.js');
      window.__yueqiPhone.openApp('pop');
      await window.__yueqiPhone.openDmThread(getActiveCharacterId());
    });
    await page.locator('[data-phone-plus]').click();
    await page.locator('[data-phone-plus-action="game"]').click();
    assert(await page.locator('[data-pop-game-sheet]').isVisible());
    await page.screenshot({ path: path.join(evidence, 'phone-game-picker.png') });
    assert.equal(await page.evaluate(async () => (await import('/src/platform/system-back.js')).handleSystemBack()), true);
    assert(!(await page.locator('[data-pop-game-sheet]').isVisible()));
    assert(await page.locator('[data-pop-chat-mode="thread"]').isVisible());
  });
  await run("Pop plugin panel cleans up before Back returns to the conversation list", async () => {
    await page.evaluate(async () => {
      const { upsertInstalledPlugin } = await import('/src/yeos/registry-plugins.js');
      const result = upsertInstalledPlugin({
        manifest: { schemaVersion: 1, kind: 'yueqi-pop-plugin', id: 'isolated-back-fixture', name: 'Back fixture', version: '1.0.0', permissions: ['pop.plugin'], pop: { hosts: ['dm'], panel: 'sheet' } },
        grantedPermissions: ['pop.plugin'],
        files: { 'plugin.js': 'export async function onToolbarClick({host,panelRoot}) { panelRoot.textContent = "Fixture plugin content"; await host.openPanel(); }' },
      });
      if (!result.ok) throw new Error(JSON.stringify(result));
      // The optional plugin handler has no default toolbar. Supply an isolated
      // fixture launcher to exercise its installed-package loading path.
      const launcher = document.createElement('button');
      launcher.dataset.popPlugin = 'isolated-back-fixture';
      document.querySelector('.mini-phone').append(launcher); launcher.click(); launcher.remove();
    });
    await page.locator('[data-pop-plugin-sheet]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-pop-plugin-panel]').textContent(), 'Fixture plugin content');
    await page.evaluate(async () => (await import('/src/platform/system-back.js')).handleSystemBack());
    assert(!(await page.locator('[data-pop-plugin-sheet]').isVisible()));
    assert.equal(await page.locator('[data-pop-plugin-panel]').textContent(), '');
    assert(await page.locator('[data-pop-chat-mode="thread"]').isVisible());
    await page.evaluate(async () => (await import('/src/platform/system-back.js')).handleSystemBack());
    assert(await page.locator('[data-pop-chat-mode="list"]').isVisible());
  });
  await run("runtime remains free of uncaught errors", () => assert.deepEqual(runtimeErrors, []));
} finally {
  await writeFile(path.join(evidence, 'BROWSER_VERIFY.json'), JSON.stringify({ generatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, passed: results.filter((row) => row.pass).length, failed: results.filter((row) => !row.pass).length, results, runtimeErrors }, null, 2));
  await context?.close(); await browser?.close(); await vite.close();
}
if (results.some((row) => !row.pass)) process.exitCode = 1;
