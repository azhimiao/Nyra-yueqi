/**
 * Conversation Runtime V2 — graph mutations (non-destructive timeline).
 * Contract: §5.6 / §13.1 / W1
 */

import {
  createConversationBranch,
  createConversationId,
  createMessageNode,
  createTurnCandidate,
  getActiveCandidate,
} from "./schema.js";
import {
  ensureSession,
  getActiveSessionForCharacter,
  getSession,
  getSessionMutable,
  persistSession,
  updateMode,
} from "./store.js";
import { emitConversationEvent, CONVERSATION_EVENTS } from "./events.js";
import {
  messageHasDescendants,
  selectActiveBranch,
  selectBranchMessageChain,
  selectChildMessages,
  selectVisibleHistory,
} from "./selectors.js";

/**
 * @param {{ characterId: string }} opts
 */
export function getOrCreateActiveSession({ characterId }) {
  const cid = String(characterId || "").trim();
  if (!cid) throw new Error("getOrCreateActiveSession_requires_characterId");
  const existing = getActiveSessionForCharacter(cid);
  if (existing) return existing;
  const created = ensureSession({ characterId: cid });
  if (!created.ok) throw new Error(created.reason || "ensure_session_failed");
  return created.value;
}

function activeBranchOf(session) {
  return selectActiveBranch(session);
}

/**
 * Append a user message node after the current branch head.
 * @param {string} sessionId
 * @param {string} text
 * @param {Record<string, unknown>} [meta]
 */
export function sendUser(sessionId, text, meta = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch || branch.status === "archived") {
    return { ok: false, reason: "no_active_branch" };
  }

  const candidate = createTurnCandidate({
    content: String(text ?? ""),
    meta: meta && typeof meta === "object" ? meta : {},
  });
  const node = createMessageNode({
    parentMessageId: branch.headMessageId || undefined,
    branchId: branch.id,
    role: "user",
    candidates: [candidate],
    activeCandidateId: candidate.id,
    mode: session.mode || "chat",
    meta: meta && typeof meta === "object" ? meta : {},
  });
  session.messageNodes[node.id] = node;
  branch.headMessageId = node.id;
  session.branches[branch.id] = branch;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.USER_SENT, {
    sessionId,
    messageId: node.id,
    candidateId: candidate.id,
    branchId: branch.id,
    characterId: session.characterId,
  });
  return { ok: true, value: saved.value, turn: toCompatTurn(node, candidate), node, candidate };
}

/**
 * Append a system note after the branch head (shared history, not model speech).
 * @param {string} sessionId
 * @param {string} text
 * @param {Record<string, unknown>} [meta]
 */
export function appendSystemNote(sessionId, text, meta = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch || branch.status === "archived") {
    return { ok: false, reason: "no_active_branch" };
  }

  const candidate = createTurnCandidate({
    content: String(text ?? ""),
    meta: meta && typeof meta === "object" ? meta : {},
  });
  const node = createMessageNode({
    parentMessageId: branch.headMessageId || undefined,
    branchId: branch.id,
    role: "system",
    candidates: [candidate],
    activeCandidateId: candidate.id,
    mode: session.mode || "chat",
    meta: meta && typeof meta === "object" ? meta : {},
  });
  session.messageNodes[node.id] = node;
  branch.headMessageId = node.id;
  session.branches[branch.id] = branch;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.USER_SENT, {
    sessionId,
    messageId: node.id,
    candidateId: candidate.id,
    branchId: branch.id,
    characterId: session.characterId,
    role: "system",
  });
  return { ok: true, value: saved.value, turn: toCompatTurn(node, candidate), node, candidate };
}

/**
 * Create a new assistant message node (first candidate) after the branch head.
 * @param {string} sessionId
 * @param {string} text
 * @param {Record<string, unknown>} [meta]
 */
