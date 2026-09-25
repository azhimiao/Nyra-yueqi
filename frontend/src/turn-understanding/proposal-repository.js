/**
 * ActionProposal persistence (C2) — localStorage authority shared by App + phone.
 * In-memory proposal-store is a cache; this module survives refresh.
 * */

import { getClock } from "../temporal/clock.js";

export const ACTION_PROPOSAL_STORE_KEY = "yueqi.action.proposals.v1";

export const PROPOSAL_STATUSES = Object.freeze([
  "proposed",
  "approved",
  "executing",
  "completed",
  "rejected",
  "failed",
  "undone",
  "expired",
]);

/** Pending UI attention (needs confirm / still in flight). */
const PENDING_STATUSES = new Set(["proposed", "approved", "executing"]);

/** Success terminal — W4 historically used "executed". */
const SUCCESS_STATUSES = new Set(["completed", "executed"]);

/** Default: proposed/approved older than this become expired (no auto-exec). */
export const DEFAULT_PROPOSAL_TTL_MS = 72 * 60 * 60 * 1000;

/** @type {null | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setProposalStorageForTests(storage) {
  testStorage = storage;
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function emptyBag() {
  return { schemaVersion: 1, proposals: [] };
}

function readBag() {
  try {
    const raw = ls()?.getItem(ACTION_PROPOSAL_STORE_KEY);
    if (!raw) return emptyBag();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyBag();
    if (!Array.isArray(parsed.proposals)) parsed.proposals = [];
    return parsed;
  } catch {
    return emptyBag();
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(ACTION_PROPOSAL_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/**
 * Normalize status: accept W4 "executed" as "completed".
 * @param {string} status
 */
export function normalizeProposalStatus(status) {
  const s = String(status || "").trim();
  if (s === "executed") return "completed";
  return PROPOSAL_STATUSES.includes(s) ? s : "proposed";
}

/**
 * @param {string} status
 */
export function isSuccessStatus(status) {
  return SUCCESS_STATUSES.has(String(status || "").trim());
}

/**
 * @param {string} status
 */
export function isPendingStatus(status) {
  return PENDING_STATUSES.has(normalizeProposalStatus(status));
}

/**
 * Build a persisted proposal record.
 * @param {object} input
 */
export function buildProposalRecord(input = {}) {
  const now = new Date().toISOString();
  const proposal = input.proposal && typeof input.proposal === "object"
    ? { ...input.proposal }
    : {};
  const proposalId = String(
    input.proposalId || proposal.proposalId || "",
  ).trim();
  const scopeIn = input.scope && typeof input.scope === "object" ? input.scope : {};
  const status = normalizeProposalStatus(
    input.status || proposal.status || "proposed",
  );
  return {
    proposalId,
    correlationId: String(input.correlationId || proposalId || "").trim(),
    turnId: String(input.turnId || "").trim(),
    scope: {
      userId: String(scopeIn.userId || "local").trim() || "local",
      companionId: String(scopeIn.companionId || "").trim(),
      relationshipId: String(scopeIn.relationshipId || "").trim(),
      conversationId: String(scopeIn.conversationId || "").trim(),
    },
    risk: String(input.risk || proposal.risk || "").trim(),
    exactEffect: String(input.exactEffect || proposal.exactEffect || "").trim(),
    temporalSnapshot:
      input.temporalSnapshot && typeof input.temporalSnapshot === "object"
        ? { ...input.temporalSnapshot }
        : null,
    parameters:
      input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters)
        ? { ...input.parameters }
        : proposal.parameters && typeof proposal.parameters === "object"
          ? { ...proposal.parameters }
          : {},
    status,
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    executionResult: input.executionResult ?? null,
    undoInfo: input.undoInfo && typeof input.undoInfo === "object"
      ? { ...input.undoInfo }
      : null,
    evidenceRefs: Array.isArray(input.evidenceRefs)
      ? input.evidenceRefs.map((r) => String(r)).filter(Boolean)
      : Array.isArray(proposal.evidenceRefs)
        ? proposal.evidenceRefs.map((r) => String(r)).filter(Boolean)
        : [],
    proposal,
    sourceText: String(input.sourceText || ""),
    taskId: String(input.taskId || ""),
    approvedAt: input.approvedAt || null,
    rejectedAt: input.rejectedAt || null,
    executedAt: input.executedAt || null,
    expiresAt: input.expiresAt || null,
  };
}

/**
 * Persist a proposal (idempotent by proposalId — existing wins unless force).
 * @param {object} input
 * @param {{ force?: boolean }} [opts]
 */
export function saveProposal(input = {}, opts = {}) {
  const record = buildProposalRecord(input);
  if (!record.proposalId) return { ok: false, reason: "missing_proposalId" };

  const bag = readBag();
  const idx = bag.proposals.findIndex((p) => p.proposalId === record.proposalId);
  if (idx >= 0 && !opts.force) {
    return { ok: true, idempotent: true, record: bag.proposals[idx] };
  }
  if (idx >= 0) {
    bag.proposals[idx] = {
      ...bag.proposals[idx],
      ...record,
      createdAt: bag.proposals[idx].createdAt || record.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const saved = writeBag(bag);
    if (!saved.ok) return saved;
    return { ok: true, record: bag.proposals[idx], replaced: true };
  }
  bag.proposals.unshift(record);
  if (bag.proposals.length > 500) bag.proposals.length = 500;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, record };
}

/**
 * @param {string} proposalId
 */
export function getProposal(proposalId) {
  const id = String(proposalId || "").trim();
  if (!id) return null;
  return readBag().proposals.find((p) => p.proposalId === id) || null;
}

/**
 * @param {{ companionId?: string, statuses?: string[], limit?: number }} [opts]
 */
