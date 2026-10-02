/** Isolated Vite-module UI check. No user browser storage or model calls. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.PROMPT_QA_BASE || "http://127.0.0.1:5173";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs/qa/authoring-editors/prompt");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [width, height] of [[360, 800], [390, 844], [412, 915]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${base}/__prompt-editor-qa`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#fafbfc;font-family:system-ui;color:#182b3b}*{box-sizing:border-box}</style><main id="editor"></main></html>' }));
    await page.goto(`${base}/__prompt-editor-qa`);
    await page.evaluate(async () => {
      await import("/src/settings/editors/authoring.css");
      const [{ mountPromptEditor }, store, { getSharedCharacterEditorController }, prefs, { assemblePrompt, buildModelMessages }, { writeCompanionTurn }, { getAllRecords, openMemoryDb }] = await Promise.all([
        import("/src/settings/editors/prompt-editor.js"), import("/src/characters/store.js"), import("/src/characters/editor-controller.js"), import("/src/settings/preferences.js"), import("/src/prompt/assemble.js"), import("/src/conversation/companion-write.js"), import("/src/storage/db.js"),
      ]);
      await openMemoryDb();
      const id = "prompt-browser-qa";
      await store.upsertCharacter({ id, source: "user", name: "Aster", profile: { fields: ["Aster", "Aster", "", "", ""], promptSystem: "BROWSER_AUTHOR", promptDeveloper: "" } });
      const controller = getSharedCharacterEditorController();
      await controller.open(id);
      await controller.patch({ alias: "待保存的身份草稿" });
      await writeCompanionTurn({ role: "user", text: "你好", companionId: id, userId: "local", chatSessionId: `dm:${id}`, saveChatMessage: async (message) => message });
      await writeCompanionTurn({ role: "assistant", text: "HISTORY_REPLY", companionId: id, userId: "local", chatSessionId: `dm:${id}`, saveChatMessage: async (message) => message });
      window.promptQa = { store, prefs, controller, getAllRecords, closeCount: 0, previewCalls: 0 };
      window.promptQa.editor = mountPromptEditor(document.getElementById("editor"), {
        characterId: id, editorController: controller, onClose: () => { window.promptQa.closeCount += 1; },
        preview: async (payload) => {
          window.promptQa.previewCalls += 1;
          const compiled = await assemblePrompt({ ...payload, sessionId: `dm:${id}`, currentUserMessageId: "preview:unpersisted", refreshDailyStatus: async () => ({ injectionEnabled: false }), searchMemories: async () => [], searchPalace: async () => ({ results: [], skipped: true }), getAllRecords, collectExternalContext: () => [] });
          return buildModelMessages(compiled, payload.query);
        },
      });
      await window.promptQa.editor.ready;
    });
    await page.locator(".prompt-more-settings summary").click();
    await page.locator('[data-prompt-field="scene"]').fill("BROWSER_SCENE 一座海边小屋");
    await page.locator('[data-prompt-field="exampleDialogue"]').fill("Aster: BROWSER_EXAMPLE 只是表达示范");
    await page.locator('[data-prompt-field="postHistory"]').fill("BROWSER_POST");
    await page.locator('[data-prompt-field="greeting"]').fill("BROWSER_GREETING");
    assert.equal(await page.evaluate(() => window.promptQa.editor.hasUnsaved), true);
    await page.locator('[data-prompt-action="save"]').click();
    await page.getByText("已保存，下轮对话生效。", { exact: true }).waitFor();
    const savedCharacter = await page.evaluate(async () => (await window.promptQa.getAllRecords("characters")).find((row) => row.id === "prompt-browser-qa"));
    assert.equal(savedCharacter.alias, "待保存的身份草稿");
    await page.locator(".prompt-more-settings summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `${width}-character.png`) });

    await page.locator('[data-tab="layout"]').click();
    await page.locator("[data-platform-additions]").uncheck();
    await page.locator('[data-layout-row="character_scenario"] .prompt-layout-options > summary').click();
    await page.locator('[data-layout-role="character_scenario"]').selectOption("developer");
    await page.locator('[data-layout-position="character_scenario"]').selectOption("at_depth");
    await page.locator('[data-layout-depth="character_scenario"]').fill("1");
    await page.locator('[data-layout-enabled="example_dialogue"]').uncheck();
    const beforeMoveIndex = await page.evaluate(() => window.promptQa.editor.getDraft().promptLayout.findIndex((row) => row.id === "character_scenario"));
    await page.locator('[data-prompt-action="up"][data-block="character_scenario"]').click();
    await page.locator(".prompt-presets summary").click();
    await page.locator("[data-preset-name]").fill("浏览器布局测试");
    await page.locator('[data-prompt-action="save-preset"]').click();
    await page.locator('[data-prompt-action="save"]').click();
    await page.getByText("已保存，下轮对话生效。", { exact: true }).waitFor();
    await page.locator(".prompt-presets summary").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-prompt-action="export"]').click();
    const downloaded = await downloadPromise;
    assert.equal(downloaded.suggestedFilename(), "nyra-prompt-preset.json");
    const { readFile } = await import("node:fs/promises");
    const exported = JSON.parse(await readFile(await downloaded.path(), "utf8"));
    assert.equal(exported.platformAdditionsEnabled, false);
    assert.equal(exported.promptLayout.find((item) => item.id === "character_scenario").position, "at_depth");
    await page.locator('[data-prompt-action="reset"]').click();
    await page.locator("[data-prompt-import]").setInputFiles({ name: "roundtrip.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
    await page.getByText("预设已载入草稿，保存后生效。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.promptQa.editor.getDraft().promptLayout.find((item) => item.id === "character_scenario").position), "at_depth");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `${width}-layout.png`) });
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, offenders: [...document.querySelectorAll("#editor *")].filter((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 5).map((node) => node.tagName + "." + node.className) }));
    assert.ok(overflow.page <= width + 1, JSON.stringify(overflow));
    assert.deepEqual(overflow.offenders, []);

    await page.locator('[data-tab="preview"]').click();
    await page.locator("[data-preview-query]").fill("你好");
    const beforePreviewCalls = await page.evaluate(() => window.promptQa.previewCalls);
    await page.locator('[data-prompt-action="preview"]').click();
    await page.waitForFunction((previous) => window.promptQa.previewCalls > previous, beforePreviewCalls);
    await page.waitForFunction(() => !document.querySelector('[data-prompt-action="preview"]').disabled);
    assert.ok(await page.locator('[data-prompt-preview] details').count(), await page.locator('[data-prompt-status]').innerText());
    await page.evaluate(() => { for (const details of document.querySelectorAll("[data-prompt-preview] details")) details.open = true; });
    const preview = await page.locator("[data-prompt-preview]").innerText();
    assert.match(preview, /developer/);
    assert.match(preview, /BROWSER_SCENE/);
    assert.match(preview, /HISTORY_REPLY/);
    assert.match(preview, /BROWSER_POST/);
    assert.doesNotMatch(preview, /BROWSER_EXAMPLE|BROWSER_GREETING/);
    await page.evaluate(() => { for (const details of document.querySelectorAll("[data-prompt-preview] details")) details.open = true; window.scrollTo(0, 0); });
    await page.screenshot({ path: resolve(output, `${width}-preview.png`) });

    assert.equal(await page.evaluate(() => window.promptQa.editor.handleBack()), true);
    await page.locator('[data-prompt-field="system"]').fill("UNSAVED_LOST_IF_WRONG");
    assert.equal(await page.evaluate(() => window.promptQa.editor.requestLeave()), false);
    await page.locator('[data-prompt-action="leave-cancel"]').click();
    assert.equal(await page.evaluate(() => window.promptQa.closeCount), 0);
    assert.equal(await page.evaluate(() => window.promptQa.editor.hasUnsaved), true);
    await page.evaluate(() => window.promptQa.editor.requestLeave());
    await page.locator('[data-prompt-action="leave-discard"]').click();
    assert.equal(await page.evaluate(() => window.promptQa.closeCount), 1);
    assert.equal(await page.evaluate(() => window.promptQa.editor.hasUnsaved), false);

    await page.evaluate(async () => window.promptQa.editor.refresh());
    const reloaded = await page.evaluate(() => window.promptQa.editor.getDraft());
    assert.equal(reloaded.platformAdditionsEnabled, false);
    assert.equal(reloaded.promptFields.scene, "BROWSER_SCENE 一座海边小屋");
    assert.equal(reloaded.promptLayout[beforeMoveIndex - 1].id, "character_scenario");
    assert.equal(reloaded.promptLayout.find((item) => item.id === "example_dialogue").enabled, false);
    assert.equal(await page.evaluate(() => window.promptQa.prefs.getPromptSettings().authorPresets.length), 1);
    assert.deepEqual(errors, []);
    results.push({ width, height, save: true, identityDraftPreserved: true, layoutPersisted: true, presetSaved: true, presetExportImport: true, actualPreview: true, leaveGuard: true, overflow, pageErrors: errors });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "report.json"), JSON.stringify({ status: "PASS", isolatedContexts: true, results }, null, 2));
console.log(`prompt editor browser: ${results.length}/3 viewports PASS; ${output}`);
