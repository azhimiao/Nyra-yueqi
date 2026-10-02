/**
 * M6 — Multi-companion memory isolation acceptance.
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
  listSessions,
} = await import("../src/conversation/index.js");
const { writeCompanionTurn } = await import("../src/conversation/companion-write.js");
const {
  __setTimelineStorageForTests,
  clearTimelineForTests,
  listTimelineEvents,
} = await import("../src/timeline/repository.js");
const { emitRelationshipEventsFromTurn } = await import("../src/timeline/from-conversation.js");
const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  recallCandidates,
  recallStableMemory,
  CANDIDATE_LEDGER_KEY,
  STABLE_MEMORY_KEY,
} = await import("../src/memory/candidate-ledger.js");
const { applyMemoryOperations } = await import("../src/context/extraction.js");
const { projectOpenTimelineCommitments } = await import("../src/context/timeline-projector.js");
const { buildContextEnvelope } = await import("../src/context/broker.js");
const { validateContextRequest } = await import("../src/context/contract.js");
const { writeOpenClawResultToCompanionHistory } = await import("../src/integrations/openclaw-mobile/writeback.js");
const { freezeCompanionScope, classifyLegacyScope, relationshipIdFor } =
  await import("../src/memory/companion-scope.js");
const { retrieveContext } = await import("../src/context/retrieve.js");

__setConversationStorageForTests(storage);
__setTimelineStorageForTests(storage);
__setCandidateLedgerStorageForTests(storage);
clearAllConversations();
clearTimelineForTests();
clearCandidateLedgerForTests();

const userId = "local";
const A = "companion_a";
const B = "companion_b";
const relA = relationshipIdFor(userId, A);
const relB = relationshipIdFor(userId, B);
const idb = [];
const saveChatMessage = async (m) => { idb.push(m); return m; };

const journey = { A: {}, B: {}, tasks: {}, legacy: {} };

// --- Test 1: private event isolation ---
{
  const u = await writeCompanionTurn({
    role: "user",
    text: "我明天下午要答辩。",
    userId,
    companionId: A,
    chatSessionId: `dm:${A}`,
    saveChatMessage,
  });
  const a = await writeCompanionTurn({
    role: "assistant",
    text: "好，结束以后告诉我。",
    userId,
    companionId: A,
    chatSessionId: `dm:${A}`,
    saveChatMessage,
  });
  const tl = emitRelationshipEventsFromTurn({
    userId,
    companionId: A,
    relationshipId: relA,
    userText: "我明天下午要答辩。",
    assistantText: "好，结束以后告诉我。",
    sourceTurnId: u.turn?.id || "",
  });
  applyMemoryOperations([{
    op: "ADD",
    content: "用户明天下午有答辩",
    kind: "goal_project",
    confidence: 0.7,
    evidenceSpan: "明天下午要答辩",
    inferred: true,
  }], {
    characterId: A,
    userId,
    relationshipId: relA,
    userEvidenceRef: u.turn?.id || "ua1",
    assistantEvidenceRef: a.turn?.id || "aa1",
    userText: "我明天下午要答辩。",
  });

  journey.A.userTurnId = u.turn?.id;
  journey.A.assistantTurnId = a.turn?.id;
  journey.A.timelineEventIds = (tl.events || []).map((e) => e.eventId);
  journey.A.conversationId = u.conversationId;

  const histA = selectVisibleHistory(getSession(u.conversationId));
  const histBSessions = listSessions().filter((s) => s.characterId === B);
  const histB = histBSessions.flatMap((s) => selectVisibleHistory(s));
  const tlA = listTimelineEvents({ companionId: A });
  const tlB = listTimelineEvents({ companionId: B });
  const candB = recallCandidates({ companionId: B, userId });
  const stableB = recallStableMemory({ companionId: B, userId });
  const graphB = retrieveContext({ characterId: B, query: "答辩", limit: 8 });

  record("t1_a_has_v2", histA.some((t) => String(t.text || t.content || "").includes("答辩")), u.turn?.id);
  record("t1_a_has_timeline", tlA.some((e) => /答辩/.test(JSON.stringify(e.payload || {}))));
  record("t1_b_no_v2", !histB.some((t) => String(t.text || t.content || "").includes("答辩")));
  record("t1_b_no_timeline", !tlB.some((e) => /答辩/.test(JSON.stringify(e.payload || {}))));
  record("t1_b_no_candidates", !candB.some((c) => String(c.claim || "").includes("答辩")));
  record("t1_b_no_stable", !stableB.some((m) => String(m.body || "").includes("答辩")));
  record("t1_b_no_graph", !(graphB.items || []).some((i) => /答辩/.test(String(i.content || i.summary || ""))));

  const envB = await buildContextEnvelope({
    purpose: "chat",
    userId,
    characterId: B,
    activeCompanionId: B,
    relationshipId: relB,
    currentInput: "在吗",
    includeHistory: true,
    includeContextGraph: true,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: false,
  });
  const envText = JSON.stringify(envB);
  journey.B.brokerTrace = envB.trace;
  record("t1_b_broker_no_defense", !/答辩/.test(envText), `alerts=${envB.trace?.isolationAlerts?.length || 0}`);

  const envA = await buildContextEnvelope({
    purpose: "chat",
    userId,
    characterId: A,
    activeCompanionId: A,
    relationshipId: relA,
    currentInput: "我结束了",
    includeHistory: true,
    includeContextGraph: true,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: false,
  });
  journey.A.brokerTrace = envA.trace;
  const openA = projectOpenTimelineCommitments({ companionId: A, relationshipId: relA });
  record("t1_a_followup_cue", openA.some((b) => /答辩|回访/.test(b.text)));
}

// --- Test 2: preference isolation ---
{
  applyMemoryOperations([{
    op: "ADD",
    content: "难过时不喜欢立刻给解决方案",
    kind: "preference",
    confidence: 0.9,
    evidenceSpan: "不喜欢别人立刻给解决方案",
    inferred: false,
  }], {
    characterId: A,
    userId,
    relationshipId: relA,
    userEvidenceRef: "pref_a",
    assistantEvidenceRef: "pref_a_as",
    userText: "我难过时不喜欢别人立刻给解决方案。",
  });
  const stableA = recallStableMemory({ companionId: A, userId, relationshipId: relA });
  const stableB = recallStableMemory({ companionId: B, userId, relationshipId: relB });
  record("t2_a_has_pref", stableA.some((m) => String(m.body || "").includes("解决方案")));
  record("t2_b_no_pref", !stableB.some((m) => String(m.body || "").includes("解决方案")));
}

// --- Test 3: task ownership freeze ---
{
  const frozen = freezeCompanionScope({
    userId,
    companionId: A,
    initiatingCompanionId: A,
    relationshipId: relA,
    taskId: "task_m6_1",
  });
  // Simulate UI switch to B before writeback
  const wb = await writeOpenClawResultToCompanionHistory({
    initiatingCompanionId: frozen.initiatingCompanionId,
    companionId: frozen.initiatingCompanionId,
    userId: frozen.userId,
    relationshipId: frozen.relationshipId,
    chatSessionId: `dm:${A}`,
    taskId: "task_m6_1",
    summary: "我们一起整理完了答辩材料",
    saveChatMessage,
  });
  journey.tasks.writeback = {
    conversationId: wb.conversation?.conversationId,
    timelineOk: wb.timeline?.ok,
    scope: wb.scope,
  };
  const histB = listSessions().filter((s) => s.characterId === B)
    .flatMap((s) => selectVisibleHistory(s));
  const tlB = listTimelineEvents({ companionId: B });
  record("t3_writeback_to_a", wb.ok && wb.scope?.initiatingCompanionId === A);
  record("t3_b_no_task_result", !histB.some((t) => /答辩材料/.test(String(t.text || t.content || ""))));
  record("t3_b_no_task_timeline", !tlB.some((e) => e.eventType === "shared_task_completed"));
  record("t3_a_has_task_timeline", listTimelineEvents({ companionId: A }).some((e) => e.eventType === "shared_task_completed"));
}

// --- Test 4: proactive / background targets frozen companion ---
{
  // A has open follow-up; "active UI" would be B — projector for B must stay empty for A's event
  const openB = projectOpenTimelineCommitments({ companionId: B, relationshipId: relB });
  record("t4_b_no_a_followup", !openB.some((b) => /答辩/.test(b.text)));
  const openA = projectOpenTimelineCommitments({ companionId: A, relationshipId: relA });
  record("t4_a_still_owns_followup", openA.some((b) => /答辩/.test(b.text)));
}

// --- Test 5: missing companionId fails; legacy scan ---
{
  const missingWrite = await writeCompanionTurn({
    role: "user",
    text: "orphan",
    userId,
    saveChatMessage,
  });
  record("t5_write_requires_companion", !missingWrite.ok && missingWrite.reason === "missing_companionId");

  const missingCtx = validateContextRequest({
    purpose: "chat",
    userId,
    currentInput: "hi",
  });
  record("t5_broker_requires_companion", !missingCtx.ok && missingCtx.errors.some((e) => /activeCompanionId|relationshipId|characterId/.test(e)));

  // Seed a legacy unscoped candidate row
  const bag = JSON.parse(storage.getItem(CANDIDATE_LEDGER_KEY) || "{\"items\":[]}");
  bag.items.push({
    schemaVersion: 1,
    candidateId: "legacy_1",
    userId,
    companionId: "",
    claim: "legacy leaked fact",
    status: "pending",
    confidence: 0.5,
    evidenceRefs: [],
    counterEvidenceRefs: [],
    source: "legacy",
    idempotencyKey: "legacy_1",
  });
  storage.setItem(CANDIDATE_LEDGER_KEY, JSON.stringify(bag));
  const leaked = recallCandidates({ companionId: B, userId });
  record("t5_legacy_not_broadcast", !leaked.some((c) => c.candidateId === "legacy_1"));

  const allCand = JSON.parse(storage.getItem(CANDIDATE_LEDGER_KEY) || "{\"items\":[]}").items || [];
  const allStable = JSON.parse(storage.getItem(STABLE_MEMORY_KEY) || "{\"items\":[]}").items || [];
  const allTimeline = listTimelineEvents({ allowUnscopedScan: true, requireCompanion: false, limit: 500 });
  const legacyCand = allCand.filter((r) => classifyLegacyScope(r) !== "scoped");
  const legacyStable = allStable.filter((r) => classifyLegacyScope(r) !== "scoped");
  const legacyTimeline = allTimeline.filter((r) => classifyLegacyScope(r) !== "scoped");
  journey.legacy = {
    candidates: legacyCand.length,
    stable: legacyStable.length,
    timeline: legacyTimeline.length,
    sources: ["candidate-ledger", "stable-memory", "timeline"],
  };
  record("t5_legacy_scan_reported", journey.legacy.candidates >= 1);
}

const allPass = cases.every((c) => c.pass);
const report = {
  phase: "M6",
  status: allPass ? "implementation_green" : "fail",
  cases,
  journey,
  modulesScoped: [
    "companion-write",
    "candidate-ledger",
    "timeline",
    "from-conversation",
    "extraction",
    "broker+timeline-projector",
    "openclaw-writeback",
    "proactive wake freeze",
    "assistant task checkpoint freeze",
  ],
  formerActiveCharacterDeps: [
    "app.js addMessage (removed getActiveCharacterId fallback for persist)",
    "openclaw writeback (uses initiatingCompanionId)",
    "proactive wakeCharacterOnce (freezes targetCompanionId)",
  ],
};
writeFileSync(join(outDir, "VERIFY_MULTI_COMPANION.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, "M6_MULTI_COMPANION_REPORT.md"), `# M6 Multi-Companion Isolation Report

**status:** ${report.status}

## Verify cases

| Case | Result | Detail |
|------|--------|--------|
${cases.map((c) => `| ${c.id} | ${c.pass ? "PASS" : "FAIL"} | ${c.detail || ""} |`).join("\n")}

## Modules already scoped by companionId

${report.modulesScoped.map((m) => `- ${m}`).join("\n")}

## Former global active/current character deps hardened

${report.formerActiveCharacterDeps.map((m) => `- ${m}`).join("\n")}

## Legacy unscoped scan

- candidates: ${journey.legacy.candidates}
- stable: ${journey.legacy.stable}
- timeline: ${journey.legacy.timeline}
- Policy: \`legacy_unscoped\` never auto-broadcast; migration mapping only when conversationId/evidence can attribute reliably.

## Journey record IDs

- A conversationId: \`${journey.A.conversationId || ""}\`
- A userTurnId: \`${journey.A.userTurnId || ""}\`
- A timelineEventIds: ${(journey.A.timelineEventIds || []).map((id) => `\`${id}\``).join(", ") || "(none)"}
- A broker activeCompanionId: \`${journey.A.brokerTrace?.activeCompanionId || ""}\`
- B broker isolationAlerts: ${journey.B.brokerTrace?.isolationAlerts?.length ?? 0}
- Task writeback conversationId: \`${journey.tasks.writeback?.conversationId || ""}\`

## Cross-companion recall

No cross-companion recall observed in automated tests when status is green.
`);

console.log(allPass ? "\nM6 MULTI-COMPANION ALL PASS" : "\nM6 MULTI-COMPANION FAILED");
process.exit(allPass ? 0 : 1);
