/**
 * TurnExecutionScope — freeze identity at user-send / reply-start.
 * In-flight turns must never re-read live UI focus.
 */

import {
  freezeCompanionScope,
  requireCompanionScope,
  relationshipIdFor,
} from "../memory/companion-scope.js";

/**
 * @typedef {object} ProviderConfigSnapshot
 * @property {string} kind
 * @property {string} model
 * @property {string} baseUrl
 * @property {boolean} hasApiKey
 */

/**
 * @typedef {object} GroupSpeakerMeta
 * @property {string} speakerId
 * @property {string} speakerName
 */

/**
 * @typedef {object} TurnExecutionScope
 * @property {string} userId
 * @property {string} companionId
 * @property {string} characterId
 * @property {string} relationshipId
 * @property {string} conversationId
 * @property {string} sessionId
 * @property {string} [conversationSessionId] V2 session id when resolved at freeze
 * @property {string} [branchId] V2 active branch when resolved at freeze
 * @property {string} [userMessageId] authoritative user turn id when known
 * @property {GroupSpeakerMeta|null} [groupSpeakerMeta] frozen group speaker metadata
 * @property {string} [groupSpeakerId]
 * @property {ProviderConfigSnapshot|null} [providerSnapshot] best-effort provider identity at freeze
 * @property {"dm"|"group"} conversationKind
 * @property {string[]} participantIds
 * @property {string} purpose
 * @property {string} appId
 * @property {string} frozenAt
 * @property {string} turnKey
 */

/**
 * Best-effort provider identity snapshot (no secrets).
 * @param {object} [config]
 * @returns {ProviderConfigSnapshot|null}
 */
export function snapshotProviderConfig(config = {}) {
  if (!config || typeof config !== "object") return null;
  return Object.freeze({
    kind: String(config.kind || ""),
    model: String(config.model || ""),
    baseUrl: String(config.baseUrl || ""),
    hasApiKey: Boolean(String(config.apiKey || "").trim()),
  });
}

/**
 * @param {{
 *   characterId?: string,
 *   companionId?: string,
 *   sessionId?: string,
 *   conversationId?: string,
 *   userId?: string,
 *   conversationKind?: "dm"|"group",
 *   participantIds?: string[],
 *   purpose?: string,
 *   appId?: string,
 *   relationshipId?: string,
 *   conversationSessionId?: string,
 *   branchId?: string,
 *   userMessageId?: string,
 *   groupSpeakerId?: string,
 *   groupSpeakerMeta?: GroupSpeakerMeta|null,
 *   providerSnapshot?: ProviderConfigSnapshot|null,
 * }} input
 * @returns {TurnExecutionScope|null}
 */
