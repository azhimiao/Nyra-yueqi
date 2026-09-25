/**
 * Unique persistence entry for character life DayPacks & observations.
 * Character-isolated; query by localDate. Works in browser + Node (memory).
 */

import { LIFE_STORE_KEY, dayPackId, isValidLocalDate } from "./schema.js";
import { validateDayPack, validateObservation } from "./validate.js";
import { getXingliDay001Clone, XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE } from "./fixtures/xingli-day-001.js";

/**
 * @typedef {{
 *   schemaVersion: number,
 *   packs: Record<string, object>,
 *   observations: object[],
 * }} LifeBag
 */

/** @type {LifeBag|null} */
let memoryBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * Inject storage for verify / export-import roundtrips (memory fixture).
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setLifeStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
}

function emptyBag() {
  return { schemaVersion: 1, packs: {}, observations: [] };
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

function readBag() {
  if (memoryBag) return memoryBag;
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  try {
    const raw = storage.getItem(LIFE_STORE_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: 1,
      packs: parsed?.packs && typeof parsed.packs === "object" ? parsed.packs : {},
      observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
    };
    return memoryBag;
  } catch {
    memoryBag = emptyBag();
    return memoryBag;
  }
}

function writeBag(bag) {
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(LIFE_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

/**
 * Persist a validated DayPack. Rejects invalid packs (does not wipe prior).
 * @param {unknown} raw
 */
export function saveDayPack(raw) {
  const validated = validateDayPack(raw);
  if (!validated.ok || !validated.value) {
    return { ok: false, reason: validated.reason || "invalid", pack: null };
  }
  const bag = readBag();
  const pack = validated.value;
  bag.packs[pack.id] = pack;
  writeBag(bag);
  return { ok: true, pack, repaired: Boolean(validated.repaired) };
}

/**
 * @param {string} characterId
 * @param {string} localDate
 */
export function getDayPack(characterId, localDate) {
  const cid = String(characterId || "").trim();
  const date = String(localDate || "").trim();
  if (!cid || !isValidLocalDate(date)) return null;
  const bag = readBag();
  const id = dayPackId(cid, date);
  const found = bag.packs[id];
  if (!found) return null;
  if (found.characterId !== cid) return null;
  return found;
}

/**
 * Latest pack for character (by localDate desc), or null.
 * @param {string} characterId
 */
export function getLatestDayPack(characterId) {
  const list = listDayPacks(characterId);
  return list[0] || null;
}

/**
 * @param {string} characterId
 * @param {{ limit?: number }} [opts]
 */
export function listDayPacks(characterId, opts = {}) {
  const cid = String(characterId || "").trim();
  const bag = readBag();
  const rows = Object.values(bag.packs || {}).filter(
    (p) => p && p.characterId === cid,
  );
  rows.sort((a, b) => String(b.localDate).localeCompare(String(a.localDate)));
  const limit = Math.max(1, Number(opts.limit) || 60);
  return rows.slice(0, limit);
}

/**
 * @param {string} characterId
 * @param {string} [localDate]
 */
export function listLifeEvents(characterId, localDate = "") {
  const cid = String(characterId || "").trim();
  const date = String(localDate || "").trim();
  if (date) {
    const pack = getDayPack(cid, date);
    return pack ? [...(pack.events || [])] : [];
  }
  const out = [];
  for (const pack of listDayPacks(cid)) {
    out.push(...(pack.events || []));
  }
  out.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  return out;
}

/**
 * Ensure Xingli seed day exists (offline / no-key).
 * Replaces pack if missing or below C3 §5.2 density (seed upgrade).
 */
export function ensureXingliSeedPack() {
  const existing = getDayPack(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE);
  if (existing) {
    const msgs = (existing.evidence || []).filter((e) => e.app === "messages" && e.kind === "thread_preview").length;
    const photos = (existing.evidence || []).filter((e) => e.app === "album" && e.kind === "photo").length;
    const browser = (existing.evidence || []).filter((e) => e.app === "browser").length;
    const memos = (existing.evidence || []).filter((e) => e.app === "memo").length;
    if (msgs >= 5 && photos >= 8 && browser >= 8 && memos >= 4) return existing;
  }
  const seed = getXingliDay001Clone();
  const result = saveDayPack(seed);
  return result.pack || existing;
}

/**
 * On generation failure: keep previous day's pack (do not clear).
 * @param {string} characterId
 * @param {string} localDate
 */
export function retainPreviousOnFailure(characterId, localDate) {
  const cid = String(characterId || "").trim();
  const date = String(localDate || "").trim();
  const current = getDayPack(cid, date);
  if (current) return { kept: current, reason: "current" };
  const prev = listDayPacks(cid).find((p) => p.localDate < date);
  return { kept: prev || null, reason: prev ? "previous" : "empty" };
}

/**
 * Record that the user viewed discoverable evidence.
 * @param {unknown} raw
 */
export function recordObservation(raw) {
  const validated = validateObservation(raw);
  if (!validated.ok || !validated.value) {
    return { ok: false, reason: validated.reason || "invalid" };
  }
  const bag = readBag();
  const obs = validated.value;
  // Idempotent: same character+evidence → update dwell / state
  const idx = bag.observations.findIndex(
    (o) => o.characterId === obs.characterId && o.evidenceId === obs.evidenceId,
  );
  if (idx >= 0) {
    const prev = bag.observations[idx];
    bag.observations[idx] = {
      ...prev,
      ...obs,
      dwellMs: Math.max(Number(prev.dwellMs) || 0, obs.dwellMs),
      reactionState:
        prev.reactionState === "used" ? "used" : obs.reactionState || prev.reactionState,
    };
  } else {
    bag.observations.unshift(obs);
  }
  bag.observations = bag.observations.slice(0, 500);
  writeBag(bag);
  return { ok: true, observation: bag.observations[idx >= 0 ? idx : 0] };
}

/**
 * @param {string} characterId
 */
export function listObservations(characterId, { limit = 100 } = {}) {
  const cid = String(characterId || "").trim();
  const bag = readBag();
  return (bag.observations || [])
    .filter((o) => o.characterId === cid)
    .slice(0, Math.max(1, Number(limit) || 100));
}

/**
 * Mark eligible → used after Pop consumed a reaction once.
 */
export function markObservationUsed(characterId, evidenceId) {
  const cid = String(characterId || "").trim();
  const eid = String(evidenceId || "").trim();
  const bag = readBag();
  let changed = false;
  for (const o of bag.observations) {
    if (o.characterId === cid && o.evidenceId === eid) {
      o.reactionState = "used";
      changed = true;
    }
  }
  if (changed) writeBag(bag);
  return changed;
}

/**
 * Delete all life data for one character (role switch / character delete).
 */
export function clearCharacterLife(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return;
  const bag = readBag();
  for (const id of Object.keys(bag.packs)) {
    if (bag.packs[id]?.characterId === cid) delete bag.packs[id];
  }
  bag.observations = (bag.observations || []).filter((o) => o.characterId !== cid);
  writeBag(bag);
}

export function clearAllLife() {
  writeBag(emptyBag());
}

export function exportLifeBag() {
  const bag = readBag();
  return JSON.parse(JSON.stringify(bag));
}

/**
 * @param {unknown} payload
 */
export function importLifeBag(payload) {
  if (!payload || typeof payload !== "object") {
    writeBag(emptyBag());
    return { ok: false, reason: "not_object", imported: 0 };
  }
  const src = /** @type {Record<string, unknown>} */ (payload);
  const packsIn = src.packs && typeof src.packs === "object"
    ? /** @type {Record<string, unknown>} */ (src.packs)
    : {};
  const next = emptyBag();
  let imported = 0;
  for (const raw of Object.values(packsIn)) {
    const validated = validateDayPack(raw);
    if (!validated.ok || !validated.value) continue;
    next.packs[validated.value.id] = validated.value;
    imported += 1;
  }
  const obsIn = Array.isArray(src.observations) ? src.observations : [];
  for (const row of obsIn) {
    const v = validateObservation(row);
    if (v.ok && v.value) next.observations.push(v.value);
  }
  writeBag(next);
  return { ok: true, imported, observations: next.observations.length };
}

/** Deep-ish equality for verify roundtrips */
export function lifeBagsDeepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
