/**
 * Multi-companion scope freeze (M6).
 * Ownership is decided at operation start — never from live UI active character.
 */

export const COMPANION_MEMORY_SCOPES = Object.freeze([
  "global_user_fact",
  "companion_private_understanding",
  "relationship_memory",
  "shared_space_memory",
]);

/**
 * @param {string} userId
 * @param {string} companionId
 */
export function relationshipIdFor(userId, companionId) {
  const u = String(userId || "local").trim() || "local";
  const c = String(companionId || "").trim();
  if (!c) return "";
  return `rel:${u}:${c}`;
}

/**
 * Normalize and freeze scope for one operation. Does not read UI active character.
 * @param {{
 *   userId?: string,
 *   companionId?: string,
 *   characterId?: string,
 *   relationshipId?: string,
 *   conversationId?: string,
 *   conversationSessionId?: string,
 *   memoryScope?: string,
 *   taskId?: string,
 *   agentId?: string,
 *   skillId?: string,
 *   experienceId?: string,
 *   sharedSpaceId?: string,
 *   initiatingCompanionId?: string,
 * }} input
 */
export function freezeCompanionScope(input = {}) {
  const companionId = String(
    input.companionId || input.characterId || input.initiatingCompanionId || "",
  ).trim();
  const userId = String(input.userId || "local").trim() || "local";
  const relationshipId = String(input.relationshipId || "").trim()
    || relationshipIdFor(userId, companionId);
  const conversationId = String(
    input.conversationId || input.conversationSessionId || "",
  ).trim();
  const memoryScope = COMPANION_MEMORY_SCOPES.includes(input.memoryScope)
    ? input.memoryScope
    : "companion_private_understanding";

  return Object.freeze({
    userId,
    companionId,
    characterId: companionId,
    relationshipId,
    conversationId,
    memoryScope,
    taskId: String(input.taskId || "").trim(),
    agentId: String(input.agentId || "").trim(),
    skillId: String(input.skillId || "").trim(),
    experienceId: String(input.experienceId || "").trim(),
    sharedSpaceId: String(input.sharedSpaceId || "").trim(),
    initiatingCompanionId: String(input.initiatingCompanionId || companionId).trim(),
    frozenAt: new Date().toISOString(),
  });
}

/**
 * @param {ReturnType<typeof freezeCompanionScope>|object} scope
 * @param {{ requireConversationId?: boolean }} [opts]
 */
export function requireCompanionScope(scope, opts = {}) {
  const s = scope && typeof scope === "object" ? scope : {};
  const companionId = String(s.companionId || s.characterId || "").trim();
  const userId = String(s.userId || "").trim();
  const relationshipId = String(s.relationshipId || "").trim();
  if (!companionId) {
    return { ok: false, reason: "missing_companionId" };
  }
  if (!userId) {
    return { ok: false, reason: "missing_userId" };
  }
  if (!relationshipId) {
    return { ok: false, reason: "missing_relationshipId" };
  }
  if (opts.requireConversationId && !String(s.conversationId || "").trim()) {
    return { ok: false, reason: "missing_conversationId" };
  }
  return { ok: true, scope: freezeCompanionScope(s) };
}

/**
 * True if a stored row may be recalled for this companion scope.
 * @param {object} row
 * @param {{ companionId: string, userId?: string, relationshipId?: string, allowGlobal?: boolean, allowSharedSpaceId?: string }} query
 */
export function rowMatchesCompanionScope(row, query = {}) {
  if (!row || typeof row !== "object") return false;
  const companionId = String(query.companionId || "").trim();
  if (!companionId) return false;

  const rowCompanion = String(row.companionId || row.characterId || "").trim();
  const rowScope = String(row.memoryScope || row.scope || "companion_private_understanding");
  const rowRel = String(row.relationshipId || "").trim();
  const rowUser = String(row.userId || "").trim();
  const qUser = String(query.userId || "").trim();

  if (!rowCompanion) {
    // legacy_unscoped — never auto-broadcast
    return false;
  }
  if (rowCompanion !== companionId) {
    if (rowScope === "global_user_fact" && query.allowGlobal === true) {
      return !qUser || !rowUser || rowUser === qUser;
    }
    if (
      rowScope === "shared_space_memory"
      && query.allowSharedSpaceId
      && String(row.sharedSpaceId || "") === String(query.allowSharedSpaceId)
    ) {
      return true;
    }
    return false;
  }
  if (qUser && rowUser && rowUser !== qUser) return false;
  if (query.relationshipId && rowRel && rowRel !== String(query.relationshipId)) return false;
  return true;
}

/**
 * Tag for migration / reports.
 */
export function classifyLegacyScope(row) {
  const companionId = String(row?.companionId || row?.characterId || "").trim();
  if (!companionId) return "legacy_unscoped";
  if (!String(row?.relationshipId || "").trim()) return "legacy_missing_relationship";
  return "scoped";
}

/**
 * Filter memory rows for companion-scoped recall (Pop, phone, assist).
 * @param {object[]} rows
 * @param {{ companionId?: string, characterId?: string, userId?: string, allowGlobal?: boolean }} query
 */
export function filterRowsByCompanionScope(rows = [], query = {}) {
  const companionId = String(query.companionId || query.characterId || "").trim();
  if (!companionId) return [];
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => rowMatchesCompanionScope(row, {
    companionId,
    userId: query.userId || "local",
    relationshipId: query.relationshipId,
    allowGlobal: query.allowGlobal === true,
    allowSharedSpaceId: query.allowSharedSpaceId,
  }));
}
