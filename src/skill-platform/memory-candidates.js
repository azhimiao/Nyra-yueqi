/**
 * Pending memory candidates keyed by SkillRun — accept/reject in P5/P6.
 */

import { STORAGE_KEYS, SKILL_PLATFORM_SCHEMA_VERSION } from "./schema.js";

export const MEMORY_CANDIDATES_STORAGE_KEY = "yueqi.skills.memoryCandidates.v1";
export const CONFIRMED_MEMORY_STORAGE_KEY = "yueqi.skills.confirmedMemory.v1";

/** Short fact cap for sync_character — no consultation transcript. */
export const SYNC_CHARACTER_FACT_MAX_LEN = 200;

/** @typedef {"session_only"|"write_personal"|"sync_character"} MemoryConfirmDecision */

/** @type {object|null} */
let memoryBag = null;

/** @type {object|null} */
let confirmedBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setMemoryCandidatesStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
  confirmedBag = null;
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

function emptyBag() {
  return { schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION, byRun: {} };
}

function emptyConfirmedBag() {
  return {
    schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION,
    sessionByRun: {},
    globalFacts: [],
    characterFacts: [],
  };
}

function readBag() {
  if (memoryBag) return memoryBag;
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  try {
    const raw = storage.getItem(MEMORY_CANDIDATES_STORAGE_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: Number(parsed?.schemaVersion) || SKILL_PLATFORM_SCHEMA_VERSION,
      byRun: parsed?.byRun && typeof parsed.byRun === "object" ? parsed.byRun : {},
    };
    return memoryBag;
  } catch {
    memoryBag = emptyBag();
    return memoryBag;
  }
}

function readConfirmedBag() {
  if (confirmedBag) return confirmedBag;
  const storage = ls();
  if (!storage) {
    confirmedBag = emptyConfirmedBag();
    return confirmedBag;
  }
  try {
    const raw = storage.getItem(CONFIRMED_MEMORY_STORAGE_KEY);
    if (!raw) {
      confirmedBag = emptyConfirmedBag();
      return confirmedBag;
    }
    const parsed = JSON.parse(raw);
    confirmedBag = {
      schemaVersion: Number(parsed?.schemaVersion) || SKILL_PLATFORM_SCHEMA_VERSION,
      sessionByRun:
        parsed?.sessionByRun && typeof parsed.sessionByRun === "object" ? parsed.sessionByRun : {},
      globalFacts: Array.isArray(parsed?.globalFacts) ? parsed.globalFacts : [],
      characterFacts: Array.isArray(parsed?.characterFacts) ? parsed.characterFacts : [],
    };
    return confirmedBag;
  } catch {
    confirmedBag = emptyConfirmedBag();
    return confirmedBag;
  }
}

