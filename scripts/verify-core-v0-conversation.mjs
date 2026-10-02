/**
 * PAIOS V0.1 — Conversation Runtime contract checks.
 * Product spine for Pop chat + immersive scenario (not RC / evidence_green).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const requiredFiles = [
  "src/conversation/schema.js",
  "src/conversation/store.js",
  "src/conversation/runtime.js",
  "src/conversation/bridge-chat.js",
  "src/conversation/index.js",
  "docs/qa/paios/V0/RUNTIME.md",
  "docs/qa/paios/V0_PRODUCT_CORRECTION.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_STORE_KEY,
  CONVERSATION_MODES,
  __resetConversationIdSeqForTests,
  __setConversationStorageForTests,
  clearAllConversations,
  getConversationStoreKey,
  getSession,
  listSessions,
  getOrCreateActiveSession,
  appendUserTurn,
  appendAssistantTurn,
  enterImmersive,
  exitImmersive,
  getSharedHistory,
  rollbackTurn,
  replaceLastAssistant,
  turnToChatMessage,
  appendChatTurnBestEffort,
} = await import("../src/conversation/index.js");

__setConversationStorageForTests(memoryStorage());
clearAllConversations();
__resetConversationIdSeqForTests();

check("schema version 1", CONVERSATION_SCHEMA_VERSION === 1);
check(
  "store key yueqi.conversation.v1",
  getConversationStoreKey() === CONVERSATION_STORE_KEY && CONVERSATION_STORE_KEY === "yueqi.conversation.v1"
);
check("modes chat|immersive", CONVERSATION_MODES.includes("chat") && CONVERSATION_MODES.includes("immersive"));

// --- create session ---
const sessionA = getOrCreateActiveSession({ characterId: "xingli" });
check("create session has id", Boolean(sessionA?.id));
check("create session characterId", sessionA.characterId === "xingli");
check("create session mode chat", sessionA.mode === "chat");
check("create session empty turns", Array.isArray(sessionA.turns) && sessionA.turns.length === 0);

const same = getOrCreateActiveSession({ characterId: "xingli" });
check("getOrCreate reuses active", same.id === sessionA.id);

// --- chat turns ---
const u1 = appendUserTurn(sessionA.id, "今晚车站见？", { source: "test_chat" });
check("append user turn ok", u1.ok === true);
const a1 = appendAssistantTurn(sessionA.id, "好，我在夜雨里等你。", { pose: "greet" });
check("append assistant turn ok", a1.ok === true);
const afterChat = getSession(sessionA.id);
check("chat turns length 2", afterChat?.turns?.length === 2);
check("chat turn modes", afterChat.turns.every((t) => t.mode === "chat"));

// --- enter immersive + scenario turns ---
const entered = enterImmersive(sessionA.id, {
  scenarioId: "night-rain-station",
  runId: "run-test-1",
  loreEntryIds: ["lore-rain", "lore-station"],
});
check("enter immersive ok", entered.ok === true);
check("mode immersive", entered.value?.mode === "immersive");
check("scenarioRunId set", entered.value?.scenarioRunId === "run-test-1");
check("loreEntryIds set", JSON.stringify(entered.value?.loreEntryIds) === JSON.stringify(["lore-rain", "lore-station"]));

const u2 = appendUserTurn(sessionA.id, "靠近一点", { choiceId: "lean-in" });
const a2 = appendAssistantTurn(sessionA.id, "伞往你这边倾了倾。", {
  pose: "lean_in",
  choices: [{ id: "ask", text: "轻轻问一句" }],
  beatId: "beat-2",
  sources: ["lore-rain"],
});
check("immersive user turn", u2.ok && u2.turn?.mode === "immersive");
check("immersive assistant meta", a2.ok && a2.turn?.meta?.beatId === "beat-2");

// --- shared history includes both modes ---
const history = getSharedHistory(sessionA.id);
check("shared history length 4", history.length === 4);
check(
  "shared history modes mixed",
  history.filter((h) => h.mode === "chat").length === 2 &&
    history.filter((h) => h.mode === "immersive").length === 2
);
const limited = getSharedHistory(sessionA.id, { limit: 2 });
check("shared history limit", limited.length === 2 && limited[0].content.includes("靠近"));

// --- rollback ---
const rolled = rollbackTurn(sessionA.id);
check("rollback ok", rolled.ok === true);
check("rollback removed assistant", rolled.removed?.role === "assistant");
check("after rollback length 3", getSession(sessionA.id)?.turns?.length === 3);

const replaced = replaceLastAssistant(sessionA.id, "伞边的雨声更近了。", { regenerated: true });
// last after rollback is user turn — replaceLastAssistant should append
check("replace when last is user appends", replaced.ok === true);
check("after replace/append length 4", getSession(sessionA.id)?.turns?.length === 4);

const rolled2 = rollbackTurn(sessionA.id);
check("rollback again", rolled2.ok);
const replaced2 = replaceLastAssistant(sessionA.id, "（重生成）雨丝贴在玻璃上。", { regenerated: true });
// still user last — append again; then make assistant last and replace
appendAssistantTurn(sessionA.id, "旧回复", {});
const replaced3 = replaceLastAssistant(sessionA.id, "（重生成）雨丝贴在玻璃上。", { regenerated: true });
check("replace last assistant in place", replaced3.ok && replaced3.turn?.text.includes("重生成"));
check("replace keeps id", replaced3.turn?.id && !String(replaced3.turn.id).includes("undefined"));

// --- exit immersive keeps session ---
const exited = exitImmersive(sessionA.id);
check("exit immersive ok", exited.ok === true);
check("exit mode chat", exited.value?.mode === "chat");
check("exit clears runId", !exited.value?.scenarioRunId);
check("session still has history", (exited.value?.turns?.length || 0) >= 4);
const stillSame = getOrCreateActiveSession({ characterId: "xingli" });
check("exit keeps same session id", stillSame.id === sessionA.id);

// --- character isolation ---
const sessionB = getOrCreateActiveSession({ characterId: "other-char" });
check("other character new session", sessionB.id !== sessionA.id);
appendUserTurn(sessionB.id, "只有 B 能看见", {});
check("A history unchanged by B", getSharedHistory(sessionA.id).every((h) => h.content !== "只有 B 能看见"));
check("B history isolated", getSharedHistory(sessionB.id).length === 1);
check("list by character", listSessions({ characterId: "xingli" }).length === 1);

// --- bridge helpers ---
const mapped = turnToChatMessage({
  turn: getSession(sessionA.id).turns[0],
  conversationSessionId: sessionA.id,
  chatSessionId: "dm-xingli",
});
check("bridge maps role/content", mapped?.role === "user" && mapped?.sessionId === "dm-xingli");
check("bridge metadata conversationSessionId", mapped?.metadata?.conversationSessionId === sessionA.id);

const best = appendChatTurnBestEffort({
  characterId: "xingli",
  role: "user",
  text: "bridge best-effort",
  getOrCreateActiveSession,
  appendUserTurn,
  appendAssistantTurn,
});
check("bridge best-effort append", best.ok === true && best.turn?.meta?.mirroredToChat === true);

// --- player / chat wiring presence ---
const playerSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8")
);
check("player-ui imports conversation", playerSrc.includes("conversation/index.js"));
check("player-ui enterImmersive", playerSrc.includes("enterImmersive"));
check("player-ui appendUserTurn", playerSrc.includes("appendUserTurn"));
check("player-ui exitImmersive", playerSrc.includes("exitImmersive"));

const chatSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "src/panels/chat.js"), "utf8")
);
check("chat.js imports conversation", chatSrc.includes("conversation/index.js"));
check("chat.js mirror best-effort", chatSrc.includes("appendChatTurnBestEffort") || chatSrc.includes("mirrorToConversation"));

const execState = await import("node:fs").then((fs) =>
  fs.readFileSync(join(root, "docs/qa/paios/EXECUTION_STATE.md"), "utf8")
);
check("EXECUTION_STATE not RC", !/release_candidate(?!.*撤销)/.test(execState) || execState.includes("已撤销"));
check("EXECUTION_STATE Product RED", execState.includes("Product RED"));
check("EXECUTION_STATE V0.1 mention", /V0\.1|Conversation Runtime/.test(execState));

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
const score = `${passed}/${checks.length}`;
console.log("\n---");
console.log(`V0.1 Conversation Runtime score: ${score}`);
if (failed) {
  console.log("Failed:");
  for (const c of checks.filter((x) => !x.pass)) {
    console.log(`  - ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
  }
  process.exitCode = 1;
} else {
  console.log("All checks passed (Architecture Prototype wiring — not product RC).");
}
