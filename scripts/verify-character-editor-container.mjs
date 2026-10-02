/**
 * Task 2.1 — shared App/phone editor container (draft vs committed).
 * Run: node scripts/verify-character-editor-container.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

class MemoryStorage {
  constructor() {
    this._data = new Map();
  }

  get length() {
    return this._data.size;
  }

  key(index) {
    return [...this._data.keys()][index] ?? null;
  }

  getItem(key) {
    return this._data.get(String(key)) ?? null;
  }

  setItem(key, value) {
    this._data.set(String(key), String(value));
  }

  removeItem(key) {
    this._data.delete(String(key));
  }
}

const characterStorage = new MemoryStorage();
globalThis.window = { localStorage: characterStorage };
globalThis.document = { dispatchEvent: () => true };

const { defaultProfile } = await import("../src/constants.js");
const { createCharacterDraftStore } = await import("../src/characters/draft-store.js");
const { createCharacterEditorService } = await import("../src/characters/editor-service.js");
const { createCharacterEditorController } = await import("../src/characters/editor-controller.js");
const {
  getCharacter,
  resetCharacterCacheForTests,
  upsertCharacter,
} = await import("../src/characters/store.js");

function profile(name, extra = {}) {
  return {
    ...defaultProfile,
    fields: [name, name, ...defaultProfile.fields.slice(2)],
    ...extra,
  };
}

resetCharacterCacheForTests();
const characterA = await upsertCharacter({
  id: "character-a",
  name: "A",
  alias: "A",
  profile: profile("A", { promptSystem: "committed-system-a" }),
});
const characterB = await upsertCharacter({
  id: "character-b",
  name: "B",
  alias: "B",
  profile: profile("B", { promptSystem: "committed-system-b" }),
});

let passed = 0;
async function verify(name, run) {
  await run();
  passed += 1;
  console.log(`PASS  ${name}`);
}

await verify("1. App patch is visible after phone open of the same id", async () => {
  const storage = new MemoryStorage();
  const app = createCharacterEditorController({ storage });
  const phone = createCharacterEditorController({ storage });
  app.bindShell("app");
  phone.bindShell("phone");
  await app.open(characterA.id);
  await app.patch({
    name: "草稿名",
    profile: { promptSystem: "draft-system" },
  });
  const phoneState = await phone.open(characterA.id);
  assert.equal(phoneState.draft.patch.name, "草稿名");
  assert.equal(phoneState.draft.patch.profile.promptSystem, "draft-system");
  assert.equal(phoneState.hasUnsaved, true);
  assert.equal(phoneState.working.name, "草稿名");
  assert.equal(phoneState.working.profile.promptSystem, "draft-system");
  assert.equal(phoneState.committed.name, "A");
  assert.equal(phone.boundShell ?? phone.getState().boundShell, "phone");
});

await verify("2. basic → advanced → basic keeps promptSystem and name", async () => {
  const storage = new MemoryStorage();
  const editor = createCharacterEditorController({ storage });
  await editor.open(characterA.id);
  await editor.patch({
    name: "模式名",
    profile: { promptSystem: "mode-system" },
  });
  assert.equal(editor.mode, "basic");
  editor.setMode("advanced");
  assert.equal(editor.mode, "advanced");
  assert.equal(editor.working.name, "模式名");
  assert.equal(editor.working.profile.promptSystem, "mode-system");
  editor.setMode("basic");
  assert.equal(editor.mode, "basic");
  assert.equal(editor.working.name, "模式名");
  assert.equal(editor.working.profile.promptSystem, "mode-system");
  assert.equal(editor.hasUnsaved, true);
});

await verify("3. save success clears unsaved and writes committed text", async () => {
  const storage = new MemoryStorage();
  const editor = createCharacterEditorController({ storage });
  await editor.open(characterA.id);
  await editor.patch({
    name: "已保存名",
    profile: { promptSystem: "saved-system" },
  });
  const result = await editor.save();
  assert.equal(result.ok, true);
  assert.equal(editor.hasUnsaved, false);
  assert.equal(editor.committed.name, "已保存名");
  assert.equal(editor.committed.profile.promptSystem, "saved-system");
  const saved = await getCharacter(characterA.id);
  assert.equal(saved.name, "已保存名");
  assert.equal(saved.profile.promptSystem, "saved-system");
  const nav = editor.confirmNavigation();
  assert.equal(nav.allowed, true);
  assert.equal(nav.hasUnsaved, false);
});

await verify("4. save failure (upsert throw) keeps the draft", async () => {
  const storage = new MemoryStorage();
  const failing = createCharacterEditorController({
    editorService: createCharacterEditorService({
      draftStore: createCharacterDraftStore({ storage }),
      characterStore: {
        getCharacter,
        upsertCharacter: async () => {
          throw new Error("upsert_failed");
        },
      },
    }),
  });
  const latest = await getCharacter(characterA.id);
  await failing.open(characterA.id);
  await failing.patch({ name: "必须留下的草稿" });
  const result = await failing.save();
  assert.equal(result.ok, false);
  assert.ok(result.saveError || result.error);
  assert.equal(failing.hasUnsaved, true);
  assert.equal(failing.draft.patch.name, "必须留下的草稿");
  assert.equal((await getCharacter(characterA.id)).name, latest.name);
  assert.equal((await getCharacter(characterA.id)).revision, latest.revision);
});

await verify("5. switching characters keeps A draft off B", async () => {
  const storage = new MemoryStorage();
  const app = createCharacterEditorController({ storage });
  const phone = createCharacterEditorController({ storage });
  await app.open(characterA.id);
  await app.patch({ name: "A-draft" });
  const nav = app.confirmNavigation();
  assert.equal(nav.hasUnsaved, true);
  assert.equal(nav.allowed, false);
  const bState = await phone.open(characterB.id);
  assert.equal(bState.characterId, characterB.id);
  assert.equal(bState.hasUnsaved, false);
  assert.notEqual(bState.working.name, "A-draft");
  assert.equal(bState.committed.name, "B");
  assert.equal(bState.draft, null);
  const back = await app.open(characterA.id);
  assert.equal(back.draft.patch.name, "A-draft");
  assert.equal(back.hasUnsaved, true);
});

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const phoneSource = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const controllerSource = readFileSync(join(root, "src/characters/editor-controller.js"), "utf8");
const indexSource = readFileSync(join(root, "index.html"), "utf8");
const styleSource = readFileSync(join(root, "styles.css"), "utf8");
const saveStart = phoneSource.indexOf("async function saveCharacterFromForm");
const saveEnd = phoneSource.indexOf("\n  async function ", saveStart + 1);
const saveBody = saveStart >= 0
  ? phoneSource.slice(saveStart, saveEnd > saveStart ? saveEnd : phoneSource.length)
  : "";

await verify("6. phone saveCharacterFromForm does not call syncProfileStateToCharacter", () => {
  assert.ok(saveBody.includes("phoneCharacterEditor.save()"));
  assert.equal(saveBody.includes("syncProfileStateToCharacter"), false);
});

await verify("editor-controller.js has no querySelector", () => {
  assert.equal(/\bquerySelector(All)?\s*\(/.test(controllerSource), false);
});

await verify("App action bar exposes save, discard, and unsaved", () => {
  assert.match(indexSource, /data-character-save/);
  assert.match(indexSource, /data-character-discard/);
  assert.match(indexSource, /data-character-unsaved/);
  assert.match(styleSource, /\.character-editor-save[\s\S]{0,180}min-height:\s*44px/);
});

assert.equal(passed, 8);
console.log(`\nPASS  ${passed}/8 character editor container checks`);
