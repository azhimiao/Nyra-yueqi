/**
 * ActionProposal runtime store (W4) + C2 persistence cache.
 * Authority: proposal-repository (localStorage). In-memory Map is a hot cache.
 * Not a second calendar or task authority — correlation only.
 */

import {
  ACTION_PROPOSAL_STORE_KEY,
  saveProposal,
  getProposal,
  updateStatus,
  listPending as repoListPending,
  expireStale as repoExpireStale,
  findByCorrelationId as repoFindByCorrelationId,
  listAllProposals as repoListAll,
  clearProposalsForTests,
  toStoreRecord,
  isSuccessStatus,
  normalizeProposalStatus,
  buildProposalRecord,
} from "./proposal-repository.js";

export { ACTION_PROPOSAL_STORE_KEY };

/** @type {Map<string, object>} */
const byProposalId = new Map();

/** proposalId → { eventId, artifactId, at, result } — idempotency side table */
/** @type {Map<string, object>} */
const executedCorrelation = new Map();

/** @type {Set<(proposal: object, meta: object) => void>} */
const listeners = new Set();

function hydrateFromRepo(proposalId) {
  const id = String(proposalId || "").trim();
  if (!id) return null;
  // Repository is authority — always re-read so expire/undo from any surface wins.
  const persisted = getProposal(id);
  if (!persisted) {
    byProposalId.delete(id);
    executedCorrelation.delete(id);
    return null;
  }
  const record = toStoreRecord(persisted);
  byProposalId.set(id, record);
  if (isSuccessStatus(persisted.status) && persisted.executionResult) {
    const eventId = String(persisted.executionResult.eventId || "").trim();
    const artifactId = String(persisted.executionResult.artifactId || "").trim();
    if (eventId || artifactId) {
      executedCorrelation.set(id, {
        proposalId: id,
        eventId,
        artifactId,
        at: persisted.executedAt || persisted.updatedAt || new Date().toISOString(),
        result: persisted.executionResult,
      });
    }
  } else if (!isSuccessStatus(persisted.status)) {
    executedCorrelation.delete(id);
  }
  return record;
}

function persistRecord(record, { force = true } = {}) {
  const proposal = record.proposal || {};
  const status = normalizeProposalStatus(record.status);
  saveProposal(
    buildProposalRecord({
      proposalId: proposal.proposalId,
      correlationId: record.correlationId || proposal.proposalId,
      turnId: record.turnId,
      scope: record.scope,
      risk: proposal.risk,
      exactEffect: proposal.exactEffect,
      temporalSnapshot: record.temporalSnapshot || null,
      parameters: proposal.parameters,
      status,
      createdAt: record.createdAt || record.registeredAt,
      updatedAt: record.updatedAt || new Date().toISOString(),
      executionResult: record.executionResult,
      undoInfo: record.undoInfo,
      evidenceRefs: proposal.evidenceRefs,
      proposal,
      sourceText: record.sourceText,
      taskId: record.taskId,
      approvedAt: record.approvedAt,
      rejectedAt: record.rejectedAt,
      executedAt: record.executedAt,
      expiresAt: record.expiresAt,
    }),
    { force },
  );
}

/**
 * @param {object} proposal ActionProposalV1
 * @param {{ turnId?: string, scope?: object, sourceText?: string, temporalSnapshot?: object, correlationId?: string, nowIso?: string }} [meta]
 */
export function registerProposal(proposal, meta = {}) {
  const proposalId = String(proposal?.proposalId || "").trim();
  if (!proposalId) return { ok: false, reason: "missing_proposalId" };

  const existing = hydrateFromRepo(proposalId);
  if (existing) {
    return { ok: true, idempotent: true, record: existing };
  }

  const now = String(meta.nowIso || "").trim() || new Date().toISOString();
  const record = {
    proposal: { ...proposal },
    turnId: String(meta.turnId || "").trim(),
    scope: meta.scope && typeof meta.scope === "object" ? { ...meta.scope } : {},
    sourceText: String(meta.sourceText || ""),
    status: normalizeProposalStatus(proposal.status || "proposed") === "completed"
      ? "executed"
      : (proposal.status || "proposed"),
    registeredAt: now,
    createdAt: now,
    updatedAt: now,
    taskId: "",
    executionResult: null,
    rejectedAt: null,
    approvedAt: null,
    executedAt: null,
    undoInfo: null,
    temporalSnapshot:
      meta.temporalSnapshot && typeof meta.temporalSnapshot === "object"
        ? { ...meta.temporalSnapshot }
        : null,
    correlationId: String(meta.correlationId || proposalId).trim(),
  };
  byProposalId.set(proposalId, record);
  persistRecord(record, { force: false });
  return { ok: true, record };
}