export function appendAssistantCandidate(sessionId, text, meta = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch || branch.status === "archived") {
    return { ok: false, reason: "no_active_branch" };
  }

  const candidate = createTurnCandidate({
    content: String(text ?? ""),
    narration: meta?.narration != null ? String(meta.narration) : undefined,
    contentBlocks: Array.isArray(meta?.contentBlocks) ? meta.contentBlocks : undefined,
    scenePatch: meta?.scenePatch && typeof meta.scenePatch === "object" ? meta.scenePatch : undefined,
    performance:
      meta?.performance && typeof meta.performance === "object" ? meta.performance : undefined,
    suggestedActions: Array.isArray(meta?.suggestedActions) ? meta.suggestedActions : undefined,
    generationSnapshot:
      meta?.generationSnapshot && typeof meta.generationSnapshot === "object"
        ? meta.generationSnapshot
        : undefined,
    meta: meta && typeof meta === "object" ? meta : {},
  });
  const node = createMessageNode({
    parentMessageId: branch.headMessageId || undefined,
    branchId: branch.id,
    role: "assistant",
    candidates: [candidate],
    activeCandidateId: candidate.id,
    mode: session.mode || "chat",
    meta: meta && typeof meta === "object" ? meta : {},
  });
  session.messageNodes[node.id] = node;
  branch.headMessageId = node.id;
  session.branches[branch.id] = branch;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.ASSISTANT_CANDIDATE_APPENDED, {
    sessionId,
    messageId: node.id,
    candidateId: candidate.id,
    branchId: branch.id,
    characterId: session.characterId,
  });
  return { ok: true, value: saved.value, turn: toCompatTurn(node, candidate), node, candidate };
}

/**
 * Add a new candidate to an existing assistant node (default: current head).
 * Old candidates are retained.
 * @param {string} sessionId
 * @param {string} text
 * @param {Record<string, unknown>} [meta]
 * @param {{ messageId?: string }} [opts]
 */
export function regenerate(sessionId, text, meta = {}, opts = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch) return { ok: false, reason: "no_active_branch" };

  const messageId = String(opts.messageId || branch.headMessageId || "").trim();
  const node = session.messageNodes[messageId];
  if (!node) return { ok: false, reason: "message_not_found" };
  if (node.role !== "assistant") return { ok: false, reason: "not_assistant_node" };

  const children = selectChildMessages(session, node.id, { branchId: branch.id });
  if (!opts._forked && (children.length > 0 || node.id !== branch.headMessageId)) {
    const forked = forkFromMessage(sessionId, node.id, {
      label: String(opts.label || `regen-${node.id.slice(-6)}`),
      meta: { regeneratedFromMessageId: node.id },
    });
    if (!forked.ok) return forked;
    const forkedMessageId = forked.idMap?.[node.id];
    if (!forkedMessageId) return { ok: false, reason: "forked_message_not_found" };
    const result = regenerate(sessionId, text, meta, {
      ...opts,
      messageId: forkedMessageId,
      _forked: true,
    });
    return result.ok
      ? { ...result, forked: true, branch: forked.branch, sourceMessageId: node.id }
      : result;
  }

  const candidate = createTurnCandidate({
    content: String(text ?? ""),
    narration: meta?.narration != null ? String(meta.narration) : undefined,
    contentBlocks: Array.isArray(meta?.contentBlocks) ? meta.contentBlocks : undefined,
    scenePatch: meta?.scenePatch && typeof meta.scenePatch === "object" ? meta.scenePatch : undefined,
    performance:
      meta?.performance && typeof meta.performance === "object" ? meta.performance : undefined,
    suggestedActions: Array.isArray(meta?.suggestedActions) ? meta.suggestedActions : undefined,
    generationSnapshot:
      meta?.generationSnapshot && typeof meta.generationSnapshot === "object"
        ? meta.generationSnapshot
        : undefined,
    meta: {
      ...(meta && typeof meta === "object" ? meta : {}),
      regenerated: true,
    },
  });
  node.candidates = [...(node.candidates || []), candidate];
  node.activeCandidateId = candidate.id;
  session.messageNodes[node.id] = node;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.REGENERATED, {
    sessionId,
    messageId: node.id,
    candidateId: candidate.id,
    previousCandidateCount: node.candidates.length - 1,
    branchId: branch.id,
  });
  return { ok: true, value: saved.value, turn: toCompatTurn(node, candidate), node, candidate };
}

