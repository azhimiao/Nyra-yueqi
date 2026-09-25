/**
 * UnderstandingCandidate V1 — inferred or user-stated understanding before promotion.
 */

export const CANDIDATE_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "rejected",
  "corrected",
  "expired",
  "forgotten",
  "superseded",
]);

export const UNDERSTANDING_CANDIDATE_SCHEMA_VERSION = 1;

/**
 * @param {object} raw
 */
export function validateUnderstandingCandidateV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== UNDERSTANDING_CANDIDATE_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["candidateId", "userId", "companionId", "claim", "source", "idempotencyKey"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!CANDIDATE_STATUSES.includes(raw.status)) errors.push("status");
  if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
    errors.push("confidence");
  }
  if (!Array.isArray(raw.evidenceRefs)) errors.push("evidenceRefs");
  if (!Array.isArray(raw.counterEvidenceRefs)) errors.push("counterEvidenceRefs");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createUnderstandingCandidateV1(input = {}) {
  return {
    schemaVersion: UNDERSTANDING_CANDIDATE_SCHEMA_VERSION,
    candidateId: String(input.candidateId || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    relationshipId: String(input.relationshipId || ""),
    claim: String(input.claim || "").trim(),
    category: String(input.category || "preference"),
    scope: String(input.scope || "companion"),
    confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0)),
    status: CANDIDATE_STATUSES.includes(input.status) ? input.status : "pending",
    source: String(input.source || ""),
    sourceEventId: String(input.sourceEventId || ""),
    realityNamespace: String(input.realityNamespace || "reality"),
    userStated: Boolean(input.userStated),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    counterEvidenceRefs: Array.isArray(input.counterEvidenceRefs) ? input.counterEvidenceRefs : [],
    idempotencyKey: String(input.idempotencyKey || ""),
    supersedesCandidateId: String(input.supersedesCandidateId || ""),
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: String(input.updatedAt || new Date().toISOString()),
  };
}
