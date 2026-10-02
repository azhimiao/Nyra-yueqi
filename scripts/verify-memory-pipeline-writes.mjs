/**
 * Memory Pipeline M0/M1 — V2 first-write; refuse IDB-only success.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/MEMORY_PIPELINE");
mkdirSync(outDir, { recursive: true });

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const storage = (() => {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
})();
globalThis.window = { localStorage: storage, dispatchEvent() {} };
globalThis.localStorage = storage;

const { __setConversationStorageForTests, clearAllConversations, getSession, selectVisibleHistory } =
  await import("../src/conversation/index.js");
const { writeCompanionTurn, writeCompanionSystemNote } =
  await import("../src/conversation/companion-write.js");

__setConversationStorageForTests(storage);
clearAllConversations();

const idb = [];
async function saveChatMessage(msg) {
  idb.push({ ...msg });
  return msg;
}

{
  clearAllConversations();
  idb.length = 0;
  const written = await writeCompanionTurn({
    role: "user",
    text: "hello from pop",
    characterId: "char_m1",
    chatSessionId: "dm:char_m1",
    meta: { source: "pop_chat" },
    saveChatMessage,
  });
  const session = getSession(written.conversationSessionId);
  const history = session ? selectVisibleHistory(session) : [];
  record("pop_user_v2", written.ok && history.some((t) => String(t.text || t.content || "").includes("hello")));
  record("pop_user_idb_has_turn_id", idb[0]?.metadata?.conversationTurnId);
}

{
  clearAllConversations();
  idb.length = 0;
  const asst = await writeCompanionTurn({
    role: "assistant",
    text: "opening hello",
    characterId: "char_fl",
    chatSessionId: "dm:char_fl",
    messageId: "fl-first-char_fl",
    meta: { source: "first_light_init", kind: "first_light_opening" },
    saveChatMessage,
  });
  record("first_light_v2", asst.ok && asst.turn?.id);
  record("first_light_idb_projected", idb[0]?.id === "fl-first-char_fl" && idb[0]?.metadata?.conversationTurnId);
}

{
  clearAllConversations();
  idb.length = 0;
  const note = await writeCompanionSystemNote({
    text: "plugin system note",
    characterId: "char_sys",
    chatSessionId: "dm:char_sys",
    meta: { source: "phone_shell", kind: "system" },
    saveChatMessage,
  });
  const session = getSession(note.conversationSessionId);
  const history = session ? selectVisibleHistory(session) : [];
  record("system_note_v2", note.ok && history.some((t) => t.role === "system"));
  record("system_note_idb", idb[0]?.role === "system" && idb[0]?.metadata?.conversationTurnId);
}

{
  clearAllConversations();
  idb.length = 0;
  let called = false;
  const brokenSave = async () => {
    called = true;
    throw new Error("should_not_call_when_v2_fails");
  };
  // Force fail: missing character and chat session
  const fail = await writeCompanionTurn({
    role: "user",
    text: "orphan",
    saveChatMessage: brokenSave,
  });
  const refuseOk = !fail.ok
    && Boolean(fail.refusedIdbProjection)
    && !called
    && idb.length === 0
    && (fail.reason === "missing_companionId" || fail.reason === "missing_characterId");
  record(
    "v2_fail_refuses_idb",
    refuseOk,
    JSON.stringify({
      ok: fail.ok,
      refused: fail.refusedIdbProjection,
      called,
      idb: idb.length,
      reason: fail.reason,
    }),
  );
}

const allPass = cases.every((c) => c.pass);
writeFileSync(
  join(outDir, "VERIFY_WRITES.json"),
  `${JSON.stringify({ phase: "M0_M1", status: allPass ? "pass" : "fail", cases }, null, 2)}\n`,
);
console.log(allPass ? "\nMEMORY PIPELINE WRITES ALL PASS" : "\nMEMORY PIPELINE WRITES FAILED");
process.exit(allPass ? 0 : 1);
