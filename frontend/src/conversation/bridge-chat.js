/**
 * Bridge: Conversation Runtime V2 ↔ existing Pop chat DB (`saveChatMessage`).
 *
 * ## Mapping
 *
 * | Graph / projection            | Chat DB message (`messages` store)     |
 * |-------------------------------|----------------------------------------|
 * | node.id / turn.id             | message.id (when mirroring)            |
 * | role                          | message.role (`user` \| `assistant`)   |
 * | active candidate content      | message.content                        |
 * | createdAt                     | message.createdAt                      |
 * | mode                          | metadata.conversationMode              |
 * | session.id                    | metadata.conversationSessionId         |
 * | candidateId / branchId        | metadata.conversationMeta              |
 * | —                             | message.sessionId = Pop DM session id  |
 *
 * ## Ownership
 *
 * - **Immersive mode:** Conversation Runtime is source of truth.
 * - **Chat mode:** Write conversation first (or alongside), then mirror.
 *
 * Prefer `sendUser` / `appendAssistantCandidate` / `regenerate` from chat submit.
 */

import { resolveConversationBinding } from "../context/session-map.js";

/**
 * Build a `saveChatMessage` payload from a conversation turn / projection.
 * @param {{
 *   turn: { id?: string, role?: string, text?: string, content?: string, createdAt?: string, mode?: string, meta?: object },
 *   conversationSessionId: string,
 *   chatSessionId: string,
 * }} args
 */
export function turnToChatMessage({ turn, conversationSessionId, chatSessionId }) {
  if (!turn || !chatSessionId) return null;
  const role = turn.role === "assistant" ? "assistant" : turn.role === "system" ? "system" : "user";
  const turnMeta = turn.meta && typeof turn.meta === "object" ? { ...turn.meta } : {};
  return {
    id: turn.id,
    sessionId: String(chatSessionId),
    role,
    content: String(turn.text ?? turn.content ?? ""),
    createdAt: turn.createdAt || new Date().toISOString(),
    metadata: {
      ...turnMeta,
      conversationSessionId: String(conversationSessionId || ""),
      conversationTurnId: String(turn.id || ""),
      conversationMode: turn.mode || "chat",
      conversationMeta: turnMeta,
      source: turnMeta.source || "conversation_runtime",
    },
  };
}

/**
 * Sync one conversation turn into the existing chat DB (best-effort).
 * @param {{
 *   turn: object,
 *   conversationSessionId: string,
 *   chatSessionId: string,
 *   saveChatMessage: (msg: object) => Promise<object>|object,
 * }} args
 */
export async function mirrorTurnToChat({
  turn,
  conversationSessionId,
  chatSessionId,
  saveChatMessage,
}) {
  if (!turn) return { ok: false, reason: "missing_turn" };
  if (!chatSessionId) return { ok: false, reason: "missing_chatSessionId" };
  if (typeof saveChatMessage !== "function") return { ok: false, reason: "missing_saveChatMessage" };
  if (turn.meta?.mirroredToChat) return { ok: true, skipped: true, reason: "already_mirrored" };

  const payload = turnToChatMessage({ turn, conversationSessionId, chatSessionId });
  if (!payload) return { ok: false, reason: "build_failed" };

  try {
    const message = await saveChatMessage(payload);
    return { ok: true, message };
  } catch (error) {
    return { ok: false, reason: error?.message || "save_failed" };
  }
}

/**
 * Best-effort: append a chat-mode turn to Conversation V2 without throwing.
 * Uses chatSessionId → Conversation V2 mapping so group chats never write into a member DM.
 * @param {{
 *   characterId: string,
 *   chatSessionId?: string,
 *   conversationKind?: "dm"|"group"|"scenario"|"project",
 *   participantIds?: string[],
 *   role: "user"|"assistant",
 *   text: string,
 *   meta?: Record<string, unknown>,
 *   getOrCreateActiveSession: (opts: { characterId: string }) => object,
 *   appendUserTurn?: (id: string, text: string, meta?: object) => object,
 *   appendAssistantTurn?: (id: string, text: string, meta?: object) => object,
 *   sendUser?: (id: string, text: string, meta?: object) => object,
 *   appendAssistantCandidate?: (id: string, text: string, meta?: object) => object,
 * }} args
 */
export function appendChatTurnBestEffort({
  characterId,
  chatSessionId = "",
  conversationKind,
  participantIds = [],
  role,
  text,
  meta = {},
  getOrCreateActiveSession,
  appendUserTurn,
  appendAssistantTurn,
  sendUser,
  appendAssistantCandidate,
}) {
  try {
    const cid = String(characterId || "").trim();
    if (!cid && !chatSessionId) return { ok: false, reason: "missing_characterId" };
    let sessionId = "";
    const sid = String(chatSessionId || meta?.legacySessionId || "").trim();
    if (sid) {
      const binding = resolveConversationBinding({
        chatSessionId: sid,
        characterId: cid,
        conversationKind,
        participantIds,
      });
      if (!binding.ok || !binding.conversationSessionId) {
        return { ok: false, reason: binding.error || "binding_failed" };
      }
      sessionId = binding.conversationSessionId;
    } else {
      const session = getOrCreateActiveSession({ characterId: cid });
      if (!session?.id) return { ok: false, reason: "no_session" };
      sessionId = session.id;
    }
    const payloadMeta = {
      ...(meta && typeof meta === "object" ? meta : {}),
      // R2: Conversation V2 is written first; chat IDB is a projection (do not claim mirrored yet).
      source: meta?.source || "pop_chat",
      chatSessionId: sid || undefined,
    };
    const userFn = sendUser || appendUserTurn;
    const asstFn = appendAssistantCandidate || appendAssistantTurn;
    if (role === "assistant") {
      if (typeof asstFn !== "function") return { ok: false, reason: "missing_append_assistant" };
      return asstFn(sessionId, text, payloadMeta);
    }
    if (typeof userFn !== "function") return { ok: false, reason: "missing_append_user" };
    return userFn(sessionId, text, payloadMeta);
  } catch (error) {
    return { ok: false, reason: error?.message || "append_failed" };
  }
}

/**
 * Best-effort regenerate (add candidate, keep old) for Pop chat hooks.
 */
export function regenerateChatBestEffort({
  characterId,
  chatSessionId = "",
  conversationKind,
  participantIds = [],
  text,
  meta = {},
  getOrCreateActiveSession,
  regenerate,
}) {
  try {
    const cid = String(characterId || "").trim();
    if (!cid && !chatSessionId) return { ok: false, reason: "missing_characterId" };
    if (typeof regenerate !== "function") return { ok: false, reason: "missing_regenerate" };
    let sessionId = "";
    const sid = String(chatSessionId || meta?.legacySessionId || "").trim();
    if (sid) {
      const binding = resolveConversationBinding({
        chatSessionId: sid,
        characterId: cid,
        conversationKind,
        participantIds,
      });
      if (!binding.ok || !binding.conversationSessionId) {
        return { ok: false, reason: binding.error || "binding_failed" };
      }
      sessionId = binding.conversationSessionId;
    } else {
      const session = getOrCreateActiveSession({ characterId: cid });
      if (!session?.id) return { ok: false, reason: "no_session" };
      sessionId = session.id;
    }
    return regenerate(sessionId, text, {
      ...(meta && typeof meta === "object" ? meta : {}),
      source: "pop_chat_regenerate",
      chatSessionId: sid || undefined,
    });
  } catch (error) {
    return { ok: false, reason: error?.message || "regenerate_failed" };
  }
}
