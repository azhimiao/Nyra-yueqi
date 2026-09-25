/**
 * Relationship Timeline Repository (R2).
 * Sole writer for canonical events; projections must not reverse-write synonyms.
 */

import {
  createTimelineEventV1,
  validateTimelineEventV1,
  mintId,
} from "../contracts/index.js";
import { resolveEventStatus } from "../temporal/contract.js";

export const TIMELINE_STORE_KEY = "yueqi.timeline.events.v1";
export const TIMELINE_MAX_EVENTS = 2000;

/** @type {null | Storage | { getItem(k:string):string|null, setItem(k:string,v:string):void }} */
let testStorage = null;

export function __setTimelineStorageForTests(storage) {
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
    const raw = ls()?.getItem(TIMELINE_STORE_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return { schemaVersion: 1, events: [] };
    if (!Array.isArray(bag.events)) bag.events = [];
    return bag;
  } catch {
    return { schemaVersion: 1, events: [] };
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(TIMELINE_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/**
 * Idempotent append. Same idempotencyKey → replace in place (revision++).
 * @param {Partial<object>} input
 */
export function appendTimelineEvent(input = {}) {
  if (!String(input.companionId || "").trim()) {
    return { ok: false, reason: "missing_companionId" };
  }
  if (!String(input.userId || "").trim()) {
    return { ok: false, reason: "missing_userId" };
  }
  const eventId = String(input.eventId || mintId("eventId")).trim();
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  const bag = readBag();
  let revision = 1;
  let existingIndex = -1;
  if (idempotencyKey) {
    existingIndex = bag.events.findIndex((e) => e && e.idempotencyKey === idempotencyKey && !e.tombstone);
    if (existingIndex >= 0) {
      revision = Number(bag.events[existingIndex].revision || 1) + 1;
    }
  }
  const event = createTimelineEventV1({
    ...input,
    eventId: existingIndex >= 0 ? bag.events[existingIndex].eventId : eventId,
    revision,
    idempotencyKey: idempotencyKey || eventId,
    dedupKey: String(input.dedupKey || idempotencyKey || eventId),
  });
  const validated = validateTimelineEventV1(event);
  if (!validated.ok) {
    return { ok: false, reason: "invalid_event", errors: validated.errors };
  }
  if (existingIndex >= 0) bag.events.splice(existingIndex, 1);
  bag.events.unshift(event);
  if (bag.events.length > TIMELINE_MAX_EVENTS) bag.events.length = TIMELINE_MAX_EVENTS;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, value: event, replaced: existingIndex >= 0 };
}

/**
 * Soft-delete via tombstone; keeps history for audit.
 * @param {string} eventId
 * @param {{ reason?: string, at?: string }} [meta]
 */
export function tombstoneTimelineEvent(eventId, meta = {}) {
  const id = String(eventId || "").trim();
  if (!id) return { ok: false, reason: "missing_eventId" };
  const bag = readBag();
  const idx = bag.events.findIndex((e) => e?.eventId === id);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const prev = bag.events[idx];
  bag.events[idx] = {
    ...prev,
    revision: Number(prev.revision || 1) + 1,
    tombstone: {
      reason: String(meta.reason || "user_delete"),
      at: String(meta.at || new Date().toISOString()),
    },
  };
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, value: bag.events[idx] };
}

/** Tombstone every event derived from one of the supplied message/evidence ids. */
export function tombstoneTimelineEventsByEvidenceRefs(evidenceRefs = [], meta = {}) {
  const refs = new Set(
    (Array.isArray(evidenceRefs) ? evidenceRefs : [])
      .map((ref) => String(ref || "").trim())
      .filter(Boolean),
  );
  if (!refs.size) return { ok: true, tombstoned: 0, eventIds: [] };
  const bag = readBag();
  const at = String(meta.at || new Date().toISOString());
  const reason = String(meta.reason || "message_deleted");
  const eventIds = [];

  bag.events = bag.events.map((event) => {
    if (!event || event.tombstone) return event;
    const sourceId = String(event.sourceId || "").trim();
    const evidence = Array.isArray(event.evidenceRefs)
      ? event.evidenceRefs.map(String)
      : [];
    if (!refs.has(sourceId) && !evidence.some((ref) => refs.has(ref))) return event;
    eventIds.push(event.eventId);
    return {
      ...event,
      revision: Number(event.revision || 1) + 1,
      tombstone: { reason, at },
    };
  });
  if (eventIds.length) writeBag(bag);
  return { ok: true, tombstoned: eventIds.length, eventIds };
}

/**
 * @param {{ idempotencyKey?: string, eventId?: string, includeTombstoned?: boolean }} [query]
 */
export function getTimelineEvent(query = {}) {
  const bag = readBag();
  const key = String(query.idempotencyKey || "").trim();
  const id = String(query.eventId || "").trim();
  const hit = bag.events.find((e) => {
    if (!e) return false;
    if (!query.includeTombstoned && e.tombstone) return false;
    if (key && e.idempotencyKey === key) return true;
    if (id && e.eventId === id) return true;
    return false;
  });
  return hit || null;
}

/**
 * Optional status filter for W2 TodayContext / projectors.
 * Missing status is treated as active/legacy (included).
 * @param {object} event
 * @param {string | string[] | "today_context" | "open"} [statusFilter]
 */
export function matchesTimelineStatusFilter(event, statusFilter) {
  if (!statusFilter) return true;
  const status = resolveEventStatus(event);
  if (statusFilter === "today_context" || statusFilter === "open") {
    return status === "confirmed" || status === "active";
  }
  const allowed = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
  return allowed.includes(status);
}

/**
 * @param {{
 *   limit?: number,
 *   companionId?: string,
 *   realityNamespace?: string,
 *   statusFilter?: string | string[] | "today_context" | "open",
 * }} [opts]
 */
export function listTimelineEvents(opts = {}) {
  const limit = Math.max(1, Math.min(500, Number(opts.limit) || 50));
  const companionId = String(opts.companionId || "").trim();
  // unscoped list returns empty — callers must pass companionId.
  if (!companionId && opts.requireCompanion !== false) {
    if (opts.allowUnscopedScan === true) {
      return readBag().events
        .filter((e) => e && !e.tombstone)
        .filter((e) => matchesTimelineStatusFilter(e, opts.statusFilter))
        .slice(0, limit);
    }
    return [];
  }
  const relationshipId = String(opts.relationshipId || "").trim();
  const ns = String(opts.realityNamespace || "").trim();
  return readBag().events
    .filter((e) => e && !e.tombstone)
    .filter((e) => !companionId || e.companionId === companionId)
    .filter((e) => !relationshipId || !e.relationshipId || e.relationshipId === relationshipId)
    .filter((e) => !ns || e.realityNamespace === ns)
    .filter((e) => matchesTimelineStatusFilter(e, opts.statusFilter))
    .slice(0, limit);
}

export function clearTimelineForTests() {
  writeBag({ schemaVersion: 1, events: [] });
}