function writeBag(bag) {
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(MEMORY_CANDIDATES_STORAGE_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

function writeConfirmedBag(bag) {
  confirmedBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(CONFIRMED_MEMORY_STORAGE_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function clearAllMemoryCandidates() {
  memoryBag = emptyBag();
  confirmedBag = emptyConfirmedBag();
  const storage = ls();
  try {
    storage?.removeItem?.(MEMORY_CANDIDATES_STORAGE_KEY);
    storage?.removeItem?.(CONFIRMED_MEMORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} runId
 * @param {object[]} candidates
 */
export function addPendingCandidates(runId, candidates) {
  const id = String(runId || "").trim();
  if (!id) return { ok: false, reason: "missing_run_id" };
  const bag = readBag();
  if (!bag.byRun) bag.byRun = {};
  const existing = Array.isArray(bag.byRun[id]) ? bag.byRun[id] : [];
  const stamped = (candidates || []).map((c, index) => ({
    id: `mc_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...c,
  }));
  bag.byRun[id] = [...existing, ...stamped];
  writeBag(bag);

  // R3: also submit into unified Candidate Ledger (best-effort dual-run).
  try {
    // Lazy to avoid circular imports in Node verify harnesses.
    import("../memory/candidate-ledger.js").then((mod) => {
      for (const row of stamped) {
        try {
          mod.submitCandidate({
            candidateId: row.id,
            userId: "local_user",
            companionId: String(row.characterId || row.companionId || "unknown"),
            claim: String(row.text || row.claim || row.summary || "").trim(),
            category: String(row.kind || "preference"),
            confidence: Number(row.confidence) || 0.45,
            source: "skill_memory_candidate",
            sourceEventId: id,
            realityNamespace: String(row.realityNamespace || "reality"),
            userStated: Boolean(row.userStated),
            evidenceRefs: Array.isArray(row.evidenceRefs) ? row.evidenceRefs : [id],
            idempotencyKey: `skill:${id}:${row.id}`,
          });
        } catch {
          /* ignore per-row */
        }
      }
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  return { ok: true, value: stamped };
}

/**
 * @param {string} runId
 */
export function listPendingCandidates(runId) {
  const id = String(runId || "").trim();
  const rows = readBag().byRun?.[id];
  return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
}

/**
 * @param {string} runId
 */
export function listAllCandidates(runId) {
  return listPendingCandidates(runId);
}

/**
 * @param {string} runId
 */
export function countPendingCandidates(runId) {
  return listPendingCandidates(runId).filter((c) => c.status === "pending").length;
}

/**
 * Find candidate across all runs (verify / UI).
 * @param {string} candidateId
 */
export function findCandidateById(candidateId) {
  const id = String(candidateId || "").trim();
  if (!id) return null;
  const bag = readBag();
  for (const [runId, rows] of Object.entries(bag.byRun || {})) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find((r) => r.id === id);
    if (hit) return { runId, candidate: { ...hit } };
  }
  return null;
}

/**
 * @param {string} text
 */
function truncateSyncFact(text) {
  const t = String(text || "").trim();
  if (t.length <= SYNC_CHARACTER_FACT_MAX_LEN) return t;
  return `${t.slice(0, SYNC_CHARACTER_FACT_MAX_LEN - 1)}…`;
}

/**
 * Confirm a pending memory candidate.
 * @param {string} candidateId
 * @param {MemoryConfirmDecision|{ decision: MemoryConfirmDecision, characterId?: string }} decision
 */
export function confirmCandidate(candidateId, decision) {
  const id = String(candidateId || "").trim();
  if (!id) return { ok: false, reason: "missing_candidate_id" };

  const decisionType =
    typeof decision === "string" ? decision : String(decision?.decision || "").trim();
  const characterId =
    typeof decision === "object" && decision?.characterId
      ? String(decision.characterId).trim()
      : "";

  if (!["session_only", "write_personal", "sync_character"].includes(decisionType)) {
    return { ok: false, reason: "invalid_confirm_decision", decision: decisionType };
  }
  if (decisionType === "sync_character" && !characterId) {
    return { ok: false, reason: "missing_character_id" };
  }

  const located = findCandidateById(id);
  if (!located) return { ok: false, reason: "candidate_not_found" };
  if (located.candidate.status !== "pending") {
    return { ok: false, reason: "candidate_not_pending", status: located.candidate.status };
  }

  const { runId, candidate } = located;
  const bag = readBag();
  const rows = bag.byRun?.[runId];
  if (!Array.isArray(rows)) return { ok: false, reason: "candidate_not_found" };

  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, reason: "candidate_not_found" };

  const confirmedAt = new Date().toISOString();
  const confirmedRow = {
    ...rows[idx],
    status: "confirmed",
    confirmedAt,
    confirmDecision: decisionType,
    ...(characterId ? { characterId } : {}),
  };
  rows[idx] = confirmedRow;
  writeBag(bag);

  const confirmedStore = readConfirmedBag();
  const factId = `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const shortText = truncateSyncFact(candidate.text);

  if (decisionType === "session_only") {
    if (!confirmedStore.sessionByRun[runId]) confirmedStore.sessionByRun[runId] = [];
    confirmedStore.sessionByRun[runId].push({
      id: factId,
      text: shortText,
      sourceCandidateId: id,
      confirmedAt,
    });
  } else if (decisionType === "write_personal") {
    confirmedStore.globalFacts.push({
      id: factId,
      runId,
      text: shortText,
      sourceCandidateId: id,
      confirmedAt,
      scope: "personal",
    });
  } else if (decisionType === "sync_character") {
    confirmedStore.characterFacts.push({
      id: factId,
      runId,
      characterId,
      text: shortText,
      sourceCandidateId: id,
      confirmedAt,
      scope: "character",
    });
  }

  writeConfirmedBag(confirmedStore);

  return {
    ok: true,
    value: {
      candidate: confirmedRow,
      fact: {
        id: factId,
        decision: decisionType,
        text: shortText,
        characterId: characterId || undefined,
      },
    },
  };
}

/**
 * Global memory projection — confirmed write_personal only; pending excluded.
 * @param {string} [runId] optional filter
 */
export function projectGlobalMemory(runId) {
  const bag = readConfirmedBag();
  const facts = bag.globalFacts || [];
  if (!runId) return facts.map((f) => ({ ...f }));
  const id = String(runId).trim();
  return facts.filter((f) => f.runId === id).map((f) => ({ ...f }));
}

/**
 * Character-visible confirmed facts from sync_character decisions.
 * @param {string} characterId
 */
export function projectCharacterMemory(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return [];
  const bag = readConfirmedBag();
  return (bag.characterFacts || [])
    .filter((f) => f.characterId === cid)
    .map((f) => ({ ...f }));
}

/**
 * Session-scoped confirmed facts (not in global/character projection).
 * @param {string} runId
 */
export function projectSessionMemory(runId) {
  const id = String(runId || "").trim();
  const bag = readConfirmedBag();
  const rows = bag.sessionByRun?.[id];
  return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
}

/**
 * Pending candidates must never appear in global projection.
 * @param {string} runId
 */
export function assertPendingExcludedFromGlobal(runId) {
  const pending = listPendingCandidates(runId).filter((c) => c.status === "pending");
  const global = projectGlobalMemory(runId);
  const leaked = pending.filter((p) =>
    global.some((g) => g.sourceCandidateId === p.id || g.text === p.text),
  );
  return { ok: leaked.length === 0, leaked };
}

export function exportMemoryCandidatesBag() {
  return {
    pending: JSON.parse(JSON.stringify(readBag())),
    confirmed: JSON.parse(JSON.stringify(readConfirmedBag())),
  };
}

/**
 * @param {{ pending?: object, confirmed?: object }} bag
 */
export function importMemoryCandidatesBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false, reason: "invalid_bag" };
  if (bag.pending) {
    writeBag({
      schemaVersion: Number(bag.pending.schemaVersion) || SKILL_PLATFORM_SCHEMA_VERSION,
      byRun: bag.pending.byRun && typeof bag.pending.byRun === "object" ? bag.pending.byRun : {},
    });
  }
  if (bag.confirmed) {
    writeConfirmedBag({
      schemaVersion: Number(bag.confirmed.schemaVersion) || SKILL_PLATFORM_SCHEMA_VERSION,
      sessionByRun:
        bag.confirmed.sessionByRun && typeof bag.confirmed.sessionByRun === "object"
          ? bag.confirmed.sessionByRun
          : {},
      globalFacts: Array.isArray(bag.confirmed.globalFacts) ? bag.confirmed.globalFacts : [],
      characterFacts: Array.isArray(bag.confirmed.characterFacts) ? bag.confirmed.characterFacts : [],
    });
  }
  return { ok: true };
}
