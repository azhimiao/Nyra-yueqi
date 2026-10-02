import { updateMessageMeta } from "../conversation/index.js";
import {
  isAbsentFromConversationV2,
  resolveMessageNodeId,
  resolveMessageSessionId,
} from "./message-ops.js";

export const MESSAGE_REACTIONS = Object.freeze(["❤️", "👍", "😂", "🥺"]);

function cleanReactionActors(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

export function normalizeMessageState(metadata = {}) {
  const source = metadata?.messageState && typeof metadata.messageState === "object"
    ? metadata.messageState
    : {};
  const reactions = {};
  for (const [emoji, actors] of Object.entries(source.reactions || {})) {
    const clean = cleanReactionActors(actors);
    if (clean.length) reactions[String(emoji)] = clean;
  }
  return {
    recalledAt: String(source.recalledAt || ""),
    readAt: String(source.readAt || ""),
    reactions,
  };
}

export function resolveReplyPreview(metadata = {}) {
  const reply = metadata?.replyTo;
  if (!reply || typeof reply !== "object") return null;
  const messageId = String(reply.messageId || "").trim();
  const text = String(reply.text || "").trim();
  if (!messageId || !text) return null;
  return {
    messageId,
    role: reply.role === "user" ? "user" : "assistant",
    text: text.slice(0, 180),
  };
}

export function toggleMessageReaction(metadata = {}, emoji, actorId = "local") {
  const state = normalizeMessageState(metadata);
  const key = MESSAGE_REACTIONS.includes(emoji) ? emoji : MESSAGE_REACTIONS[0];
  const actor = String(actorId || "local");
  const actors = new Set(state.reactions[key] || []);
  if (actors.has(actor)) actors.delete(actor);
  else actors.add(actor);
  if (actors.size) state.reactions[key] = [...actors];
  else delete state.reactions[key];
  return state;
}

export function recallMessageState(metadata = {}, at = new Date().toISOString()) {
  return { ...normalizeMessageState(metadata), recalledAt: String(at) };
}

export function markMessageReadState(metadata = {}, at = new Date().toISOString()) {
  const state = normalizeMessageState(metadata);
  if (state.readAt) return state;
  return { ...state, readAt: String(at) };
}

/**
 * V2-first mutation followed by an IDB projection update.
 * @param {{
 *   message: object,
 *   messageState: object,
 *   conversationSessionId?: string,
 *   saveChatMessage: (message: object) => Promise<object>,
 * }} input
 */
export async function persistMessageState(input = {}) {
  const message = input.message && typeof input.message === "object" ? input.message : null;
  if (!message?.id) return { ok: false, reason: "message_required" };
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const sessionId = resolveMessageSessionId(message, input.conversationSessionId);
  const state = normalizeMessageState({ messageState: input.messageState });
  const v2 = sessionId
    ? updateMessageMeta(sessionId, resolveMessageNodeId(message), { messageState: state })
    : { ok: false, reason: "conversation_session_required" };
  if (!v2?.ok && !isAbsentFromConversationV2(v2)) {
    return { ok: false, reason: v2?.reason || "v2_update_failed" };
  }
  const inV2 = Boolean(v2?.ok);
  if (typeof input.saveChatMessage !== "function") {
    if (!inV2) return { ok: false, reason: "no_writable_store" };
    return { ok: true, messageState: state, inV2, projected: false, node: v2.node };
  }
  try {
    const projected = await input.saveChatMessage({
      ...message,
      metadata: { ...metadata, messageState: state },
    });
    return { ok: true, messageState: state, inV2, projected: true, message: projected, node: v2?.node };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "idb_projection_failed",
      v2Ok: inV2,
      messageState: state,
    };
  }
}
