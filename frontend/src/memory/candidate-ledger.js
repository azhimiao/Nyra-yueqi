/**
 * Understanding Candidate Ledger (R3) — sole authority for inferred understanding.
 * Stable memory only via controlled promotion; shared_fiction never auto-promotes to reality.
 * recalls require companionId; unscoped rows never broadcast.
 */

import {
  createUnderstandingCandidateV1,
  validateUnderstandingCandidateV1,
  createStableMemoryV1,
  validateStableMemoryV1,
  mintId,
} from "../contracts/index.js";
import { isFeatureEnabled } from "../features/flags.js";
import { freezeCompanionScope, rowMatchesCompanionScope } from "./companion-scope.js";
import { sweepAfterForget } from "./projection/stale-sweep.js";
import { projectStableUnderstanding } from "./stable-projection.js";
import {
  isSuppressed,
  recordForgetSuppression,
  clearSuppressionLedgerForTests,
} from "./suppression-ledger.js";

export const CANDIDATE_LEDGER_KEY = "yueqi.understanding.candidates.v1";
export const STABLE_MEMORY_KEY = "yueqi.stable.memory.v1";

/** Single observation cannot promote to global persona without user statement or high confidence + repeats. */
export const PROMOTE_MIN_CONFIDENCE = 0.85;
export const PROMOTE_MIN_EVIDENCE = 2;

/** @type {null | { getItem(k:string):string|null, setItem(k:string,v:string):void }} */
let testStorage = null;