/**
 * @param {string} sessionId
 * @param {string} messageId
 * @param {string} candidateId
 */
export function switchCandidate(sessionId, messageId, candidateId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = session.messageNodes[String(messageId || "")];
  if (!node) return { ok: false, reason: "message_not_found" };
  const cand = (node.candidates || []).find((c) => c.id === String(candidateId || ""));
  if (!cand) return { ok: false, reason: "candidate_not_found" };
  if (cand.status === "archived") return { ok: false, reason: "candidate_archived" };

  const children = selectChildMessages(session, node.id, { branchId: node.branchId });
  if (children.length > 0) {
    // Allowed but audited — UI must confirm fork for continued generation.
    emitConversationEvent(CONVERSATION_EVENTS.CANDIDATE_SWITCHED, {
      sessionId,
      messageId: node.id,
      candidateId: cand.id,
      hasDescendants: true,
      warning: "has_descendants_fork_before_continue",
    });
  }

  const prev = node.activeCandidateId;
  node.activeCandidateId = cand.id;
  session.messageNodes[node.id] = node;
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.CANDIDATE_SWITCHED, {
    sessionId,
    messageId: node.id,
    candidateId: cand.id,
    previousCandidateId: prev,
    hasDescendants: children.length > 0,
  });
  return { ok: true, value: saved.value, node, candidate: cand };
}

/**
 * Merge durable presentation/action metadata into one message node.
 * Accepts either the Conversation V2 node id or its projected clientMessageId.
 * @param {string} sessionId
 * @param {string} messageId
 * @param {Record<string, unknown>} patch
 */
/**
 * Resolve a node by its V2 id or by the projected clientMessageId the UI holds.
 * @param {object} session
 * @param {string} messageId
 */
function findMessageNode(session, messageId) {
  const targetId = String(messageId || "").trim();
  if (!targetId) return null;
  return session.messageNodes[targetId]
    || Object.values(session.messageNodes || {}).find((entry) => {
      if (String(entry?.meta?.clientMessageId || "") === targetId) return true;
      return (entry?.candidates || []).some(
        (candidate) => String(candidate?.meta?.clientMessageId || "") === targetId,
      );
    })
    || null;
}

export function updateMessageMeta(sessionId, messageId, patch = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const targetId = String(messageId || "").trim();
  if (!targetId) return { ok: false, reason: "message_id_required" };
  const node = findMessageNode(session, targetId);
  if (!node) return { ok: false, reason: "message_not_found" };
  const safePatch = patch && typeof patch === "object" ? { ...patch } : {};
  node.meta = { ...(node.meta || {}), ...safePatch };
  const active = getActiveCandidate(node);
  if (active) {
    active.meta = { ...(active.meta || {}), ...safePatch };
    node.candidates = (node.candidates || []).map((candidate) => (
      candidate.id === active.id ? active : candidate
    ));
  }
  session.messageNodes[node.id] = node;
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.MESSAGE_META_UPDATED, {
    sessionId,
    messageId: node.id,
    clientMessageId: String(node.meta?.clientMessageId || ""),
    branchId: node.branchId,
    characterId: session.characterId,
    patch: safePatch,
  });
  return { ok: true, value: saved.value, node, candidate: active };
}

/**
 * Edit a user message. In-place with revision history if no descendants;
 * otherwise fork a new branch from the parent.
 * @param {string} sessionId
 * @param {string} messageId
 * @param {string} newText
 * @param {Record<string, unknown>} [meta]
 */
