/**
 * First-spoken-turn must survive the real Pop order: write user → assemble.
 * Empty-history-only checks hide the bug because the current sentence is
 * already in Conversation V2 by the time assemblePrompt runs.
 *
 * Run: npm run verify:first-spoken-turn
 */
import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { isFirstSpokenTurn, splitTurnHistory } from "../src/prompt/first-spoken-turn.js";
import { buildModeContribution } from "../src/prompt/mode-contributions.js";

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = {
  localStorage: memStorage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  documentElement: { lang: "zh-CN", getAttribute: () => null, setAttribute() {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
};

memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({
  worldbook: false,
  memoryRag: true,
  external: false,
  temporalContextV1: false,
  relationshipContinuityV1: false,
  unifiedMemoryAdaptersV1: false,
  singleBrokerRetrievalV1: false,
}));

const {
  __setConversationStorageForTests,
  clearAllConversations,
} = await import("../src/conversation/index.js");
const { __setSessionMapStorageForTests } = await import("../src/context/session-map.js");
const { writeCompanionTurn } = await import("../src/conversation/companion-write.js");
const { assemblePrompt, buildModelMessages } = await import("../src/prompt/assemble.js");

__setConversationStorageForTests(memStorage);
__setSessionMapStorageForTests(memStorage);

const FIRST_TURN_MARK = /这是这段对话里用户的第一句/;
const POP_INVENTED_THREAD = /保留跨入口的同一角色身份、关系连续性与未完成事项/;

const firstSplit = splitTurnHistory(
  [{ role: "user", content: "你好，今天在干嘛呢" }],
  "你好，今天在干嘛呢",
);
assert.equal(firstSplit.priorMessages.length, 0, "current sentence is not prior chat");
assert.equal(firstSplit.currentAlreadyInHistory, true);
const secondSplit = splitTurnHistory(
  [
    { role: "user", content: "你好，今天在干嘛呢" },
    { role: "assistant", content: "在。" },
    { role: "user", content: "什么?" },
  ],
  "什么?",
);
assert.equal(secondSplit.priorMessages.length, 2);
assert.equal(secondSplit.priorMessages[0].content, "你好，今天在干嘛呢");

assert.equal(isFirstSpokenTurn([], "你好，今天在干嘛呢"), true, "empty history is first turn");
assert.equal(
  isFirstSpokenTurn([{ role: "user", content: "你好，今天在干嘛呢" }], "你好，今天在干嘛呢"),
  true,
  "write-then-assemble must not count the current sentence as prior chat",
);
assert.equal(
  isFirstSpokenTurn([{ role: "user", content: "  你好，今天在干嘛呢  " }], "你好，今天在干嘛呢"),
  true,
  "trailing current input comparison is trimmed",
);
assert.equal(
  isFirstSpokenTurn([{ role: "user", content: "上一句还没说完" }], "你好，今天在干嘛呢"),
  false,
  "a different earlier user line is prior chat",
);
assert.equal(
  isFirstSpokenTurn(
    [
      { role: "user", content: "你好，今天在干嘛呢" },
      { role: "assistant", content: "在等你问完那句之后的回答" },
      { role: "user", content: "什么?" },
    ],
    "什么?",
  ),
  false,
  "second user turn is not first spoken turn",
);
assert.equal(
  isFirstSpokenTurn(
    [
      { role: "user", content: "你好" },
      { role: "assistant", content: "在。" },
      { role: "user", content: "你好" },
    ],
    "你好",
  ),
  false,
  "repeating the same words later is still not the first turn",
);
assert.equal(
  isFirstSpokenTurn([{ role: "user", content: "你好，今天在干嘛呢" }], ""),
  true,
  "continue/regenerate of the opening user line stays first spoken turn",
);
assert.equal(
  isFirstSpokenTurn(
    [
      { role: "user", content: "你好，今天在干嘛呢" },
      { role: "assistant", content: "思考中" },
    ],
    "你好，今天在干嘛呢",
  ),
  true,
  "a trailing assistant row after the current user line is not prior chat",
);
assert.equal(
  isFirstSpokenTurn(
    [
      { role: "user", content: "上一句" },
      { role: "assistant", content: "嗯" },
      { role: "user", content: "你好" },
      { role: "assistant", content: "思考中" },
    ],
    "你好",
  ),
  false,
  "a real earlier user line remains prior chat even with a trailing assistant",
);
assert.equal(
  isFirstSpokenTurn(
    [
      { role: "user", content: "你好" },
      { role: "assistant", content: "在。" },
      { role: "user", content: "下一句" },
    ],
    "",
  ),
  false,
  "continue after two user turns is not first spoken turn",
);

const firstPop = buildModeContribution("pop", { firstSpokenTurn: true }).text;
assert.match(firstPop, FIRST_TURN_MARK);
assert.doesNotMatch(firstPop, POP_INVENTED_THREAD);
const laterPop = buildModeContribution("pop", { firstSpokenTurn: false }).text;
assert.doesNotMatch(laterPop, FIRST_TURN_MARK);
assert.doesNotMatch(laterPop, POP_INVENTED_THREAD);
assert.doesNotMatch(laterPop, /未完成事项/);
assert.match(laterPop, /Pop 私密即时通讯/);

const companionId = "first-spoken-char";
const userId = "local";
const chatSessionId = `dm:${companionId}`;
const firstLine = "你好，今天在干嘛呢";

function relationshipText(compiled) {
  return String(
    (compiled?.canonical?.blocks || []).find((block) => block.id === "relationship_context")?.text || "",
  );
}

async function assembleTurn(query) {
  return assemblePrompt({
    query,
    refreshDailyStatus: async () => ({
      mood: "平静",
      weather: { label: "" },
      asleep: false,
      injectionEnabled: false,
    }),
    searchMemories: async () => [],
    searchPalace: async () => ({ results: [], skipped: true, backend: "test" }),
    getAllRecords: async () => [],
    characterRecord: { id: companionId, name: "平静", alias: "" },
    collectExternalContext: () => [],
    sessionId: chatSessionId,
    characterId: companionId,
    purpose: "chat",
    appId: "pop",
    turnIntent: "user_message",
  });
}

clearAllConversations();
const emptyCompiled = await assembleTurn(firstLine);
assert.match(relationshipText(emptyCompiled), FIRST_TURN_MARK, "empty-history assemble still gets first-turn protection");

await writeCompanionTurn({
  role: "user",
  text: firstLine,
  userId,
  companionId,
  chatSessionId,
  saveChatMessage: async (message) => message,
});
const afterWrite = await assembleTurn(firstLine);
const afterWriteText = relationshipText(afterWrite);
assert.equal(
  (afterWrite.historyMessages || []).some((item) => item.role === "user" && item.content === firstLine),
  true,
  "authoritative history already contains the just-written first sentence",
);
assert.match(
  afterWriteText,
  FIRST_TURN_MARK,
  "write-then-assemble must still treat the first sentence as the first spoken turn",
);
assert.doesNotMatch(afterWriteText, POP_INVENTED_THREAD);
assert.match(afterWriteText, /从这一句开场/);
const modelMessages = await buildModelMessages(afterWrite, firstLine, chatSessionId);
assert.equal(
  modelMessages.filter((item) => item.role === "user" && String(item.content || "").trim() === firstLine).length,
  1,
  "current sentence must appear once in the model request",
);

await writeCompanionTurn({
  role: "assistant",
  text: "在等你问完那句之后的回答",
  userId,
  companionId,
  chatSessionId,
  saveChatMessage: async (message) => message,
});
const secondLine = "什么?";
await writeCompanionTurn({
  role: "user",
  text: secondLine,
  userId,
  companionId,
  chatSessionId,
  saveChatMessage: async (message) => message,
});
const secondTurn = await assembleTurn(secondLine);
const secondText = relationshipText(secondTurn);
assert.doesNotMatch(secondText, FIRST_TURN_MARK, "a real second user turn is not first spoken");
assert.doesNotMatch(secondText, /未完成事项/, "later turns must not be told to continue invented unfinished plots");

console.log("verify-first-spoken-turn: PASS");
