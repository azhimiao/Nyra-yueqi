/**
 * Projection registry — records which projections were built from canonical events.
 * Projections must never create synonym canonical events.
 */

export const PROJECTION_REGISTRY_KEY = "yueqi.timeline.projections.v1";

/** @type {null | Storage | { getItem(k:string):string|null, setItem(k:string,v:string):void }} */
let testStorage = null;

export function __setProjectionRegistryStorageForTests(storage) {
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

function readBag() {
  try {
    const raw = ls()?.getItem(PROJECTION_REGISTRY_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return { schemaVersion: 1, records: [] };
    if (!Array.isArray(bag.records)) bag.records = [];
    return bag;
  } catch {
    return { schemaVersion: 1, records: [] };
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(PROJECTION_REGISTRY_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/**
 * @param {{
 *   sourceEventId: string,
 *   projectionKind: string,
 *   projectionId: string,
 *   projectionVersion?: number,
 * }} input
 */
export function registerProjection(input = {}) {
  const sourceEventId = String(input.sourceEventId || "").trim();
  const projectionKind = String(input.projectionKind || "").trim();
  const projectionId = String(input.projectionId || "").trim();
  if (!sourceEventId || !projectionKind || !projectionId) {
    return { ok: false, reason: "missing_fields" };
  }
  const bag = readBag();
  const projectionVersion = Number(input.projectionVersion) > 0 ? Number(input.projectionVersion) : 1;
  const existing = bag.records.findIndex(
    (r) => r.sourceEventId === sourceEventId && r.projectionKind === projectionKind && r.projectionId === projectionId,
  );
  const record = {
    sourceEventId,
    projectionKind,
    projectionId,
    projectionVersion,
    registeredAt: new Date().toISOString(),
  };
  if (existing >= 0) bag.records[existing] = record;
  else bag.records.unshift(record);
  if (bag.records.length > 4000) bag.records.length = 4000;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, value: record };
}

export function listProjectionsForEvent(sourceEventId) {
  const id = String(sourceEventId || "").trim();
  if (!id) return [];
  return readBag().records.filter((r) => r.sourceEventId === id);
}