export function editUserMessage(sessionId, messageId, newText, meta = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = session.messageNodes[String(messageId || "")];
  if (!node) return { ok: false, reason: "message_not_found" };
  if (node.role !== "user") return { ok: false, reason: "not_user_node" };

  const hasKids = messageHasDescendants(session, node.id, { branchId: node.branchId });
  if (hasKids) {
    // §5.6: fork from parent; keep old branch intact; append edited user on new branch
    const forked = forkFromMessage(sessionId, node.parentMessageId || "", {
      label: `edit-${node.id.slice(-6)}`,
      editSourceMessageId: node.id,
      meta,
    });
    if (!forked.ok) return forked;
    const sent = sendUser(sessionId, String(newText ?? ""), {
      ...(meta && typeof meta === "object" ? meta : {}),
      editedFromMessageId: node.id,
    });
    emitConversationEvent(CONVERSATION_EVENTS.USER_EDITED, {
      sessionId,
      messageId: sent.node?.id,
      forked: true,
      sourceMessageId: node.id,
      branchId: sent.node?.branchId,
    });
    return { ...sent, forked: true, sourceMessageId: node.id, branch: forked.branch };
  }

  const active = getActiveCandidate(node);
  if (!active) return { ok: false, reason: "no_active_candidate" };
  const revisions = Array.isArray(active.revisions) ? active.revisions.slice() : [];
  revisions.push({
    at: new Date().toISOString(),
    content: active.content,
    meta: active.meta ? { ...active.meta } : undefined,
  });
  active.content = String(newText ?? "");
  active.revisions = revisions;
  active.meta = {
    ...(active.meta || {}),
    ...(meta && typeof meta === "object" ? meta : {}),
    editedAt: new Date().toISOString(),
  };
  node.candidates = node.candidates.map((c) => (c.id === active.id ? active : c));
  session.messageNodes[node.id] = node;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.USER_EDITED, {
    sessionId,
    messageId: node.id,
    forked: false,
    candidateId: active.id,
  });
  return { ok: true, value: saved.value, turn: toCompatTurn(node, active), node, forked: false };
}

/**
 * In-place content edit for any role, keeping the previous text as a revision.
 *
 * Unlike `editUserMessage` this never forks: the chat surfaces expose it as a
 * plain "correct what was said" action, so the visible thread must not split.
 * @param {string} sessionId
 * @param {string} messageId
 * @param {string} newText
 * @param {Record<string, unknown>} [meta]
 */
export function editMessageContent(sessionId, messageId, newText, meta = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = findMessageNode(session, messageId);
  if (!node) return { ok: false, reason: "message_not_found" };
  const active = getActiveCandidate(node);
  if (!active) return { ok: false, reason: "no_active_candidate" };

  const revisions = Array.isArray(active.revisions) ? active.revisions.slice() : [];
  revisions.push({
    at: new Date().toISOString(),
    content: active.content,
    meta: active.meta ? { ...active.meta } : undefined,
  });
  active.content = String(newText ?? "");
  active.revisions = revisions;
  active.meta = {
    ...(active.meta || {}),
    ...(meta && typeof meta === "object" ? meta : {}),
    editedAt: new Date().toISOString(),
  };
  node.candidates = (node.candidates || []).map((c) => (c.id === active.id ? active : c));
  session.messageNodes[node.id] = node;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.MESSAGE_EDITED, {
    sessionId,
    messageId: node.id,
    clientMessageId: String(node.meta?.clientMessageId || ""),
    role: node.role,
    candidateId: active.id,
  });
  return { ok: true, value: saved.value, node, candidate: active };
}

/**
 * Tombstone a message so every surface hides it and prompt history skips it.
 *
 * The node stays in the graph on purpose — children keep their parent link and
 * the audit trail stays intact. Callers drop their own projection separately.
 * @param {string} sessionId
 * @param {string} messageId
 */
export function deleteMessage(sessionId, messageId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = findMessageNode(session, messageId);
  if (!node) return { ok: false, reason: "message_not_found" };
  const deletedAt = new Date().toISOString();
  node.meta = { ...(node.meta || {}), deletedAt };
  const active = getActiveCandidate(node);
  if (active) {
    active.meta = { ...(active.meta || {}), deletedAt };
    node.candidates = (node.candidates || []).map((c) => (c.id === active.id ? active : c));
  }
  session.messageNodes[node.id] = node;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.MESSAGE_DELETED, {
    sessionId,
    messageId: node.id,
    clientMessageId: String(node.meta?.clientMessageId || ""),
    role: node.role,
    deletedAt,
  });
  return { ok: true, value: saved.value, node, deletedAt };
}

