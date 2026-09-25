/**
 * Conversation V2 selectors — project linear visible history for the active branch
 * (active candidates only; archived candidates skipped).
 */

import { getActiveCandidate } from "./schema.js";

function isTombstonedMeta(meta) {
  return Boolean(meta && typeof meta === "object" && meta.deletedAt);
}

/**
 * Walk parent links from head → root, then reverse.
 * @param {import("./schema.js").ConversationSession} session
 * @param {{ branchId?: string, limit?: number, includeArchivedCandidates?: boolean }} [opts]
 * @returns {import("./schema.js").MessageNode[]}
 */
export function selectBranchMessageChain(session, opts = {}) {
  if (!session?.messageNodes || !session?.branches) return [];
  const branchId = String(opts.branchId || session.activeBranchId || "");
  const branch = session.branches[branchId];
  if (!branch) return [];

  const nodes = session.messageNodes;
  /** @type {import("./schema.js").MessageNode[]} */
  const chain = [];
  let cursor = branch.headMessageId ? nodes[branch.headMessageId] : null;
  const seen = new Set();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.branchId === branchId || !cursor.branchId) {
      chain.push(cursor);
    }
    cursor = cursor.parentMessageId ? nodes[cursor.parentMessageId] : null;
  }
  chain.reverse();
  const limit = Number(opts.limit) || 0;
  return limit > 0 ? chain.slice(-limit) : chain;
}

/**
 * Visible linear turns for UI / prompt (active candidate content only).
 * @param {import("./schema.js").ConversationSession|null|undefined} session
 * @param {{ branchId?: string, limit?: number }} [opts]
 * @returns {{
 *   id: string,
 *   role: string,
 *   content: string,
 *   text: string,
 *   mode: string,
 *   meta: object,
 *   createdAt: string,
 *   messageId: string,
 *   candidateId: string,
 *   branchId: string,
 *   candidateCount: number,
 * }[]}
 */
export function selectVisibleHistory(session, opts = {}) {
  const chain = selectBranchMessageChain(session, { ...opts, limit: 0 });
  const rows = chain
    .map((node) => {
      if (isTombstonedMeta(node?.meta)) return null;
      const cand = getActiveCandidate(node);
      if (!cand || isTombstonedMeta(cand.meta)) return null;
      const content = String(cand.content ?? "");
      return {
        id: node.id,
        role: node.role,
        content,
        text: content,
        mode: node.mode || session?.mode || "chat",
        meta: {
          ...(node.meta || {}),
          ...(cand.meta || {}),
          candidateId: cand.id,
          candidateCount: Array.isArray(node.candidates) ? node.candidates.length : 0,
        },
        createdAt: cand.createdAt || node.createdAt,
        messageId: node.id,
        candidateId: cand.id,
        branchId: node.branchId,
        candidateCount: Array.isArray(node.candidates) ? node.candidates.length : 0,
      };
    })
    .filter(Boolean);
  const limit = Number(opts.limit) || 0;
  return limit > 0 ? rows.slice(-limit) : rows;
}

/**
 * Compat: V1-shaped turns[] projection.
 * @param {import("./schema.js").ConversationSession|null|undefined} session
 * @param {{ branchId?: string, limit?: number }} [opts]
 */
export function selectLinearTurns(session, opts = {}) {
  return selectVisibleHistory(session, opts).map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    mode: row.mode,
    createdAt: row.createdAt,
    meta: row.meta,
  }));
}

/**
 * Children of a message on a given branch (direct descendants).
 * @param {import("./schema.js").ConversationSession} session
 * @param {string} messageId
 * @param {{ branchId?: string }} [opts]
 */
export function selectChildMessages(session, messageId, opts = {}) {
  const mid = String(messageId || "");
  if (!mid || !session?.messageNodes) return [];
  const branchId = opts.branchId != null ? String(opts.branchId) : null;
  return Object.values(session.messageNodes).filter((n) => {
    if (n.parentMessageId !== mid) return false;
    if (branchId != null && n.branchId !== branchId) return false;
    return true;
  });
}

/**
 * True if message has any descendant on its branch (or any branch if crossBranch).
 * @param {import("./schema.js").ConversationSession} session
 * @param {string} messageId
 * @param {{ branchId?: string }} [opts]
 */
export function messageHasDescendants(session, messageId, opts = {}) {
  return selectChildMessages(session, messageId, opts).length > 0;
}

/**
 * Active branch record.
 * @param {import("./schema.js").ConversationSession|null|undefined} session
 */
export function selectActiveBranch(session) {
  if (!session?.branches) return null;
  return session.branches[session.activeBranchId] || null;
}
