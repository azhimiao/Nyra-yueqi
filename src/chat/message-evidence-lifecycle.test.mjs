import assert from "node:assert/strict";

import {
  __setCandidateLedgerStorageForTests,
  promoteCandidateToStable,
  recallCandidates,
  recallStableMemory,
  submitCandidate,
} from "../memory/candidate-ledger.js";
import {
  __setContextStorageForTests,
  getItem,
  putItem,
} from "../context/store.js";
import {
  __setBranchSummaryStorageForTests,
  commitBranchSummary,
  getBranchSummary,
} from "../context/branch-summary.js";
import {
  __setTimelineStorageForTests,
  appendTimelineEvent,
  getTimelineEvent,
} from "../timeline/repository.js";
import { buildContextItem } from "../context/schema.js";
import {
  __resetDeletedMessageEvidenceRepairForTests,
  invalidateChatMessageEvidence,
  repairDeletedMessageEvidence,
} from "./message-evidence-lifecycle.js";
import {
  __setConversationStorageForTests,
  deleteMessage,
  getOrCreateActiveSession,
  getSharedHistory,
  sendUser,
} from "../conversation/index.js";
import { applyMessageDelete, applyMessageEdit } from "./message-ops.js";

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

const storage = memoryStorage();
__setCandidateLedgerStorageForTests(storage);
__setContextStorageForTests(storage);
__setBranchSummaryStorageForTests(storage);
__setTimelineStorageForTests(storage);
__setConversationStorageForTests(storage);

const userMessageId = "msg-user-delete-1";
const assistantMessageId = "msg-assistant-delete-1";
const companionId = "char-delete-test";
const conversationSessionId = "conv-delete-test";
const branchId = "branch-delete-test";

const submitted = submitCandidate({
  userId: "local",
  companionId,
  relationshipId: `local::${companionId}`,
  claim: "用户喜欢雨天散步",
  category: "preference",
  confidence: 0.95,
  userStated: true,
  evidenceRefs: [userMessageId, assistantMessageId],
  source: "explicit_user_directive",
  idempotencyKey: `delete-test:${userMessageId}`,
});
assert.equal(submitted.ok, true);
assert.equal(promoteCandidateToStable(submitted.value.candidateId).ok, true);

const graphItem = buildContextItem({
  content: "用户喜欢雨天散步",
  summary: "用户喜欢雨天散步",
  kind: "semantic",
  source: "candidate_promotion",
  sourceRef: userMessageId,
  evidenceRefs: [userMessageId, assistantMessageId],
  confidence: 0.95,
  characterId: companionId,
  workspaceId: companionId,
});
assert.equal(putItem(graphItem).ok, true);

assert.equal(commitBranchSummary({
  characterId: companionId,
  conversationSessionId,
  branchId,
  summary: "用户说自己喜欢雨天散步。",
  sourceMessages: [
    { messageId: userMessageId, role: "user", content: "我喜欢雨天散步" },
    { messageId: assistantMessageId, role: "assistant", content: "我记住了" },
  ],
}).ok, true);

const timeline = appendTimelineEvent({
  companionId,
  userId: "local",
  relationshipId: `local::${companionId}`,
  actor: "local",
  principal: "local",
  eventType: "user_remember_request",
  source: "conversation_turn",
  sourceId: assistantMessageId,
  evidenceRefs: [assistantMessageId],
  idempotencyKey: `delete-test-timeline:${assistantMessageId}`,
  payload: { summary: "用户喜欢雨天散步" },
});
assert.equal(timeline.ok, true);

const result = await invalidateChatMessageEvidence({
  role: "user",
  evidenceRefs: [userMessageId, assistantMessageId],
  conversationSessionId,
  reason: "message_deleted",
});
assert.equal(result.ok, true);
assert.equal(result.stableForgotten, 1);
assert.equal(result.candidatesForgotten, 1);
assert.equal(result.contextDeleted, 1);
assert.equal(result.branchSummariesInvalidated, 1);
assert.equal(result.timelineTombstoned, 1);

