/**
 * Temporal event expiry / completion / supersede rules against a frozen snapshot.
 */

import { TEMPORAL_EVENT_STATUSES } from "../contracts/temporal-event-v1.js";
import { resolveEventStatus } from "./contract.js";

/**
 * Pick the effective end instant for expiry checks.
 * @param {object} event
 */
export function effectiveEndIso(event) {
  if (!event || typeof event !== "object") return null;
  return (
    event.endsAt
    || event.dueAt
    || event.payload?.endsAt
    || event.payload?.dueAt
    || event.occurredAt
    || event.payload?.occurredAt
    || null
  );
}

/**
 * @param {object} event TemporalEvent-like or timeline event
 * @param {object} snapshot TemporalSnapshotV1
 * @returns {"completed"|"expired"|"cancelled"|"superseded"|"confirmed"|"active"|"proposed"|string}
 */
export function evaluateEventLifecycle(event, snapshot) {
  const status = resolveEventStatus(event);
  if (["completed", "cancelled", "superseded", "expired"].includes(status)) {
    return status;
  }
  const endIso = effectiveEndIso(event);
  if (!endIso || !snapshot?.capturedAt) return status;
  const endMs = Date.parse(endIso);
  const nowMs = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) return status;
  // Past-due open events → expired (not completed — completion is explicit)
  if (endMs < nowMs && ["proposed", "confirmed", "active"].includes(status)) {
    return "expired";
  }
  return status;
}

/**
 * Return a shallow-patched event with updated status/updatedAt when lifecycle changes.
 * @param {object} event
 * @param {object} snapshot
 */
export function applyExpiry(event, snapshot) {
  const nextStatus = evaluateEventLifecycle(event, snapshot);
  const prev = resolveEventStatus(event);
  if (nextStatus === prev) return { changed: false, event };
  const updatedAt = String(snapshot.capturedAt || new Date().toISOString());
  if (event.payload && typeof event.payload === "object" && !event.status) {
    return {
      changed: true,
      event: {
        ...event,
        payload: { ...event.payload, status: nextStatus },
        updatedAt,
      },
    };
  }
  return {
    changed: true,
    event: {
      ...event,
      status: nextStatus,
      updatedAt,
    },
  };
}

/**
 * Mark event completed (explicit user/system action).
 * @param {object} event
 * @param {string} [atIso]
 */
export function markCompleted(event, atIso) {
  const updatedAt = String(atIso || new Date().toISOString());
  return {
    ...event,
    status: "completed",
    updatedAt,
    payload: event.payload && typeof event.payload === "object"
      ? { ...event.payload, status: "completed" }
      : event.payload,
  };
}

/**
 * Supersede an older event when a conflicting update lands.
 * @param {object} event
 * @param {string} [successorId]
 * @param {string} [atIso]
 */
export function markSuperseded(event, successorId = "", atIso) {
  const updatedAt = String(atIso || new Date().toISOString());
  const payload = event.payload && typeof event.payload === "object" ? { ...event.payload } : {};
  if (successorId) payload.supersededBy = successorId;
  payload.status = "superseded";
  return {
    ...event,
    status: "superseded",
    updatedAt,
    payload,
  };
}

/**
 * Filter to events still open for today-context given snapshot expiry rules.
 * @param {object[]} events
 * @param {object} snapshot
 */
export function filterOpenAfterExpiry(events, snapshot) {
  return (events || [])
    .map((e) => applyExpiry(e, snapshot).event)
    .filter((e) => {
      const status = resolveEventStatus(e);
      return TEMPORAL_EVENT_STATUSES.includes(status)
        ? ["confirmed", "active"].includes(status)
        : true;
    });
}
