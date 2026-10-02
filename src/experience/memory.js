/**
 * Experience memory — candidates, review gates, and accepted-worldline projection (§11 / L8 / W5).
 * Only accepted candidates on a live (non-archived) branch of a non-preview/test session project.
 */

import { appendConfluenceEvent } from "../life/confluence.js";
import { ingestCandidate } from "../context/pipeline.js";
import { touchLastUsed } from "../context/store.js";
import {
  applyAcceptedRelationPatch,
  getRelationshipState,
  saveRelationshipState,
} from "./relationship.js";
import { getExperienceSession, saveExperienceSession } from "./store.js";

export const EXPERIENCE_MEMORY_STORE_KEY = "yueqi.experience.memory.v1";

export const CANDIDATE_TYPES = Object.freeze([
  "shared_event",
  "promise",
  "preference",
  "boundary",
  "unresolved_thread",
]);

/** pending ≡ proposed (§11.2); user W5 surface uses pending. */
export const CANDIDATE_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "rejected",
  "revoked",
]);

/** @type {Storage|null} */
let _storageOverride = null;

let _idSeq = 0;

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (_storageOverride) return _storageOverride;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * @param {Storage|null} storage
 */
export function __setExperienceMemoryStorageForTests(storage) {
  _storageOverride = storage;
}