assert.equal(recallStableMemory({ companionId }).length, 0);
assert.equal(recallCandidates({
  companionId,
  includeStatuses: ["pending", "accepted"],
}).length, 0);
assert.equal(getItem(graphItem.id), null);
assert.equal(getBranchSummary({ characterId: companionId, conversationSessionId, branchId }), null);
assert.ok(getTimelineEvent({ eventId: timeline.value.eventId, includeTombstoned: true })?.tombstone);

// Integration guard: the shared message-menu operation must invoke the
// evidence cascade, not merely tombstone Conversation V2.
const wiredSession = getOrCreateActiveSession({ characterId: "char-wired-delete" });
const wiredMessage = sendUser(wiredSession.id, "请记住我喜欢海边", {
  clientMessageId: "ui-wired-delete",
});
assert.equal(wiredMessage.ok, true);
const wiredCandidate = submitCandidate({
  userId: "local",
  companionId: "char-wired-delete",
  claim: "用户喜欢海边",
  category: "preference",
  confidence: 0.95,
  userStated: true,
  evidenceRefs: [wiredMessage.node.id],
  source: "explicit_user_directive",
  idempotencyKey: `wired-delete:${wiredMessage.node.id}`,
});
assert.equal(wiredCandidate.ok, true);
assert.equal(promoteCandidateToStable(wiredCandidate.value.candidateId).ok, true);

const wiredDelete = await applyMessageDelete({
  message: {
    id: wiredMessage.node.id,
    role: "user",
    content: "请记住我喜欢海边",
    metadata: {
      conversationSessionId: wiredSession.id,
      conversationNodeId: wiredMessage.node.id,
    },
  },
  conversationSessionId: wiredSession.id,
});
assert.equal(wiredDelete.ok, true);
assert.equal(wiredDelete.evidence?.stableForgotten, 1);
assert.equal(recallStableMemory({ companionId: "char-wired-delete" }).length, 0);
assert.equal(
  getSharedHistory(wiredSession.id).some((row) => row.content.includes("喜欢海边")),
  false,
  "deleted text must leave prompt history",
);

const editedSession = getOrCreateActiveSession({ characterId: "char-wired-edit" });
const editedMessage = sendUser(editedSession.id, "我以前叫小雨", {
  clientMessageId: "ui-wired-edit",
});
assert.equal(editedMessage.ok, true);
const edited = await applyMessageEdit({
  message: {
    id: editedMessage.node.id,
    role: "user",
    content: "我以前叫小雨",
    metadata: {
      conversationSessionId: editedSession.id,
      conversationNodeId: editedMessage.node.id,
    },
  },
  text: "我现在叫小雪",
  conversationSessionId: editedSession.id,
});
assert.equal(edited.ok, true);
const editedHistory = getSharedHistory(editedSession.id).map((row) => row.content);
assert.equal(editedHistory.includes("我现在叫小雪"), true);
assert.equal(editedHistory.includes("我以前叫小雨"), false);

// Upgrade guard: repair stale memory left by a deletion performed by an older
// build that only tombstoned Conversation V2.
const legacySession = getOrCreateActiveSession({ characterId: "char-legacy-delete" });
const legacyMessage = sendUser(legacySession.id, "请记住我喜欢山茶花");
assert.equal(legacyMessage.ok, true);
const legacyCandidate = submitCandidate({
  userId: "local",
  companionId: "char-legacy-delete",
  claim: "用户喜欢山茶花",
  category: "preference",
  confidence: 0.95,
  userStated: true,
  evidenceRefs: [legacyMessage.node.id],
  source: "explicit_user_directive",
  idempotencyKey: `legacy-delete:${legacyMessage.node.id}`,
});
assert.equal(legacyCandidate.ok, true);
assert.equal(promoteCandidateToStable(legacyCandidate.value.candidateId).ok, true);
assert.equal(deleteMessage(legacySession.id, legacyMessage.node.id).ok, true);
assert.equal(recallStableMemory({ companionId: "char-legacy-delete" }).length, 1);

__resetDeletedMessageEvidenceRepairForTests();
const repaired = await repairDeletedMessageEvidence();
assert.equal(repaired.ok, true);
assert.ok(repaired.messagesRepaired >= 1);
assert.equal(recallStableMemory({ companionId: "char-legacy-delete" }).length, 0);

console.log("message-evidence-lifecycle.test: ok");
