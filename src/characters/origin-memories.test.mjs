/**
 * Authored origin memories — custom character editor, not lived chat.
 * Run: node src/characters/origin-memories.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};
globalThis.document = { dispatchEvent() { return true; } };

const { openMemoryDb, storeRecord, getAllRecords, normalizeMemory } = await import("../storage/db.js");
const {
  isAuthoredOriginMemory,
  originWeightToLevel,
  originLevelToWeight,
  originDraftHasContent,
  buildOriginMemoryRecord,
  replaceOriginMemories,
  listOriginMemories,
  toOriginMemoryDraft,
  BUILTIN_ORIGIN_ID_PREFIX,
} = await import("./origin-memories.js");
const { originMemoryEditorInnerMarkup, originMemoryRowMarkup } = await import("./origin-memory-editor.js");

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`PASS ${name}`);
  });
}

await openMemoryDb();

await test("lived chat is not origin memory", () => {
  const lived = normalizeMemory({
    id: "mem-chat-1",
    title: "昨天",
    rawText: "我们一起吃了饭",
    source: "chat.memory",
    companionId: "char-custom-1",
    characterId: "char-custom-1",
  });
  assert.equal(isAuthoredOriginMemory(lived, "char-custom-1"), false);
});

await test("character.history is origin memory and stays scoped", () => {
  const origin = buildOriginMemoryRecord("char-custom-1", {
    title: "童年",
    rawText: "在海边长大",
    weightLevel: "high",
    pinned: true,
    searchable: true,
    tagsText: "海边",
  });
  assert.equal(origin.source, "character.history");
  assert.equal(origin.sourceType, "authored_origin_memory");
  assert.equal(origin.sourceRef.truthDomain, "character_canon");
  assert.equal(origin.companionId, "char-custom-1");
  assert.equal(origin.weight, originLevelToWeight("high"));
  assert.equal(origin.pinned, true);
  assert.ok(origin.tags.includes("海边"));
  assert.equal(isAuthoredOriginMemory(origin, "char-custom-1"), true);
  assert.equal(isAuthoredOriginMemory(origin, "char-other"), false);
});

await test("weight mapping", () => {
  assert.equal(originWeightToLevel(0.8), "low");
  assert.equal(originWeightToLevel(1.32), "medium");
  assert.equal(originWeightToLevel(1.8), "high");
  assert.equal(originDraftHasContent({ title: "", rawText: "" }), false);
  assert.equal(originDraftHasContent({ title: "a", rawText: "" }), true);
});

await test("replace skips unless editor is ready", async () => {
  const id = "char-skip-ready";
  const result = await replaceOriginMemories(id, [
    { title: "不该写入", rawText: "nope" },
  ], { ready: false });
  assert.equal(result.skipped, true);
  assert.equal((await listOriginMemories(id)).length, 0);
});

await test("replace writes origin and leaves lived chat alone", async () => {
  const id = "char-custom-save";
  await storeRecord("memories", normalizeMemory({
    id: "lived-keep",
    title: "共同晚饭",
    rawText: "我们点了拉面",
    source: "chat.memory",
    companionId: id,
    characterId: id,
  }));
  const first = await replaceOriginMemories(id, [
    { title: "故乡", rawText: "从小住在港口", tagsText: "港口", weightLevel: "medium" },
    { title: "", rawText: "" },
  ], { ready: true, role: "港口人" });
  assert.equal(first.ok, true);
  assert.equal(first.saved.length, 1);
  const listed = await listOriginMemories(id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "故乡");
  assert.equal(listed[0].role, "港口人");
  const all = await getAllRecords("memories");
  assert.ok(all.some((row) => row.id === "lived-keep"));

  const updated = await replaceOriginMemories(id, [
    { id: listed[0].id, title: "故乡", rawText: "港口的风总是很硬", weightLevel: "high", pinned: true },
  ], { ready: true, role: "港口人" });
  assert.equal(updated.saved[0].rawText.includes("港口的风"), true);
  assert.equal(updated.deleted.length, 0);

  const cleared = await replaceOriginMemories(id, [], { ready: true });
  assert.equal(cleared.deleted.length, 1);
  assert.equal((await listOriginMemories(id)).length, 0);
  assert.ok((await getAllRecords("memories")).some((row) => row.id === "lived-keep"));
});

await test("builtin origin ids are not deleted", async () => {
  const id = "char-xingli";
  const seedId = `${BUILTIN_ORIGIN_ID_PREFIX}99`;
  await storeRecord("memories", buildOriginMemoryRecord(id, {
    id: seedId,
    title: "内置一条",
    rawText: "作者写的过去",
  }));
  const result = await replaceOriginMemories(id, [], { ready: true });
  assert.ok(!result.deleted.includes(seedId));
  const keep = await listOriginMemories(id);
  assert.ok(keep.some((row) => row.id === seedId));
});

await test("editor markup has prompt-adjacent memory fields", () => {
  assert.equal(typeof toOriginMemoryDraft, "function");
  const html = originMemoryEditorInnerMarkup([
    { id: "m1", title: "第一场雪", rawText: "那年冬天", tagsText: "", weightLevel: "medium", pinned: false, searchable: true, when: "2012-01-01" },
  ]);
  assert.match(html, /data-origin-title/);
  assert.match(html, /data-origin-body/);
  assert.match(html, /data-origin-weight/);
  assert.match(html, /data-origin-pinned/);
  assert.match(html, /data-origin-searchable/);
  assert.match(html, /data-origin-memory-add/);
  const builtinRow = originMemoryRowMarkup({
    id: `${BUILTIN_ORIGIN_ID_PREFIX}1`,
    title: "Nyra",
    rawText: "seed",
    weightLevel: "medium",
    searchable: true,
  });
  assert.doesNotMatch(builtinRow, /data-origin-memory-remove/);
});

await test("custom origin memories start empty and optional", () => {
  const html = originMemoryEditorInnerMarkup([]);
  assert.doesNotMatch(html, /data-origin-memory-row/);
  assert.match(html, /data-origin-memory-empty/);
  assert.match(html, /data-origin-memory-add/);
  assert.match(html, /现在可以不写/);
});

await test("identity and phone customize surfaces include origin editor", () => {
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  const phoneJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  const appJs = readFileSync(join(root, "src/app.js"), "utf8");
  assert.match(indexHtml, /data-origin-memory-editor/);
  assert.match(indexHtml, /character\.originMemoriesTitle/);
  assert.match(indexHtml, /现在不写也可以/);
  assert.match(phoneJs, /originMemoryEditorInnerMarkup/);
  assert.match(phoneJs, /commitOriginMemoryEditor/);
  assert.match(appJs, /hydrateOriginMemoryEditor/);
  assert.match(appJs, /commitOriginMemoryEditor/);
});

console.log(`origin-memories passed: ${passed}`);
