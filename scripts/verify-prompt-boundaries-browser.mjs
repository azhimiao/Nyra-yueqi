/** Failure, concurrency, import, and escaping checks in disposable browser storage. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const base = process.env.PROMPT_QA_BASE || "http://127.0.0.1:5173";
const reportPath = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/qa/authoring/PROMPT_BOUNDARIES.json");
const report = {
  startedAt: new Date().toISOString(),
  script: "scripts/verify-prompt-boundaries-browser.mjs",
  environment: { browser: "chromium", headless: true, isolatedBrowser: true, storage: "fresh context per case", viewport: { width: 390, height: 844 }, baseUrl: base, paidModelCalls: false },
  cases: [],
  runtimeErrors: [],
  errors: [],
};
const errorDetails = (error) => ({ name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || null });
let browser;
let passed = 0;
async function check(name, run) {
  const result = { name, startedAt: new Date().toISOString(), passed: false, error: null, runtimeErrors: [] };
  report.cases.push(result);
  let context;
  try {
    context = await browser.newContext({ viewport: report.environment.viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => result.runtimeErrors.push(errorDetails(error)));
    await page.route(`${base}/__prompt-boundaries`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:system-ui}*{box-sizing:border-box}</style><main id="editor"></main></html>' }));
    await page.goto(`${base}/__prompt-boundaries`);
    await page.evaluate(async () => {
      await import("/src/settings/editors/authoring.css");
      const [{ mountPromptEditor }, store, { createCharacterEditorController }, { createCharacterEditorService }, db, prefs, { LOCAL_KEYS }, { assembleCanonical }] = await Promise.all([
        import("/src/settings/editors/prompt-editor.js"), import("/src/characters/store.js"), import("/src/characters/editor-controller.js"), import("/src/characters/editor-service.js"), import("/src/storage/db.js"), import("/src/settings/preferences.js"), import("/src/constants.js"), import("/src/prompt/assemble.js"),
      ]);
      await db.openMemoryDb();
      const id = "boundary-character";
      await store.upsertCharacter({ id, name: "长夜与月光里的朋友", profile: { fields: ["长夜与月光里的朋友", "朋友", "", "", ""], promptSystem: "ORIGINAL_PROMPT", promptDeveloper: "" } });
      const qa = window.qa = { store, db, prefs, id, saved: 0, left: 0, failCommit: false, previewCalls: [], settingsKey: LOCAL_KEYS.settingsKey };
      const service = createCharacterEditorService({ characterStore: {
        getCharacter: store.getCharacter,
        async upsertCharacter(...args) {
          if (qa.commitGate) { qa.commitEntered = true; await qa.commitGate; qa.commitGate = null; }
          if (qa.failCommit) throw new Error("simulated_write_failure");
          return store.upsertCharacter(...args);
        },
      } });
      qa.controller = createCharacterEditorController({ editorService: service });
      await qa.controller.open(id);
      await qa.controller.patch({ alias: "identity-kept" });
      qa.mount = async () => {
        qa.editor?.destroy();
        qa.editor = mountPromptEditor(document.getElementById("editor"), {
          characterId: id, editorController: qa.controller, onSave: () => { qa.saved += 1; },
          preview: async (payload) => {
            qa.previewCalls.push(payload.query);
            if (qa.previewGate) { qa.previewEntered = true; await qa.previewGate; qa.previewGate = null; }
            const compiled = { canonical: assembleCanonical({ semantic: true, platformSafety: `CONTEXT:${payload.query}`, characterPackage: payload.characterRecord.profile.promptSystem, promptLayout: payload.promptLayout, totalBudget: 8000 }), promptLayout: payload.promptLayout, historyMessages: [], currentUserMessageId: "preview:unpersisted" };
            qa.previewFinished = true;
            return compiled;
          },
        });
        await qa.editor.ready;
      };
      await qa.mount();
    });
    await run(page);
    assert.deepEqual(result.runtimeErrors, []);
    result.passed = true;
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    result.error = errorDetails(error);
    process.exitCode = 1;
    console.error(`FAIL ${name}: ${error?.stack || error}`);
  } finally {
    try { await context?.close(); }
    catch (error) {
      if (result.passed) passed -= 1;
      result.passed = false;
      result.error ||= errorDetails(error);
      process.exitCode = 1;
    }
    result.completedAt = new Date().toISOString();
    report.runtimeErrors.push(...result.runtimeErrors.map((error) => ({ case: name, ...error })));
  }
}
try {
  browser = await chromium.launch({ headless: true });
  report.environment.browserVersion = browser.version();
  await check("failed save retains local text; discard preserves only the original identity draft", async (page) => {
    await page.locator('[data-prompt-field="system"]').fill("FAILED_SHOULD_DISCARD");
    await page.evaluate(() => { qa.failCommit = true; });
    await page.locator('[data-prompt-action="save"]').click();
    await page.locator('[data-prompt-status][data-state="error"]').waitFor();
    const failed = await page.evaluate(() => ({ dirty: qa.editor.hasUnsaved, draft: qa.controller.draft, saved: qa.saved }));
    assert.equal(failed.dirty, true);
    assert.equal(failed.saved, 0);
    assert.equal(failed.draft.patch.alias, "identity-kept");
    assert.equal(failed.draft.patch.profile?.promptSystem, undefined);
    await page.evaluate(() => qa.editor.requestLeave(() => { qa.left += 1; }));
    await page.locator('[data-prompt-action="leave-discard"]').click();
    assert.equal(await page.evaluate(() => qa.left), 1);
    await page.evaluate(() => qa.mount());
    assert.equal(await page.locator('[data-prompt-field="system"]').inputValue(), "ORIGINAL_PROMPT");
    assert.equal(await page.evaluate(() => qa.controller.working.alias), "identity-kept");
  });

  await check("save completion survives tab rendering and keeps text typed during the write unsaved", async (page) => {
    await page.locator('[data-prompt-field="system"]').fill("SUBMITTED_TEXT");
    await page.evaluate(() => { qa.commitGate = new Promise((resolve) => { qa.releaseCommit = resolve; }); });
    await page.locator('[data-prompt-action="save"]').click();
    await page.waitForFunction(() => qa.commitEntered);
    await page.locator('[data-tab="layout"]').click();
    await page.locator('[data-tab="character"]').click();
    await page.locator('[data-prompt-field="system"]').fill("TYPED_DURING_SAVE");
    await page.evaluate(() => qa.releaseCommit());
    await page.waitForFunction(() => qa.saved === 1);
    assert.equal(await page.locator('[data-prompt-action="save"]').isEnabled(), true);
    assert.equal(await page.evaluate(() => qa.editor.hasUnsaved), true);
    assert.equal(await page.locator('[data-prompt-field="system"]').inputValue(), "TYPED_DURING_SAVE");
    assert.equal(await page.evaluate(async () => (await qa.db.getAllRecords("characters")).find((row) => row.id === qa.id).profile.promptSystem), "SUBMITTED_TEXT");
  });

  await check("partial storage failure reports saved character accurately and retries the pending layout", async (page) => {
    await page.locator('[data-prompt-field="system"]').fill("CHARACTER_SAVED");
    await page.locator('[data-tab="layout"]').click();
    await page.locator("[data-platform-additions]").uncheck();
    await page.evaluate(() => {
      qa.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === qa.settingsKey) throw new Error("simulated_settings_quota"); return qa.originalSetItem.call(this, key, value); };
    });
    await page.locator('[data-prompt-action="save"]').click();
    await page.locator('[data-prompt-status][data-state="error"]').waitFor();
    assert.match(await page.locator("[data-prompt-status]").innerText(), /角色内容已保存/);
    assert.equal(await page.evaluate(() => qa.saved), 1);
    assert.equal(await page.evaluate(() => qa.editor.hasUnsaved), true);
    assert.equal(await page.evaluate(() => qa.prefs.getPromptSettings().platformAdditionsEnabled), true);
    assert.equal(await page.evaluate(async () => (await qa.db.getAllRecords("characters")).find((row) => row.id === qa.id).profile.promptSystem), "CHARACTER_SAVED");
    await page.evaluate(() => { Storage.prototype.setItem = qa.originalSetItem; });
    await page.locator('[data-prompt-action="save"]').click();
    await page.getByText("已保存，下轮对话生效。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => qa.editor.hasUnsaved), false);
    assert.equal(await page.evaluate(() => qa.prefs.getPromptSettings().platformAdditionsEnabled), false);
  });

  await check("stale revision cannot overwrite newer character text or leave discarded prompt in identity draft", async (page) => {
    await page.locator('[data-prompt-field="system"]').fill("STALE_EDITOR_TEXT");
    await page.evaluate(() => qa.store.upsertCharacter({ id: qa.id, profile: { promptSystem: "EXTERNAL_NEWER_TEXT" } }));
    await page.locator('[data-prompt-action="save"]').click();
    await page.locator('[data-prompt-status][data-state="error"]').waitFor();
    assert.equal(await page.evaluate(() => qa.editor.hasUnsaved), true);
    assert.equal(await page.locator('[data-prompt-field="system"]').inputValue(), "STALE_EDITOR_TEXT");
    assert.equal(await page.evaluate(async () => (await qa.db.getAllRecords("characters")).find((row) => row.id === qa.id).profile.promptSystem), "EXTERNAL_NEWER_TEXT");
    assert.equal(await page.evaluate(() => qa.controller.draft.patch.profile?.promptSystem), undefined);
    await page.evaluate(() => qa.editor.requestLeave(() => {}));
    await page.locator('[data-prompt-action="leave-discard"]').click();
    await page.evaluate(async () => { await qa.controller.open(qa.id); await qa.mount(); });
    assert.equal(await page.locator('[data-prompt-field="system"]').inputValue(), "EXTERNAL_NEWER_TEXT");
  });

  await check("invalid presets leave draft intact; authored HTML stays text; stale preview cannot replace new input", async (page) => {
    const attack = '</textarea><img src=x onerror="window.promptXss=1"><svg onload="window.promptXss=2">';
    await page.locator('[data-prompt-field="system"]').fill(attack);
    await page.locator('[data-tab="layout"]').click();
    const original = await page.evaluate(() => qa.editor.getDraft());
    for (const invalid of [
      { promptLayout: [{ id: "__proto__" }] },
      { promptLayout: [{ id: "character", role: "assistant" }] },
      { promptLayout: [{ id: "character", enabled: "false" }] },
      { promptLayout: [{ id: "character", depth: -1 }] },
      { promptLayout: [], platformAdditionsEnabled: "false" },
    ]) {
      await page.locator("[data-prompt-import]").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid)) });
      await page.getByText("预设格式无效。", { exact: true }).waitFor();
      assert.deepEqual(await page.evaluate(() => qa.editor.getDraft()), original);
    }
    await page.locator("[data-prompt-import]").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ name: attack, promptLayout: [], platformAdditionsEnabled: true })) });
    await page.getByText("预设已载入草稿，保存后生效。", { exact: true }).waitFor();
    assert.equal(await page.locator("#editor img, #editor svg, #editor script").count(), 0);
    await page.locator('[data-tab="preview"]').click();
    await page.locator("[data-preview-query]").fill("OLD_QUERY");
    await page.evaluate(() => { qa.previewGate = new Promise((resolve) => { qa.releasePreview = resolve; }); });
    await page.locator('[data-prompt-action="preview"]').click();
    await page.waitForFunction(() => qa.previewEntered);
    await page.locator("[data-preview-query]").fill("NEW_QUERY");
    await page.evaluate(() => qa.releasePreview());
    await page.waitForFunction(() => qa.previewFinished);
    assert.equal(await page.locator("[data-prompt-preview] details").count(), 0);
    await page.locator('[data-prompt-action="preview"]').click();
    await page.locator("[data-prompt-preview] details").first().waitFor();
    const preview = await page.locator("[data-prompt-preview]").textContent();
    assert.match(preview, /CONTEXT:NEW_QUERY/);
    assert.doesNotMatch(preview, /OLD_QUERY/);
    assert.ok(preview.includes(attack));
    assert.equal(await page.locator("#editor img, #editor svg, #editor script").count(), 0);
    assert.equal(await page.evaluate(() => window.promptXss), undefined);
  });
  console.log(`Prompt boundary browser: ${passed}/5 passed`);
} catch (error) {
  report.errors.push(errorDetails(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  try { await browser?.close(); }
  catch (error) { report.errors.push(errorDetails(error)); process.exitCode = 1; }
  report.completedAt = new Date().toISOString();
  report.summary = { expected: 5, executed: report.cases.length, passed, failed: report.cases.filter((result) => !result.passed).length };
  report.passed = passed === 5 && report.errors.length === 0 && report.runtimeErrors.length === 0;
  if (!report.passed) process.exitCode = 1;
  report.exitCode = Number(process.exitCode || 0);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Prompt boundary report: ${reportPath}`);
}
