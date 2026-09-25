/**
 * Conversation Runtime schema V2 — ConversationGraph.
 * Key: localStorage `yueqi.conversation.v2`
 */

export const CONVERSATION_SCHEMA_VERSION = 2;

export const CONVERSATION_STORE_KEY = "yueqi.conversation.v2";
export const CONVERSATION_STORE_KEY_V1 = "yueqi.conversation.v1";
export const CONVERSATION_BACKUP_KEY_V1 = "yueqi.conversation.v1.backup";

/** @typedef {"chat"|"immersive"} ConversationMode */
/** @typedef {"active"|"archived"} BranchStatus */
/** @typedef {"active"|"archived"} CandidateStatus */
/** @typedef {"user"|"assistant"|"system"} MessageRole */

export const CONVERSATION_MODES = Object.freeze(["chat", "immersive"]);
export const BRANCH_STATUSES = Object.freeze(["active", "archived"]);
export const CANDIDATE_STATUSES = Object.freeze(["active", "archived"]);

/**
 * @typedef {{
 *   id: string,
 *   content: string,
 *   narration?: string,
 *   scenePatch?: Record<string, unknown>,
 *   performance?: Record<string, unknown>,
 *   suggestedActions?: unknown[],
 *   generationSnapshot?: Record<string, unknown>,
 *   createdAt: string,
 *   status: CandidateStatus,
 *   meta: Record<string, unknown>,
 *   revisions?: { at: string, content: string, meta?: Record<string, unknown> }[],
 * }} TurnCandidate
 */

/**
 * @typedef {{
 *   id: string,
 *   parentMessageId?: string,
 *   branchId: string,
 *   role: MessageRole,
 *   candidates: TurnCandidate[],
 *   activeCandidateId: string,
 *   mode: ConversationMode,
 *   createdAt: string,
 *   accepted?: boolean,
 *   meta: Record<string, unknown>,
 * }} MessageNode
 */

/**
 * @typedef {{
 *   id: string,
 *   parentBranchId?: string,
 *   forkedFromMessageId?: string,
 *   headMessageId: string,
 *   label: string,
 *   status: BranchStatus,
 *   createdAt: string,
 *   meta: Record<string, unknown>,
 * }} ConversationBranch
 */

/**
 * @typedef {{
 *   mode: ConversationMode,
 *   scenarioRunId?: string,
 *   loreEntryIds: string[],
 *   draft?: string,
 *   scrollAnchor?: string,
 *   extra: Record<string, unknown>,
 * }} ConversationModeContext
 */

/**
 * @typedef {{
 *   id: string,
 *   characterId: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   mode: ConversationMode,
 *   activeBranchId: string,
 *   branches: Record<string, ConversationBranch>,
 *   messageNodes: Record<string, MessageNode>,
 *   modeContext: ConversationModeContext,
 *   scenarioRunId?: string,
 *   loreEntryIds: string[],
 *   meta: Record<string, unknown>,
 * }} ConversationSession
 */

let idSeq = 0;

