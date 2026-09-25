/**
 * Relationship reducer stub — applies only accepted experience events (W5 / §11).
 * Not a full social simulation; tracks intimacy/trust/tension deltas + event log.
 */

export const RELATIONSHIP_STORE_KEY = "yueqi.experience.relationship.v1";

/** @type {Storage|null} */
let _storageOverride = null;

let _eventSeq = 0;

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
export function __setRelationshipStorageForTests(storage) {
  _storageOverride = storage;
}

export function __clearRelationshipForTests() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(RELATIONSHIP_STORE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function __resetRelationshipIdSeqForTests() {
  _eventSeq = 0;
}

/**
 * @param {Partial<object>} [seed]
 */
export function createEmptyRelationshipState(seed = {}) {
  return {
    characterId: String(seed.characterId || "").trim(),
    intimacy: clamp(Number(seed.intimacy) || 0, 0, 5),
    trust: clamp(Number(seed.trust) || 0, 0, 5),
    tension: clamp(Number(seed.tension) || 0, 0, 3),
    flags: Array.isArray(seed.flags) ? seed.flags.map(String) : [],
    events: Array.isArray(seed.events) ? seed.events.slice() : [],
    updatedAt: String(seed.updatedAt || nowIso()),
  };
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function readBag() {
  const storage = getStorage();
  if (!storage) return { byCharacter: {} };
  try {
    const raw = JSON.parse(storage.getItem(RELATIONSHIP_STORE_KEY) || "{}") || {};
    return {
      byCharacter:
        raw.byCharacter && typeof raw.byCharacter === "object" ? { ...raw.byCharacter } : {},
    };
  } catch {
    return { byCharacter: {} };
  }
}

function writeBag(bag) {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "no_storage" };
  try {
    storage.setItem(RELATIONSHIP_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage_write_failed" };
  }
}

/**
 * @param {string} characterId
 */
export function getRelationshipState(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return createEmptyRelationshipState();
  const bag = readBag();
  const row = bag.byCharacter[cid];
  if (!row) return createEmptyRelationshipState({ characterId: cid });
  return createEmptyRelationshipState({ ...row, characterId: cid });
}

/**
 * @param {string} characterId
 * @param {object} state
 */
export function saveRelationshipState(characterId, state) {
  const cid = String(characterId || "").trim();
  if (!cid) return { ok: false, reason: "missing_character" };
  const bag = readBag();
  bag.byCharacter[cid] = createEmptyRelationshipState({
    ...state,
    characterId: cid,
    updatedAt: nowIso(),
  });
  writeBag(bag);
  return { ok: true, value: bag.byCharacter[cid] };
}

/**
 * Apply a relation patch that originated from an **accepted** experience candidate.
 * Idempotent by meta.projectionKey when provided.
 * @param {object} state
 * @param {object|null} patch
 * @param {{
 *   characterId?: string,
 *   projectionKey?: string,
 *   candidateId?: string,
 *   sessionId?: string,
 *   branchId?: string,
 *   summary?: string,
 *   at?: string,
 * }} [meta]
 */
export function applyAcceptedRelationPatch(state, patch, meta = {}) {
  const base = createEmptyRelationshipState(state || {});
  if (!patch || typeof patch !== "object") {
    return { state: base, event: null, applied: false, reason: "empty_patch" };
  }

  const projectionKey = String(meta.projectionKey || "").trim();
  if (projectionKey && base.events.some((e) => e.projectionKey === projectionKey)) {
    return {
      state: base,
      event: base.events.find((e) => e.projectionKey === projectionKey) || null,
      applied: false,
      reason: "already_applied",
    };
  }

  const intimacyDelta = Number(patch.intimacyDelta ?? patch.intimacy ?? 0) || 0;
  const trustDelta = Number(patch.trustDelta ?? patch.trust ?? 0) || 0;
  const tensionDelta = Number(patch.tensionDelta ?? patch.tension ?? 0) || 0;
  const flags = Array.isArray(patch.flags) ? patch.flags.map(String) : [];

  _eventSeq += 1;
  const event = {
    id: `rel-${Date.now().toString(36)}-${_eventSeq}`,
    kind: String(patch.kind || "shared_experience"),
    summary: String(meta.summary || patch.summary || "").slice(0, 240),
    intimacyDelta,
    trustDelta,
    tensionDelta,
    flags,
    projectionKey,
    candidateId: String(meta.candidateId || "").trim(),
    sessionId: String(meta.sessionId || "").trim(),
    branchId: String(meta.branchId || "").trim(),
    at: String(meta.at || nowIso()),
  };

  const nextFlags = [...base.flags];
  for (const f of flags) {
    if (f && !nextFlags.includes(f)) nextFlags.push(f);
  }

  const next = createEmptyRelationshipState({
    ...base,
    characterId: String(meta.characterId || base.characterId || "").trim(),
    intimacy: clamp(base.intimacy + intimacyDelta, 0, 5),
    trust: clamp(base.trust + trustDelta, 0, 5),
    tension: clamp(base.tension + tensionDelta, 0, 3),
    flags: nextFlags,
    events: [...base.events, event].slice(-80),
    updatedAt: nowIso(),
  });

  return { state: next, event, applied: true };
}

/**
 * @param {string} characterId
 * @param {{ limit?: number }} [opts]
 */
export function listRelationshipEvents(characterId, opts = {}) {
  const state = getRelationshipState(characterId);
  const limit = Math.max(1, Number(opts.limit) || 40);
  return state.events.slice(-limit).reverse();
}