export function __clearExperienceMemoryForTests() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(EXPERIENCE_MEMORY_STORE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function __resetExperienceMemoryIdSeqForTests() {
  _idSeq = 0;
}

/**
 * @param {string} [prefix]
 */
export function createExperienceMemoryId(prefix = "emc") {
  _idSeq += 1;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${_idSeq}-${rand}`;
}

/**
 * Projection identity — NOT fuzzy title/text match (§14 W5 / §15.7).
 * @param {string} sessionId
 * @param {string} branchId
 * @param {string} candidateId
 */
export function projectionKey(sessionId, branchId, candidateId) {
  return [
    String(sessionId || "").trim(),
    String(branchId || "").trim(),
    String(candidateId || "").trim(),
  ].join("::");
}

/**
 * @returns {{
 *   schemaVersion: number,
 *   candidates: Record<string, object>,
 *   projections: Record<string, object>,
 *   diaryLedger: object[],
 * }}
 */
function emptyBag() {
  return {
    schemaVersion: 1,
    candidates: {},
    projections: {},
    diaryLedger: [],
  };
}

function readBag() {
  const storage = getStorage();
  if (!storage) return emptyBag();
  try {
    const raw = JSON.parse(storage.getItem(EXPERIENCE_MEMORY_STORE_KEY) || "{}") || {};
    return {
      schemaVersion: Number(raw.schemaVersion) || 1,
      candidates:
        raw.candidates && typeof raw.candidates === "object" ? { ...raw.candidates } : {},
      projections:
        raw.projections && typeof raw.projections === "object" ? { ...raw.projections } : {},
      diaryLedger: Array.isArray(raw.diaryLedger) ? raw.diaryLedger.slice() : [],
    };
  } catch {
    return emptyBag();
  }
}

function writeBag(bag) {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "no_storage" };
  try {
    storage.setItem(EXPERIENCE_MEMORY_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage_write_failed" };
  }
}

/**
 * Normalize status: proposed → pending.
 * @param {unknown} status
 */
export function normalizeCandidateStatus(status) {
  const s = String(status || "pending").trim().toLowerCase();
  if (s === "proposed") return "pending";
  if (CANDIDATE_STATUSES.includes(s)) return s;
  return "pending";
}

/**
 * @param {unknown} type
 */
export function normalizeCandidateType(type) {
  const t = String(type || "shared_event").trim();
  if (CANDIDATE_TYPES.includes(t)) return t;
  return "shared_event";
}

/**
 * Normalize content for dedupe fingerprint.
 * @param {string} text
 */
export function normalizeMemoryKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, "")
    .trim()
    .slice(0, 160);
}

/**
 * @typedef {{
 *   id: string,
 *   candidateId: string,
 *   characterId: string,
 *   experienceSessionId: string,
 *   sessionId: string,
 *   branchId: string,
 *   sourceMessageIds: string[],
 *   type: string,
 *   summary: string,
 *   evidence: string,
 *   confidence: number,
 *   privacy: string,
 *   proposedRelationPatch: object|null,
 *   status: string,
 *   source: string,
 *   createdAt: string,
 *   updatedAt: string,
 *   acceptedAt: string,
 *   rejectedAt: string,
 *   revokedAt: string,
 *   committedAt: string,
 *   lastUsedAt: string|null,
 *   meta: object,
 * }} ExperienceMemoryCandidate
 */

/**
 * @param {Partial<ExperienceMemoryCandidate> & { summary?: string }} partial
 * @returns {ExperienceMemoryCandidate}
 */
export function createExperienceMemoryCandidate(partial = {}) {
  const now = nowIso();
  const id = String(partial.id || partial.candidateId || createExperienceMemoryId()).trim();
  const sessionId = String(
    partial.experienceSessionId || partial.sessionId || "",
  ).trim();
  return {
    id,
    candidateId: id,
    characterId: String(partial.characterId || "").trim(),
    experienceSessionId: sessionId,
    sessionId,
    branchId: String(partial.branchId || "").trim(),
    sourceMessageIds: Array.isArray(partial.sourceMessageIds)
      ? partial.sourceMessageIds.map(String).filter(Boolean)
      : [],
    type: normalizeCandidateType(partial.type),
    summary: String(partial.summary || "").trim().slice(0, 480),
    evidence: String(partial.evidence || "").trim().slice(0, 800),
    confidence: Math.max(0, Math.min(1, Number(partial.confidence) || 0.6)),
    privacy: String(partial.privacy || "shared").trim() || "shared",
    proposedRelationPatch:
      partial.proposedRelationPatch && typeof partial.proposedRelationPatch === "object"
        ? { ...partial.proposedRelationPatch }
        : null,
    status: normalizeCandidateStatus(partial.status),
    source: String(partial.source || "experience.finale").trim(),
    createdAt: String(partial.createdAt || now),
    updatedAt: String(partial.updatedAt || now),
    acceptedAt: String(partial.acceptedAt || ""),
    rejectedAt: String(partial.rejectedAt || ""),
    revokedAt: String(partial.revokedAt || ""),
    committedAt: String(partial.committedAt || ""),
    lastUsedAt: partial.lastUsedAt ? String(partial.lastUsedAt) : null,
    meta: partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * Persist / upsert a candidate.
 * @param {Partial<ExperienceMemoryCandidate>} partial
 */
export function saveCandidate(partial) {
  const candidate = createExperienceMemoryCandidate(partial);
  if (!candidate.characterId || !candidate.sessionId || !candidate.branchId) {
    return { ok: false, reason: "missing_identity", value: null };
  }
  if (!candidate.summary) {
    return { ok: false, reason: "empty_summary", value: null };
  }
  const bag = readBag();
  const prev = bag.candidates[candidate.id];
  const next = prev
    ? createExperienceMemoryCandidate({
        ...prev,
        ...candidate,
        createdAt: prev.createdAt,
        updatedAt: nowIso(),
      })
    : candidate;
  bag.candidates[next.id] = next;
  writeBag(bag);
  return { ok: true, value: next };
}

/**
 * @param {string} candidateId
 */
export function getCandidate(candidateId) {
  const id = String(candidateId || "").trim();
  if (!id) return null;
  return readBag().candidates[id] || null;
}

/**
 * @param {{
 *   characterId?: string,
 *   sessionId?: string,
 *   experienceSessionId?: string,
 *   branchId?: string,
 *   status?: string|string[],
 *   limit?: number,
 * }} [filter]
 */
export function listCandidates(filter = {}) {
  const bag = readBag();
  const sessionId = String(filter.sessionId || filter.experienceSessionId || "").trim();
  const characterId = String(filter.characterId || "").trim();
  const branchId = String(filter.branchId || "").trim();
  const statuses = filter.status == null
    ? null
    : new Set(
        (Array.isArray(filter.status) ? filter.status : [filter.status]).map(
          normalizeCandidateStatus,
        ),
      );
  const limit = Math.max(1, Number(filter.limit) || 200);
  return Object.values(bag.candidates)
    .filter((c) => {
      if (characterId && c.characterId !== characterId) return false;
      if (sessionId && c.sessionId !== sessionId) return false;
      if (branchId && c.branchId !== branchId) return false;
      if (statuses && !statuses.has(normalizeCandidateStatus(c.status))) return false;
      return true;
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}

/**
 * Dedupe within same session+branch by normalized summary.
 * @param {ExperienceMemoryCandidate|object} candidate
 */
export function findDuplicateCandidate(candidate) {
  const key = normalizeMemoryKey(candidate?.summary);
  if (!key) return null;
  const sessionId = String(candidate.sessionId || candidate.experienceSessionId || "").trim();
  const branchId = String(candidate.branchId || "").trim();
  const characterId = String(candidate.characterId || "").trim();
  const selfId = String(candidate.id || candidate.candidateId || "").trim();
  for (const peer of listCandidates({ characterId, sessionId, branchId, limit: 500 })) {
    if (peer.id === selfId) continue;
    if (normalizeCandidateStatus(peer.status) === "rejected") continue;
    if (normalizeCandidateStatus(peer.status) === "revoked") continue;
    if (normalizeMemoryKey(peer.summary) === key) return peer;
  }
  return null;
}

/**
 * Conflict: same type + opposing polarity on preference/boundary within session.
 * @param {ExperienceMemoryCandidate|object} candidate
 */
export function findConflictCandidates(candidate) {
  const type = normalizeCandidateType(candidate?.type);
  if (type !== "preference" && type !== "boundary" && type !== "promise") return [];
  const subject = extractPreferenceSubject(candidate?.summary);
  if (!subject) return [];
  const sessionId = String(candidate.sessionId || candidate.experienceSessionId || "").trim();
  const characterId = String(candidate.characterId || "").trim();
  const selfId = String(candidate.id || candidate.candidateId || "").trim();
  const negA = isNegativePreference(String(candidate.summary || ""));
  /** @type {object[]} */
  const out = [];
  for (const peer of listCandidates({ characterId, sessionId, limit: 500 })) {
    if (peer.id === selfId) continue;
    if (normalizeCandidateType(peer.type) !== type) continue;
    const st = normalizeCandidateStatus(peer.status);
    if (st === "rejected" || st === "revoked") continue;
    if (extractPreferenceSubject(peer.summary) !== subject) continue;
    const negB = isNegativePreference(String(peer.summary || ""));
    if (negA !== negB) out.push(peer);
  }
  return out;
}

/**
 * @param {string} summary
 */
function isNegativePreference(summary) {
  return /不喜欢|讨厌|反对|禁止|不再|拒绝|不要/.test(String(summary || ""));
}

/**
 * @param {string} summary
 */
function extractPreferenceSubject(summary) {
  const t = String(summary || "").trim();
  const m =
    t.match(/(?:不喜欢|讨厌|喜欢|偏好|习惯)\s*([^\s，。,！!？?]{1,24})/)
    || t.match(/([^\s，。,]{1,24})\s*(?:是|为)/);
  if (m?.[1]) return normalizeMemoryKey(m[1]);
  return normalizeMemoryKey(t.replace(/^(?:不喜欢|讨厌|喜欢|偏好)/, "")).slice(0, 48);
}

/**
 * Propose (pending) candidates from finale / memorySignals. Dedupes on insert.
 * @param {{
 *   characterId: string,
 *   experienceSessionId: string,
 *   branchId: string,
 *   signals?: unknown[],
 *   sourceMessageIds?: string[],
 *   source?: string,
 *   meta?: object,
 * }} input
 */
export function proposeCandidatesFromSignals(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const sessionId = String(input.experienceSessionId || "").trim();
  const branchId = String(input.branchId || "").trim();
  if (!characterId || !sessionId || !branchId) {
    return { ok: false, reason: "missing_identity", created: [], reused: [] };
  }

  const signals = Array.isArray(input.signals) ? input.signals : [];
  /** @type {object[]} */
  const created = [];
  /** @type {object[]} */
  const reused = [];

  for (const raw of signals) {
    const summary =
      typeof raw === "string"
        ? raw.trim()
        : String(raw?.summary || raw?.content || raw?.text || "").trim();
    if (!summary) continue;
    const draft = createExperienceMemoryCandidate({
      characterId,
      experienceSessionId: sessionId,
      branchId,
      summary,
      evidence: String(raw?.evidence || "").trim(),
      type: raw?.type || "shared_event",
      confidence: raw?.confidence,
      privacy: raw?.privacy || "shared",
      sourceMessageIds: Array.isArray(raw?.sourceMessageIds)
        ? raw.sourceMessageIds
        : input.sourceMessageIds || [],
      proposedRelationPatch: raw?.proposedRelationPatch || null,
      source: input.source || "experience.memorySignals",
      status: "pending",
      meta: { ...(input.meta || {}), ...(raw?.meta || {}) },
    });
    const dup = findDuplicateCandidate(draft);
    if (dup) {
      reused.push(dup);
      continue;
    }
    const conflicts = findConflictCandidates(draft);
    if (conflicts.length) {
      draft.meta = {
        ...draft.meta,
        conflictWith: conflicts.map((c) => c.id),
        conflictState: "suspected",
      };
    }
    const saved = saveCandidate(draft);
    if (saved.ok && saved.value) created.push(saved.value);
  }

  return { ok: true, created, reused };
}

/**
 * Accept a pending candidate (does not project until commit).
 * @param {string} candidateId
 * @param {{ force?: boolean }} [opts]
 */
export function acceptCandidate(candidateId, opts = {}) {
  const cand = getCandidate(candidateId);
  if (!cand) return { ok: false, reason: "not_found" };
  const status = normalizeCandidateStatus(cand.status);
  if (status === "accepted") {
    return { ok: true, already: true, value: cand };
  }
  if (status === "revoked" && !opts.force) {
    return { ok: false, reason: "revoked" };
  }
  if (status === "rejected" && !opts.force) {
    return { ok: false, reason: "rejected" };
  }
  const gate = assertProjectionAllowed(cand);
  if (!gate.ok) return gate;

  const now = nowIso();
  const saved = saveCandidate({
    ...cand,
    status: "accepted",
    acceptedAt: now,
    rejectedAt: "",
    revokedAt: "",
    updatedAt: now,
  });
  if (saved.ok && saved.value) {
    syncSessionAcceptedIds(saved.value);
  }
  return saved.ok
    ? { ok: true, already: false, value: saved.value }
    : { ok: false, reason: saved.reason || "save_failed" };
}

/**
 * @param {string} candidateId
 */
export function rejectCandidate(candidateId) {
  const cand = getCandidate(candidateId);
  if (!cand) return { ok: false, reason: "not_found" };
  const status = normalizeCandidateStatus(cand.status);
  if (status === "rejected") return { ok: true, already: true, value: cand };
  if (status === "accepted" && cand.committedAt) {
    return { ok: false, reason: "already_committed_use_revoke" };
  }
  const now = nowIso();
  const saved = saveCandidate({
    ...cand,
    status: "rejected",
    rejectedAt: now,
    updatedAt: now,
  });
  if (saved.ok && saved.value) syncSessionAcceptedIds(saved.value);
  return saved.ok
    ? { ok: true, already: false, value: saved.value }
    : { ok: false, reason: saved.reason || "save_failed" };
}

/**
 * Revoke an accepted (possibly committed) candidate and tombstone its projection.
 * @param {string} candidateId
 */
export function revokeCandidate(candidateId) {
  const cand = getCandidate(candidateId);
  if (!cand) return { ok: false, reason: "not_found" };
  const status = normalizeCandidateStatus(cand.status);
  if (status === "revoked") return { ok: true, already: true, value: cand };

  const now = nowIso();
  const key = projectionKey(cand.sessionId, cand.branchId, cand.candidateId || cand.id);
  const bag = readBag();
  if (bag.projections[key]) {
    bag.projections[key] = {
      ...bag.projections[key],
      revoked: true,
      revokedAt: now,
    };
  }
  bag.diaryLedger = bag.diaryLedger.filter((row) => row.projectionKey !== key);
  const next = createExperienceMemoryCandidate({
    ...cand,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  });
  bag.candidates[next.id] = next;
  writeBag(bag);
  syncSessionAcceptedIds(next);
  return { ok: true, already: false, value: next };
}

/**
 * Session / branch / runKind gates for L8.
 * @param {ExperienceMemoryCandidate|object} candidate
 * @param {{
 *   branchStatus?: string,
 *   runKind?: string,
 *   sessionMeta?: object,
 *   sessionStatus?: string,
 * }} [overrides]
 */
export function assertProjectionAllowed(candidate, overrides = {}) {
  const sessionId = String(candidate?.sessionId || candidate?.experienceSessionId || "").trim();
  const session = sessionId ? getExperienceSession(sessionId) : null;
  const meta = {
    ...(session?.meta && typeof session.meta === "object" ? session.meta : {}),
    ...(overrides.sessionMeta || {}),
  };
  const runKind = String(
    overrides.runKind || meta.runKind || meta.mode || "",
  )
    .trim()
    .toLowerCase();
  if (
    runKind === "preview"
    || runKind === "test"
    || runKind === "sandbox"
    || meta.preview === true
    || meta.isPreview === true
    || meta.testRun === true
    || meta.isTest === true
  ) {
    return { ok: false, reason: "preview_or_test_blocked" };
  }

  const branchStatus = String(
    overrides.branchStatus || meta.branchStatus || candidate?.meta?.branchStatus || "active",
  )
    .trim()
    .toLowerCase();
  if (branchStatus === "archived") {
    return { ok: false, reason: "archived_branch_blocked" };
  }

  const sessionStatus = String(overrides.sessionStatus || session?.status || "").trim();
  if (sessionStatus === "archived" && meta.allowArchivedSessionProjection !== true) {
    // ended is fine for finale commit; archived session itself is blocked
    return { ok: false, reason: "archived_session_blocked" };
  }

  return { ok: true };
}

function syncSessionAcceptedIds(candidate) {
  const sessionId = String(candidate.sessionId || "").trim();
  if (!sessionId) return;
  try {
    const session = getExperienceSession(sessionId);
    if (!session) return;
    const accepted = listCandidates({
      sessionId,
      status: "accepted",
      limit: 500,
    }).map((c) => c.id);
    saveExperienceSession({
      ...session,
      acceptedMemoryCandidateIds: accepted,
    });
  } catch {
    /* best effort */
  }
}

/**
 * Idempotent project of one accepted candidate → diary ledger / cohabit / context / relationship.
 * @param {string} candidateId
 * @param {{
 *   branchStatus?: string,
 *   runKind?: string,
 *   sessionMeta?: object,
 *   packageTitle?: string,
 *   skipExternal?: boolean,
 * }} [opts]
 */
export function commitCandidateProjection(candidateId, opts = {}) {
  const cand = getCandidate(candidateId);
  if (!cand) return { ok: false, reason: "not_found" };
  if (normalizeCandidateStatus(cand.status) !== "accepted") {
    return { ok: false, reason: "not_accepted" };
  }

  const gate = assertProjectionAllowed(cand, opts);
  if (!gate.ok) return gate;

  const key = projectionKey(cand.sessionId, cand.branchId, cand.candidateId || cand.id);
  const bag = readBag();
  const existing = bag.projections[key];
  if (existing && !existing.revoked) {
    return {
      ok: true,
      alreadyCommitted: true,
      projectionKey: key,
      projection: existing,
      candidate: cand,
    };
  }

  const now = nowIso();
  /** @type {object} */
  const projection = {
    projectionKey: key,
    sessionId: cand.sessionId,
    branchId: cand.branchId,
    candidateId: cand.candidateId || cand.id,
    characterId: cand.characterId,
    summary: cand.summary,
    type: cand.type,
    committedAt: now,
    revoked: false,
    targets: {
      diary: false,
      cohabit: false,
      context: false,
      relationship: false,
    },
    refs: {
      diaryId: "",
      eventId: "",
      contextItemId: "",
      relationEventId: "",
    },
  };

  // Diary ledger (testable without IndexedDB). Keyed identity only.
  const diaryId = `exp-diary:${key}`;
  bag.diaryLedger.push({
    id: diaryId,
    projectionKey: key,
    sessionId: cand.sessionId,
    branchId: cand.branchId,
    candidateId: cand.candidateId || cand.id,
    characterId: cand.characterId,
    title: opts.packageTitle
      ? `经历 · ${opts.packageTitle}`
      : "共同经历",
    body: cand.summary,
    createdAt: now,
  });
  projection.targets.diary = true;
  projection.refs.diaryId = diaryId;

  if (!opts.skipExternal) {
    try {
      const written = appendConfluenceEvent({
        appId: "experience",
        kind: "shared_event",
        summary: cand.summary.slice(0, 240),
        characterId: cand.characterId,
        idempotentKey: `experience-memory:${key}`,
        meta: {
          experienceSessionId: cand.sessionId,
          branchId: cand.branchId,
          candidateId: cand.candidateId || cand.id,
          projectionKey: key,
          type: cand.type,
          diaryId,
        },
        visibility: cand.privacy === "private" ? "private" : "shared",
      });
      if (written?.ok) {
        projection.targets.cohabit = true;
        projection.refs.eventId = String(written?.event?.id || "");
      }
    } catch {
      /* best effort */
    }

    try {
      const ingested = ingestCandidate({
        content: cand.summary,
        summary: cand.summary.slice(0, 240),
        kind: cand.type === "preference" || cand.type === "boundary" ? "relational" : "episodic",
        source: "experience.accepted",
        sourceRef: key,
        occurredAt: now,
        confidence: cand.confidence,
        characterId: cand.characterId,
        workspaceId: cand.characterId,
        whyRemembered: "谢幕接受的共同经历",
        tags: ["experience", "accepted", cand.type],
        privacyLevel: cand.privacy === "private" ? "private" : "shared",
      });
      if (ingested?.ok) {
        projection.targets.context = true;
        projection.refs.contextItemId = String(ingested.itemId || "");
      }
    } catch {
      /* best effort */
    }

    if (cand.proposedRelationPatch) {
      try {
        const state = getRelationshipState(cand.characterId);
        const applied = applyAcceptedRelationPatch(state, cand.proposedRelationPatch, {
          characterId: cand.characterId,
          projectionKey: key,
          candidateId: cand.candidateId || cand.id,
          sessionId: cand.sessionId,
          branchId: cand.branchId,
          summary: cand.summary,
          at: now,
        });
        saveRelationshipState(cand.characterId, applied.state);
        projection.targets.relationship = true;
        projection.refs.relationEventId = String(applied.event?.id || "");
      } catch {
        /* best effort */
      }
    }
  } else {
    // Still apply relationship stub in-process for tests with skipExternal
    if (cand.proposedRelationPatch) {
      const state = getRelationshipState(cand.characterId);
      const applied = applyAcceptedRelationPatch(state, cand.proposedRelationPatch, {
        characterId: cand.characterId,
        projectionKey: key,
        candidateId: cand.candidateId || cand.id,
        sessionId: cand.sessionId,
        branchId: cand.branchId,
        summary: cand.summary,
        at: now,
      });
      saveRelationshipState(cand.characterId, applied.state);
      projection.targets.relationship = true;
      projection.refs.relationEventId = String(applied.event?.id || "");
    }
  }

  bag.projections[key] = projection;
  const nextCand = createExperienceMemoryCandidate({
    ...cand,
    committedAt: now,
    updatedAt: now,
  });
  bag.candidates[nextCand.id] = nextCand;
  writeBag(bag);

  return {
    ok: true,
    alreadyCommitted: false,
    projectionKey: key,
    projection,
    candidate: nextCand,
  };
}

/**
 * Finale review commit: project all accepted candidates for a session+branch.
 * Rejected / pending / revoked are skipped. Idempotent per projection key.
 * @param {{
 *   experienceSessionId: string,
 *   branchId: string,
 *   characterId?: string,
 *   branchStatus?: string,
 *   runKind?: string,
 *   sessionMeta?: object,
 *   packageTitle?: string,
 *   skipExternal?: boolean,
 * }} input
 */
export function commitFinaleReview(input = {}) {
  const sessionId = String(input.experienceSessionId || "").trim();
  const branchId = String(input.branchId || "").trim();
  if (!sessionId || !branchId) {
    return { ok: false, reason: "missing_session_or_branch", results: [] };
  }

  const accepted = listCandidates({
    sessionId,
    branchId,
    characterId: input.characterId,
    status: "accepted",
    limit: 500,
  });

  /** @type {object[]} */
  const results = [];
  for (const cand of accepted) {
    results.push(
      commitCandidateProjection(cand.id, {
        branchStatus: input.branchStatus,
        runKind: input.runKind,
        sessionMeta: input.sessionMeta,
        packageTitle: input.packageTitle,
        skipExternal: input.skipExternal,
      }),
    );
  }

  const committed = results.filter((r) => r.ok && !r.alreadyCommitted).length;
  const reused = results.filter((r) => r.ok && r.alreadyCommitted).length;
  const failed = results.filter((r) => !r.ok);

  return {
    ok: failed.length === 0,
    sessionId,
    branchId,
    acceptedCount: accepted.length,
    committed,
    reused,
    failed,
    results,
  };
}

/**
 * @param {{ characterId?: string, sessionId?: string, includeRevoked?: boolean }} [filter]
 */
export function listProjections(filter = {}) {
  const bag = readBag();
  const characterId = String(filter.characterId || "").trim();
  const sessionId = String(filter.sessionId || "").trim();
  return Object.values(bag.projections).filter((p) => {
    if (!filter.includeRevoked && p.revoked) return false;
    if (characterId && p.characterId !== characterId) return false;
    if (sessionId && p.sessionId !== sessionId) return false;
    return true;
  });
}

/**
 * Diary ledger rows for accepted projections (testable consumer).
 * @param {{ characterId?: string, sessionId?: string }} [filter]
 */
export function listProjectedDiaryEntries(filter = {}) {
  const bag = readBag();
  const characterId = String(filter.characterId || "").trim();
  const sessionId = String(filter.sessionId || "").trim();
  const liveKeys = new Set(
    listProjections({ characterId, sessionId, includeRevoked: false }).map(
      (p) => p.projectionKey,
    ),
  );
  return bag.diaryLedger.filter((row) => {
    if (!liveKeys.has(row.projectionKey)) return false;
    if (characterId && row.characterId !== characterId) return false;
    if (sessionId && row.sessionId !== sessionId) return false;
    return true;
  });
}

/**
 * Retrieve accepted experiences for Pop / deskpet / phone.
 * Marks lastUsedAt. Never returns rejected/revoked/pending or revoked projections.
 * @param {{
 *   characterId: string,
 *   query?: string,
 *   mode?: string,
 *   limit?: number,
 *   markUsed?: boolean,
 * }} opts
 */
export function retrieveAcceptedExperiences(opts = {}) {
  const characterId = String(opts.characterId || "").trim();
  if (!characterId) return { ok: false, items: [], reason: "missing_character" };
  const limit = Math.max(1, Math.min(20, Number(opts.limit) || 6));
  const query = String(opts.query || "").trim().toLowerCase();
  const markUsed = opts.markUsed !== false;
  const now = nowIso();

  const projections = listProjections({ characterId, includeRevoked: false });
  /** @type {object[]} */
  const items = [];
  for (const p of projections) {
    const cand = getCandidate(p.candidateId);
    if (!cand || normalizeCandidateStatus(cand.status) !== "accepted") continue;
    if (cand.privacy === "forbidden") continue;
    if (query) {
      const hay = `${cand.summary} ${cand.evidence} ${cand.type}`.toLowerCase();
      if (!hay.includes(query) && !query.split(/\s+/).some((t) => t && hay.includes(t))) {
        // soft: still include if no text filter match when query empty tokens
        if (query.length >= 2) continue;
      }
    }
    items.push({
      projectionKey: p.projectionKey,
      sessionId: p.sessionId,
      branchId: p.branchId,
      candidateId: p.candidateId,
      characterId,
      type: cand.type,
      summary: cand.summary,
      confidence: cand.confidence,
      source: cand.source,
      committedAt: p.committedAt,
      lastUsedAt: cand.lastUsedAt,
    });
  }

  items.sort((a, b) => String(b.committedAt).localeCompare(String(a.committedAt)));
  const sliced = items.slice(0, limit);

  if (markUsed) {
    const bag = readBag();
    for (const item of sliced) {
      const cand = bag.candidates[item.candidateId];
      if (cand) {
        cand.lastUsedAt = now;
        cand.updatedAt = now;
        bag.candidates[cand.id] = cand;
      }
      const proj = bag.projections[item.projectionKey];
      const contextItemId = proj?.refs?.contextItemId;
      if (contextItemId) {
        try {
          touchLastUsed(contextItemId, now);
        } catch {
          /* ignore */
        }
      }
    }
    writeBag(bag);
  }

  return { ok: true, items: sliced, mode: String(opts.mode || "") };
}

/**
 * Assemble a short prompt contribution for pop / deskpet / phone.
 * @param {{ characterId: string, mode?: string, query?: string, limit?: number }} opts
 */
export function assembleAcceptedExperienceContribution(opts = {}) {
  const retrieved = retrieveAcceptedExperiences({
    ...opts,
    markUsed: true,
    limit: opts.limit ?? 4,
  });
  if (!retrieved.ok || !retrieved.items.length) {
    return { id: "accepted_experience", text: "", source: "experience.accepted", items: [] };
  }
  const lines = retrieved.items.map(
    (it) => `- [${it.type}] ${String(it.summary).slice(0, 120)}`,
  );
  return {
    id: "accepted_experience",
    text: `已接受的共同经历（勿机械复读）：\n${lines.join("\n")}`,
    source: "experience.accepted",
    items: retrieved.items,
  };
}

/**
 * Best-effort post-scene companion hint from latest accepted event — no spam invention.
 * @param {{ characterId: string }} opts
 */
export function suggestPostSceneCompanionAction(opts = {}) {
  const characterId = String(opts.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "missing_character" };
  const retrieved = retrieveAcceptedExperiences({
    characterId,
    limit: 1,
    markUsed: false,
  });
  const item = retrieved.items?.[0];
  if (!item) return { ok: false, reason: "no_accepted_experience" };

  const type = item.type;
  let actionId = "comfort";
  let hint = "轻轻提起刚才那段共同经历，一两句即可";
  if (type === "promise") {
    actionId = "nod";
    hint = "记住刚才的约定，稍后自然确认一次即可";
  } else if (type === "boundary") {
    actionId = "idle_loop";
    hint = "尊重刚确认的边界，不要主动加压";
  } else if (type === "preference") {
    actionId = "soft_smile";
    hint = "之后回应时可照顾刚才提到的偏好";
  }

  return {
    ok: true,
    actionId,
    hint,
    projectionKey: item.projectionKey,
    candidateId: item.candidateId,
    sessionId: item.sessionId,
    branchId: item.branchId,
    summary: item.summary,
  };
}

/**
 * Consumer guard: has this projection key been written to diary ledger?
 * @param {string} sessionId
 * @param {string} branchId
 * @param {string} candidateId
 */
export function hasProjectedDiary(sessionId, branchId, candidateId) {
  const key = projectionKey(sessionId, branchId, candidateId);
  return listProjectedDiaryEntries({ sessionId }).some((r) => r.projectionKey === key);
}