export function __setCandidateLedgerStorageForTests(storage) {
  testStorage = storage;
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readJson(key, fallback) {
  try {
    const raw = ls()?.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(key, value) {
  try {
    ls()?.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

function emptyCandidates() {
  return { schemaVersion: 1, items: [] };
}

function emptyStable() {
  return { schemaVersion: 1, items: [] };
}

/**
 * @param {Partial<object>} input
 */
export function submitCandidate(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  if (!companionId) return { ok: false, reason: "missing_companionId" };
  const scope = freezeCompanionScope({
    userId: input.userId,
    companionId,
    relationshipId: input.relationshipId,
    memoryScope: input.memoryScope || input.scope || "companion_private_understanding",
  });
  const candidate = createUnderstandingCandidateV1({
    ...input,
    userId: scope.userId,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    scope: scope.memoryScope,
    candidateId: input.candidateId || mintId("eventId", "cand"),
    idempotencyKey: String(input.idempotencyKey || "").trim() || mintId("eventId", "idem"),
    status: input.status || "pending",
    confidence: input.userStated ? Math.max(Number(input.confidence) || 0, 0.9) : Number(input.confidence) || 0.4,
  });
  // Preserve M6 memoryScope on the stored row (contract scope field doubles as category bucket).
  candidate.memoryScope = scope.memoryScope;
  const validated = validateUnderstandingCandidateV1(candidate);
  if (!validated.ok) return { ok: false, reason: "invalid_candidate", errors: validated.errors };

  const bag = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  if (!Array.isArray(bag.items)) bag.items = [];
  const idx = bag.items.findIndex((c) => c.idempotencyKey === candidate.idempotencyKey);
  if (idx >= 0) {
    bag.items[idx] = { ...bag.items[idx], ...candidate, updatedAt: new Date().toISOString() };
  } else {
    bag.items.unshift(candidate);
  }
  if (bag.items.length > 5000) bag.items.length = 5000;
  const saved = writeJson(CANDIDATE_LEDGER_KEY, bag);
  if (!saved.ok) return saved;
  return { ok: true, value: idx >= 0 ? bag.items[idx] : candidate };
}

/**
 * @param {string} candidateId
 * @param {"accepted"|"rejected"|"corrected"|"forgotten"|"expired"|"superseded"} status
 * @param {{ claim?: string, counterEvidenceRefs?: string[] }} [patch]
 */
export function transitionCandidate(candidateId, status, patch = {}) {
  const id = String(candidateId || "").trim();
  const bag = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  const item = bag.items.find((c) => c.candidateId === id);
  if (!item) return { ok: false, reason: "not_found" };
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (patch.claim) item.claim = String(patch.claim);
  if (Array.isArray(patch.counterEvidenceRefs)) {
    item.counterEvidenceRefs = [...(item.counterEvidenceRefs || []), ...patch.counterEvidenceRefs];
  }
  if (status === "corrected" || status === "forgotten" || status === "rejected") {
    item.confidence = Math.min(Number(item.confidence) || 0, 0.15);
  }
  const saved = writeJson(CANDIDATE_LEDGER_KEY, bag);
  if (!saved.ok) return saved;
  return { ok: true, value: item };
}

/**
 * Recall candidates for context — excludes rejected/forgotten/expired and wrong namespace.
 * @param {{
 *   userId?: string,
 *   companionId?: string,
 *   realityNamespace?: string,
 *   includeStatuses?: string[],
 *   limit?: number,
 * }} query
 */
export function recallCandidates(query = {}) {
  const bag = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  const companionId = String(query.companionId || "").trim();
  // companion recalls must be scoped — empty companionId returns nothing (no broadcast).
  if (!companionId) return [];
  const userId = String(query.userId || "").trim();
  const relationshipId = String(query.relationshipId || "").trim();
  const ns = String(query.realityNamespace || "reality").trim();
  const allow = new Set(query.includeStatuses || ["pending", "accepted"]);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const forgetOn = isFeatureEnabled("unifiedMemoryForgetV1");
  return (bag.items || [])
    .filter((c) => c && allow.has(c.status))
    .filter((c) => rowMatchesCompanionScope(c, {
      companionId,
      userId,
      relationshipId,
      allowGlobal: query.allowGlobal === true,
      allowSharedSpaceId: query.sharedSpaceId,
    }))
    .filter((c) => {
      const cns = String(c.realityNamespace || "reality");
      if (ns === "reality") return cns === "reality";
      return cns === ns;
    })
    .filter((c) => c.status !== "forgotten" && c.status !== "rejected" && c.status !== "expired")
    .filter((c) => {
      if (!forgetOn) return true;
      if (isSuppressed(c.candidateId) || isSuppressed(c.claim)) return false;
      const refs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs : [];
      return !refs.some((ref) => isSuppressed(ref));
    })
    .slice(0, limit);
}

/**
 * Promote candidate → stable memory with hard gates.
 * @param {string} candidateId
 */
export function promoteCandidateToStable(candidateId) {
  const id = String(candidateId || "").trim();
  const bag = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  const candidate = bag.items.find((c) => c.candidateId === id);
  if (!candidate) return { ok: false, reason: "not_found" };
  if (["rejected", "forgotten", "expired"].includes(candidate.status)) {
    return { ok: false, reason: "not_promotable_status" };
  }
  if (String(candidate.realityNamespace || "reality") === "shared_fiction") {
    return { ok: false, reason: "shared_fiction_blocked" };
  }
  const evidenceCount = Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs.length : 0;
  const userStated = Boolean(candidate.userStated);
  if (!userStated) {
    if (Number(candidate.confidence) < PROMOTE_MIN_CONFIDENCE) {
      return { ok: false, reason: "confidence_too_low" };
    }
    if (evidenceCount < PROMOTE_MIN_EVIDENCE) {
      return { ok: false, reason: "single_observation_blocked" };
    }
  }

  const memory = createStableMemoryV1({
    memoryId: mintId("eventId", "mem"),
    userId: candidate.userId,
    companionId: candidate.companionId,
    relationshipId: candidate.relationshipId,
    body: candidate.claim,
    category: candidate.category,
    realityNamespace: candidate.realityNamespace || "reality",
    source: "candidate_promotion",
    sourceCandidateId: candidate.candidateId,
    sourceEventId: candidate.sourceEventId,
    evidenceRefs: candidate.evidenceRefs || [],
    idempotencyKey: `stable:${candidate.idempotencyKey}`,
  });
  const validated = validateStableMemoryV1(memory);
  if (!validated.ok) return { ok: false, reason: "invalid_memory", errors: validated.errors };

  const stable = readJson(STABLE_MEMORY_KEY, emptyStable());
  if (!Array.isArray(stable.items)) stable.items = [];
  const existing = stable.items.findIndex((m) => m.idempotencyKey === memory.idempotencyKey && !m.deleted);
  if (existing >= 0) stable.items[existing] = memory;
  else stable.items.unshift(memory);
  writeJson(STABLE_MEMORY_KEY, stable);

  candidate.status = "accepted";
  candidate.updatedAt = new Date().toISOString();
  writeJson(CANDIDATE_LEDGER_KEY, bag);

  /** @type {object|null} */
  let projection = null;
  if (isFeatureEnabled("contextGraphProjectionOnlyV1")) {
    try {
      projection = projectStableUnderstanding(memory);
    } catch {
      projection = { ok: false, reason: "projection_failed" };
    }
  }

  return { ok: true, value: memory, projection };
}

/**
 * @param {{ companionId?: string, realityNamespace?: string, limit?: number }} query
 */
export function recallStableMemory(query = {}) {
  const stable = readJson(STABLE_MEMORY_KEY, emptyStable());
  const companionId = String(query.companionId || "").trim();
  if (!companionId) return [];
  const userId = String(query.userId || "").trim();
  const relationshipId = String(query.relationshipId || "").trim();
  const ns = String(query.realityNamespace || "reality").trim();
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const forgetOn = isFeatureEnabled("unifiedMemoryForgetV1");
  return (stable.items || [])
    .filter((m) => m && !m.deleted)
    .filter((m) => rowMatchesCompanionScope(m, {
      companionId,
      userId,
      relationshipId,
      allowGlobal: query.allowGlobal === true,
      allowSharedSpaceId: query.sharedSpaceId,
    }))
    .filter((m) => {
      const mns = String(m.realityNamespace || "reality");
      if (ns === "reality") return mns === "reality";
      return mns === ns;
    })
    .filter((m) => {
      if (!forgetOn) return true;
      if (isSuppressed(m.memoryId) || isSuppressed(`stable:${m.memoryId}`) || isSuppressed(m.body)) {
        return false;
      }
      const refs = Array.isArray(m.evidenceRefs) ? m.evidenceRefs : [];
      return !refs.some((ref) => isSuppressed(ref));
    })
    .slice(0, limit);
}

/**
 * Cascade forget: tombstone stable + supersede candidates sharing claim/key.
 * When palaceProjectionV1 or unifiedMemoryForgetV1 is on, stale-sweep palace index.
 * When unifiedMemoryForgetV1 is on, also write suppression ledger.
 * @param {{ companionId: string, claimIncludes?: string, candidateId?: string, palaceStore?: object }} input
 */
export function forgetUnderstanding(input = {}) {
  const companionId = String(input.companionId || "").trim();
  const needle = String(input.claimIncludes || "").trim().toLowerCase();
  const candidateId = String(input.candidateId || "").trim();
  const bag = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  const stable = readJson(STABLE_MEMORY_KEY, emptyStable());
  let touched = 0;
  /** @type {object[]} */
  const forgottenCandidates = [];
  /** @type {object[]} */
  const forgottenStable = [];
  for (const c of bag.items || []) {
    if (companionId && c.companionId !== companionId) continue;
    if (candidateId && c.candidateId !== candidateId) continue;
    if (needle && !String(c.claim || "").toLowerCase().includes(needle)) continue;
    c.status = "forgotten";
    c.updatedAt = new Date().toISOString();
    forgottenCandidates.push(c);
    touched += 1;
  }
  for (const m of stable.items || []) {
    if (companionId && m.companionId !== companionId) continue;
    const body = String(m.body || m.claim || "").toLowerCase();
    if (needle && !body.includes(needle)) continue;
    m.deleted = true;
    m.tombstone = { reason: "user_forget", at: new Date().toISOString() };
    m.updatedAt = new Date().toISOString();
    forgottenStable.push(m);
    touched += 1;
  }
  writeJson(CANDIDATE_LEDGER_KEY, bag);
  writeJson(STABLE_MEMORY_KEY, stable);

  const forgetOn = isFeatureEnabled("unifiedMemoryForgetV1");
  /** @type {object|null} */
  let suppression = null;
  if (forgetOn && (forgottenStable.length || forgottenCandidates.length)) {
    try {
      suppression = recordForgetSuppression({
        forgottenStable,
        forgottenCandidates,
        companionId,
        reason: "user_forget",
      });
    } catch {
      suppression = { ok: false, reason: "suppression_failed" };
    }
  }

  /** @type {object|null} */
  let palaceSweep = null;
  const sweepOn = isFeatureEnabled("palaceProjectionV1") || forgetOn;
  if (sweepOn && (forgottenStable.length || forgottenCandidates.length)) {
    try {
      palaceSweep = sweepAfterForget({
        forgottenStable,
        forgottenCandidates,
        companionId,
        store: input.palaceStore,
      });
    } catch {
      palaceSweep = { ok: false, reason: "palace_sweep_failed" };
    }
  }

  return { ok: true, touched, palaceSweep, suppression };
}

/**
 * Forget understanding whose authority came from a deleted user message.
 *
 * Evidence identity is safer than text matching: deleting "我喜欢雨天" must
 * not erase an unrelated memory that happens to contain the same words.
 * @param {{ evidenceRefs?: string[], reason?: string, palaceStore?: object }} input
 */
export function forgetUnderstandingByEvidenceRefs(input = {}) {
  const refs = new Set(
    (Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [])
      .map((ref) => String(ref || "").trim())
      .filter(Boolean),
  );
  if (!refs.size) {
    return {
      ok: true,
      touched: 0,
      candidatesForgotten: 0,
      stableForgotten: 0,
      forgottenCandidates: [],
      forgottenStable: [],
    };
  }

  const at = new Date().toISOString();
  const reason = String(input.reason || "message_deleted").trim() || "message_deleted";
  const candidates = readJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  const stable = readJson(STABLE_MEMORY_KEY, emptyStable());
  const forgottenCandidates = [];
  const forgottenStable = [];

  for (const candidate of candidates.items || []) {
    const evidence = Array.isArray(candidate?.evidenceRefs)
      ? candidate.evidenceRefs.map(String)
      : [];
    if (!evidence.some((ref) => refs.has(ref))) continue;
    if (candidate.status !== "forgotten") {
      candidate.status = "forgotten";
      candidate.confidence = Math.min(Number(candidate.confidence) || 0, 0.15);
      candidate.updatedAt = at;
      candidate.tombstone = { reason, at };
    }
    forgottenCandidates.push(candidate);
  }

  const forgottenCandidateIds = new Set(
    forgottenCandidates.map((candidate) => String(candidate.candidateId || "")).filter(Boolean),
  );
  for (const memory of stable.items || []) {
    const evidence = Array.isArray(memory?.evidenceRefs)
      ? memory.evidenceRefs.map(String)
      : [];
    const linkedCandidate = String(memory?.sourceCandidateId || "");
    if (
      !evidence.some((ref) => refs.has(ref))
      && (!linkedCandidate || !forgottenCandidateIds.has(linkedCandidate))
    ) {
      continue;
    }
    if (!memory.deleted) {
      memory.deleted = true;
      memory.tombstone = { reason, at };
      memory.updatedAt = at;
    }
    forgottenStable.push(memory);
  }

  writeJson(CANDIDATE_LEDGER_KEY, candidates);
  writeJson(STABLE_MEMORY_KEY, stable);

  let suppression = null;
  try {
    suppression = recordForgetSuppression({
      forgottenStable,
      forgottenCandidates,
      reason,
    });
  } catch {
    suppression = { ok: false, reason: "suppression_failed" };
  }

  let palaceSweep = null;
  try {
    palaceSweep = sweepAfterForget({
      forgottenStable,
      forgottenCandidates,
      store: input.palaceStore,
    });
  } catch {
    palaceSweep = { ok: false, reason: "palace_sweep_failed" };
  }

  return {
    ok: true,
    touched: forgottenCandidates.length + forgottenStable.length,
    candidatesForgotten: forgottenCandidates.length,
    stableForgotten: forgottenStable.length,
    forgottenCandidates,
    forgottenStable,
    suppression,
    palaceSweep,
  };
}

export function clearCandidateLedgerForTests() {
  writeJson(CANDIDATE_LEDGER_KEY, emptyCandidates());
  writeJson(STABLE_MEMORY_KEY, emptyStable());
  try {
    clearSuppressionLedgerForTests();
  } catch {
    /* ignore */
  }
}
