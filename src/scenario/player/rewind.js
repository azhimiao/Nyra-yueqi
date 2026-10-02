/**
 * Scenario rewind — match tavern delete-last / VN truncate, not "leave opening".
 *
 * Opening-only (single assistant greeting) → leave the stage.
 * Last exchange is user + assistant → drop both (one play turn).
 * Otherwise drop the last visible message.
 */

import { getSession, rollbackHead, selectVisibleHistory } from "../../conversation/index.js";

/**
 * @param {Array<{ role?: string }>} history
 * @returns {{ kind: "leave"|"drop-turn"|"drop-one", count: number }}
 */
export function planScenarioRewind(history) {
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) return { kind: "leave", count: 0 };
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  if (rows.length === 1 && last?.role === "assistant") {
    return { kind: "leave", count: 0 };
  }
  if (last?.role === "assistant" && prev?.role === "user") {
    return { kind: "drop-turn", count: 2 };
  }
  return { kind: "drop-one", count: 1 };
}

/**
 * Move the active branch head back one play step.
 * @param {string} sessionId
 * @returns {{ ok: boolean, leave?: boolean, dropped?: number, reason?: string }}
 */
export function rewindScenarioConversation(sessionId) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const plan = planScenarioRewind(selectVisibleHistory(session));
  if (plan.kind === "leave") return { ok: true, leave: true, dropped: 0 };
  for (let i = 0; i < plan.count; i += 1) {
    const result = rollbackHead(sessionId);
    if (!result.ok) return { ok: false, reason: result.reason || "rollback_failed" };
  }
  return { ok: true, leave: false, dropped: plan.count };
}

/**
 * Truncate from a message (inclusive) — VN/story "删除以下".
 * @param {string} sessionId
 * @param {string} messageId
 */
export function rewindFromMessage(sessionId, messageId) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = session.messageNodes?.[String(messageId || "")];
  if (!node) return { ok: false, reason: "message_not_found" };
  return rollbackHead(sessionId, node.parentMessageId || "");
}
