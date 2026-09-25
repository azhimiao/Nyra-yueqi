/**
 * TemporalEvent V1 — timed reality event with lifecycle status (plan §5.2).
 */

import { mintId } from "./ids.js";

export const TEMPORAL_EVENT_SCHEMA_VERSION = 1;

export const TEMPORAL_EVENT_KINDS = Object.freeze([
  "observation",
  "commitment",
  "follow_up",
  "calendar",
  "task",
  "anniversary",
]);

export const TEMPORAL_EVENT_STATUSES = Object.freeze([
  "proposed",
  "confirmed",
  "active",
  "completed",
  "expired",
  "cancelled",
  "superseded",
]);

export const TEMPORAL_EVENT_SOURCES = Object.freeze([
  "conversation",
  "calendar",
  "task",
  "diary",
  "system",
]);

export const TEMPORAL_FOLLOW_UP_POLICIES = Object.freeze([
  "ask_once",
  "notify",
  "silent_context",
]);

/**
 * @param {object} raw
 */
export function validateTemporalEventV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== TEMPORAL_EVENT_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of [
    "eventId",
    "userId",
    "companionId",
    "kind",
    "title",
    "timezone",
    "temporalText",
    "status",
    "sourceType",
    "sourceId",
    "createdAt",
    "updatedAt",
  ]) {
    if (!String(raw[key] ?? "").trim()) errors.push(key);
  }
  if (raw.relationshipId == null || typeof raw.relationshipId !== "string") {
    errors.push("relationshipId");
  }
  if (!TEMPORAL_EVENT_KINDS.includes(raw.kind)) errors.push("kind_enum");
  if (!TEMPORAL_EVENT_STATUSES.includes(raw.status)) errors.push("status_enum");
  if (!TEMPORAL_EVENT_SOURCES.includes(raw.sourceType)) errors.push("sourceType_enum");
  if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
    errors.push("confidence");
  }
  if (!Array.isArray(raw.evidenceRefs)) errors.push("evidenceRefs");
  if (typeof raw.needsFollowUp !== "boolean") errors.push("needsFollowUp");
  if (
    raw.followUpPolicy != null
    && raw.followUpPolicy !== ""
    && !TEMPORAL_FOLLOW_UP_POLICIES.includes(raw.followUpPolicy)
  ) {
    errors.push("followUpPolicy_enum");
  }
  for (const key of ["occurredAt", "startsAt", "dueAt", "endsAt"]) {
    if (raw[key] != null && raw[key] !== "" && typeof raw[key] !== "string") {
      errors.push(`${key}_type`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createTemporalEventV1(input = {}) {
  const now = new Date().toISOString();
  const status = TEMPORAL_EVENT_STATUSES.includes(input.status) ? input.status : "proposed";
  const kind = TEMPORAL_EVENT_KINDS.includes(input.kind) ? input.kind : "observation";
  const sourceType = TEMPORAL_EVENT_SOURCES.includes(input.sourceType)
    ? input.sourceType
    : "conversation";
  const confidence = Number(input.confidence);
  return {
    schemaVersion: TEMPORAL_EVENT_SCHEMA_VERSION,
    eventId: String(input.eventId || mintId("eventId")).trim(),
    userId: String(input.userId || "").trim(),
    companionId: String(input.companionId || "").trim(),
    relationshipId: String(input.relationshipId || ""),
    kind,
    title: String(input.title || "").trim(),
    occurredAt: input.occurredAt ? String(input.occurredAt) : undefined,
    startsAt: input.startsAt ? String(input.startsAt) : undefined,
    dueAt: input.dueAt ? String(input.dueAt) : undefined,
    endsAt: input.endsAt ? String(input.endsAt) : undefined,
    timezone: String(input.timezone || "Asia/Shanghai").trim() || "Asia/Shanghai",
    temporalText: String(input.temporalText || "").trim(),
    status,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    sourceType,
    sourceId: String(input.sourceId || "").trim(),
    evidenceRefs: Array.isArray(input.evidenceRefs)
      ? input.evidenceRefs.map((r) => String(r)).filter(Boolean)
      : [],
    needsFollowUp: Boolean(input.needsFollowUp),
    followUpPolicy: TEMPORAL_FOLLOW_UP_POLICIES.includes(input.followUpPolicy)
      ? input.followUpPolicy
      : undefined,
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  };
}