export function listPending(opts = {}) {
  const companionId = String(opts.companionId || "").trim();
  const statuses = Array.isArray(opts.statuses) && opts.statuses.length
    ? new Set(opts.statuses.map(normalizeProposalStatus))
    : PENDING_STATUSES;
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 40));
  return readBag().proposals
    .filter((p) => {
      if (!statuses.has(normalizeProposalStatus(p.status))) return false;
      if (companionId && String(p.scope?.companionId || "") !== companionId) return false;
      return true;
    })
    .slice(0, limit);
}

/**
 * @param {string} proposalId
 * @param {string} status
 * @param {Partial<object>} [patch]
 */
export function updateStatus(proposalId, status, patch = {}) {
  const id = String(proposalId || "").trim();
  if (!id) return { ok: false, reason: "missing_proposalId" };
  const bag = readBag();
  const idx = bag.proposals.findIndex((p) => p.proposalId === id);
  if (idx < 0) return { ok: false, reason: "not_found" };

  const nextStatus = normalizeProposalStatus(status);
  const prev = bag.proposals[idx];
  const next = {
    ...prev,
    ...patch,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    proposal: {
      ...(prev.proposal || {}),
      ...(patch.proposal && typeof patch.proposal === "object" ? patch.proposal : {}),
      status: nextStatus === "completed" ? "executed" : nextStatus,
    },
  };
  if (patch.executionResult !== undefined) next.executionResult = patch.executionResult;
  if (patch.undoInfo !== undefined) next.undoInfo = patch.undoInfo;
  if (patch.taskId !== undefined) next.taskId = String(patch.taskId || "");
  if (patch.approvedAt !== undefined) next.approvedAt = patch.approvedAt;
  if (patch.rejectedAt !== undefined) next.rejectedAt = patch.rejectedAt;
  if (patch.executedAt !== undefined) next.executedAt = patch.executedAt;

  bag.proposals[idx] = next;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, record: next };
}

/**
 * Expire stale proposed/approved proposals. Never auto-executes.
 * Uses injected temporal clock when `nowMs` omitted (keeps tests + product time aligned).
 * @param {{ nowMs?: number, ttlMs?: number }} [opts]
 */
export function expireStale(opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : getClock().nowMs();
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : DEFAULT_PROPOSAL_TTL_MS;
  const bag = readBag();
  let changed = 0;
  /** @type {object[]} */
  const expired = [];
  for (let i = 0; i < bag.proposals.length; i += 1) {
    const p = bag.proposals[i];
    const status = normalizeProposalStatus(p.status);
    if (status !== "proposed" && status !== "approved") continue;
    const createdMs = Date.parse(p.createdAt || "") || 0;
    const expiresAtMs = p.expiresAt ? Date.parse(p.expiresAt) : createdMs + ttlMs;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) continue;
    bag.proposals[i] = {
      ...p,
      status: "expired",
      updatedAt: new Date(nowMs).toISOString(),
      proposal: { ...(p.proposal || {}), status: "expired" },
    };
    changed += 1;
    expired.push(bag.proposals[i]);
  }
  if (changed) writeBag(bag);
  return { ok: true, expiredCount: changed, expired };
}

/**
 * @param {string} correlationId
 */
export function findByCorrelationId(correlationId) {
  const id = String(correlationId || "").trim();
  if (!id) return null;
  return (
    readBag().proposals.find(
      (p) => p.correlationId === id || p.proposalId === id,
    ) || null
  );
}

/**
 * @param {{ companionId?: string, limit?: number }} [opts]
 */
export function listAllProposals(opts = {}) {
  const companionId = String(opts.companionId || "").trim();
  const limit = Math.max(1, Math.min(500, Number(opts.limit) || 200));
  return readBag().proposals
    .filter((p) => !companionId || String(p.scope?.companionId || "") === companionId)
    .slice(0, limit);
}

export function clearProposalsForTests() {
  writeBag(emptyBag());
}

/**
 * Convert repo record → W4 proposal-store shape (status "executed" for completed).
 * @param {object} record
 */
export function toStoreRecord(record) {
  if (!record) return null;
  const status = normalizeProposalStatus(record.status);
  const legacyStatus = status === "completed" ? "executed" : status;
  const contractStatus = ["proposed", "approved", "rejected", "executed", "failed"].includes(legacyStatus)
    ? legacyStatus
    : status === "completed"
      ? "executed"
      : "proposed";
  return {
    proposal: {
      ...(record.proposal || {}),
      proposalId: record.proposalId,
      status: contractStatus,
      exactEffect: record.exactEffect || record.proposal?.exactEffect || "",
      risk: record.risk || record.proposal?.risk || "",
      parameters: record.parameters || record.proposal?.parameters || {},
      evidenceRefs: record.evidenceRefs || record.proposal?.evidenceRefs || [],
      reversible: record.proposal?.reversible,
      capabilityId: record.proposal?.capabilityId,
      operation: record.proposal?.operation,
      title: record.proposal?.title,
      requiresApproval: record.proposal?.requiresApproval,
      explicitness: record.proposal?.explicitness,
      schemaVersion: record.proposal?.schemaVersion,
    },
    turnId: record.turnId || "",
    scope: record.scope || {},
    sourceText: record.sourceText || "",
    status: legacyStatus,
    registeredAt: record.createdAt,
    taskId: record.taskId || "",
    executionResult: record.executionResult,
    rejectedAt: record.rejectedAt,
    approvedAt: record.approvedAt,
    executedAt: record.executedAt,
    undoInfo: record.undoInfo,
    temporalSnapshot: record.temporalSnapshot,
    correlationId: record.correlationId,
    expiresAt: record.expiresAt,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
  };
}
