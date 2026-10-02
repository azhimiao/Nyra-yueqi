/**
 * TimelineEvent V1 — canonical shared-history event.
 */

export const REALITY_NAMESPACES = Object.freeze([
  "reality",
  "shared_fiction",
  "simulation",
  "creative_work",
]);

export const TIMELINE_EVENT_SCHEMA_VERSION = 1;

/**
 * @param {object} raw
 */
export function validateTimelineEventV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== TIMELINE_EVENT_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of [
    "eventId",
    "eventType",
    "source",
    "idempotencyKey",
    "dedupKey",
    "actor",
    "principal",
    "companionId",
    "userId",
    "realityNamespace",
    "occurredAt",
  ]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!REALITY_NAMESPACES.includes(raw.realityNamespace)) errors.push("realityNamespace_enum");
  if (typeof raw.revision !== "number" || raw.revision < 1) errors.push("revision");
  if (raw.tombstone != null && typeof raw.tombstone !== "object") errors.push("tombstone");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createTimelineEventV1(input = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: TIMELINE_EVENT_SCHEMA_VERSION,
    eventId: input.eventId || "",
    eventType: String(input.eventType || "").trim(),
    source: String(input.source || "").trim(),
    sourceId: String(input.sourceId || ""),
    sourceEventId: String(input.sourceEventId || ""),
    idempotencyKey: String(input.idempotencyKey || "").trim(),
    dedupKey: String(input.dedupKey || input.idempotencyKey || "").trim(),
    revision: Number(input.revision) > 0 ? Number(input.revision) : 1,
    actor: String(input.actor || "").trim(),
    principal: String(input.principal || "").trim(),
    companionId: String(input.companionId || "").trim(),
    relationshipId: String(input.relationshipId || ""),
    userId: String(input.userId || "").trim(),
    agentId: String(input.agentId || ""),
    skillId: String(input.skillId || ""),
    packageVersion: String(input.packageVersion || ""),
    experienceId: String(input.experienceId || ""),
    realityNamespace: REALITY_NAMESPACES.includes(input.realityNamespace)
      ? input.realityNamespace
      : "reality",
    occurredAt: String(input.occurredAt || now),
    timezone: String(input.timezone || ""),
    locale: String(input.locale || ""),
    causationId: String(input.causationId || ""),
    correlationId: String(input.correlationId || ""),
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    visibility: String(input.visibility || "private"),
    tombstone: input.tombstone && typeof input.tombstone === "object" ? input.tombstone : null,
    deviceOrigin: String(input.deviceOrigin || ""),
    syncOrigin: String(input.syncOrigin || ""),
    // W2 optional lifecycle (missing ⇒ active/legacy in projectors)
    ...(input.status ? { status: String(input.status) } : {}),
    // W2/W6 optional temporal projection fields
    ...(input.kind ? { kind: String(input.kind) } : {}),
    ...(input.title ? { title: String(input.title) } : {}),
    ...(input.temporalText ? { temporalText: String(input.temporalText) } : {}),
    ...(typeof input.needsFollowUp === "boolean" ? { needsFollowUp: input.needsFollowUp } : {}),
  };
}
