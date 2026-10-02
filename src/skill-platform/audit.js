/**
 * Append-only skill platform audit log.
 */

import { AUDIT_EVENT_TYPES, STORAGE_KEYS, SKILL_PLATFORM_SCHEMA_VERSION } from "./schema.js";

/** @type {object|null} */
let memoryAuditBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setSkillAuditStorageForTests(storage) {
  testStorage = storage;
  memoryAuditBag = null;
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
  return { schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION, events: [] };
}

function readBag() {
  if (memoryAuditBag) return memoryAuditBag;
  const storage = ls();
  if (!storage) {
    memoryAuditBag = emptyBag();
    return memoryAuditBag;
  }
  try {
    const raw = storage.getItem(STORAGE_KEYS.audit);
    if (!raw) {
      memoryAuditBag = emptyBag();
      return memoryAuditBag;
    }
    memoryAuditBag = JSON.parse(raw);
    if (!Array.isArray(memoryAuditBag.events)) memoryAuditBag.events = [];
    return memoryAuditBag;
  } catch {
    memoryAuditBag = emptyBag();
    return memoryAuditBag;
  }
}

function writeBag(bag) {
  memoryAuditBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEYS.audit, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function clearSkillAuditLog() {
  memoryAuditBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(STORAGE_KEYS.audit);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   type: string,
 *   skillId?: string,
 *   version?: string,
 *   detail?: string,
 *   meta?: object,
 * }} event
 */
export function appendSkillAuditEvent(event) {
  const type = String(event?.type || "").trim();
  if (!AUDIT_EVENT_TYPES.includes(type)) {
    return { ok: false, reason: "invalid_event_type" };
  }
  const bag = readBag();
  const record = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    skillId: event.skillId ? String(event.skillId) : undefined,
    version: event.version ? String(event.version) : undefined,
    detail: event.detail ? String(event.detail) : "",
    meta: event.meta && typeof event.meta === "object" ? event.meta : {},
    at: new Date().toISOString(),
  };
  bag.events.push(record);
  writeBag(bag);
  return { ok: true, value: record };
}

/**
 * @param {{ skillId?: string, type?: string, limit?: number }} [filter]
 */
export function listSkillAuditEvents(filter = {}) {
  let events = [...readBag().events];
  if (filter.skillId) {
    events = events.filter((e) => e.skillId === filter.skillId);
  }
  if (filter.type) {
    events = events.filter((e) => e.type === filter.type);
  }
  if (filter.skillRunId) {
    events = events.filter((e) => e.meta?.skillRunId === filter.skillRunId);
  }
  if (filter.taskId) {
    events = events.filter((e) => e.meta?.taskId === filter.taskId);
  }
  if (filter.limit && filter.limit > 0) {
    events = events.slice(-filter.limit);
  }
  return events;
}

/**
 * @param {{ events?: object[] }} bag
 */
export function importSkillAuditBag(bag) {
  if (!bag || !Array.isArray(bag.events)) return { ok: false, reason: "invalid_bag" };
  writeBag({
    schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION,
    events: bag.events.map((e) => ({ ...e })),
  });
  return { ok: true };
}
