/**
 * Calendar FeatureMemoryAdapter — lifecycle Timeline after Calendar Repository writes.
 * Does not own calendar state (local-calendar-store / phone-data remain authority).
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import {
  appendTimelineEvent,
  listTimelineEvents,
} from "../../timeline/repository.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const CALENDAR_ADAPTER_FEATURE_ID = "calendar";
export const CALENDAR_TIMELINE_PROJECTION_KIND = "timeline_event";

const LIFECYCLE_TYPES = Object.freeze({
  create: "calendar.created",
  created: "calendar.created",
  update: "calendar.updated",
  updated: "calendar.updated",
  cancel: "calendar.cancelled",
  cancelled: "calendar.cancelled",
  delete: "calendar.cancelled",
  complete: "calendar.completed",
  completed: "calendar.completed",
});

let registered = false;

/**
 * @returns {boolean}
 */
export function isUnifiedMemoryAdaptersEnabled() {
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

function calendarScope(event, scope = {}) {
  const companionId = String(
    scope.companionId
    || event?.companionId
    || event?.characterId
    || "",
  ).trim();
  const userId = String(scope.userId || event?.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      scope.relationshipId
      || event?.relationshipId
      || relationshipIdFor(userId, companionId),
  });
}

/**
 * @param {object} event — calendar repository row
 * @param {{ sourceVersion?: number }} [meta]
 */
export function getCalendarSourceRef(event, meta = {}) {
  if (!event || typeof event !== "object") return null;
  const sourceId = String(event.id || event.eventId || "").trim();
  if (!sourceId) return null;
  const scope = calendarScope(event, meta.scope || {});
  const sourceVersion = Number(meta.sourceVersion || event.sourceVersion || 1) || 1;
  const title = String(event.title || "").trim();
  const date = String(event.date || "").trim();
  const time = String(event.time || "").trim();
  const contentHash =
    String(event.contentHash || "").trim()
    || `${sourceId}:v${sourceVersion}:${date}:${time}:${title}`;
  return createSourceRefV1({
    sourceType: "calendar_event",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: String(event.realityNamespace || "reality"),
    occurredAt: String(event.updatedAt || event.createdAt || new Date().toISOString()),
    visibility: String(event.visibility || "private"),
    contentHash,
  });
}

function resolveLifecycleType(op) {
  const key = String(op || "create").toLowerCase();
  return LIFECYCLE_TYPES[key] || LIFECYCLE_TYPES.create;
}

function isActiveCalendarLifecycle(event) {
  if (!event || event.tombstone) return false;
  if (!String(event.eventType || "").startsWith("calendar.")) return false;
  const status = String(event.status || event.payload?.status || "active");
  return !["superseded", "cancelled", "completed", "expired"].includes(status);
}

function matchesCalendarSource(event, sourceId) {
  if (!event || !sourceId) return false;
  if (String(event.sourceId || "") === sourceId) return true;
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (String(payload.calendarEventId || "") === sourceId) return true;
  const ref = payload.sourceRef;
  return Boolean(ref && String(ref.sourceId || "") === sourceId);
}

/**
 * Mark prior active calendar.* lifecycle rows for this source as superseded.
 * @param {string} sourceId
 * @param {object} scope
 * @param {string} [successorEventId]
 */
function supersedePriorLifecycle(sourceId, scope, successorEventId = "") {
  if (!scope?.companionId || !sourceId) return { ok: true, superseded: 0 };
  const prior = listTimelineEvents({ companionId: scope.companionId, limit: 200 })
    .filter((e) => matchesCalendarSource(e, sourceId))
    .filter(isActiveCalendarLifecycle);
  let superseded = 0;
  for (const e of prior) {
    const payload = e.payload && typeof e.payload === "object" ? { ...e.payload } : {};
    if (successorEventId) payload.supersededBy = successorEventId;
    payload.status = "superseded";
    const result = appendTimelineEvent({
      eventId: e.eventId,
      eventType: e.eventType,
      source: e.source || "calendar_adapter",
      sourceId: e.sourceId || sourceId,
      idempotencyKey: e.idempotencyKey,
      actor: e.actor || scope.companionId,
      principal: e.principal || scope.userId,
      companionId: scope.companionId,
      userId: scope.userId,
      relationshipId: scope.relationshipId || e.relationshipId,
      realityNamespace: e.realityNamespace || "reality",
      occurredAt: e.occurredAt || new Date().toISOString(),
      visibility: e.visibility || "private",
      status: "superseded",
      kind: "calendar",
      payload,
      evidenceRefs: Array.isArray(e.evidenceRefs) ? e.evidenceRefs : [],
    });
    if (result.ok) superseded += 1;
  }
  return { ok: true, superseded };
}

/**
 * Emit one lifecycle Timeline event with sourceRef → calendar event id.
 *
 * @param {object} event
 * @param {object} [scope]
 * @param {{ op?: string, sourceVersion?: number }} [meta]
 */
