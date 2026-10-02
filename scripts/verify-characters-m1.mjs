/**
 * M1 — per-character DM sessions + profile from character store.
 * Run: node scripts/verify-characters-m1.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

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

const { BUILTIN_CHARACTER_ID, DEFAULT_SESSION_ID } = await import("../src/constants.js");
const { dmSessionId } = await import("../src/characters/ids.js");
const {
  createCharacter,
  ensureCharactersMigrated,
  getCharacterSync,
  resetCharacterCacheForTests,
  upsertCharacter,
} = await import("../src/characters/store.js");
const { characterToCollectedProfile, collectedProfileFromStore } = await import("../src/characters/profile.js");
const {
  getChatFocus,
  getCurrentSessionId,
  initChatFocusFromActive,
  setChatFocusCharacter,
} = await import("../src/characters/session-context.js");
const { openMemoryDb, saveChatMessage, getMessagesBySession } = await import("../src/storage/db.js");

const appJs = readFileSync(join(root, "src/app.js"), "utf8");
const chatJs = readFileSync(join(root, "src/panels/chat.js"), "utf8");
check("app chat paths avoid hardcoded DEFAULT_SESSION_ID", !appJs.includes("sessionId: DEFAULT_SESSION_ID"));
check("chat panel resolves session via getSessionId", chatJs.includes("resolveSessionId") && !chatJs.includes("DEFAULT_SESSION_ID"));
check("assemblePrompt accepts sessionId", readFileSync(join(root, "src/prompt/assemble.js"), "utf8").includes("sessionId = DEFAULT_SESSION_ID"));

resetCharacterCacheForTests();
await openMemoryDb();
await ensureCharactersMigrated();
await initChatFocusFromActive();

check("focus starts on builtin", getChatFocus().characterId === BUILTIN_CHARACTER_ID);
check("session id matches dm", getCurrentSessionId() === dmSessionId(BUILTIN_CHARACTER_ID));

const charB = await createCharacter({
  name: "角色乙",
  copyFromId: BUILTIN_CHARACTER_ID,
});
await upsertCharacter({
  id: charB.id,
  name: "角色乙",
  alias: "乙",
  profile: {
    ...charB.profile,
    fields: ["角色乙", "乙", "测试身份", "model", "乙的人设正文"],
  },
});

await setChatFocusCharacter(BUILTIN_CHARACTER_ID);
await saveChatMessage({
  sessionId: getCurrentSessionId(),
  role: "user",
  content: "message-for-A",
});

await setChatFocusCharacter(charB.id);
check("focus switched to B", getChatFocus().characterId === charB.id);
await saveChatMessage({
  sessionId: getCurrentSessionId(),
  role: "user",
  content: "message-for-B",
});

const msgsA = await getMessagesBySession(dmSessionId(BUILTIN_CHARACTER_ID), 50);
const msgsB = await getMessagesBySession(dmSessionId(charB.id), 50);
check("A session has A message", msgsA.some((m) => m.content === "message-for-A"));
check("A session lacks B message", !msgsA.some((m) => m.content === "message-for-B"));
check("B session has B message", msgsB.some((m) => m.content === "message-for-B"));
check("B session lacks A message", !msgsB.some((m) => m.content === "message-for-A"));
check("legacy default-session empty", (await getMessagesBySession(DEFAULT_SESSION_ID, 50)).length === 0);

const profileA = collectedProfileFromStore(BUILTIN_CHARACTER_ID);
const profileB = collectedProfileFromStore(charB.id);
check("profile A from store", Boolean(profileA?.name));
check(
  "A and B names differ",
  profileA?.name !== profileB?.name,
  `${profileA?.name} vs ${profileB?.name}`
);
check("B base from fields", profileB?.base === "乙的人设正文");
check("characterToCollectedProfile alias", characterToCollectedProfile(getCharacterSync(charB.id))?.alias === "乙");

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