export function freezeTurnExecutionScope(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  const sessionId = String(input.sessionId || input.conversationId || "").trim();
  if (!companionId) return null;

  const userId = String(input.userId || "local").trim() || "local";
  const base = freezeCompanionScope({
    userId,
    companionId,
    characterId: companionId,
    conversationSessionId: sessionId,
    relationshipId: input.relationshipId || relationshipIdFor(userId, companionId),
    initiatingCompanionId: companionId,
  });
  const gate = requireCompanionScope(base, { requireConversationId: false });
  if (!gate.ok) return null;

  const conversationKind = input.conversationKind === "group" ? "group" : "dm";
  const participantIds = Array.isArray(input.participantIds)
    ? input.participantIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const purpose = String(input.purpose || "chat").trim() || "chat";
  const appId = String(input.appId || (purpose === "deskpet" ? "deskpet" : "pop")).trim() || "pop";
  const turnKey = `${companionId}::${sessionId || "_"}`;
  const conversationSessionId = String(
    input.conversationSessionId || gate.scope.conversationId || "",
  ).trim();
  const branchId = String(input.branchId || "").trim();
  const userMessageId = String(input.userMessageId || "").trim();
  const groupSpeakerId = String(input.groupSpeakerId || "").trim();
  const groupSpeakerMeta = input.groupSpeakerMeta && typeof input.groupSpeakerMeta === "object"
    ? Object.freeze({
      speakerId: String(input.groupSpeakerMeta.speakerId || groupSpeakerId || "").trim(),
      speakerName: String(input.groupSpeakerMeta.speakerName || "").trim()
        || String(input.groupSpeakerMeta.speakerId || groupSpeakerId || "").trim(),
    })
    : null;
  const providerSnapshot = input.providerSnapshot && typeof input.providerSnapshot === "object"
    ? Object.freeze({ ...input.providerSnapshot })
    : null;

  return Object.freeze({
    ...gate.scope,
    sessionId,
    conversationSessionId,
    branchId,
    userMessageId,
    turnExecutionId: String(input.turnExecutionId || "").trim()
      || `tex-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    groupSpeakerId,
    groupSpeakerMeta,
    providerSnapshot,
    conversationKind,
    participantIds,
    purpose,
    appId,
    turnKey,
  });
}

/**
 * Pick execution scope for reply: live bucket first, else any buffered (cross-char race), else live.
 * @param {ReturnType<createPendingTurnBuckets>} buckets
 * @param {TurnExecutionScope|null} liveScope
 */
export function resolveReplyExecutionScope(buckets, liveScope) {
  const liveTaken = buckets.take(liveScope);
  if (liveTaken.scope && (liveTaken.pendingUserTurns > 0 || liveTaken.userText)) {
    return { executionScope: liveTaken.scope, taken: liveTaken };
  }
  const bufferedScope = buckets.peekLatestScope();
  if (bufferedScope) {
    const bufferedTaken = buckets.take(bufferedScope);
    if (bufferedTaken.scope) {
      return { executionScope: bufferedTaken.scope, taken: bufferedTaken };
    }
  }
  return { executionScope: liveScope, taken: liveTaken };
}

/**
 * Pending user-turn bucket keyed by turnKey (character+session).
 */
export function createPendingTurnBuckets() {
  /** @type {Map<string, {
   *   scope: TurnExecutionScope,
   *   pendingUserTurns: number,
   *   userText: string,
   *   userMessageId: string,
   *   attachment: object|null,
   *   location: object|null,
   * }>} */
  const buckets = new Map();

  return {
    /**
     * @param {TurnExecutionScope} scope
     * @param {{ userText: string, userMessageId?: string, attachment?: object|null, location?: object|null }} payload
     */
    buffer(scope, payload) {
      if (!scope?.turnKey) return;
      const prev = buckets.get(scope.turnKey);
      const userMessageId = String(payload.userMessageId || "");
      buckets.set(scope.turnKey, {
        scope: freezeTurnExecutionScope({
          ...scope,
          userMessageId: userMessageId || scope.userMessageId,
          turnExecutionId: payload.turnExecutionId || scope.turnExecutionId,
        }) || scope,
        pendingUserTurns: (prev?.pendingUserTurns || 0) + 1,
        userText: String(payload.userText || ""),
        userMessageId,
        attachment: payload.attachment ?? null,
        location: payload.location ?? null,
        turnExecutionId: String(payload.turnExecutionId || scope.turnExecutionId || "").trim(),
      });
    },

    /**
     * Take pending turns for a scope. Does not clear other characters' buckets.
     * @param {TurnExecutionScope|null} scope
     */
    take(scope) {
      if (!scope?.turnKey) {
        return {
          scope: null,
          pendingUserTurns: 0,
          userText: "",
          userMessageId: "",
          attachment: null,
          location: null,
          turnExecutionId: "",
        };
      }
      const entry = buckets.get(scope.turnKey);
      if (!entry) {
        return {
          scope,
          pendingUserTurns: 0,
          userText: "",
          userMessageId: "",
          attachment: null,
          location: null,
          turnExecutionId: "",
        };
      }
      buckets.delete(scope.turnKey);
      return {
        scope: entry.scope,
        pendingUserTurns: entry.pendingUserTurns,
        userText: entry.userText,
        userMessageId: entry.userMessageId,
        attachment: entry.attachment,
        location: entry.location || null,
        turnExecutionId: entry.turnExecutionId || entry.scope?.turnExecutionId || "",
      };
    },

    /** Clear one bucket after successful reply (idempotent). */
    clear(scope) {
      if (scope?.turnKey) buckets.delete(scope.turnKey);
    },

    /** @returns {TurnExecutionScope|null} */
    peekLatestScope() {
      let latest = null;
      for (const entry of buckets.values()) {
        if (!latest || String(entry.scope.frozenAt) > String(latest.frozenAt)) {
          latest = entry.scope;
        }
      }
      return latest;
    },

    size() {
      return buckets.size;
    },
  };
}
