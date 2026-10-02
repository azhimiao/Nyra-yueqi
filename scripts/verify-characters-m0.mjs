/**
 * M0 character registry — migrate, CRUD, active companion.
 * Run: node scripts/verify-characters-m0.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

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
  CHARACTERS_MIGRATED_KEY,
  DEFAULT_SESSION_ID,
  LOCAL_KEYS,
  MEMORY_DB_VERSION,
  defaultProfile,
} = await import("../src/constants.js");
const { SELECTED_PET_KEY } = await import("../src/avatar/pet-catalog.js");
const { dmSessionId } = await import("../src/characters/ids.js");
const {
  createCharacter,
  deleteCharacter,
  ensureCharactersMigrated,
  getActiveCharacterId,
  getCharacter,
  listCharacters,
  resetCharacterCacheForTests,
  setActiveCharacterId,
  upsertCharacter,
} = await import("../src/characters/store.js");
const { getAllRecords, openMemoryDb, saveChatMessage, storeRecord } = await import("../src/storage/db.js");

check("MEMORY_DB_VERSION supports character stores", MEMORY_DB_VERSION >= 6);
check("BUILTIN_CHARACTER_ID", BUILTIN_CHARACTER_ID === "char-xingli");
check("dmSessionId shape", dmSessionId(BUILTIN_CHARACTER_ID) === "char:char-xingli");

const dbJs = readFileSync(join(root, "src/storage/db.js"), "utf8");
check("db REQUIRED_STORES has characters", dbJs.includes('"characters"'));
check("db ensureStores creates characters", dbJs.includes('createObjectStore("characters"'));

const appJs = readFileSync(join(root, "src/app.js"), "utf8");
check("app calls ensureCharactersMigrated", appJs.includes("ensureCharactersMigrated"));

// Seed legacy profile + pet + a default-session message
window.localStorage.setItem(
  LOCAL_KEYS.profileKey,
  JSON.stringify({
    ...defaultProfile,
    fields: ["测试星梨", "测梨", ...defaultProfile.fields.slice(2)],
  })
);
window.localStorage.setItem(SELECTED_PET_KEY, "bubble");
await openMemoryDb();
await saveChatMessage({
  sessionId: DEFAULT_SESSION_ID,
  role: "user",
  content: "legacy hello",
});
await storeRecord("conversations", {
  id: DEFAULT_SESSION_ID,
  title: "旧会话",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

resetCharacterCacheForTests();
const first = await ensureCharactersMigrated();
check("migrate returns characters", Array.isArray(first.characters) && first.characters.length >= 1);
check("migrated flag set", window.localStorage.getItem(CHARACTERS_MIGRATED_KEY) === "1");

const xingli = await getCharacter(BUILTIN_CHARACTER_ID);
check("builtin exists", Boolean(xingli));
check("builtin name from legacy profile", xingli?.name === "测试星梨");
check("builtin pet from selectedPetId", xingli?.petId === "yueqi-female");
check("active is builtin", getActiveCharacterId() === BUILTIN_CHARACTER_ID);

const msgs = await getAllRecords("messages");
const moved = msgs.filter((m) => m.sessionId === dmSessionId(BUILTIN_CHARACTER_ID) && m.content === "legacy hello");
const leftover = msgs.filter((m) => m.sessionId === DEFAULT_SESSION_ID);
check("default-session messages moved", moved.length >= 1, `moved=${moved.length}`);
check("no leftover default-session msgs", leftover.length === 0, `left=${leftover.length}`);

const conversations = await getAllRecords("conversations");
check(
  "dm conversation exists",
  conversations.some((c) => c.id === dmSessionId(BUILTIN_CHARACTER_ID) && c.kind === "dm")
);
check("legacy conversation removed", !conversations.some((c) => c.id === DEFAULT_SESSION_ID));

const second = await ensureCharactersMigrated();
check("migrate is idempotent", second.skipped === true);
check("still one builtin after remigrate", (await listCharacters()).filter((c) => c.id === BUILTIN_CHARACTER_ID).length === 1);

const created = await createCharacter({ name: "第二位", copyFromId: BUILTIN_CHARACTER_ID });
check("create second character", created?.id && created.id !== BUILTIN_CHARACTER_ID);
check("list size >= 2", (await listCharacters()).length >= 2);
check("copy keeps pet unless overridden", created.petId === "yueqi-female");

await upsertCharacter({ id: created.id, petId: "yueqi-male" });
check("upsert petId", (await getCharacter(created.id))?.petId === "yueqi-male");

setActiveCharacterId(created.id);
check("setActiveCharacterId", getActiveCharacterId() === created.id);

let deleteBlocked = false;
await deleteCharacter(BUILTIN_CHARACTER_ID);
check("can delete non-last", !(await getCharacter(BUILTIN_CHARACTER_ID)));
check("active falls back after delete", getActiveCharacterId() !== BUILTIN_CHARACTER_ID && Boolean(getActiveCharacterId()));

try {
  await deleteCharacter((await listCharacters())[0].id);
} catch (error) {
  deleteBlocked = String(error?.message || error).includes("cannot_delete_last_character");
}
check("refuse delete last character", deleteBlocked);
check("one character remains", (await listCharacters()).length === 1);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
