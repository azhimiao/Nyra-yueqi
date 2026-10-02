/**
 * M3 — Pop DM session list helpers.
 * Run: node scripts/verify-characters-m3.mjs
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

const phoneJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check("Pop has session list markup", phoneJs.includes("data-pop-session-list") && phoneJs.includes('data-pop-chat-mode="list"'));
check("Pop has thread mode", phoneJs.includes('data-pop-chat-mode="thread"'));
check("Pop contacts dynamic", phoneJs.includes("data-pop-contacts") && phoneJs.includes("data-set-companion"));
check("Pop add friend", phoneJs.includes("data-pop-add-friend") && phoneJs.includes("data-pop-add-contact"));
check("Pop new chat sheet", phoneJs.includes("data-pop-dm-sheet") && phoneJs.includes("data-pop-header-action"));

const {
  createCharacter,
  ensureCharactersMigrated,
  resetCharacterCacheForTests,
  setActiveCharacterId,
} = await import("../src/characters/store.js");
const { getChatFocus, initChatFocusFromActive } = await import("../src/characters/session-context.js");
const { listDmSessions, openDm } = await import("../src/characters/sessions.js");
const { addContact, ensurePopContactsMigrated, resetPopContactsForTests } = await import("../src/characters/contacts.js");
const { dmSessionId } = await import("../src/characters/ids.js");
const { openMemoryDb, saveChatMessage } = await import("../src/storage/db.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");

resetCharacterCacheForTests();
resetPopContactsForTests();
await openMemoryDb();
await ensureCharactersMigrated();
await initChatFocusFromActive();
await ensurePopContactsMigrated();

const charB = await createCharacter({ name: "列表乙", copyFromId: BUILTIN_CHARACTER_ID });
addContact(charB.id);
await saveChatMessage({
  sessionId: dmSessionId(BUILTIN_CHARACTER_ID),
  role: "user",
  content: "hello-A",
});
await saveChatMessage({
  sessionId: dmSessionId(charB.id),
  role: "user",
  content: "hello-B",
});

const rows = await listDmSessions();
check("listDmSessions size >= 2", rows.length >= 2, `n=${rows.length}`);
const rowA = rows.find((row) => row.characterId === BUILTIN_CHARACTER_ID);
const rowB = rows.find((row) => row.characterId === charB.id);
check("preview A belongs to A", rowA?.preview?.includes("hello-A"));
check("preview B belongs to B", rowB?.preview?.includes("hello-B"));

setActiveCharacterId(charB.id);
const afterActive = await listDmSessions();
check("companion row pinned first", afterActive[0]?.characterId === charB.id && afterActive[0]?.isCompanion);

await openDm(BUILTIN_CHARACTER_ID);
check("openDm focuses A", getChatFocus().characterId === BUILTIN_CHARACTER_ID);
await openDm(charB.id);
check("openDm focuses B", getChatFocus().characterId === charB.id);

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
