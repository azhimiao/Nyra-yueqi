/**
 * Personal Context Graph persistence — localStorage `yueqi.context.graph.v1`.
 * Works in browser + Node (injected storage).
 */

import { CONTEXT_GRAPH_KEY, CONTEXT_SCHEMA_VERSION, validateContextItem } from "./schema.js";

/**
 * @typedef {{
 *   schemaVersion: number,
 *   items: Record<string, object>,
 *   tombstones: Record<string, string>,
 *   migration: { lastRunAt: string|null, sources: Record<string, number> },
 * }} ContextBag
 */

/** @type {ContextBag|null} */
let memoryBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setContextStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
}

function emptyBag() {
  return {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    items: {},
    tombstones: {},
    migration: { lastRunAt: null, sources: {} },
  };
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
    const raw = storage.getItem(CONTEXT_GRAPH_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: Number(parsed?.schemaVersion) || CONTEXT_SCHEMA_VERSION,
      items: parsed?.items && typeof parsed.items === "object" ? parsed.items : {},
      tombstones:
        parsed?.tombstones && typeof parsed.tombstones === "object" ? parsed.tombstones : {},
      migration: {
        lastRunAt: parsed?.migration?.lastRunAt || null,
        sources:
          parsed?.migration?.sources && typeof parsed.migration.sources === "object"
            ? parsed.migration.sources
            : {},
      },
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
    storage.setItem(CONTEXT_GRAPH_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function getContextStoreKey() {
  return CONTEXT_GRAPH_KEY;
}

export function clearAllContextItems() {
  memoryBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(CONTEXT_GRAPH_KEY);
    storage?.setItem?.(CONTEXT_GRAPH_KEY, JSON.stringify(memoryBag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} item
 * @returns {{ ok: boolean, errors?: string[], value?: object }}
 */
export function putItem(item) {
  const v = validateContextItem(item);
  if (!v.ok) return { ok: false, errors: v.errors };
  const bag = readBag();
  if (bag.tombstones[item.id]) {
    return { ok: false, errors: ["item is tombstoned"] };
  }
  bag.items[item.id] = { ...item, deleted: false, deletedAt: null };
  writeBag(bag);
  return { ok: true, value: bag.items[item.id] };
}

/**
 * @param {string} id
 */
export function getItem(id) {
  const bag = readBag();
  if (bag.tombstones[id]) return null;
  const item = bag.items[id];
  if (!item || item.deleted) return null;
  return item;
}

/**
 * Soft-delete + tombstone so consumers and caches cannot retrieve.
 * @param {string} id
 * @param {{ nowIso?: string }} [opts]
 */
export function deleteItem(id, opts = {}) {
  const bag = readBag();
  const now = opts.nowIso || new Date().toISOString();
  const existing = bag.items[id];
  if (existing) {
    bag.items[id] = { ...existing, deleted: true, deletedAt: now, frozen: true, forbidProactive: true };
  }
  bag.tombstones[id] = now;
  writeBag(bag);
  return { ok: true, id };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export function updateItem(id, patch) {
  const bag = readBag();
  if (bag.tombstones[id]) return { ok: false, error: "tombstoned" };
  const existing = bag.items[id];
  if (!existing || existing.deleted) return { ok: false, error: "not found" };
  const next = { ...existing, ...patch, id: existing.id, characterId: existing.characterId };
  const v = validateContextItem(next);
  if (!v.ok) return { ok: false, error: v.errors.join("; ") };
  bag.items[id] = next;
  writeBag(bag);
  return { ok: true, value: next };
}

/**
 * @param {{
 *   characterId?: string,
 *   workspaceId?: string,
 *   kinds?: string[],
 *   includeDeleted?: boolean,
 *   includeFrozen?: boolean,
 *   limit?: number,
 * }} [query]
 */
export function listItems(query = {}) {
  const bag = readBag();
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 500;
  /** @type {object[]} */
  const out = [];
  for (const id of Object.keys(bag.items)) {
    if (bag.tombstones[id] && !query.includeDeleted) continue;
    const item = bag.items[id];
    if (!item) continue;
    if (item.deleted && !query.includeDeleted) continue;
    if (query.characterId && item.characterId !== query.characterId) continue;
    if (query.workspaceId && item.workspaceId !== query.workspaceId) continue;
    if (query.kinds?.length && !query.kinds.includes(item.kind)) continue;
    if (item.frozen && query.includeFrozen === false) continue;
    out.push(item);
  }
  out.sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")));
  return out.slice(0, limit);
}

/**
 * @param {string} id
 * @param {string} [nowIso]
 */
export function touchLastUsed(id, nowIso) {
  const bag = readBag();
  const item = bag.items[id];
  if (!item || item.deleted || bag.tombstones[id]) return null;
  item.lastUsedAt = nowIso || new Date().toISOString();
  writeBag(bag);
  return item;
}

/** Batch usage stamp: one storage write per retrieval, not one per hit. */
export function touchLastUsedMany(ids = [], nowIso) {
  const wanted = new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean));
  if (!wanted.size) return [];
  const bag = readBag();
  const at = nowIso || new Date().toISOString();
  const touched = [];
  for (const id of wanted) {
    const item = bag.items[id];
    if (!item || item.deleted || bag.tombstones[id]) continue;
    item.lastUsedAt = at;
    touched.push(item);
  }
  if (touched.length) writeBag(bag);
  return touched;
}

export function getMigrationMeta() {
  return { ...readBag().migration };
}

/**
 * @param {Record<string, number>} sources
 * @param {string} [nowIso]
 */
export function setMigrationMeta(sources, nowIso) {
  const bag = readBag();
  bag.migration = {
    lastRunAt: nowIso || new Date().toISOString(),
    sources: { ...bag.migration.sources, ...sources },
  };
  writeBag(bag);
  return bag.migration;
}

/** Raw bag for tests / export */
export function exportContextBag() {
  return structuredClone(readBag());
}

/**
 * @param {ContextBag} bag
 */
export function importContextBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false };
  memoryBag = {
    schemaVersion: Number(bag.schemaVersion) || CONTEXT_SCHEMA_VERSION,
    items: bag.items && typeof bag.items === "object" ? bag.items : {},
    tombstones: bag.tombstones && typeof bag.tombstones === "object" ? bag.tombstones : {},
    migration: bag.migration || { lastRunAt: null, sources: {} },
  };
  writeBag(memoryBag);
  return { ok: true };
}

export function countActiveItems(characterId) {
  return listItems({ characterId, limit: 10000 }).length;
}
