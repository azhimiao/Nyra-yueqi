/**
 * Temporal contract re-validation helpers (W2).
 */

import {
  createTemporalSnapshotV1,
  validateTemporalSnapshotV1,
} from "../contracts/temporal-snapshot-v1.js";
import {
  createTemporalEventV1,
  validateTemporalEventV1,
  TEMPORAL_EVENT_STATUSES,
} from "../contracts/temporal-event-v1.js";

export {
  createTemporalSnapshotV1,
  validateTemporalSnapshotV1,
  createTemporalEventV1,
  validateTemporalEventV1,
  TEMPORAL_EVENT_STATUSES,
};

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function assertTemporalSnapshot(raw) {
  const result = validateTemporalSnapshotV1(raw);
  if (!result.ok) return result;
  return { ok: true, value: raw };
}

/**
 * @param {unknown} raw
 */
export function assertTemporalEvent(raw) {
  const result = validateTemporalEventV1(raw);
  if (!result.ok) return result;
  return { ok: true, value: raw };
}

/**
 * Resolve lifecycle status for context projection.
 * Missing status → active (legacy timeline events).
 * @param {{ status?: string, payload?: { status?: string } } | null} event
 */
export function resolveEventStatus(event) {
  if (!event || typeof event !== "object") return "active";
  const raw = event.status || event.payload?.status || "";
  const status = String(raw || "").trim();
  if (!status) return "active";
  return TEMPORAL_EVENT_STATUSES.includes(status) ? status : "active";
}

/**
 * Whether an event may appear in confirmed today / open follow-up lists.
 * @param {object | null} event
 * @param {{ allowProposed?: boolean }} [opts]
 */
export function isEventEligibleForTodayContext(event, opts = {}) {
  if (!event || event.tombstone) return false;
  const status = resolveEventStatus(event);
  if (["expired", "cancelled", "superseded", "completed"].includes(status)) return false;
  if (status === "proposed" && !opts.allowProposed) return false;
  return status === "confirmed" || status === "active" || (opts.allowProposed && status === "proposed");
}
