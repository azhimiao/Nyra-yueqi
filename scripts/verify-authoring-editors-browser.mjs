
async function revealSettingsControl(control) {
  const category = control.locator('xpath=ancestor::details[@data-settings-group]');
  if (await category.count() && await category.getAttribute("open") === null) {
    await category.locator(":scope > summary").click();
  }
  return control;
}
/**
 * Isolated dual-shell authoring regression. No user browser/profile is touched.
 * Run: node scripts/verify-authoring-editors-browser.mjs
 * UI writes use real visible controls; module calls below only inspect saved
 * state/recall, except the explicit fixture-only producer retry after deletion.
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
const evidenceDir = path.join(root, "docs/qa/authoring");
await mkdir(evidenceDir, { recursive: true });
const results = [];
const runtimeErrors = [];
const nativeDialogs = [];
const startedAt = Date.now();
const widths = [360, 390, 412];
const fixture = {
  memoryTitle: "回归：蓝色灯塔", memoryBody: "蓝色灯塔回归记忆：下次想一起看海。",
  guardTitle: "回归：保存保护", guardBody: "编辑后保存，再次进入仍可看见。",
  worldTitle: "回归：玻璃花园", worldBody: "玻璃花园只在周三开放，这是作者设定。",
  scene: "AUTHORING_SCENE_FIXTURE：角色正在玻璃花园整理地图。",
};

function seedOnboarding() {
  if (localStorage.getItem("authoring-browser-fixture")) return;
  localStorage.setItem("authoring-browser-fixture", "1");
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.firstLight.v2", JSON.stringify({ schemaVersion: 2, stage: "COMPLETED", done: true, paused: false }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: false, token: "", authMode: "offline", productMode: "developer" }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
  localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
}

const port = await new Promise((resolve, reject) => {
  const probe = createPortProbe();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const candidate = probe.address().port;
    probe.close((error) => error ? reject(error) : resolve(candidate));
  });
});
const vite = await createServer({
  root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-authoring-browser"),
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
});
let browser;
let page;
let cid = "";
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  assert(address && typeof address !== "string", "Vite did not bind a port");
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => runtimeErrors.push(error.stack || error.message));
  page.on("dialog", async (dialog) => {
    nativeDialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });
  await page.addInitScript(seedOnboarding);
  const screenshot = async (name) => {
    const file = `${name}.png`;
    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: false, animations: "disabled" });
    return file;
  };
  const bootReady = async () => {
    await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__yueqiPhone));
  };
  const reload = async () => { await page.reload({ waitUntil: "domcontentloaded" }); await bootReady(); };
  const run = async (name, task) => {
    const at = Date.now();
    try {
      const detail = await task();
      results.push({ name, pass: true, durationMs: Date.now() - at, detail });
      console.log(`PASS  ${name}`);
      return true;
    } catch (error) {
      const image = await screenshot(`failure-${results.length + 1}`).catch(() => null);
      const uiState = await page.evaluate(async () => {
        const { getSharedCharacterEditorService } = await import("/src/characters/editor-service.js");
        return {
          appMode: document.body.dataset.appMode,
          phoneView: document.querySelector(".mini-phone")?.dataset.phoneView,
          settingsRoute: document.querySelector("[data-settings-shell]")?.dataset.settingsRoute,
          characterDrafts: getSharedCharacterEditorService().listUnsaved().map((draft) => ({ characterId: draft.characterId, keys: Object.keys(draft.patch || {}), profileKeys: Object.keys(draft.patch?.profile || {}) })),
        };
      }).catch(() => null);
      results.push({ name, pass: false, durationMs: Date.now() - at, error: error.stack, image, uiState, nativeDialogs: [...nativeDialogs] });
      console.error(`FAIL  ${name}\n      ${error.message}`);
      // Re-enter through normal UI after a failed scenario; an abandoned draft
      // must not make every later independent check fail its navigation guard.
      await reload().catch(() => {});
      return false;
    }
  };
  const appPanel = (route) => page.locator(`[data-settings-view="${route}"]`);
  const phonePanel = (route) => page.locator(`[data-phone-screen="${route}"]`);
  const appBack = () => page.locator("[data-settings-back]").click();
  const appHome = async () => {
    if (!(await page.locator('[data-panel="me"]').evaluate((el) => el.classList.contains("is-active")))) {
      await page.locator("[data-nav-hub-toggle]:visible").click();
      await page.locator('[data-nav-hub] [data-tab="me"]').click();
    }
    for (let index = 0; index < 4; index++) {
      if (!(await page.locator("[data-settings-shell]").getAttribute("data-settings-route"))) return;
      await appBack();
    }
    assert.equal(await page.locator("[data-settings-shell]").getAttribute("data-settings-route"), "", "settings back must reach the list");
  };
  const openAppEditor = async (route) => {
    await appHome();
    await page.locator(`[data-settings-nav] [data-settings-route="${route === "prompt" ? "identity" : route}"]`).click();
    if (route === "prompt") await page.locator("[data-open-prompt-editor]").click();
    const panel = appPanel(route);
    const editor = panel.locator(".author-editor");
    await editor.waitFor();
    return editor;
  };
  const phoneBack = async () => {
    await page.locator('[data-phone-screen].is-active > .mini-appbar [data-phone-back]').click();
    // Exiting the final view paints home after its short close animation.
    // Read the next route only after that transition, not the outgoing view.
    await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-closing"));
  };
  const phoneSettings = async () => {
    for (let index = 0; index < 5; index++) {
      const view = await page.locator(".mini-phone").getAttribute("data-phone-view");
      if (view === "settings") return;
      if (view === "home") {
        await page.locator('[data-app-id="settings"]:visible').first().click();
      } else await phoneBack();
    }
    assert.equal(await page.locator(".mini-phone").getAttribute("data-phone-view"), "settings");
  };
  const openPhoneEditor = async (route) => {
    await phoneSettings();
    await (await revealSettingsControl(phonePanel("settings").locator(`[data-phone-open="${route}"]`))).click();
    const panel = phonePanel(route);
    const editor = panel.locator(".author-editor");
    await editor.waitFor();
    return editor;
  };
  const overflow = async (panel, label) => {
    const measurements = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      const size = await panel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const shell = el.closest(".author-mount");
        return { width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
          left: rect.left, right: rect.right, editorClient: el.clientWidth, editorScroll: el.scrollWidth,
          mountClient: shell.clientWidth, mountScroll: shell.scrollWidth };
      });
      assert(size.document <= width + 1 && size.body <= width + 1, `${label} ${width}px: document overflow ${JSON.stringify(size)}`);
      assert(size.left >= -1 && size.right <= width + 1 && size.editorScroll <= size.editorClient + 1 && size.mountScroll <= size.mountClient + 1, `${label} ${width}px: editor overflow ${JSON.stringify(size)}`);
      measurements.push(size);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    return measurements;
  };
  const memoryRecall = (text) => page.evaluate(async ({ text, cid }) => {
    await (await import("/src/storage/db.js")).openMemoryDb();
    const { searchMemories } = await import("/src/memory/rag.js");
    return (await searchMemories(text, { companionId: cid, topK: 20 })).map((row) => ({ id: row.id, rawText: row.rawText }));
  }, { text, cid });
  const savedStatus = (panel) => panel.locator('.author-status').filter({ hasText: "已保存" }).waitFor();
  const verifyBubbleStyles = async () => {
    const selector = 'body[data-app-mode="app"] .message:not(.has-turn-activity), body[data-app-mode="phone"] .mini-phone .mini-message:not(.has-turn-activity), body[data-app-mode="app"] .message.has-turn-activity > .message-bubble, body[data-app-mode="phone"] .mini-phone .mini-message.has-turn-activity > .message-bubble';
    const bubbles = await page.locator(selector).evaluateAll((nodes) => nodes.map((el) => ({ className: el.className, parent: el.parentElement.className, font: getComputedStyle(el).fontSize, radius: getComputedStyle(el).borderTopLeftRadius, textFonts: [...el.querySelectorAll(":scope > p, :scope > .message-text")].map((text) => getComputedStyle(text).fontSize) })));
    assert(bubbles.length > 0, "the real seeded opening bubble must be present for style verification");
    for (const bubble of bubbles) {
      assert.equal(bubble.font, "18px", `real bubble size ${JSON.stringify(bubble)}`);
      assert.equal(bubble.radius, "24px", `real bubble radius ${JSON.stringify(bubble)}`);
      for (const font of bubble.textFonts) assert.equal(font, "18px", "nested message text inherits the customized size");
    }
    return bubbles;
  };

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await bootReady();
  cid = await page.evaluate(async () => (await import("/src/characters/store.js")).getActiveCharacterId());
  assert(cid, "onboarding must supply a real active character");

  await run("App prompt/worldbook/memory/theme load at 360/390/412 without overflow", async () => {
    const sizes = {};
    for (const route of ["prompt", "worldbook", "memory", "theme"]) {
      const panel = await openAppEditor(route);
      sizes[route] = await overflow(panel, `app:${route}`);
      await screenshot(`app-${route}-390`);
    }
    return sizes;
  });

  await run("memory create, recall, pause, reload, delete and retry suppression", async () => {
    let panel = await openAppEditor("memory");
    await panel.locator('[data-memory-action="add"]').click();
    await panel.locator('[data-memory-field="title"]').fill(fixture.memoryTitle);
    await panel.locator('[data-memory-field="rawText"]').fill(fixture.memoryBody);
    await panel.locator('[data-memory-form] [type="submit"]').click();
    await savedStatus(panel);
    assert((await memoryRecall("蓝色灯塔")).some((row) => row.rawText === fixture.memoryBody));
    const original = await page.evaluate(async ({ title, cid }) => {
      await (await import("/src/storage/db.js")).openMemoryDb();
      const { listManagedMemories } = await import("/src/memory/manager.js");
      return (await listManagedMemories(cid)).find((row) => row.title === title);
    }, { title: fixture.memoryTitle, cid });
    assert(original?.id);
    await expandDetails(panel, "[data-memory-management]"); await panel.locator("[data-memory-recall]").uncheck();
    await panel.locator('.author-status').filter({ hasText: "已更新" }).waitFor();
    assert(!(await memoryRecall("蓝色灯塔")).some((row) => row.id === original.id));
    await reload();
    panel = await openAppEditor("memory");
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("蓝色灯塔");
    await panel.locator("[data-memory-open]").filter({ hasText: fixture.memoryTitle }).click();
    await expandDetails(panel, "[data-memory-management]"); assert.equal(await panel.locator("[data-memory-recall]").isChecked(), false);
    assert(!(await memoryRecall("蓝色灯塔")).some((row) => row.id === original.id));
    await panel.locator('[data-memory-action="delete"]').click();
    await panel.locator('[role="alertdialog"]').waitFor();
    const beforeConfirm = await page.evaluate(async (id) => {
      const db = await import("/src/storage/db.js");
      await db.openMemoryDb();
      const row = (await db.getAllRecords("memories")).find((item) => item.id === id);
      return row ? { id: row.id, tombstone: row.tombstone || null } : null;
    }, original.id);
    assert(beforeConfirm && !beforeConfirm.tombstone, `delete must wait for in-editor confirmation: ${JSON.stringify(beforeConfirm)}`);
    await screenshot("memory-delete-confirm-390");
    await panel.locator('[data-memory-action="confirm-accept"]').click();
    await panel.locator('.author-status').filter({ hasText: "已删除" }).waitFor();
    const retried = await page.evaluate(async (row) => {
      const { fileDrawer } = await import("/src/memory/palace/drawer.js");
      return fileDrawer({ ...row, id: `${row.id}-producer-retry`, searchable: true });
    }, original);
    assert.equal(retried, null, "producer retry cannot resurrect a deleted note");
    await reload();
    panel = await openAppEditor("memory");
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("蓝色灯塔");
    await panel.getByText("没有匹配的记忆", { exact: true }).waitFor();
    assert(!(await memoryRecall("蓝色灯塔")).some((row) => row.rawText === fixture.memoryBody));
  });

  await run("memory unsaved back guard retains draft; saved draft survives re-entry", async () => {
    let panel = await openAppEditor("memory");
    await panel.locator('[data-memory-action="add"]').click();
    await panel.locator('[data-memory-field="title"]').fill(fixture.guardTitle);
    await panel.locator('[data-memory-field="rawText"]').fill(fixture.guardBody);
    await appBack();
    await panel.locator('[role="alertdialog"]').waitFor();
    await panel.locator('[data-memory-action="confirm-cancel"]').click();
    assert.equal(await panel.locator('[data-memory-field="rawText"]').inputValue(), fixture.guardBody);
    await page.locator('.bottom-tabs [data-tab="chat"]').click();
    await panel.locator('[role="alertdialog"]').waitFor();
    await panel.locator('[data-memory-action="confirm-cancel"]').click();
    assert.equal(await panel.locator('[data-memory-field="rawText"]').inputValue(), fixture.guardBody);
    await panel.locator('[data-memory-form] [type="submit"]').click();
    await savedStatus(panel);
    await page.locator('.bottom-tabs [data-tab="chat"]').click();
    await page.locator("[data-nav-hub-toggle]:visible").click();
    await page.locator('[data-nav-hub] [data-tab="me"]').click();
    assert.equal(await page.locator("[data-settings-shell]").getAttribute("data-settings-route"), "", "returning to My intentionally opens its home list");
    await page.locator('[data-settings-nav] [data-settings-route="memory"]').click();
    await appPanel("memory").locator(".author-editor").waitFor();
    await appHome();
    panel = await openAppEditor("memory");
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("保存保护");
    await panel.locator("[data-memory-open]").filter({ hasText: fixture.guardTitle }).waitFor();
  });

  await run("App worldbook writes a scoped entry through the editor", async () => {
    const panel = await openAppEditor("worldbook");
    await panel.locator('[data-wb-action="new"]').click();
    await panel.locator('[name="title"]').fill(fixture.worldTitle);
    await panel.locator('[name="content"]').fill(fixture.worldBody);
    await panel.locator('[name="binding"]').selectOption(cid);
    await expandDetails(panel, ".wb-form-usage"); await panel.locator('[name="keys"]').fill("玻璃花园");
    await panel.locator('[data-wb-form] [type="submit"]').click();
    await panel.locator("[data-wb-open]").filter({ hasText: fixture.worldTitle }).waitFor();
  });

  await run("Prompt scene/platform/layout save reaches actual assemble and model messages", async () => {
    let panel = await openAppEditor("prompt");
    await panel.locator(".prompt-more-settings > summary").click();
    await panel.locator('[data-prompt-field="scene"]').fill(fixture.scene);
    await panel.locator('[data-prompt-action="tab"][data-tab="layout"]').click();
    await panel.locator("[data-platform-additions]").uncheck();
    await panel.locator('[data-layout-row="character_scenario"] .prompt-layout-options > summary').click();
    await panel.locator('[data-layout-role="character_scenario"]').selectOption("developer");
    await panel.locator('[data-layout-position="character_scenario"]').selectOption("after_history");
    await panel.locator('[data-prompt-action="save"]').click();
    await savedStatus(panel);
    await appHome();
    panel = await openAppEditor("prompt");
    await panel.locator(".prompt-more-settings > summary").click();
    assert.equal(await panel.locator('[data-prompt-field="scene"]').inputValue(), fixture.scene);
    await panel.locator('[data-prompt-action="tab"][data-tab="layout"]').click();
    assert.equal(await panel.locator("[data-platform-additions]").isChecked(), false);
    assert.equal(await panel.locator('[data-layout-role="character_scenario"]').inputValue(), "developer");
    assert.equal(await panel.locator('[data-layout-position="character_scenario"]').inputValue(), "after_history");
    const actual = await page.evaluate(async ({ cid, scene }) => {
      const { getCharacter } = await import("/src/characters/store.js");
      const { assemblePrompt, buildModelMessages } = await import("/src/prompt/assemble.js");
      const { getAllRecords, openMemoryDb } = await import("/src/storage/db.js");
      await openMemoryDb();
      const { searchMemories } = await import("/src/memory/rag.js");
      const { searchPalace } = await import("/src/memory/palace/search.js");
      const compiled = await assemblePrompt({ characterId: cid, characterRecord: await getCharacter(cid), query: "玻璃花园", sessionId: `dm:${cid}`, preview: true, refreshDailyStatus: async () => ({ injectionEnabled: false }), searchMemories, searchPalace, getAllRecords, collectExternalContext: () => [] });
      const messages = await buildModelMessages(compiled, "玻璃花园", `dm:${cid}`);
      return { messages, platformAdditionsEnabled: compiled.platformAdditionsEnabled, layout: compiled.promptLayout, sceneCount: messages.filter((row) => String(row.content).includes(scene)).length };
    }, { cid, scene: fixture.scene });
    const sceneMessage = actual.messages.find((row) => String(row.content).includes(fixture.scene));
    assert.equal(sceneMessage?.role, "developer");
    assert.equal(actual.sceneCount, 1);
    assert.equal(actual.platformAdditionsEnabled, false);
    const sceneLayout = actual.layout.find((row) => row.id === "character_scenario");
    assert.equal(sceneLayout.role, "developer");
    assert.equal(sceneLayout.position, "after_history");
    assert.equal(actual.messages.at(-1)?.role, "user");
    assert.equal(actual.messages.at(-1)?.content, "玻璃花园");
    assert(!actual.messages.some((row) => /【连续聊天意图】/.test(String(row.content))));
    await panel.locator('[data-prompt-action="tab"][data-tab="preview"]').click();
    await panel.locator("[data-preview-query]").fill("玻璃花园");
    await panel.locator('[data-prompt-action="preview"]').click();
    await panel.locator("[data-prompt-preview] pre").filter({ hasText: fixture.scene }).waitFor({ state: "attached" });
    await screenshot("app-prompt-preview-390");
    return { sceneRole: sceneMessage.role, sceneCount: actual.sceneCount, messageCount: actual.messages.length };
  });

  await run("appearance font/radius/widget choices update live state and survive reload", async () => {
    let panel = await openAppEditor("theme");
    await panel.locator('[data-appearance-theme="mist"]').click();
    // Keyboard edits exercise native range input events (no JS value assignment).
    for (const [name, value, step] of [["fontSize", 18, 1], ["bubbleRadius", 24, 2]]) {
      const slider = panel.locator(`[name="${name}"]`);
      await slider.focus(); await slider.press("Home");
      const min = Number(await slider.getAttribute("min"));
      for (let v = min; v < value; v += step) await slider.press("ArrowRight");
    }
    const sample = await panel.locator(".appearance-preview-bubble.is-user").evaluate((el) => ({ font: getComputedStyle(el).fontSize, radius: getComputedStyle(el).borderTopLeftRadius, color: getComputedStyle(el).backgroundColor }));
    assert.deepEqual(sample, { font: "18px", radius: "24px", color: "rgb(228, 237, 243)" });
    await panel.locator("details").filter({ has: page.locator("[data-appearance-widgets]") }).locator("summary").click();
    await panel.locator('[data-widget-choice="clock"]').uncheck();
    await panel.locator('[data-widget-up="today"]').click();
    await panel.locator("[data-appearance-save]").click();
    await savedStatus(panel);
    const inspect = () => page.evaluate(() => ({
      size: getComputedStyle(document.documentElement).getPropertyValue("--author-chat-size").trim(),
      radius: getComputedStyle(document.documentElement).getPropertyValue("--author-bubble-radius").trim(),
      theme: document.documentElement.dataset.theme,
      phone: JSON.parse(localStorage.getItem("yueqi.phone.os.v1")),
    }));
    const saved = await inspect();
    assert.equal(saved.size, "18px"); assert.equal(saved.radius, "24px");
    assert.equal(saved.theme, "mist");
    assert.equal(saved.phone.widgets.clock, false); assert.equal(saved.phone.widgetOrder[0], "today");
    await reload();
    assert.deepEqual(await inspect(), saved);
    panel = await openAppEditor("theme");
    assert.equal(await panel.locator('[name="fontSize"]').inputValue(), "18");
    assert.equal(await panel.locator('[name="bubbleRadius"]').inputValue(), "24");
    const bubbles = await verifyBubbleStyles();
    await screenshot("app-appearance-saved-390");
    return { fontSize: saved.size, radius: saved.radius, preview: sample, bubbles, widgetOrder: saved.phone.widgetOrder };
  });

  await run("switch to phone through settings and observe saved home widgets", async () => {
    await appHome();
    await page.locator('[data-settings-nav] [data-settings-route="interface"]').click();
    await appPanel("interface").locator('[data-app-mode="phone"]').click();
    await page.waitForFunction(() => document.body.dataset.appMode === "phone");
    const unlock = page.locator("[data-lock-to-passcode]");
    if (await unlock.isVisible()) await unlock.click();
    await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
    const widget = await page.locator('[data-home-widgets] [data-widget="clock"]').evaluate((el) => ({ hidden: el.hidden, display: getComputedStyle(el).display }));
    assert(widget.hidden || widget.display === "none", "saved clock visibility must affect the actual home widget");
    await screenshot("phone-home-widgets-390");
    return { bubbles: await verifyBubbleStyles() };
  });

  await run("phone prompt/worldbook/memory/beautify load at 360/390/412 without overflow", async () => {
    const sizes = {};
    for (const route of ["prompt", "worldbook", "memory", "beautify"]) {
      const panel = await openPhoneEditor(route);
      sizes[route] = await overflow(panel, `phone:${route}`);
      await screenshot(`phone-${route}-390`);
    }
    return sizes;
  });

  await run("phone reads App worldbook, prompt and memory saves", async () => {
    let panel = await openPhoneEditor("worldbook");
    await panel.locator('[data-wb-action="search"]').click(); await panel.locator("[data-wb-search]").fill("玻璃花园");
    await panel.locator("[data-wb-open]").filter({ hasText: fixture.worldTitle }).click();
    await panel.locator("[data-wb-edit]:visible").click();
    assert.equal(await panel.locator('[name="content"]').inputValue(), fixture.worldBody);
    await panel.locator('[name="content"]').fill(`${fixture.worldBody} PHONE_SAVED`);
    await panel.locator('[data-wb-form] [type="submit"]').click();
    await savedStatus(panel);
    panel = await openPhoneEditor("prompt");
    await panel.locator(".prompt-more-settings > summary").click();
    assert.equal(await panel.locator('[data-prompt-field="scene"]').inputValue(), fixture.scene);
    panel = await openPhoneEditor("memory");
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("保存保护");
    await panel.locator("[data-memory-open]").filter({ hasText: fixture.guardTitle }).waitFor();
    await expandDetails(panel, "[data-memory-tools]"); await panel.locator("[data-memory-search]").fill("蓝色灯塔");
    await panel.getByText("没有匹配的记忆", { exact: true }).waitFor();
  });

  await run("phone dirty memory navigation is guarded; phone appearance persists", async () => {
    let panel = await openPhoneEditor("memory");
    await panel.locator('[data-memory-action="add"]').click();
    await panel.locator('[data-memory-field="rawText"]').fill("PHONE_UNSAVED_FIXTURE");
    await phoneBack();
    await panel.locator('[role="alertdialog"]').waitFor();
    await panel.locator('[data-memory-action="confirm-cancel"]').click();
    assert.equal(await panel.locator('[data-memory-field="rawText"]').inputValue(), "PHONE_UNSAVED_FIXTURE");
    await phoneBack();
    await panel.locator('[data-memory-action="confirm-accept"]').click();
    panel = await openPhoneEditor("beautify");
    assert.equal(await panel.locator('[name="fontSize"]').inputValue(), "18");
    assert.equal(await panel.locator('[name="bubbleRadius"]').inputValue(), "24");
    await reload();
    const unlock = page.locator("[data-lock-to-passcode]");
    if (await unlock.isVisible()) await unlock.click();
    await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
    panel = await openPhoneEditor("beautify");
    assert.equal(await panel.locator('[name="fontSize"]').inputValue(), "18");
    assert.equal(await panel.locator('[data-widget-choice="clock"]').isChecked(), false);
  });

  await run("phone origin draft blocks Prompt navigation until discarded", async () => {
    await phoneSettings();
    await (await revealSettingsControl(phonePanel("settings").locator('[data-phone-open="profile"]'))).click();
    const profile = phonePanel("profile");
    const toggle = profile.locator(`[data-profile-toggle="${cid}"]`);
    await toggle.waitFor();
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const form = profile.locator(`[data-profile-form="${cid}"]`);
    await form.locator("[data-origin-memory-add]").click();
    const newOrigin = form.locator('[data-origin-memory-row][data-origin-id=""]').last();
    const title = "ORIGIN_UNSAVED_TITLE";
    const body = "ORIGIN_UNSAVED_BODY：这是一段尚未保存的角色起源。";
    await newOrigin.locator("[data-origin-title]").fill(title);
    await newOrigin.locator("[data-origin-body]").fill(body);
    await form.locator(`[data-phone-prompt-character="${cid}"]`).click();
    assert.equal(await page.locator(".mini-phone").getAttribute("data-phone-view"), "profile");
    assert.equal(await newOrigin.locator("[data-origin-title]").inputValue(), title);
    assert.equal(await newOrigin.locator("[data-origin-body]").inputValue(), body);
    assert.equal(await form.locator("[data-character-unsaved]").isVisible(), true);
    await screenshot("phone-origin-unsaved-guard-390");
    await form.locator(`[data-profile-discard="${cid}"]`).click();
    await page.waitForFunction(({ cid, body }) => {
      const form = document.querySelector(`[data-profile-form="${cid}"]`);
      return form && ![...form.querySelectorAll("[data-origin-body]")].some((input) => input.value === body);
    }, { cid, body });
    await form.locator(`[data-phone-prompt-character="${cid}"]`).click();
    await phonePanel("prompt").locator(".author-editor").waitFor();
    assert.equal(await page.locator(".mini-phone").getAttribute("data-phone-view"), "prompt");
  });

  await run("App reads a worldbook revision saved from phone", async () => {
    await phoneSettings();
    await (await revealSettingsControl(phonePanel("settings").locator('[data-phone-ui-modes] [data-segment-id="app"]'))).click();
    await page.waitForFunction(() => document.body.dataset.appMode === "app");
    const panel = await openAppEditor("worldbook");
    await panel.locator("[data-wb-open]").filter({ hasText: fixture.worldTitle }).click();
    await panel.locator("[data-wb-edit]:visible").click();
    assert.equal(await panel.locator('[name="content"]').inputValue(), `${fixture.worldBody} PHONE_SAVED`);
  });

  await run("Prompt regains unsaved protection after App-phone-App switch", async () => {
    const switchMode = (mode) => page.evaluate((next) => {
      // Public navigation event used by the shell switch, including its real
      // setAppMode guard. This keeps the current editor route mounted instead
      // of first leaving it to visit the Interface settings page.
      window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: next } }));
    }, mode);
    await openAppEditor("prompt");
    await switchMode("phone");
    await page.waitForFunction(() => document.body.dataset.appMode === "phone");
    await openPhoneEditor("prompt");
    await switchMode("app");
    await page.waitForFunction(() => document.body.dataset.appMode === "app");
    const panel = appPanel("prompt").locator(".author-editor");
    await panel.waitFor();
    const field = panel.locator('[data-prompt-field="system"]');
    const original = await field.inputValue();
    const draft = `${original}\nSHELL_RETURN_UNSAVED_FIXTURE`;
    await field.fill(draft);
    await switchMode("phone");
    await panel.locator(".prompt-leave-confirm").waitFor();
    assert.equal(await page.locator("body").getAttribute("data-app-mode"), "app");
    await panel.locator('[data-prompt-action="leave-cancel"]').click();
    assert.equal(await field.inputValue(), draft);
    assert.equal(await page.locator("body").getAttribute("data-app-mode"), "app");
    await screenshot("app-prompt-shell-return-guard-390");
    await field.fill(original);
    await switchMode("phone");
    await page.waitForFunction(() => document.body.dataset.appMode === "phone");
    await switchMode("app");
    await page.waitForFunction(() => document.body.dataset.appMode === "app");
    await panel.waitFor();
    assert.equal(await field.inputValue(), original);
  });
  await run("no uncaught browser runtime errors", async () => {
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(nativeDialogs, [], "clean fixture navigation must not create unexpected native confirmations");
  });
} catch (error) {
  results.push({ name: "browser setup/completion", pass: false, error: error.stack });
  console.error(error);
} finally {
  await browser?.close();
  await vite.close();
  const report = { script: "scripts/verify-authoring-editors-browser.mjs", isolated: true, at: new Date().toISOString(), durationMs: Date.now() - startedAt, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results, runtimeErrors, nativeDialogs };
  await writeFile(path.join(evidenceDir, "BROWSER_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nAuthoring browser: ${report.passed}/${results.length}; ${(report.durationMs / 1000).toFixed(1)}s`);
  if (report.failed) process.exitCode = 1;
}
