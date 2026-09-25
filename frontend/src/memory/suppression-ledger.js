/**
 * Suppression ledger (M6) — forgotten / suppressed stable ids + sourceRefs.
 * When `unifiedMemoryForgetV1` is on, recall/search filters must drop suppressed keys
 * and consolidator must not resurrect forgotten facts from old chat.
 *
 */

export const SUPPRESSION_LEDGER_KEY = "yueqi.memory.suppression.v1";

/** @type {null | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setSuppressionLedgerStorageForTests(storage) {
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
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function emptyBag() {
  return { schemaVersion: 1, keys: {} };
}

function readBag() {
  try {
    const raw = ls()?.getItem(SUPPRESSION_LEDGER_KEY);
    if (!raw) return emptyBag();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyBag();
    if (!parsed.keys || typeof parsed.keys !== "object") parsed.keys = {};
    return parsed;
  } catch {
    return emptyBag();
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(SUPPRESSION_LEDGER_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/**
 * Normalize claim / content for suppression fingerprint matching.
 * @param {string} text
 */
export function suppressionFingerprint(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, "")
    .trim()
    .slice(0, 160);
}

/**
 * @param {string} idOrRef
 * @returns {boolean}
 */
export function isSuppressed(idOrRef) {
  const key = String(idOrRef || "").trim();
  if (!key) return false;
  const bag = readBag();
  if (bag.keys[key]) return true;
  const fp = suppressionFingerprint(key);
  if (fp && fp !== key && bag.keys[fp]) return true;
  return false;
}

/**
 * Content-aware suppression: exact key/fingerprint match, or containment against
 * recorded claim fingerprints (so consolidator variants cannot resurrect).
 * @param {string} text
 * @returns {boolean}
 */
export function isSuppressedContent(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isSuppressed(raw)) return true;
  const fp = suppressionFingerprint(raw);
  if (!fp) return false;
  if (isSuppressed(fp)) return true;
  const bag = readBag();
  for (const [key, meta] of Object.entries(bag.keys || {})) {
    if (!key) continue;
    if (meta?.kind && meta.kind !== "fingerprint" && meta.kind !== "stable" && meta.kind !== "candidate") {
      // still allow sourceRef exact via isSuppressed above; skip containment on refs
      if (meta.kind === "sourceRef") continue;
    }
    const kfp = meta?.kind === "fingerprint" ? key : suppressionFingerprint(key);
    if (!kfp || kfp.length < 4) continue;
    if (fp.includes(kfp) || kfp.includes(fp)) return true;
  }
  return false;
}

/**
 * Record forgotten stable ids, candidate ids, sourceRefs, and claim fingerprints.
 * @param {{
 *   stableIds?: string[],
 *   candidateIds?: string[],
 *   sourceRefs?: string[],
 *   claims?: string[],
 *   fingerprints?: string[],
 *   companionId?: string,
 *   reason?: string,
 *   at?: string,
 * }} input
 */
export function recordSuppression(input = {}) {
  const bag = readBag();
  const at = String(input.at || new Date().toISOString());
  const companionId = String(input.companionId || "").trim();
  const reason = String(input.reason || "user_forget").trim() || "user_forget";
  let added = 0;

  const put = (rawKey, kind) => {
    const key = String(rawKey || "").trim();
    if (!key) return;
    if (!bag.keys[key]) added += 1;
    bag.keys[key] = {
      kind: String(kind || "id"),
      companionId,
      reason,
      at,
    };
  };

  for (const id of Array.isArray(input.stableIds) ? input.stableIds : []) put(id, "stable");
  for (const id of Array.isArray(input.candidateIds) ? input.candidateIds : []) put(id, "candidate");
  for (const ref of Array.isArray(input.sourceRefs) ? input.sourceRefs : []) put(ref, "sourceRef");
  for (const fp of Array.isArray(input.fingerprints) ? input.fingerprints : []) put(fp, "fingerprint");
  for (const claim of Array.isArray(input.claims) ? input.claims : []) {
    const fp = suppressionFingerprint(claim);
    if (fp) put(fp, "fingerprint");
  }

  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, added, total: Object.keys(bag.keys).length };
}

/**
 * Bulk helper used by forgetUnderstanding.
 * @param {{
 *   forgottenStable?: object[],
 *   forgottenCandidates?: object[],
 *   companionId?: string,
 *   reason?: string,
 * }} input
 */
export function recordForgetSuppression(input = {}) {
  const stableIds = [];
  const candidateIds = [];
  const sourceRefs = [];
  const claims = [];

  for (const m of Array.isArray(input.forgottenStable) ? input.forgottenStable : []) {
    const id = String(m?.memoryId || m?.id || "").trim();
    if (id) {
      stableIds.push(id);
      sourceRefs.push(`stable:${id}`);
    }
    if (m?.sourceCandidateId) sourceRefs.push(String(m.sourceCandidateId));
    for (const ref of Array.isArray(m?.evidenceRefs) ? m.evidenceRefs : []) {
      if (ref) sourceRefs.push(String(ref));
    }
    if (m?.body) claims.push(String(m.body));
  }

  for (const c of Array.isArray(input.forgottenCandidates) ? input.forgottenCandidates : []) {
    const id = String(c?.candidateId || c?.id || "").trim();
    if (id) candidateIds.push(id);
    for (const ref of Array.isArray(c?.evidenceRefs) ? c.evidenceRefs : []) {
      if (ref) sourceRefs.push(String(ref));
    }
    if (c?.sourceEventId) sourceRefs.push(String(c.sourceEventId));
    if (c?.claim) claims.push(String(c.claim));
  }

  return recordSuppression({
    stableIds,
    candidateIds,
    sourceRefs,
    claims,
    companionId: input.companionId,
    reason: input.reason || "user_forget",
  });
}

export function listSuppressionKeys() {
  return Object.keys(readBag().keys || {});
}

export function clearSuppressionLedgerForTests() {
  writeBag(emptyBag());
  try {
    ls()?.removeItem?.(SUPPRESSION_LEDGER_KEY);
  } catch {
    /* ignore */
  }
  writeBag(emptyBag());
}