export function emitCalendarLifecycle(event, scope = {}, meta = {}) {
  const frozen = calendarScope(event, scope);
  if (!frozen.companionId) {
    return { ok: false, reason: "missing_companionId", events: [] };
  }
  const sourceRef = getCalendarSourceRef(event, { ...meta, scope: frozen });
  if (!sourceRef) return { ok: false, reason: "missing_source_ref", events: [] };

  const eventType = resolveLifecycleType(meta.op);
  const terminal = eventType === "calendar.cancelled" || eventType === "calendar.completed";
  const updating = eventType === "calendar.updated" || terminal;

  const idempotencyKey =
    eventType === "calendar.updated"
      ? `calendar:${sourceRef.sourceId}:updated:v${sourceRef.sourceVersion}`
      : `calendar:${sourceRef.sourceId}:${eventType.split(".").pop()}`;

  const draftEventId = mintId("eventId", "calendar");
  if (updating) {
    supersedePriorLifecycle(sourceRef.sourceId, frozen, draftEventId);
  }

  const result = appendTimelineEvent({
    eventId: draftEventId,
    eventType,
    source: "calendar_adapter",
    sourceId: sourceRef.sourceId,
    idempotencyKey,
    actor: frozen.companionId,
    principal: frozen.userId,
    companionId: frozen.companionId,
    userId: frozen.userId,
    relationshipId: frozen.relationshipId,
    realityNamespace: sourceRef.realityNamespace,
    occurredAt: sourceRef.occurredAt,
    visibility: sourceRef.visibility,
    status: terminal
      ? (eventType === "calendar.cancelled" ? "cancelled" : "completed")
      : "confirmed",
    kind: "calendar",
    title: String(event.title || "").trim(),
    payload: {
      summary: eventType,
      calendarEventId: sourceRef.sourceId,
      title: String(event.title || "").trim(),
      date: String(event.date || "").trim(),
      time: String(event.time || "").trim(),
      localDate: String(event.date || "").trim(),
      sourceVersion: sourceRef.sourceVersion,
      sourceRef,
      op: String(meta.op || "create"),
    },
    evidenceRefs: [`calendar:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`],
  });

  return {
    ok: result.ok !== false,
    events: result.ok ? [result.value] : [],
    result,
    sourceRef,
    eventType,
  };
}

/**
 * Reminder preference → understanding candidate stub (never a calendar row).
 * Stable Memory must not store each schedule; only long-lived prefs.
 *
 * @param {object} change
 * @param {object} [scope]
 */
export function submitReminderPreferenceCandidate(change = {}, scope = {}) {
  const claim = String(
    change.claim || change.text || change.preference || "",
  ).trim();
  if (!claim) {
    return { ok: true, candidates: [], stub: true };
  }
  const frozen = calendarScope(change, scope);
  return {
    ok: true,
    stub: true,
    candidates: [
      {
        kind: "understanding_candidate",
        category: "reminder_preference",
        claim,
        confidence: Number(change.confidence) > 0 ? Number(change.confidence) : 0.85,
        companionId: frozen.companionId,
        userId: frozen.userId,
        relationshipId: frozen.relationshipId,
        evidenceRefs: Array.isArray(change.evidenceRefs) ? change.evidenceRefs : [claim],
        // Not Stable Memory — ledger promotion is a later wave.
        promoteToStable: false,
      },
    ],
  };
}

/**
 * After authoritative calendar create/update/cancel.
 * Flag-off: no Timeline write.
 *
 * @param {object} event
 * @param {{
 *   op?: string,
 *   scope?: object,
 *   sourceVersion?: number,
 *   force?: boolean,
 * }} [opts]
 */
export function onCalendarCommitted(event, opts = {}) {
  if (!isUnifiedMemoryAdaptersEnabled() && opts.force !== true) {
    return { ok: true, skipped: true, reason: "flag_off" };
  }
  ensureCalendarAdapterRegistered();
  const scope = opts.scope || calendarScope(event);
  return emitCalendarLifecycle(event, scope, {
    op: opts.op || "create",
    sourceVersion: opts.sourceVersion,
  });
}

export function ensureCalendarAdapterRegistered() {
  if (registered) return calendarFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(CALENDAR_ADAPTER_FEATURE_ID, calendarFeatureMemoryAdapter);
  registered = true;
  return calendarFeatureMemoryAdapter;
}

export function __resetCalendarAdapterRegistrationForTests() {
  registered = false;
}

export const calendarFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: CALENDAR_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getCalendarSourceRef(change),
  emitTimelineEvents: (change, scope) =>
    emitCalendarLifecycle(change, scope, { op: change?.op || change?.action || "create" }),
  submitUnderstandingCandidates: (change, scope) =>
    submitReminderPreferenceCandidate(change, scope),
  buildIndexDocuments: async () => [],
  handleSourceTombstone: (change, scope) =>
    emitCalendarLifecycle(
      { id: change?.sourceId || change?.id, ...change },
      scope,
      { op: "cancel" },
    ),
  rebuildForSource: async () => ({ ok: true, skipped: true }),
  onSave: (change, scope, opts) =>
    onCalendarCommitted(change, { ...opts, scope, op: change?.op || opts?.op || "create" }),
});
