/** Isolated UI regression for an App A editor after the Phone controller opens B. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.PROMPT_QA_BASE || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${base}/__prompt-scope-qa`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}</style><main id="app"></main><main id="phone" hidden></main></html>' }));
  await page.goto(`${base}/__prompt-scope-qa`);
  await page.evaluate(async () => {
    const [{ mountPromptEditor }, store, { getSharedCharacterEditorController }, { getAllRecords, openMemoryDb }] = await Promise.all([
      import("/src/settings/editors/prompt-editor.js"), import("/src/characters/store.js"), import("/src/characters/editor-controller.js"), import("/src/storage/db.js"),
    ]);
    await openMemoryDb();
    for (const id of ["scope-A", "scope-B"]) await store.upsertCharacter({ id, name: id, profile: { fields: [id, id, "", "", ""], promptSystem: `${id}_OLD`, promptDeveloper: "" } });
    const controller = getSharedCharacterEditorController();
    await controller.open("scope-A");
    await controller.patch({ alias: "keep A identity draft" });
    window.scopeQa = { controller, getAllRecords, result: null };
    const editor = mountPromptEditor(document.querySelector("#app"), { characterId: "scope-A", editorController: controller, onSave: (result) => { window.scopeQa.result = result; } });
    await editor.ready;
    document.querySelector("#app").hidden = true;
    document.querySelector("#phone").hidden = false;
    await controller.open("scope-B");
    await controller.patch({ alias: "keep B pending draft" });
    document.querySelector("#phone").hidden = true;
    document.querySelector("#app").hidden = false;
  });
  await page.locator('[data-prompt-field="system"]').fill("SAVE_ONLY_A");
  await page.locator('[data-prompt-action="save"]').click();
  await page.getByText("已保存，下轮对话生效。", { exact: true }).waitFor();
  const result = await page.evaluate(async () => ({
    rows: await window.scopeQa.getAllRecords("characters"),
    resultId: window.scopeQa.result.committed.id,
    controller: window.scopeQa.controller.getState(),
  }));
  const a = result.rows.find((row) => row.id === "scope-A");
  const b = result.rows.find((row) => row.id === "scope-B");
  assert.equal(result.resultId, "scope-A");
  assert.equal(a.profile.promptSystem, "SAVE_ONLY_A");
  assert.equal(a.alias, "keep A identity draft");
  assert.equal(b.profile.promptSystem, "scope-B_OLD");
  assert.equal(b.name, "scope-B");
  assert.equal(result.controller.characterId, "scope-B");
  assert.equal(result.controller.working.alias, "keep B pending draft");
  assert.equal(result.controller.hasUnsaved, true);
  assert.deepEqual(errors, []);
  console.log("PASS App A → Phone B → App A save writes A only, preserves both identity drafts, and leaves B controller unchanged");
} finally { await browser.close(); }
