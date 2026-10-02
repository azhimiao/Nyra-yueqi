/**
 * Memory Pipeline M5 — golden journey: one character spine.
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

const {
  __setConversationStorageForTests,
  clearAllConversations,
  getSession,
  selectVisibleHistory,
} = await import("../src/conversation/index.js");
const { writeCompanionTurn, writeCompanionSystemNote } =
  await import("../src/conversation/companion-write.js");
const { __setTimelineStorageForTests, clearTimelineForTests, listTimelineEvents } =
  await import("../src/timeline/repository.js");
const { emitRelationshipEventsFromTurn } = await import("../src/timeline/from-conversation.js");
const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  recallCandidates,
  recallStableMemory,
} = await import("../src/memory/candidate-ledger.js");
const { applyMemoryOperations } = await import("../src/context/extraction.js");
const { projectOpenTimelineCommitments } = await import("../src/context/timeline-projector.js");
const { routeUserInput } = await import("../src/agent-orchestrator/index.js");

__setConversationStorageForTests(storage);
__setTimelineStorageForTests(storage);
__setCandidateLedgerStorageForTests(storage);
clearAllConversations();
clearTimelineForTests();
clearCandidateLedgerForTests();

const characterId = "char_golden";
const chatSessionId = `dm:${characterId}`;
const idb = [];
const saveChatMessage = async (m) => { idb.push(m); return m; };

// 1) First Light opening
const opening = await writeCompanionTurn({
  role: "assistant",
  text: "我是你的新同伴，从今天开始陪着你。",
  characterId,
  chatSessionId,
  messageId: `fl-first-${characterId}`,
  meta: { source: "first_light_init", kind: "first_light_opening" },
  saveChatMessage,
});
record("fl_opening_v2", opening.ok);

// 2) User: tomorrow defense
const user1 = await writeCompanionTurn({
  role: "user",
  text: "我明天下午答辩，好紧张。",
  characterId,
  chatSessionId,
  saveChatMessage,
});
const asst1 = await writeCompanionTurn({
  role: "assistant",
  text: "我记住了，明天结束以后告诉我。",
  characterId,
  chatSessionId,
  saveChatMessage,
});
emitRelationshipEventsFromTurn({
  companionId: characterId,
  userId: "local",
  userText: "我明天下午答辩，好紧张。",
  assistantText: "我记住了，明天结束以后告诉我。",
  sourceTurnId: user1.turn?.id || "",
});
applyMemoryOperations([{
  op: "ADD",
  content: "用户面对答辩时容易紧张",
  kind: "semantic",
  confidence: 0.6,
  evidenceSpan: "好紧张",
  inferred: true,
}], {
  characterId,
  userEvidenceRef: user1.turn?.id || "u1",
  assistantEvidenceRef: asst1.turn?.id || "a1",
  userText: "我明天下午答辩，好紧张。",
});
record("turn_in_v2", user1.ok && asst1.ok);
record("timeline_schedule", listTimelineEvents({ companionId: characterId }).some((e) => e.eventType === "schedule_commitment"));
record("candidate_inferred", recallCandidates({ companionId: characterId }).some((c) => c.claim.includes("紧张")));

// 3) Next turn cue for broker projector
const openBlocks = projectOpenTimelineCommitments({ companionId: characterId });
record("broker_followup_cue", openBlocks.some((b) => /答辩|回访/.test(b.text)));

// 4) Preference correction → stable
applyMemoryOperations([{
  op: "ADD",
  content: "不喜欢空洞的加油式鼓励",
  kind: "preference",
  confidence: 0.92,
  evidenceSpan: "不要再说加油",
  inferred: false,
}], {
  characterId,
  userEvidenceRef: "u_pref",
  assistantEvidenceRef: "a_pref",
  userText: "不要再说加油",
});
record("preference_stable", recallStableMemory({ companionId: characterId }).some((m) => String(m.body || "").includes("加油")));

// 5) Phone system note
const sys = await writeCompanionSystemNote({
  text: "插件：已同步日历提醒",
  characterId,
  chatSessionId,
  saveChatMessage,
});
const session = getSession(sys.conversationSessionId || opening.conversationSessionId);
const history = session ? selectVisibleHistory(session) : [];
record("system_in_v2", sys.ok && history.some((t) => t.role === "system"));

record("love_not_openclaw", routeUserInput({ text: "你还记得我明天要答辩吗？" }).route === "companion_chat");

const allPass = cases.every((c) => c.pass);
const verdict = {
  phase: "M5",
  status: allPass ? "implementation_green" : "fail",
  cases,
  pipeline: "Character→V2→Timeline→candidate-ledger→Stable/Graph→Broker",
};
writeFileSync(join(outDir, "VERIFY_GOLDEN.json"), `${JSON.stringify(verdict, null, 2)}\n`);
writeFileSync(join(outDir, "M5_REPORT.md"), `# Memory Pipeline Golden Journey

**status:** ${verdict.status}

| Step | Result |
|------|--------|
${cases.map((c) => `| ${c.id} | ${c.pass ? "PASS" : "FAIL"} |`).join("\n")}

## Pipeline

Character Block → Conversation V2 → Relationship Timeline → candidate-ledger → Stable/Graph → Context Broker

OpenClaw remains task writeback only.
`);
console.log(allPass ? "\nM5 GOLDEN ALL PASS" : "\nM5 GOLDEN FAILED");
process.exit(allPass ? 0 : 1);
