/**
 * Pop contacts — character library ≠ address book.
 * Run: node scripts/verify-pop-contacts.mjs
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

globalThis.localStorage = globalThis.window.localStorage;

const phoneJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check("Pop add-friend UI", phoneJs.includes("data-pop-add-friend") && phoneJs.includes("data-pop-add-contact"));
check("Pop contact card UI", phoneJs.includes("data-pop-contact-card") && phoneJs.includes("data-pop-remove-contact"));
check("Pop me user identity", phoneJs.includes("data-pop-me-name") && phoneJs.includes("data-pop-me-companion"));

const {
  createCharacter,
  ensureCharactersMigrated,
  resetCharacterCacheForTests,
} = await import("../src/characters/store.js");
const {
  POP_CONTACTS_KEY,
  addContact,
  ensurePopContactsMigrated,
  isContact,
  listContacts,
  listNonContactCharacters,
  removeContact,
  resetPopContactsForTests,
} = await import("../src/characters/contacts.js");
const { listDmSessions } = await import("../src/characters/sessions.js");
const { openMemoryDb } = await import("../src/storage/db.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");

resetCharacterCacheForTests();
resetPopContactsForTests();
await openMemoryDb();
await ensureCharactersMigrated();

const first = await ensurePopContactsMigrated();
check("migrate seeds existing characters", first.seeded === true && first.count >= 1, JSON.stringify(first));
check("builtin is contact after migrate", isContact(BUILTIN_CHARACTER_ID));

const second = await ensurePopContactsMigrated();
check("migrate is one-shot", second.seeded === false);

const beforeCreate = listContacts().length;
const newbie = await createCharacter({ name: "未加好友", copyFromId: BUILTIN_CHARACTER_ID });
check("create does not auto-add contact", !isContact(newbie.id));
check("contact count unchanged after create", listContacts().length === beforeCreate);

const dmBefore = await listDmSessions();
check("new character absent from DM list", !dmBefore.some((row) => row.characterId === newbie.id));

const nonContacts = await listNonContactCharacters();
check("non-contact list includes newbie", nonContacts.some((row) => row.id === newbie.id));

addContact(newbie.id);
check("addContact marks friend", isContact(newbie.id));

const dmAfter = await listDmSessions();
check("added friend appears in DM list", dmAfter.some((row) => row.characterId === newbie.id));

removeContact(newbie.id);
check("removeContact clears friend", !isContact(newbie.id));
const dmRemoved = await listDmSessions();
check("removed friend leaves DM list", !dmRemoved.some((row) => row.characterId === newbie.id));
check("store key still present after remove", window.localStorage.getItem(POP_CONTACTS_KEY) != null);

const failed = checks.filter((item) => !item.pass);
if (failed.length) {
  console.error(`\nverify-pop-contacts: ${failed.length} failed`);
  process.exit(1);
}
console.log("\nverify-pop-contacts: ok");
