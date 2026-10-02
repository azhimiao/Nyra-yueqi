import assert from "node:assert/strict";
import { test } from "node:test";
import { projectChatHistory } from "./chat-projection.js";

test("a V2 committed turn remains visible when the IDB mirror is missing", () => {
  const rows = [{ id: "v2-a", messageId: "v2-a", candidateId: "candidate-a", role: "assistant", content: "已提交回复", createdAt: "2026-09-27T00:00:00Z", meta: { clientMessageId: "ui-a", turnActivity: { innerState: "安心了一点" } } }];
  const result = projectChatHistory(rows, [], { sessionId: "dm:c", conversationSessionId: "v2-c" });
  assert.equal(result.messages[0].id, "ui-a");
  assert.equal(result.messages[0].content, "已提交回复");
  assert.equal(result.messages[0].metadata.turnActivity.innerState, "安心了一点");
  assert.deepEqual(result.repairs, result.messages);
  const again = projectChatHistory(rows, result.messages, { sessionId: "dm:c", conversationSessionId: "v2-c" });
  assert.equal(again.repairs.length, 0, "repair is idempotent and never appends a candidate");
});

test("active candidate replaces stale text/inner state, while delivery extras remain", () => {
  const old = [{ id: "ui-a", role: "assistant", content: "旧候选", createdAt: "2026-09-27T00:00:00Z", metadata: { conversationNodeId: "v2-a", conversationCandidateId: "old", turnActivity: { innerState: "旧心绪" }, reactions: { heart: ["user"] } } }, { id: "deleted", role: "user", content: "已从V2删除" }];
  const result = projectChatHistory([{ id: "v2-a", messageId: "v2-a", candidateId: "new", role: "assistant", content: "新候选", meta: {} }], old, { sessionId: "dm:c", conversationSessionId: "v2-c" });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].id, "ui-a");
  assert.equal(result.messages[0].content, "新候选");
  assert.equal(result.messages[0].metadata.turnActivity, undefined);
  assert.deepEqual(result.messages[0].metadata.reactions, { heart: ["user"] });
  assert.equal(result.repairs.length, 1);
  assert.equal(old[0].content, "旧候选", "projection leaves input and V2 untouched");
});

test("active candidate refreshes subjective affect even when visible text is unchanged", () => {
  const existing = [{
    id: "ui-a1", role: "assistant", content: "same reply", createdAt: "2026-01-01T00:00:02.000Z",
    metadata: { conversationCandidateId: "cand-1", characterAffect: { version: 1, feeling: "旧" } },
  }];
  const rows = [{
    id: "v2-a1", messageId: "v2-a1", role: "assistant", content: "same reply", createdAt: "2026-01-01T00:00:02.000Z",
    candidateId: "cand-1", meta: { characterAffect: { version: 1, feeling: "新" } },
  }];
  const projection = projectChatHistory(rows, existing, { sessionId: "s", conversationSessionId: "c" });
  assert.deepEqual(projection.messages[0].metadata.characterAffect, { version: 1, feeling: "新" });
  assert.equal(projection.repairs.length, 1);
});
