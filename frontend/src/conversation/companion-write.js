/**
 * Sole companion transcript write gate (Memory Pipeline M0 + M6 scope).
 * Conversation V2 first; IDB messages are projections only.
 * Refuse IDB-only success when V2 fails. Require frozen companionId — no UI active fallback.
 */

import { resolveConversationBinding } from "../context/session-map.js";
import { freezeCompanionScope, requireCompanionScope } from "../memory/companion-scope.js";
import {
  appendAssistantCandidate,
  appendSystemNote,
  getOrCreateActiveSession,
  sendUser,
} from "./runtime.js";
import { mirrorTurnToChat } from "./bridge-chat.js";

/**
 * Resolve Conversation V2 session id from character + optional chat session binding.
 * @param {{
 *   characterId?: string,
 *   companionId?: string,
 *   chatSessionId?: string,
 *   conversationKind?: "dm"|"group"|"scenario"|"project",
 *   participantIds?: string[],
 * }} input
 */
export function resolveCompanionConversationSession(input = {}) {
  const characterId = String(input.companionId || input.characterId || "").trim();
  const chatSessionId = String(input.chatSessionId || "").trim();
  if (!characterId) return { ok: false, reason: "missing_companionId" };
  if (chatSessionId) {
    const binding = resolveConversationBinding({
      chatSessionId,
      characterId,
      conversationKind: input.conversationKind,
      participantIds: input.participantIds || [],
    });
    if (!binding.ok || !binding.conversationSessionId) {
      return { ok: false, reason: binding.error || "binding_failed" };
    }
    return {
      ok: true,
      conversationSessionId: binding.conversationSessionId,
      chatSessionId,
      characterId,
      companionId: characterId,
    };
  }
  try {
    const session = getOrCreateActiveSession({ characterId });
    if (!session?.id) return { ok: false, reason: "no_session" };
    return {
      ok: true,
      conversationSessionId: session.id,
      chatSessionId: "",
      characterId,
      companionId: characterId,
    };
  } catch (error) {
    return { ok: false, reason: error?.message || "session_failed" };
  }
}

/**
 * Write one companion turn: V2 authoritative, then optional IDB projection.
 * @param {{
 *   role: "user"|"assistant"|"system",
 *   text: string,
 *   characterId?: string,
 *   companionId?: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   chatSessionId?: string,
 *   conversationKind?: "dm"|"group"|"scenario"|"project",
 *   participantIds?: string[],
 *   meta?: Record<string, unknown>,
 *   saveChatMessage?: (msg: object) => Promise<object>|object,
 *   messageId?: string,
 *   skipIdbProjection?: boolean,
 * }} input
 */
export async function writeCompanionTurn(input = {}) {
  const role = input.role === "assistant" || input.role === "system" ? input.role : "user";
  const text = String(input.text ?? "").trim();
  if (!text) return { ok: false, reason: "empty_text" };

  const scopeCheck = requireCompanionScope(freezeCompanionScope({
    userId: input.userId,
    companionId: input.companionId || input.characterId,
    relationshipId: input.relationshipId,
    taskId: input.meta?.taskId,
  }));
  if (!scopeCheck.ok) {
    return { ok: false, reason: scopeCheck.reason, refusedIdbProjection: true };
  }
  const scope = scopeCheck.scope;

  const resolved = resolveCompanionConversationSession({
    ...input,
    characterId: scope.companionId,
    companionId: scope.companionId,
  });
  if (!resolved.ok) {
    return { ...resolved, refusedIdbProjection: true };
  }

  const frozenScope = freezeCompanionScope({
    ...scope,
    conversationId: resolved.conversationSessionId,
  });

  const meta = {
    ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
    source: input.meta?.source || "companion_write",
    chatSessionId: resolved.chatSessionId || undefined,
    userId: frozenScope.userId,
    companionId: frozenScope.companionId,
    characterId: frozenScope.companionId,
    relationshipId: frozenScope.relationshipId,
    conversationId: frozenScope.conversationId,
    clientMessageId: String(input.messageId || input.meta?.clientMessageId || "").trim() || undefined,
  };

  let v2;
  if (role === "assistant") {
    v2 = appendAssistantCandidate(resolved.conversationSessionId, text, meta);
  } else if (role === "system") {
    v2 = appendSystemNote(resolved.conversationSessionId, text, meta);
  } else {
    v2 = sendUser(resolved.conversationSessionId, text, meta);
  }

  if (!v2?.ok) {
    return {
      ok: false,
      reason: v2?.reason || "v2_write_failed",
      refusedIdbProjection: true,
      scope: frozenScope,
    };
  }

  const runtimeTurn = v2.turn || {
    id: v2.node?.id,
    role,
    text,
    content: text,
    createdAt: v2.node?.createdAt,
    mode: "chat",
    meta,
  };
  const turn = input.createdAt ? { ...runtimeTurn, createdAt: input.createdAt } : runtimeTurn;

  if (input.skipIdbProjection || typeof input.saveChatMessage !== "function") {
    return {
      ok: true,
      value: v2.value,
      turn,
      node: v2.node,
      conversationSessionId: resolved.conversationSessionId,
      conversationId: resolved.conversationSessionId,
      scope: frozenScope,
      projected: false,
    };
  }

  const chatSessionId = resolved.chatSessionId || String(input.chatSessionId || "").trim();
  if (!chatSessionId) {
    return {
      ok: true,
      value: v2.value,
      turn,
      node: v2.node,
      conversationSessionId: resolved.conversationSessionId,
      conversationId: resolved.conversationSessionId,
      scope: frozenScope,
      projected: false,
      reason: "missing_chatSessionId_for_projection",
    };
  }

  const mirror = await mirrorTurnToChat({
    turn: input.messageId
      ? {
          ...turn,
          id: input.messageId,
          meta: { ...(turn.meta || {}), conversationNodeId: String(v2.node?.id || "") },
        }
      : turn,
    conversationSessionId: resolved.conversationSessionId,
    chatSessionId,
    saveChatMessage: input.saveChatMessage,
  });

  if (!mirror.ok) {
    return {
      ok: false,
      reason: mirror.reason || "idb_projection_failed",
      v2Ok: true,
      turn,
      conversationSessionId: resolved.conversationSessionId,
      scope: frozenScope,
    };
  }

  return {
    ok: true,
    value: v2.value,
    turn,
    node: v2.node,
    conversationSessionId: resolved.conversationSessionId,
    conversationId: resolved.conversationSessionId,
    scope: frozenScope,
    message: mirror.message,
    projected: true,
  };
}

/**
 * System note helper — same gate as writeCompanionTurn(role: system).
 * @param {Omit<Parameters<typeof writeCompanionTurn>[0], "role">} input
 */
export async function writeCompanionSystemNote(input = {}) {
  return writeCompanionTurn({ ...input, role: "system" });
}