/**
 * Fork a new branch copying the chain up to (and including) targetMessageId.
 * If targetMessageId is empty, fork from root (empty head).
 * @param {string} sessionId
 * @param {string} targetMessageId
 * @param {{ label?: string, editSourceMessageId?: string, newUserText?: string, meta?: object }} [opts]
 */
export function forkFromMessage(sessionId, targetMessageId, opts = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const sourceBranch = activeBranchOf(session);
  if (!sourceBranch) return { ok: false, reason: "no_active_branch" };

  const targetId = String(targetMessageId || "").trim();
  const chain = selectBranchMessageChain(session, { branchId: sourceBranch.id });
  const cutIndex = targetId ? chain.findIndex((n) => n.id === targetId) : -1;
  if (targetId && cutIndex < 0) return { ok: false, reason: "target_not_on_branch" };

  const prefix = targetId ? chain.slice(0, cutIndex + 1) : [];
  const newBranchId = createConversationId("branch");
  /** @type {Record<string, string>} */
  const idMap = {};

  let parentOnNew = undefined;
  let headMessageId = "";
  for (const src of prefix) {
    const newId = createConversationId("msg");
    idMap[src.id] = newId;
    const clonedCandidates = (src.candidates || []).map((c) =>
      createTurnCandidate({
        ...c,
        id: createConversationId("cand"),
        meta: { ...(c.meta || {}), forkedFromCandidateId: c.id },
      })
    );
    const activeSrc = getActiveCandidate(src);
    const activeOnNew =
      clonedCandidates.find((c) => c.meta?.forkedFromCandidateId === activeSrc?.id) ||
      clonedCandidates[0];
    const node = createMessageNode({
      id: newId,
      parentMessageId: parentOnNew,
      branchId: newBranchId,
      role: src.role,
      candidates: clonedCandidates,
      activeCandidateId: activeOnNew?.id,
      mode: src.mode,
      createdAt: src.createdAt,
      meta: {
        ...(src.meta || {}),
        forkedFromMessageId: src.id,
      },
    });
    session.messageNodes[newId] = node;
    parentOnNew = newId;
    headMessageId = newId;
  }

  const branch = createConversationBranch({
    id: newBranchId,
    parentBranchId: sourceBranch.id,
    forkedFromMessageId: targetId || undefined,
    headMessageId,
    label: String(opts.label || `fork-${newBranchId.slice(-6)}`),
    meta: {
      ...(opts.meta && typeof opts.meta === "object" ? opts.meta : {}),
      editSourceMessageId: opts.editSourceMessageId,
    },
  });
  session.branches[newBranchId] = branch;
  session.activeBranchId = newBranchId;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.FORKED, {
    sessionId,
    branchId: newBranchId,
    parentBranchId: sourceBranch.id,
    forkedFromMessageId: targetId || null,
    copiedCount: prefix.length,
  });
  return { ok: true, value: saved.value, branch, idMap };
}

/**
 * Snapshot checkpoint metadata on the active branch (non-destructive).
 * @param {string} sessionId
 * @param {{ label?: string, meta?: object }} [opts]
 */
export function checkpoint(sessionId, opts = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch) return { ok: false, reason: "no_active_branch" };

  const cpId = createConversationId("cp");
  const checkpoints = Array.isArray(branch.meta?.checkpoints)
    ? branch.meta.checkpoints.slice()
    : [];
  const entry = {
    id: cpId,
    at: new Date().toISOString(),
    headMessageId: branch.headMessageId,
    label: String(opts.label || `checkpoint-${checkpoints.length + 1}`),
    meta: opts.meta && typeof opts.meta === "object" ? { ...opts.meta } : {},
  };
  checkpoints.push(entry);
  branch.meta = { ...(branch.meta || {}), checkpoints };
  session.branches[branch.id] = branch;

  // Also stash on session meta for UI restore
  session.meta = {
    ...(session.meta || {}),
    lastCheckpointId: cpId,
  };

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.CHECKPOINT, {
    sessionId,
    branchId: branch.id,
    checkpointId: cpId,
    headMessageId: branch.headMessageId,
  });
  return { ok: true, value: saved.value, checkpoint: entry };
}

