/**
 * CP-9 Companion — relationship planning + memory consolidation layers.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPANION_LAYER_DOCS,
  COMPANION_LAYER_IDS,
  describeCompanionLayer,
  detectImportantEvent,
  formatConsolidatedPromptBlock,
  isOperationalAgentPayload,
  onCompanionChatTurn,
  onCompanionImportantEvent,
  onCompanionSessionEnd,
  planRelationship,
  consolidateSessionMemory,
} from "../../src/companion/runtime-layers.js";
import {
  __clearRelationshipForTests,
  __resetRelationshipIdSeqForTests,
  __setRelationshipStorageForTests,
  getRelationshipState,
} from "../../src/experience/relationship.js";
import { __setContextStorageForTests, clearAllContextItems } from "../../src/context/store.js";
import {
  __clearConsolidationForTests,
  __setConsolidationBagForTests,
} from "../../src/companion/memory-consolidator.js";
import { __resetCompanionSessionHooksForTests } from "../../src/companion/session-hooks.js";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

console.log("=== CP-9 Layer docs ===");
assert(describeCompanionLayer(COMPANION_LAYER_IDS.IMMEDIATE)?.label, "immediate layer doc");
assert(describeCompanionLayer(COMPANION_LAYER_IDS.RELATIONSHIP)?.triggers?.length, "relationship triggers");
assert(describeCompanionLayer(COMPANION_LAYER_IDS.MEMORY)?.excludes?.length, "memory excludes full chat");
assert(Object.keys(COMPANION_LAYER_DOCS).length === 3, "three layers exported");

console.log("=== CP-9 Operational agent boundary ===");
assert(isOperationalAgentPayload({ source: "openclaw-tool-log" }), "reject openclaw");
assert(isOperationalAgentPayload({ agentTaskId: "t1" }), "reject agent task");
assert(!isOperationalAgentPayload({ source: "pop_chat" }), "allow pop chat");

console.log("=== CP-9 Important event detection ===");
{
  const conflict = detectImportantEvent({ userText: "你怎么又这样，我生气了" });
  assert(conflict.type === "conflict", "detect conflict");
  const mundane = detectImportantEvent({ userText: "今天天气不错" });
  assert(!mundane.type, "skip mundane");
  const promise = detectImportantEvent({ userText: "我们约定下周一起去看展" });
  assert(promise.type === "promise", "detect promise");
  const offline = detectImportantEvent({ meta: { offlineReturn: true }, userText: "嗨" });
  assert(offline.type === "offline_return", "offline return meta");
}

console.log("=== CP-9 Relationship planner ===");
__clearRelationshipForTests();
__resetRelationshipIdSeqForTests();
__setRelationshipStorageForTests(makeMemoryStorage());
{
  const plan = planRelationship({
    characterId: "char-a",
    sessionId: "sess-1",
    userText: "我们纪念日快乐，真的很感动",
    apply: true,
  });
  assert(plan.ok && plan.eventType === "anniversary", "anniversary plan");
  assert(plan.relationshipDelta?.intimacyDelta > 0, "positive intimacy delta");
  assert(Array.isArray(plan.goals) && plan.goals.length, "goals present");
  assert(Array.isArray(plan.proactiveCandidates) && plan.proactiveCandidates.length, "proactive candidates");
  assert(plan.diaryHint, "diary hint");
  assert(plan.applied === true, "relationship applied");
  const state = getRelationshipState("char-a");
  assert(state.intimacy > 0, "relationship state updated");
}

console.log("=== CP-9 Memory consolidator ===");
clearAllContextItems();
__clearConsolidationForTests();
__setContextStorageForTests(makeMemoryStorage());
__setConsolidationBagForTests({ sessions: {} });
{
  const messages = [
    { role: "user", content: "我喜欢喝燕麦拿铁，记住这个偏好" },
    { role: "assistant", content: "好，我记住了。" },
    { role: "user", content: "今天我们一起完成了小目标" },
    { role: "assistant", content: "嗯，很有意义。" },
  ];
  const result = consolidateSessionMemory({
    characterId: "char-a",
    sessionId: "sess-1",
    messages,
    ingest: true,
  });
  assert(result.ok, "consolidation ok");
  assert(result.facts.length >= 1, "facts extracted");
  assert(result.summary && result.summary.length < 2000, "compact summary");
  assert(!result.summary.includes(messages[0].content.repeat(2)), "not full chat dump");
  const block = formatConsolidatedPromptBlock(result.summary);
  assert(block.includes("摘要"), "prompt block labeled summary");
  assert(!block.includes("assistant") && !/\{role:/.test(block), "no raw message dump");
}

console.log("=== CP-9 Session hooks (not every message) ===");
__resetCompanionSessionHooksForTests();
__clearRelationshipForTests();
__setRelationshipStorageForTests(makeMemoryStorage());
{
  const mundane = onCompanionChatTurn({
    characterId: "char-b",
    sessionId: "sess-2",
    userText: "嗯",
    assistantText: "好",
  });
  assert(mundane.ok && !mundane.importantPlan, "mundane turn skips planner output");

  const emotional = onCompanionChatTurn({
    characterId: "char-b",
    sessionId: "sess-2",
    userText: "我真的好感动，谢谢你一直陪着我",
    assistantText: "我也是",
  });
  assert(emotional.importantPlan?.eventType === "strong_emotion", "important turn plans");

  const end = onCompanionSessionEnd({
    characterId: "char-b",
    sessionId: "sess-2",
    messages: [
      { role: "user", content: "我喜欢夜跑" },
      { role: "assistant", content: "记住了" },
    ],
    ingest: true,
  });
  assert(end.ok && end.summary, "session end consolidates");

  const explicit = onCompanionImportantEvent({
    characterId: "char-b",
    sessionId: "sess-3",
    eventType: "promise",
    userText: "答应我下次早点睡",
    apply: true,
  });
  assert(explicit.eventType === "promise", "explicit important event");
}

console.log("=== CP-9 Source wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const chat = readFileSync(join(root, "src/panels/chat.js"), "utf8");
  const phone = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  assert(chat.includes("onCompanionChatTurn"), "chat panel hooks companion turn");
  assert(phone.includes("onCompanionSessionEnd"), "phone shell hooks session end");
  assert(!chat.includes("OpenClawMobileRuntimeAdapter"), "chat does not wire openclaw");
  assert(!phone.includes("OpenClawMobileRuntimeAdapter"), "phone does not wire openclaw");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-9 companion verify PASSED");
