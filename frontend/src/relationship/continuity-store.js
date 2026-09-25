/**
 * RelationshipContinuity store — rebuildable projection cache (plan §8.2 / §5.5).
 * Keyed by userId + companionId + localDate. Not a fact authority.
 */

import {
  createRelationshipContinuityV1,
  validateRelationshipContinuityV1,
} from "../contracts/relationship-continuity-v1.js";

/** Rebuildable cache — may be deleted; projector regenerates from timeline/stable. */
export const CONTINUITY_STORE_KEY = "yueqi.relationship.continuity.cache.v1";
export const CONTINUITY_STORE_META = Object.freeze({
  authoritative: false,
  rebuildable: true,
  purpose: "RelationshipContinuity daily projection cache",
});

/** @type {null | Storage | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setContinuityStorageForTests(storage) {
  testStorage = storage;
}

export function __clearContinuityStoreForTests() {
  const s = ls();
  try {
    s?.removeItem?.(CONTINUITY_STORE_KEY);
    s?.setItem?.(CONTINUITY_STORE_KEY, JSON.stringify(emptyBag()));
  } catch {
    /* ignore */
  }
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
  return {
    schemaVersion: 1,
    authoritative: false,
    rebuildable: true,
    entries: {},
  };
}

function readBag() {
  try {
    const raw = ls()?.getItem(CONTINUITY_STORE_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return emptyBag();
    if (!bag.entries || typeof bag.entries !== "object") bag.entries = {};
    bag.authoritative = false;
    bag.rebuildable = true;
    return bag;
  } catch {
    return emptyBag();
  }
}

function writeBag(bag) {
  try {
    const next = {
      ...emptyBag(),
      ...bag,
      authoritative: false,
      rebuildable: true,
      entries: bag.entries || {},
    };
    ls()?.setItem(CONTINUITY_STORE_KEY, JSON.stringify(next));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/**
 * @param {string} userId
 * @param {string} companionId
 * @param {string} localDate
 */
export function continuityStorageKey(userId, companionId, localDate) {
  const u = String(userId || "local").trim() || "local";
  const c = String(companionId || "").trim();
  const d = String(localDate || "").trim();
  return `${u}::${c}::${d}`;
}

/**
 * @param {{ userId?: string, companionId: string, localDate: string }} query
 */
export function loadContinuity(query = {}) {
  const companionId = String(query.companionId || "").trim();
  const localDate = String(query.localDate || "").trim();
  if (!companionId || !localDate) return null;
  const userId = String(query.userId || "local").trim() || "local";
  const key = continuityStorageKey(userId, companionId, localDate);
  const entry = readBag().entries[key];
  if (!entry) return null;
  const check = validateRelationshipContinuityV1(entry);
  return check.ok ? entry : null;
}

/**
 * @param {object} continuity
 */
export function saveContinuity(continuity) {
  const created = createRelationshipContinuityV1(continuity);
  const check = validateRelationshipContinuityV1(created);
  if (!check.ok) return { ok: false, reason: "invalid_continuity", errors: check.errors };
  const key = continuityStorageKey(created.userId, created.companionId, created.localDate);
  const bag = readBag();
  bag.entries[key] = created;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, value: created, key };
}

/**
 * @param {{ userId?: string, companionId: string, localDate?: string }} query
 */
export function clearContinuity(query = {}) {
  const companionId = String(query.companionId || "").trim();
  const userId = String(query.userId || "local").trim() || "local";
  const bag = readBag();
  if (!companionId) {
    bag.entries = {};
    return writeBag(bag);
  }
  const localDate = String(query.localDate || "").trim();
  if (localDate) {
    delete bag.entries[continuityStorageKey(userId, companionId, localDate)];
  } else {
    const prefix = `${userId}::${companionId}::`;
    for (const key of Object.keys(bag.entries)) {
      if (key.startsWith(prefix)) delete bag.entries[key];
    }
  }
  return writeBag(bag);
}