/**
 * @param {string} proposalId
 */
export function getProposalRecord(proposalId) {
  return hydrateFromRepo(proposalId);
}

export function listProposalRecords() {
  for (const p of repoListAll({ limit: 200 })) {
    hydrateFromRepo(p.proposalId);
  }
  return [...byProposalId.values()];
}

/**
 * @param {string} proposalId
 * @param {Partial<object>} patch
 */
export function updateProposalRecord(proposalId, patch = {}) {
  const id = String(proposalId || "").trim();
  const record = hydrateFromRepo(id) || byProposalId.get(id);
  if (!record) return { ok: false, reason: "not_found" };
  if (patch.proposal && typeof patch.proposal === "object") {
    record.proposal = { ...record.proposal, ...patch.proposal };
  }
  for (const key of [
    "status",
    "taskId",
    "executionResult",
    "rejectedAt",
    "approvedAt",
    "executedAt",
    "undoInfo",
    "temporalSnapshot",
    "correlationId",
    "expiresAt",
  ]) {
    if (patch[key] !== undefined) record[key] = patch[key];
  }
  record.updatedAt = new Date().toISOString();
  byProposalId.set(id, record);

  const repoStatus = patch.status !== undefined
    ? normalizeProposalStatus(patch.status)
    : normalizeProposalStatus(record.status);
  updateStatus(id, repoStatus, {
    proposal: record.proposal,
    taskId: record.taskId,
    executionResult: record.executionResult,
    rejectedAt: record.rejectedAt,
    approvedAt: record.approvedAt,
    executedAt: record.executedAt,
    undoInfo: record.undoInfo,
  });
  return { ok: true, record };
}

/**
 * @param {string} proposalId
 * @param {{ eventId?: string, artifactId?: string, result?: object }} payload
 */
export function markExecutedCorrelation(proposalId, payload = {}) {
  const id = String(proposalId || "").trim();
  if (!id) return null;
  const entry = {
    proposalId: id,
    eventId: String(payload.eventId || "").trim(),
    artifactId: String(payload.artifactId || "").trim(),
    at: new Date().toISOString(),
    result: payload.result || null,
  };
  executedCorrelation.set(id, entry);
  return entry;
}

/**
 * @param {string} proposalId
 */
export function getExecutedCorrelation(proposalId) {
  const id = String(proposalId || "").trim();
  if (executedCorrelation.has(id)) return executedCorrelation.get(id);
  const record = hydrateFromRepo(id);
  if (!record || !isSuccessStatus(record.status)) return null;
  const eventId = String(record.executionResult?.eventId || "").trim();
  const artifactId = String(record.executionResult?.artifactId || "").trim();
  if (!eventId && !artifactId) return null;
  const entry = {
    proposalId: id,
    eventId,
    artifactId,
    at: record.executedAt || record.updatedAt || new Date().toISOString(),
    result: record.executionResult,
  };
  executedCorrelation.set(id, entry);
  return entry;
}

/**
 * UI hook: subscribe to newly proposed actions needing attention.
 * @param {(proposal: object, meta: object) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onActionProposal(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {object} proposal
 * @param {object} [meta]
 */
export function emitActionProposal(proposal, meta = {}) {
  for (const fn of listeners) {
    try {
      fn(proposal, meta);
    } catch {
      /* UI listeners must not break dispatch */
    }
  }
}

/**
 * @param {{ companionId?: string, statuses?: string[], limit?: number }} [opts]
 */
export function listPendingProposals(opts = {}) {
  repoExpireStale();
  const rows = repoListPending(opts);
  return rows.map((r) => {
    hydrateFromRepo(r.proposalId);
    return toStoreRecord(r);
  });
}

/**
 * @param {{ nowMs?: number, ttlMs?: number }} [opts]
 */
export function expireStaleProposals(opts = {}) {
  const result = repoExpireStale(opts);
  for (const row of result.expired || []) {
    const id = row.proposalId;
    if (byProposalId.has(id)) {
      const rec = byProposalId.get(id);
      rec.status = "expired";
      rec.updatedAt = row.updatedAt;
      if (rec.proposal) rec.proposal = { ...rec.proposal, status: "expired" };
    }
  }
  return result;
}

/**
 * @param {string} correlationId
 */
export function findProposalByCorrelationId(correlationId) {
  const persisted = repoFindByCorrelationId(correlationId);
  if (!persisted) return null;
  return hydrateFromRepo(persisted.proposalId);
}

export function clearProposalStoreForTests() {
  byProposalId.clear();
  executedCorrelation.clear();
  listeners.clear();
  clearProposalsForTests();
}