/**
 * @param {string} sessionId
 * @param {string} branchId
 */
export function switchBranch(sessionId, branchId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = session.branches[String(branchId || "")];
  if (!branch) return { ok: false, reason: "branch_not_found" };
  if (branch.status === "archived") return { ok: false, reason: "branch_archived" };

  const prev = session.activeBranchId;
  session.activeBranchId = branch.id;
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.BRANCH_SWITCHED, {
    sessionId,
    branchId: branch.id,
    previousBranchId: prev,
  });
  return { ok: true, value: saved.value, branch };
}

/**
 * @param {string} sessionId
 * @param {string} branchId
 */
export function archiveBranch(sessionId, branchId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const id = String(branchId || "");
  const branch = session.branches[id];
  if (!branch) return { ok: false, reason: "branch_not_found" };
  if (session.activeBranchId === id) {
    return { ok: false, reason: "cannot_archive_active_branch" };
  }
  branch.status = "archived";
  session.branches[id] = branch;
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.BRANCH_ARCHIVED, { sessionId, branchId: id });
  return { ok: true, value: saved.value, branch };
}

/**
 * @param {string} sessionId
 * @param {string} messageId
 * @param {string} candidateId
 */
export function archiveCandidate(sessionId, messageId, candidateId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const node = session.messageNodes[String(messageId || "")];
  if (!node) return { ok: false, reason: "message_not_found" };
  const cand = (node.candidates || []).find((c) => c.id === String(candidateId || ""));
  if (!cand) return { ok: false, reason: "candidate_not_found" };
  if (node.activeCandidateId === cand.id) {
    const fallback = node.candidates.find((c) => c.id !== cand.id && c.status !== "archived");
    if (!fallback) return { ok: false, reason: "cannot_archive_last_active_candidate" };
    node.activeCandidateId = fallback.id;
  }
  cand.status = "archived";
  node.candidates = node.candidates.map((c) => (c.id === cand.id ? cand : c));
  session.messageNodes[node.id] = node;
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.CANDIDATE_ARCHIVED, {
    sessionId,
    messageId: node.id,
    candidateId: cand.id,
  });
  return { ok: true, value: saved.value, node, candidate: cand };
}

/**
 * Move branch head to a prior message without destroying descendants.
 * @param {string} sessionId
 * @param {string} [messageId] — defaults to parent of current head
 */
export function rollbackHead(sessionId, messageId) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = activeBranchOf(session);
  if (!branch) return { ok: false, reason: "no_active_branch" };
  if (!branch.headMessageId) return { ok: false, reason: "no_turns" };

  const currentHead = session.messageNodes[branch.headMessageId];
  const targetId =
    messageId != null && String(messageId).trim()
      ? String(messageId).trim()
      : currentHead?.parentMessageId || "";

  if (messageId != null && String(messageId).trim()) {
    if (targetId && !session.messageNodes[targetId]) {
      return { ok: false, reason: "message_not_found" };
    }
  }

  const removed = currentHead || null;
  const prevHead = branch.headMessageId;
  branch.headMessageId = targetId || "";
  session.branches[branch.id] = branch;

  const saved = persistSession(session);
  if (!saved.ok) return saved;
  emitConversationEvent(CONVERSATION_EVENTS.HEAD_ROLLED_BACK, {
    sessionId,
    branchId: branch.id,
    previousHeadMessageId: prevHead,
    headMessageId: branch.headMessageId,
  });
  const removedTurn = removed
    ? toCompatTurn(removed, getActiveCandidate(removed))
    : null;
  return { ok: true, value: saved.value, removed: removedTurn, previousHeadMessageId: prevHead };
}

