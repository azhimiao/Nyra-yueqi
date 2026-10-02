/**
 * Task 1.1 — additive CharacterProfileV2 migration and stock-prompt safety.
 * Run: node scripts/verify-characters-v2.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

globalThis.document = {
  dispatchEvent() {
    return true;
  },
};

const {
  BUILTIN_CHARACTER_ID,
  BUILTIN_COMPANION_PROMPT_SYSTEM,
} = await import("../src/constants.js");
const {
  annotateCharacterV2,
  fromCharacterProfileV2,
  toCharacterProfileV2,
} = await import("../src/characters/migration-v2.js");
const {
  isStockCharacterPrompt,
} = await import("../src/characters/prompt-stock.js");
const {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  normalizeCharacter,
  resetCharacterCacheForTests,
  upsertCharacter,
} = await import("../src/characters/store.js");
const { openMemoryDb } = await import("../src/storage/db.js");

const customSystem = "自定义开场：有人在故事里说“你是林星梨（小栖）”，但这不是官方卡。  \n";
const customDeveloper = "\n  保留前后空白与换行。\n";
assert.equal(isStockCharacterPrompt(customSystem), false);
assert.equal(isStockCharacterPrompt("", { source: "user" }), false);
assert.equal(isStockCharacterPrompt("", { characterId: BUILTIN_CHARACTER_ID }), true);
assert.equal(
  isStockCharacterPrompt(BUILTIN_COMPANION_PROMPT_SYSTEM, {
    characterId: BUILTIN_CHARACTER_ID,
    source: "builtin",
  }),
  true,
);

for (const id of ["char-xingli", "random-opaque-id"]) {
  const legacy = {
    id,
    name: "字节保留测试",
    source: id === BUILTIN_CHARACTER_ID ? "builtin" : "user",
    profile: {
      fields: ["字节保留测试", "别名", "", "", ""],
      ranges: ["1", "2", "3", "4"],
      tokens: ["token"],
      status: { injectionEnabled: false },
      promptSystem: customSystem,
      promptDeveloper: customDeveloper,
    },
    customTag: "keep-me",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
  const profileV2 = toCharacterProfileV2(legacy);
  assert.equal(profileV2.characterId, id);
  assert.equal(profileV2.prompts.characterSystemSupplement, customSystem);
  assert.equal(profileV2.prompts.characterDeveloperSupplement, customDeveloper);
  assert.equal(profileV2.extensions.legacyUnknownFields.customTag, "keep-me");

  const roundTrip = fromCharacterProfileV2(profileV2, legacy);
  assert.equal(roundTrip.profile.promptSystem, customSystem);
  assert.equal(roundTrip.profile.promptDeveloper, customDeveloper);
  assert.equal(roundTrip.customTag, "keep-me");

  const annotated = annotateCharacterV2(legacy);
  assert.equal(annotated.schemaVersion, 2);
  assert.equal(annotated.revision, 1);
  assert.equal(annotated.profile.promptSystem, customSystem);
  assert.equal(annotated.profile.promptDeveloper, customDeveloper);
  assert.equal(annotated.customTag, "keep-me");
}

const emptyUserPrompt = normalizeCharacter({
  id: "empty-user-prompt",
  source: "user",
  profile: {
    promptSystem: "",
    promptDeveloper: "",
  },
});
assert.equal(emptyUserPrompt.profile.promptSystem, "");
assert.equal(emptyUserPrompt.profile.promptDeveloper, "");

const oversizedCustomPrompt = `custom-${"x".repeat(17000)}  \n`;
const failedClosed = annotateCharacterV2({
  id: "oversized-custom",
  source: "user",
  profile: {
    promptSystem: oversizedCustomPrompt,
    promptDeveloper: customDeveloper,
  },
});
assert.equal(failedClosed.profile.promptSystem, oversizedCustomPrompt);
assert.equal(failedClosed.profile.promptDeveloper, customDeveloper);
assert.equal(failedClosed.profileV2, undefined);
assert.equal(failedClosed.v2MigrationError.code, "character_profile_v2_validation_failed");

resetCharacterCacheForTests();
await openMemoryDb();
const created = await createCharacter({ name: "V2 CRUD" });
assert.equal(created.schemaVersion, 2);
assert.equal(created.revision, 1);
assert.equal(created.profile.promptSystem, "");
assert.equal((await getCharacter(created.id))?.id, created.id);
assert.ok((await listCharacters()).some((item) => item.id === created.id));

const customized = await upsertCharacter({
  id: created.id,
  customTag: "keep-me",
  profile: {
    ...created.profile,
    promptSystem: customSystem,
    promptDeveloper: customDeveloper,
  },
});
assert.equal(customized.revision, 2);
assert.equal(customized.profile.promptSystem, customSystem);
assert.equal(customized.profile.promptDeveloper, customDeveloper);
assert.equal(customized.customTag, "keep-me");

const unchanged = await upsertCharacter({
  id: customized.id,
  profile: { ...customized.profile },
});
assert.equal(unchanged.revision, customized.revision);

const persisted = await getCharacter(created.id);
assert.equal(persisted.profile.promptSystem, customSystem);
assert.equal(persisted.profile.promptDeveloper, customDeveloper);
assert.equal(persisted.customTag, "keep-me");

await createCharacter({ name: "delete guard companion" });
assert.equal(await deleteCharacter(created.id), true);
assert.equal(await getCharacter(created.id), null);

const storeSource = readFileSync(join(root, "src/characters/store.js"), "utf8");
const stockSource = readFileSync(join(root, "src/characters/prompt-stock.js"), "utf8");
for (const source of [storeSource, stockSource]) {
  assert.equal(source.includes('includes("你是林星梨'), false);
  assert.equal(source.includes('includes("官方角色：陪伴人格'), false);
}

console.log("PASS  Character V2 additive migration, prompt bytes, hash stock detection, and CRUD");
