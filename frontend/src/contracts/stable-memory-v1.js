/**
 * StableMemory V1 — promoted, user-visible durable memory.
 */

export const STABLE_MEMORY_SCHEMA_VERSION = 1;

/**
 * @param {object} raw
 */
export function validateStableMemoryV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== STABLE_MEMORY_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["memoryId", "userId", "companionId", "body", "source", "idempotencyKey"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (raw.deleted === true && !raw.tombstone) errors.push("tombstone_required_when_deleted");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createStableMemoryV1(input = {}) {
  return {
    schemaVersion: STABLE_MEMORY_SCHEMA_VERSION,
    memoryId: String(input.memoryId || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    relationshipId: String(input.relationshipId || ""),
    body: String(input.body || "").trim(),
    category: String(input.category || "fact"),
    realityNamespace: String(input.realityNamespace || "reality"),
    source: String(input.source || ""),
    sourceCandidateId: String(input.sourceCandidateId || ""),
    sourceEventId: String(input.sourceEventId || ""),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    idempotencyKey: String(input.idempotencyKey || ""),
    deleted: Boolean(input.deleted),
    tombstone: input.tombstone && typeof input.tombstone === "object" ? input.tombstone : null,
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}