/** @param {string} [prefix] */
export function createConversationId(prefix = "conv") {
  idSeq += 1;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now().toString(16)}-${idSeq.toString(16)}-${rand}`;
}

/** Test helper */
export function __resetConversationIdSeqForTests() {
  idSeq = 0;
}

/**
 * @param {object} [partial]
 * @returns {TurnCandidate}
 */
export function createTurnCandidate(partial = {}) {
  const status = CANDIDATE_STATUSES.includes(partial.status) ? partial.status : "active";
  return {
    id: String(partial.id || createConversationId("cand")),
    content: String(partial.content ?? partial.text ?? ""),
    narration: partial.narration != null ? String(partial.narration) : undefined,
    contentBlocks: Array.isArray(partial.contentBlocks)
      ? partial.contentBlocks.map((block) => ({ ...block }))
      : undefined,
    scenePatch:
      partial.scenePatch && typeof partial.scenePatch === "object"
        ? { ...partial.scenePatch }
        : undefined,
    performance:
      partial.performance && typeof partial.performance === "object"
        ? { ...partial.performance }
        : undefined,
    suggestedActions: Array.isArray(partial.suggestedActions)
      ? partial.suggestedActions.slice()
      : undefined,
    generationSnapshot:
      partial.generationSnapshot && typeof partial.generationSnapshot === "object"
        ? { ...partial.generationSnapshot }
        : undefined,
    createdAt: String(partial.createdAt || new Date().toISOString()),
    status,
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
    revisions: Array.isArray(partial.revisions) ? partial.revisions.slice() : undefined,
  };
}

/**
 * @param {object} [partial]
 * @returns {MessageNode}
 */
export function createMessageNode(partial = {}) {
  const role =
    partial.role === "assistant" || partial.role === "system" ? partial.role : "user";
  const mode = CONVERSATION_MODES.includes(partial.mode) ? partial.mode : "chat";
  const candidates = Array.isArray(partial.candidates)
    ? partial.candidates.map((c) => createTurnCandidate(c))
    : [createTurnCandidate({ content: partial.content ?? partial.text ?? "", meta: partial.meta })];
  const activeCandidateId = String(
    partial.activeCandidateId || candidates[0]?.id || createConversationId("cand")
  );
  if (!candidates.some((c) => c.id === activeCandidateId) && candidates[0]) {
    candidates[0] = { ...candidates[0], id: activeCandidateId };
  }
  return {
    id: String(partial.id || createConversationId("msg")),
    parentMessageId: partial.parentMessageId ? String(partial.parentMessageId) : undefined,
    branchId: String(partial.branchId || ""),
    role,
    candidates,
    activeCandidateId,
    mode,
    createdAt: String(partial.createdAt || new Date().toISOString()),
    accepted: partial.accepted === true,
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * @param {object} [partial]
 * @returns {ConversationBranch}
 */
export function createConversationBranch(partial = {}) {
  const status = BRANCH_STATUSES.includes(partial.status) ? partial.status : "active";
  return {
    id: String(partial.id || createConversationId("branch")),
    parentBranchId: partial.parentBranchId ? String(partial.parentBranchId) : undefined,
    forkedFromMessageId: partial.forkedFromMessageId
      ? String(partial.forkedFromMessageId)
      : undefined,
    headMessageId: String(partial.headMessageId || ""),
    label: String(partial.label || "main"),
    status,
    createdAt: String(partial.createdAt || new Date().toISOString()),
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * @param {object} [partial]
 * @returns {ConversationModeContext}
 */
export function createModeContext(partial = {}) {
  const mode = CONVERSATION_MODES.includes(partial.mode) ? partial.mode : "chat";
  return {
    mode,
    scenarioRunId: partial.scenarioRunId ? String(partial.scenarioRunId) : undefined,
    loreEntryIds: Array.isArray(partial.loreEntryIds)
      ? partial.loreEntryIds.map((id) => String(id)).filter(Boolean)
      : [],
    draft: partial.draft != null ? String(partial.draft) : undefined,
    scrollAnchor: partial.scrollAnchor != null ? String(partial.scrollAnchor) : undefined,
    extra: partial.extra && typeof partial.extra === "object" ? { ...partial.extra } : {},
  };
}

/**
 * @param {object} [partial]
 * @returns {ConversationSession}
 */
export function createConversationSession(partial = {}) {
  const now = new Date().toISOString();
  const characterId = String(partial.characterId || "").trim();
  if (!characterId) {
    throw new Error("conversation_session_requires_characterId");
  }
  const mode = CONVERSATION_MODES.includes(partial.mode) ? partial.mode : "chat";
  const mainBranchId = String(partial.activeBranchId || createConversationId("branch"));
  const branches =
    partial.branches && typeof partial.branches === "object"
      ? { ...partial.branches }
      : {
          [mainBranchId]: createConversationBranch({
            id: mainBranchId,
            label: "main",
            headMessageId: "",
          }),
        };
  const modeContext = createModeContext({
    mode,
    scenarioRunId: partial.scenarioRunId,
    loreEntryIds: partial.loreEntryIds,
    draft: partial.modeContext?.draft,
    scrollAnchor: partial.modeContext?.scrollAnchor,
    extra: partial.modeContext?.extra,
    ...(partial.modeContext && typeof partial.modeContext === "object" ? partial.modeContext : {}),
    mode,
  });
  return {
    id: String(partial.id || createConversationId("conv")),
    characterId,
    createdAt: String(partial.createdAt || now),
    updatedAt: String(partial.updatedAt || now),
    mode,
    activeBranchId: String(partial.activeBranchId || mainBranchId),
    branches,
    messageNodes:
      partial.messageNodes && typeof partial.messageNodes === "object"
        ? { ...partial.messageNodes }
        : {},
    modeContext,
    scenarioRunId: modeContext.scenarioRunId,
    loreEntryIds: modeContext.loreEntryIds.slice(),
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * Linear V1-shaped turn (compat projection / migration input).
 * @param {object} [partial]
 */
export function createConversationTurn(partial = {}) {
  const role =
    partial.role === "assistant" || partial.role === "system" ? partial.role : "user";
  const mode = CONVERSATION_MODES.includes(partial.mode) ? partial.mode : "chat";
  return {
    id: String(partial.id || createConversationId("turn")),
    role,
    text: String(partial.text ?? partial.content ?? ""),
    mode,
    createdAt: String(partial.createdAt || new Date().toISOString()),
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * @param {unknown} session
 * @returns {{ ok: true, value: ConversationSession }|{ ok: false, reason: string }}
 */
export function validateConversationSession(session) {
  if (!session || typeof session !== "object") return { ok: false, reason: "not_object" };
  if (!String(session.id || "").trim()) return { ok: false, reason: "missing_id" };
  if (!String(session.characterId || "").trim()) return { ok: false, reason: "missing_characterId" };
  if (!CONVERSATION_MODES.includes(session.mode)) return { ok: false, reason: "invalid_mode" };
  if (!String(session.activeBranchId || "").trim()) {
    return { ok: false, reason: "missing_activeBranchId" };
  }
  if (!session.branches || typeof session.branches !== "object") {
    return { ok: false, reason: "branches_not_object" };
  }
  if (!session.messageNodes || typeof session.messageNodes !== "object") {
    return { ok: false, reason: "messageNodes_not_object" };
  }
  if (!session.branches[session.activeBranchId]) {
    return { ok: false, reason: "active_branch_missing" };
  }
  return { ok: true, value: /** @type {ConversationSession} */ (session) };
}

/**
 * Active candidate content for a message node.
 * @param {MessageNode|null|undefined} node
 */
export function getActiveCandidate(node) {
  if (!node || !Array.isArray(node.candidates)) return null;
  return (
    node.candidates.find((c) => c.id === node.activeCandidateId && c.status !== "archived") ||
    node.candidates.find((c) => c.status !== "archived") ||
    node.candidates[0] ||
    null
  );
}
