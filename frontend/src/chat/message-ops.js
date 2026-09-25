/**
 * Edit / delete a chat message, V2 first and projection second.
 *
 * Both shells expose the same three-dot menu, so the write path lives here
 * instead of being duplicated in `app.js` and `phone-shell.js`.
 */

import { deleteMessage, editMessageContent } from "../conversation/index.js";
import { invalidateChatMessageEvidence } from "./message-evidence-lifecycle.js";

/** Menu actions that mutate durable state, in display order. */
export const MESSAGE_MENU_ACTIONS = Object.freeze(["edit", "reply", "regenerate", "react", "delete"]);

export function resolveMessageSessionId(message, explicit) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return String(
    explicit || metadata.conversationSessionId || metadata.conversationId || "",
  ).trim();
}

export function resolveMessageNodeId(message) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return String(metadata.conversationNodeId || metadata.conversationTurnId || message?.id || "").trim();
}

function evidenceRefsForMutation(message, v2) {
  const refs = new Set([
    message?.id,
    resolveMessageNodeId(message),
    v2?.node?.id,
    v2?.node?.meta?.clientMessageId,
  ].map((value) => String(value || "").trim()).filter(Boolean));

  // Legacy relationship timeline rows used the assistant child id as the turn
  // source. When its parent user message is removed, revoke those rows too.
  if (message?.role === "user" && v2?.node?.id && v2?.value?.messageNodes) {
    for (const node of Object.values(v2.value.messageNodes)) {
      if (node?.parentMessageId !== v2.node.id) continue;
      refs.add(String(node.id || "").trim());
      const clientMessageId = String(node.meta?.clientMessageId || "").trim();
      if (clientMessageId) refs.add(clientMessageId);
    }
  }
  return [...refs].filter(Boolean);
}

async function invalidateMutationEvidence(message, sessionId, v2, reason) {
  return invalidateChatMessageEvidence({
    role: message?.role === "user" ? "user" : "assistant",
    evidenceRefs: evidenceRefsForMutation(message, v2),
    conversationSessionId: sessionId,
    characterId: v2?.value?.characterId || message?.characterId,
    sourceTexts: [message?.content, message?.text],
    reason,
  });
}

/**
 * Reasons that mean the message never reached the V2 graph rather than that the
 * write failed. Threads legitimately hold such bubbles: the seeded greeting is
 * rendered with `persist: false`, a failed turn leaves its notice in place
 * without committing, and rows projected before V2 existed carry no node id.
 * Refusing to act on them is what made delete and regenerate fail at random —
 * for these the projection is the only store there is to update.
 */
const V2_ABSENCE_REASONS = new Set([
  "conversation_session_required",
  "session_not_found",
  "message_not_found",
  "no_active_candidate",
]);

/** @param {{ ok?: boolean, reason?: string }} outcome */
export function isAbsentFromConversationV2(outcome) {
  if (outcome?.ok) return false;
  return V2_ABSENCE_REASONS.has(String(outcome?.reason || ""));
}

/**
 * Which menu entries a given message may show.
 * `isLastAssistant` gates regenerate: re-rolling a mid-thread reply would
 * silently invalidate everything said after it.
 * @param {{ role?: string, metadata?: object }} message
 * @param {{ isLastAssistant?: boolean, pending?: boolean }} [context]
 */
export function resolveMessageMenuActions(message = {}, context = {}) {
  // Always emit the menu chrome. Pending/failed bubbles still need a visible
  // ⋯; CSS hides edit/reply/regenerate/react until the send settles.
  const role = message.role === "user" ? "user" : "assistant";
  const actions = ["edit", "reply"];
  if (role === "assistant" && context.isLastAssistant) actions.push("regenerate");
  actions.push("react", "delete");
  return actions;
}

/**
 * @param {{
 *   message: object,
 *   text: string,
 *   conversationSessionId?: string,
 *   saveChatMessage?: (message: object) => Promise<object>,
 * }} input
 */
export async function applyMessageEdit(input = {}) {
  const message = input.message && typeof input.message === "object" ? input.message : null;
  if (!message?.id) return { ok: false, reason: "message_required" };
  const text = String(input.text ?? "");
  if (!text.trim()) return { ok: false, reason: "empty_text" };
  const sessionId = resolveMessageSessionId(message, input.conversationSessionId);

  const v2 = sessionId
    ? editMessageContent(sessionId, resolveMessageNodeId(message), text)
    : { ok: false, reason: "conversation_session_required" };
  if (!v2?.ok && !isAbsentFromConversationV2(v2)) {
    return { ok: false, reason: v2?.reason || "v2_edit_failed" };
  }
  const inV2 = Boolean(v2?.ok);
  let evidence = null;
  if (inV2) {
    evidence = await invalidateMutationEvidence(message, sessionId, v2, "message_edited");
  }
  if (typeof input.saveChatMessage !== "function") {
    // Absent from V2 and no projection to write: nothing would outlive the
    // repaint, so do not claim the edit was kept.
    if (!inV2) return { ok: false, reason: "no_writable_store" };
    return { ok: true, content: text, inV2, projected: false, evidence };
  }
  try {
    const projected = await input.saveChatMessage({
      ...message,
      content: text,
      metadata: { ...(message.metadata || {}), editedAt: new Date().toISOString() },
    });
    if (!inV2) {
      evidence = await invalidateMutationEvidence(message, sessionId, v2, "message_edited");
    }
    return { ok: true, content: text, inV2, projected: true, message: projected, evidence };
  } catch (error) {
    return { ok: false, reason: error?.message || "idb_projection_failed", v2Ok: inV2, content: text };
  }
}

/**
 * @param {{
 *   message: object,
 *   conversationSessionId?: string,
 *   deleteRecord?: (storeName: string, id: string) => Promise<unknown>,
 * }} input
 */
export async function applyMessageDelete(input = {}) {
  const message = input.message && typeof input.message === "object" ? input.message : null;
  if (!message?.id) return { ok: false, reason: "message_required" };
  const sessionId = resolveMessageSessionId(message, input.conversationSessionId);

  const v2 = sessionId
    ? deleteMessage(sessionId, resolveMessageNodeId(message))
    : { ok: false, reason: "conversation_session_required" };
  if (!v2?.ok && !isAbsentFromConversationV2(v2)) {
    return { ok: false, reason: v2?.reason || "v2_delete_failed" };
  }
  const inV2 = Boolean(v2?.ok);
  let evidence = null;
  if (inV2) {
    evidence = await invalidateMutationEvidence(message, sessionId, v2, "message_deleted");
  }
  if (typeof input.deleteRecord !== "function") {
    if (!inV2) return { ok: false, reason: "no_writable_store" };
    return { ok: true, inV2, projected: false, deletedAt: v2.deletedAt, evidence };
  }
  try {
    // Dropping a row that was never projected is a no-op, which is exactly the
    // outcome a UI-only bubble needs.
    await input.deleteRecord("messages", message.id);
    if (!inV2) {
      evidence = await invalidateMutationEvidence(message, sessionId, v2, "message_deleted");
    }
    return {
      ok: true,
      inV2,
      projected: true,
      deletedAt: v2?.deletedAt || new Date().toISOString(),
      evidence,
    };
  } catch (error) {
    return { ok: false, reason: error?.message || "idb_projection_failed", v2Ok: inV2 };
  }
}
