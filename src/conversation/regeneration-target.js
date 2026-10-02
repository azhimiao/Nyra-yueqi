import { getSession } from "./store.js";
import { selectVisibleHistory } from "./selectors.js";

/** Capture an existing answer without mutating its candidate or its projection. */
export function captureRegenerationTarget(sessionId, message = {}) {
  const session = getSession(sessionId);
  const rows = selectVisibleHistory(session);
  const nodeId = String(message.metadata?.conversationNodeId || message.metadata?.conversationTurnId || message.id || "");
  const answer = rows.find(row => row.id === nodeId || row.meta?.clientMessageId === message.id);
  if (!answer || answer.role !== "assistant") return { ok: false, reason: "regeneration_answer_not_found" };
  const branch = session.branches[session.activeBranchId];
  if (branch.headMessageId !== answer.id) return { ok: false, reason: "regeneration_requires_current_answer" };
  const user = rows.slice(0, rows.indexOf(answer)).findLast(row => row.role === "user");
  return { ok: true, target: Object.freeze({
    conversationSessionId: session.id, branchId: branch.id, messageId: answer.id,
    candidateId: answer.candidateId, content: answer.content,
    clientMessageId: String(answer.meta?.clientMessageId || message.id || answer.id),
    createdAt: message.createdAt || answer.createdAt,
    sourceUserMessageId: user?.id || "", sourceUserText: user?.content || "",
  }) };
}

/** Compare immediately before the synchronous V2 mutation; stale work may not replace newer turns. */
export function validateRegenerationTarget(target) {
  const session = getSession(target?.conversationSessionId);
  const branch = session?.branches?.[session.activeBranchId];
  const answer = selectVisibleHistory(session).find(row => row.id === target?.messageId);
  if (!target || !branch || branch.id !== target.branchId || branch.headMessageId !== target.messageId
    || !answer || answer.candidateId !== target.candidateId || answer.content !== target.content) {
    return { ok: false, reason: "regeneration_target_changed" };
  }
  const source = target.sourceUserMessageId
    ? selectVisibleHistory(session).find(row => row.id === target.sourceUserMessageId) : null;
  if (target.sourceUserMessageId && source?.content !== target.sourceUserText) {
    return { ok: false, reason: "regeneration_source_changed" };
  }
  return { ok: true };
}
