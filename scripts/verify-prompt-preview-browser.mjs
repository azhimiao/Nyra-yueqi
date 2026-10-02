/** Focused preview-only regression: final budget display and unsent repeated text. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.PROMPT_QA_BASE || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${base}/__prompt-preview-qa`, (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:system-ui}*{box-sizing:border-box}</style><main id="editor"></main></html>' }));
  await page.goto(`${base}/__prompt-preview-qa`);
  await page.evaluate(async () => {
    await import("/src/settings/editors/authoring.css");
    const [{ mountPromptEditor }, store, { writeCompanionTurn }, { openMemoryDb }, conversation, { finalizeModelRequest }] = await Promise.all([
      import("/src/settings/editors/prompt-editor.js"), import("/src/characters/store.js"), import("/src/conversation/companion-write.js"), import("/src/storage/db.js"), import("/src/conversation/index.js"), import("/src/prompt/finalize.js"),
    ]);
    await openMemoryDb();
    const characterId = "preview-qa-character";
    const sessionId = `dm:${characterId}`;
    const character = await store.upsertCharacter({ id: characterId, name: "Preview", profile: { fields: ["Preview", "Preview", "", "", ""], promptSystem: "PREVIEW_AUTHOR" } });
    await writeCompanionTurn({ role: "user", text: "重复的一句", companionId: characterId, userId: "local", chatSessionId: sessionId, saveChatMessage: async (message) => message });
    await writeCompanionTurn({ role: "assistant", text: "KEEP_PREVIOUS_REPLY", companionId: characterId, userId: "local", chatSessionId: sessionId, saveChatMessage: async (message) => message });
    window.previewQa = { mountPromptEditor, characterId, character, sessionId, conversation, finalizeModelRequest };
    window.previewQa.before = JSON.stringify(localStorage.getItem("yueqi.conversation.v2"));
    window.previewQa.editor = mountPromptEditor(document.getElementById("editor"), { characterId, characterRecord: character, sessionId });
    await window.previewQa.editor.ready;
  });
  await page.locator('[data-tab="layout"]').click();
  assert.match(await page.locator('[data-prompt-scope]').innerText(), /所有角色/);
  await page.locator('[data-tab="preview"]').click();
  await page.locator('[data-preview-query]').fill("重复的一句");
  await page.locator('[data-prompt-action="preview"]').click();
  await page.locator('[data-prompt-budget]').waitFor();
  await page.evaluate(() => { for (const node of document.querySelectorAll('[data-prompt-preview] details')) node.open = true; });
  const preview = await page.locator('[data-prompt-preview]').innerText();
  assert.equal((preview.match(/重复的一句/g) || []).length, 2, "prior identical user line and unsent new input both remain");
  assert.match(preview, /KEEP_PREVIOUS_REPLY/);
  assert.match(preview, /yueqi-runtime/);
  assert.match(await page.locator('[data-prompt-budget]').innerText(), /tokens/);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage.getItem("yueqi.conversation.v2")) === window.previewQa.before), true, "fallback preview must not mutate V2 conversation");

  await page.evaluate(async () => {
    window.previewQa.editor.destroy();
    const { mountPromptEditor, characterId, character, finalizeModelRequest } = window.previewQa;
    window.previewQa.editor = mountPromptEditor(document.getElementById("editor"), {
      characterId, characterRecord: character,
      preview: async ({ query }) => finalizeModelRequest([
        { role: "system", content: "AUTHOR", blockId: "character" },
        { role: "system", content: "可省略的世界条目。".repeat(2000), blockId: "world_context" },
        { role: "user", content: query, blockId: "user_input" },
      ], { totalContextTokens: 2048, outputReserveTokens: 512 }),
    });
    await window.previewQa.editor.ready;
  });
  await page.locator('[data-tab="preview"]').click();
  await page.locator('[data-preview-query]').fill("本轮问题");
  await page.locator('[data-prompt-action="preview"]').click();
  await page.locator('[data-prompt-budget]').waitFor();
  assert.match(await page.locator('[data-prompt-budget]').innerText(), /省略 1 段/);
  assert.doesNotMatch(await page.locator('[data-prompt-preview]').innerText(), /可省略的世界条目/);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("preview browser: fallback read-only history, repeated input, runtime format, scope copy, final budget summary PASS");
} finally { await browser.close(); }
