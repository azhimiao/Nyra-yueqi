/**
 * TruthEnvelopeV1 — shared metadata for authored canon, lived product facts,
 * external evidence and inferred candidates. The envelope describes where a
 * statement came from; it never turns an inference into a fact by itself.
 */

export const TRUTH_ENVELOPE_SCHEMA_VERSION = 1;

export const TRUTH_DOMAINS = Object.freeze([
  "platform_fact",
  "character_canon",
  "agreed_shared_setup",
  "lived_product_fact",
  "external_evidence",
  "inferred_candidate",
]);

export const PROVENANCE_SOURCE_TYPES = Object.freeze([
  "user_correction",
  "user_setup",
  "character_import",
  "authored_origin_memory",
  "conversation",
  "diary",
  "artifact",
  "tool_receipt",
  "timeline_event",
  "external_source",
  "inference",
]);

export const TRUTH_SALIENCE = Object.freeze(["low", "normal", "high", "critical"]);

export const TRUTH_STATUS = Object.freeze(["active", "candidate", "superseded", "tombstoned"]);

export const TRUTH_DOMAIN_PRIORITY = Object.freeze({
  inferred_candidate: 10,
  external_evidence: 20,
  character_canon: 30,
  agreed_shared_setup: 40,
  lived_product_fact: 50,
  platform_fact: 60,
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonEmpty(value) {
  return String(value || "").trim();
}

function normalizeRange(value) {
  const raw = plainObject(value);
  const start = nonEmpty(raw.start || raw.from);
  const end = nonEmpty(raw.end || raw.to);
  return start || end ? { start: start || null, end: end || null } : null;
}

export function createTruthEnvelopeV1(input = {}) {
  const src = plainObject(input);
  const provenance = plainObject(src.provenance);
  const subjectScope = plainObject(src.subjectScope);
  const truthDomain = TRUTH_DOMAINS.includes(src.truthDomain)
    ? src.truthDomain
    : "inferred_candidate";
  const sourceType = PROVENANCE_SOURCE_TYPES.includes(provenance.sourceType)
    ? provenance.sourceType
    : (truthDomain === "character_canon" ? "character_import" : "inference");
  const confidence = Number(provenance.confidence ?? src.confidence);
  const status = TRUTH_STATUS.includes(src.status)
    ? src.status
    : (truthDomain === "inferred_candidate" ? "candidate" : "active");
  return {
    schemaVersion: TRUTH_ENVELOPE_SCHEMA_VERSION,
    truthDomain,
    status,
    subjectScope: {
      userId: nonEmpty(subjectScope.userId || src.userId),
      characterId: nonEmpty(subjectScope.characterId || src.characterId),
      relationshipId: nonEmpty(subjectScope.relationshipId || src.relationshipId),
      sessionId: nonEmpty(subjectScope.sessionId || src.sessionId),
    },
    relationshipScope: nonEmpty(src.relationshipScope || subjectScope.relationshipId),
    salience: TRUTH_SALIENCE.includes(src.salience) ? src.salience : "normal",
    occurredRange: normalizeRange(src.occurredRange || src.occurred),
    provenance: {
      sourceType,
      sourceId: nonEmpty(provenance.sourceId || src.sourceId),
      authoredBy: nonEmpty(provenance.authoredBy || src.authoredBy || "system"),
      createdAt: nonEmpty(provenance.createdAt || src.createdAt || new Date().toISOString()),
      observedAt: nonEmpty(provenance.observedAt || src.observedAt),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      revisionOf: nonEmpty(provenance.revisionOf || src.revisionOf),
      evidenceRefs: Array.isArray(provenance.evidenceRefs)
        ? provenance.evidenceRefs.map((item) => nonEmpty(item)).filter(Boolean)
        : [],
    },
  };
}

export function validateTruthEnvelopeV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== TRUTH_ENVELOPE_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!TRUTH_DOMAINS.includes(raw.truthDomain)) errors.push("truthDomain");
  if (!TRUTH_STATUS.includes(raw.status)) errors.push("status");
  if (!TRUTH_SALIENCE.includes(raw.salience)) errors.push("salience");
  if (!raw.subjectScope || typeof raw.subjectScope !== "object") errors.push("subjectScope");
  if (!raw.provenance || typeof raw.provenance !== "object") errors.push("provenance");
  else {
    if (!PROVENANCE_SOURCE_TYPES.includes(raw.provenance.sourceType)) errors.push("provenance.sourceType");
    if (!String(raw.provenance.authoredBy || "").trim()) errors.push("provenance.authoredBy");
    if (!String(raw.provenance.createdAt || "").trim()) errors.push("provenance.createdAt");
    if (raw.provenance.confidence !== null
      && (!Number.isFinite(raw.provenance.confidence) || raw.provenance.confidence < 0 || raw.provenance.confidence > 1)) {
      errors.push("provenance.confidence");
    }
  }
  if (raw.status === "superseded" && !String(raw.provenance?.revisionOf || "").trim()) {
    errors.push("provenance.revisionOf");
  }
  return { ok: errors.length === 0, errors };
}

export function truthDomainPriority(domain) {
  return Number(TRUTH_DOMAIN_PRIORITY[domain]) || 0;
}

export function canSupersedeTruthEnvelope(candidate, current) {
  const next = createTruthEnvelopeV1(candidate);
  const previous = createTruthEnvelopeV1(current);
  if (next.provenance.revisionOf && next.provenance.revisionOf === previous.provenance.sourceId) return true;
  if (next.provenance.sourceType === "user_correction") return true;
  return truthDomainPriority(next.truthDomain) >= truthDomainPriority(previous.truthDomain)
    && next.status !== "candidate";
}

export function promoteInferredTruth(candidate, evidenceRefs = []) {
  const envelope = createTruthEnvelopeV1(candidate);
  if (envelope.truthDomain !== "inferred_candidate") return envelope;
  const refs = [...new Set([
    ...envelope.provenance.evidenceRefs,
    ...(Array.isArray(evidenceRefs) ? evidenceRefs.map(nonEmpty).filter(Boolean) : []),
  ])];
  if (!refs.length) return envelope;
  return createTruthEnvelopeV1({
    ...envelope,
    truthDomain: "lived_product_fact",
    status: "active",
    provenance: {
      ...envelope.provenance,
      sourceType: "conversation",
      evidenceRefs: refs,
      confidence: Math.max(envelope.provenance.confidence ?? 0, 0.7),
    },
  });
}

