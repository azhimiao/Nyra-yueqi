/**
 * Manual turn → one lived memory. Run: node src/memory/session-summary.test.mjs
 */
import assert from "node:assert/strict";

import {
  __setConversationStorageForTests,
  appendAssistantCandidate,
  clearAllConversations,
  getOrCreateActiveSession,
  getSharedHistory,
  sendUser,
} from "../conversation/index.js";
import {
  buildChatRounds,
  buildTranscriptFromIds,
  collectMessageIdsForRounds,
  listRecentRoundsForSummary,
  parseConsolidatedMemoryJson,
  sanitizeTurnText,
  summarizeSelectedTurns,
  SESSION_SUMMARY_KIND,
  SESSION_SUMMARY_SOURCE,
  SESSION_SUMMARY_SOURCE_TYPE,
} from "./session-summary.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`PASS ${name}`);
  });
}

__setConversationStorageForTests(memoryStorage());
clearAllConversations();

await test("sanitize strips runtime and inner-state", () => {
  const raw = "今晚见。<yueqi-inner-state>心跳</yueqi-inner-state>好。<yueqi-runtime>{\"version\":1}</yueqi-runtime>";
  assert.equal(sanitizeTurnText(raw).includes("yueqi-runtime"), false);
  assert.equal(sanitizeTurnText(raw).includes("心跳"), false);
  assert.match(sanitizeTurnText(raw), /今晚见/);
});

await test("buildChatRounds pairs user+assistant like CogPrism", () => {
  const rounds = buildChatRounds([
    { role: "system", messageId: "s1", content: "note" },
    { role: "user", messageId: "u1", content: "hi" },
    { role: "assistant", messageId: "a1", content: "hey" },
    { role: "user", messageId: "u2", content: "later" },
  ]);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].lineStart, 1);
  assert.equal(rounds[0].lineEnd, 2);
  assert.equal(rounds[1].lineStart, 3);
  assert.equal(rounds[1].lineEnd, 3);
});

await test("parseConsolidatedMemoryJson reads CogPrism shape", () => {
  const parsed = parseConsolidatedMemoryJson('{"rawContent":"他们约了车站见面","importance":8,"rationale":"agreement"}');
  assert.equal(parsed.rawContent, "他们约了车站见面");
  assert.equal(parsed.importance, 8);
});

const session = getOrCreateActiveSession({ characterId: "char-summary-1" });
sendUser(session.id, "今晚车站见？");
appendAssistantCandidate(session.id, "好，我在夜雨里等你。");
sendUser(session.id, "别忘了带伞");
appendAssistantCandidate(session.id, "带了。你也小心路滑。");

await test("lists recent rounds from the one active conversation", () => {
  const model = listRecentRoundsForSummary("char-summary-1");
  assert.equal(model.sessionId, session.id);
  assert.equal(model.rounds.length, 2);
  assert.equal(model.rounds[0].ready, true);
  assert.match(model.rounds[0].userPreview, /车站/);
});

await test("other character sees no rounds", () => {
  const model = listRecentRoundsForSummary("char-other");
  assert.equal(model.rounds.length, 0);
});

await test("summarize writes one lived memory and leaves chat intact", async () => {
  const model = listRecentRoundsForSummary("char-summary-1");
  const before = getSharedHistory(session.id).length;
  const filed = [];
  const result = await summarizeSelectedTurns({
    characterId: "char-summary-1",
    roundKeys: model.rounds.map((round) => round.key),
    collectProviderConfig: () => ({
      baseUrl: "http://local.test",
      apiKey: "sk-test",
      model: "test-model",
    }),
    callModel: async () => ({
      content: JSON.stringify({
        rawContent: "他们约定今晚在车站见面，并提醒彼此带伞。",
        importance: 7,
        rationale: "plan",
      }),
    }),
    fileDrawer: async (record) => {
      filed.push(record);
      return { ...record, id: record.id };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(filed.length, 1);
  assert.equal(filed[0].source, SESSION_SUMMARY_SOURCE);
  assert.equal(filed[0].sourceType, SESSION_SUMMARY_SOURCE_TYPE);
  assert.equal(filed[0].sourceRef.kind, SESSION_SUMMARY_KIND);
  assert.equal(filed[0].companionId, "char-summary-1");
  assert.notEqual(filed[0].source, "character.history");
  assert.ok(Array.isArray(filed[0].sourceRef.messageIds));
  assert.equal(filed[0].sourceRef.messageIds.length >= 4, true);
  assert.equal(getSharedHistory(session.id).length, before);
});

await test("empty selection does not write", async () => {
  const result = await summarizeSelectedTurns({
    characterId: "char-summary-1",
    roundKeys: [],
    collectProviderConfig: () => ({ baseUrl: "x", apiKey: "y", model: "z" }),
    callModel: async () => ({ content: "{}" }),
    fileDrawer: async () => {
      throw new Error("should not write");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "EMPTY_SELECTION");
});

await test("missing provider does not write", async () => {
  const model = listRecentRoundsForSummary("char-summary-1");
  const result = await summarizeSelectedTurns({
    characterId: "char-summary-1",
    roundKeys: [model.rounds[0].key],
    collectProviderConfig: () => ({}),
    callModel: async () => ({ content: "{}" }),
    fileDrawer: async () => {
      throw new Error("should not write");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "PROVIDER_REQUIRED");
});

await test("transcript only includes selected message ids", () => {
  const model = listRecentRoundsForSummary("char-summary-1");
  const ids = collectMessageIdsForRounds(model, [model.rounds[0].key]);
  const transcript = buildTranscriptFromIds(model.lines, ids);
  assert.match(transcript, /USER \(human\):/);
  assert.match(transcript, /车站/);
  assert.equal(transcript.includes("带伞"), false);
});

console.log(`session-summary ${passed} PASS`);