/**
 * Persist UI draft / scroll anchor for refresh restore (W1 §14).
 * @param {string} sessionId
 * @param {{ draft?: string, scrollAnchor?: string }} state
 */
export function saveUiState(sessionId, state = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  session.modeContext = session.modeContext || { mode: session.mode, loreEntryIds: [], extra: {} };
  if ("draft" in state) session.modeContext.draft = state.draft != null ? String(state.draft) : undefined;
  if ("scrollAnchor" in state) {
    session.modeContext.scrollAnchor =
      state.scrollAnchor != null ? String(state.scrollAnchor) : undefined;
  }
  return persistSession(session);
}

/* ——— Compat shims for Pop chat + immersive (V1 names) ——— */

export function appendUserTurn(sessionId, text, meta = {}) {
  return sendUser(sessionId, text, meta);
}

export function appendAssistantTurn(sessionId, text, meta = {}) {
  return appendAssistantCandidate(sessionId, text, meta);
}

export function enterImmersive(sessionId, payload = {}) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const loreEntryIds = Array.isArray(payload.loreEntryIds)
    ? payload.loreEntryIds.map((id) => String(id)).filter(Boolean)
    : session.loreEntryIds || [];
  return updateMode(sessionId, "immersive", {
    scenarioRunId: payload.runId || payload.experienceSessionId || session.scenarioRunId || "",
    loreEntryIds,
    meta: {
      ...(session.meta || {}),
      scenarioId: payload.scenarioId ? String(payload.scenarioId) : session.meta?.scenarioId || "",
      experienceSessionId: payload.experienceSessionId
        ? String(payload.experienceSessionId)
        : session.meta?.experienceSessionId || "",
      packageId: payload.packageId ? String(payload.packageId) : session.meta?.packageId || "",
      openingId: payload.openingId ? String(payload.openingId) : session.meta?.openingId || "",
      enteredImmersiveAt: new Date().toISOString(),
    },
  });
}

export function exitImmersive(sessionId) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  return updateMode(sessionId, "chat", {
    scenarioRunId: undefined,
    loreEntryIds: session.loreEntryIds || [],
    meta: {
      ...(session.meta || {}),
      lastScenarioRunId: session.scenarioRunId || session.meta?.lastScenarioRunId || "",
      exitedImmersiveAt: new Date().toISOString(),
    },
  });
}

export function getSharedHistory(sessionId, opts = {}) {
  const session = getSession(sessionId);
  if (!session) return [];
  return selectVisibleHistory(session, opts).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    mode: row.mode,
    meta: row.meta || {},
    createdAt: row.createdAt,
    messageId: row.messageId,
    candidateId: row.candidateId,
    branchId: row.branchId,
  }));
}

export function rollbackTurn(sessionId) {
  return rollbackHead(sessionId);
}

/**
 * Non-destructive: prefer regenerate. Kept name for older callers.
 */
export function replaceLastAssistant(sessionId, text, meta = {}) {
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const branch = selectActiveBranch(session);
  const head = branch?.headMessageId ? session.messageNodes[branch.headMessageId] : null;
  if (head?.role === "assistant") {
    return regenerate(sessionId, text, { ...(meta || {}), via: "replaceLastAssistant" });
  }
  return appendAssistantCandidate(sessionId, text, meta);
}

/**
 * @param {import("./schema.js").MessageNode} node
 * @param {import("./schema.js").TurnCandidate|null} candidate
 */
function toCompatTurn(node, candidate) {
  if (!node) return null;
  return {
    id: node.id,
    role: node.role,
    text: candidate ? String(candidate.content ?? "") : "",
    mode: node.mode,
    createdAt: candidate?.createdAt || node.createdAt,
    meta: {
      ...(node.meta || {}),
      ...(candidate?.meta || {}),
      candidateId: candidate?.id,
      candidateCount: node.candidates?.length || 0,
    },
  };
}
