/**
 * M4 — group chat create + speaker pick / @mention.
 * Run: node scripts/verify-characters-m4.mjs
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
check("Pop compose menu", phoneJs.includes("data-pop-compose-sheet") && phoneJs.includes("data-pop-compose-group"));
check("Pop group sheet", phoneJs.includes("data-pop-group-sheet") && phoneJs.includes("data-pop-group-create"));
check("Pop open group row", phoneJs.includes("data-open-group"));

const {
  createCharacter,
  ensureCharactersMigrated,
  resetCharacterCacheForTests,
} = await import("../src/characters/store.js");
const { initChatFocusFromActive, getChatFocus, getLastGroupSpeakerMeta, setLastGroupSpeakerId } = await import("../src/characters/session-context.js");
const {
  createGroupConversation,
  pickGroupSpeaker,
  buildGroupRosterBlock,
  openGroup,
} = await import("../src/characters/group-chat.js");
const { listPopSessions } = await import("../src/characters/sessions.js");
const { openMemoryDb, saveChatMessage } = await import("../src/storage/db.js");
const { BUILTIN_CHARACTER_ID } = await import("../src/constants.js");

resetCharacterCacheForTests();
await openMemoryDb();
await ensureCharactersMigrated();
await initChatFocusFromActive();

const charB = await createCharacter({ name: "群友乙", copyFromId: BUILTIN_CHARACTER_ID });
const charC = await createCharacter({ name: "群友丙", copyFromId: BUILTIN_CHARACTER_ID });

let blocked = false;
try {
  await createGroupConversation({ memberIds: [BUILTIN_CHARACTER_ID] });
} catch (error) {
  blocked = String(error?.message || error).includes("group_needs_two_members");
}
check("refuse group with <2 members", blocked);

const group = await createGroupConversation({
  title: "测试群",
  memberIds: [BUILTIN_CHARACTER_ID, charB.id, charC.id],
});
check("create group id", String(group.id).startsWith("group:"));
check("create group members", group.memberIds.length === 3);

await openGroup(group.id);
check("focus is group", getChatFocus().kind === "group" && getChatFocus().sessionId === group.id);

const mentioned = pickGroupSpeaker(`你好 @群友乙 在吗`, group.memberIds, []);
check("@mention picks B", mentioned === charB.id, mentioned);

const rotated = pickGroupSpeaker("随便说说", group.memberIds, [
  { role: "assistant", metadata: { speakerId: BUILTIN_CHARACTER_ID } },
]);
check("rotate after last speaker", rotated === charB.id, rotated);

const roster = buildGroupRosterBlock(group.memberIds, charB.id);
check("roster mentions speaker", roster.includes("本轮发言") && roster.includes("群友乙"));

setLastGroupSpeakerId(charB.id);
const meta = getLastGroupSpeakerMeta();
check("speaker meta name", meta?.speakerId === charB.id && meta?.speakerName === "群友乙");

await saveChatMessage({
  sessionId: group.id,
  role: "assistant",
  content: "我是乙",
  metadata: meta,
});

const rows = await listPopSessions();
const groupRow = rows.find((row) => row.kind === "group" && row.sessionId === group.id);
check("listPopSessions includes group", Boolean(groupRow));
check("group preview", groupRow?.preview?.includes("我是乙"));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
