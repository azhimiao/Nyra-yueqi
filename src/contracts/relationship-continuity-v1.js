/**
 * RelationshipContinuity V1 — evidence-backed narrative relationship state (plan §5.5).
 * Ordinary companion UI/prompt use this instead of intimacy/trust/tension numerics.
 */

import { relationshipIdFor } from "../memory/companion-scope.js";

export const RELATIONSHIP_CONTINUITY_SCHEMA_VERSION = 1;

/**
 * @typedef {{
 *   text: string,
 *   sourceIds: string[],
 *   evidenceRefs: string[],
 *   confidence: number,
 * }} EvidenceBackedText
 *
 * @typedef {{
 *   loopId: string,
 *   text: string,
 *   sourceIds: string[],
 *   evidenceRefs: string[],
 *   confidence: number,
 *   status?: "open" | "resolved",
 * }} ContinuityLoop
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateEvidenceBackedText(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (!String(raw.text ?? "").trim()) errors.push("text");
  if (!Array.isArray(raw.sourceIds) || raw.sourceIds.length === 0) errors.push("sourceIds");
  if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length === 0) errors.push("evidenceRefs");
  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence)) errors.push("confidence");
  else if (raw.confidence < 0 || raw.confidence > 1) errors.push("confidence_range");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<EvidenceBackedText>} input
 * @returns {EvidenceBackedText}
 */
export function createEvidenceBackedText(input = {}) {
  const sourceIds = Array.isArray(input.sourceIds)
    ? input.sourceIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? input.evidenceRefs.map((id) => String(id || "").trim()).filter(Boolean)
    : sourceIds.slice();
  return {
    text: String(input.text || "").trim(),
    sourceIds,
    evidenceRefs,
    confidence: typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, input.confidence))
      : 0.5,
  };
}

/**
 * @param {unknown} raw
 */
export function validateContinuityLoop(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (!String(raw.loopId ?? "").trim()) errors.push("loopId");
  const textCheck = validateEvidenceBackedText({
    text: raw.text,
    sourceIds: raw.sourceIds,
    evidenceRefs: raw.evidenceRefs,
    confidence: raw.confidence,
  });
  if (!textCheck.ok) errors.push(...textCheck.errors.map((e) => `loop_${e}`));
  if (raw.status != null && !["open", "resolved"].includes(raw.status)) errors.push("status_enum");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<ContinuityLoop>} input
 */
export function createContinuityLoop(input = {}) {
  const backed = createEvidenceBackedText(input);
  return {
    loopId: String(input.loopId || "").trim() || `loop_${backed.sourceIds[0] || "unknown"}`,
    text: backed.text,
    sourceIds: backed.sourceIds,
    evidenceRefs: backed.evidenceRefs,
    confidence: backed.confidence,
    status: input.status === "resolved" ? "resolved" : "open",
  };
}

/**
 * @param {object} raw
 */
export function validateRelationshipContinuityV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== RELATIONSHIP_CONTINUITY_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["userId", "companionId", "relationshipId", "localDate", "sourceFingerprint", "generatedAt"]) {
    if (!String(raw[key] ?? "").trim()) errors.push(key);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.localDate || ""))) errors.push("localDate_format");
  if (!Array.isArray(raw.openLoops)) errors.push("openLoops");
  else {
    raw.openLoops.forEach((loop, i) => {
      const check = validateContinuityLoop(loop);
      if (!check.ok) errors.push(`openLoops[${i}]`);
    });
  }
  if (!Array.isArray(raw.userBoundaries)) errors.push("userBoundaries");
  else {
    raw.userBoundaries.forEach((item, i) => {
      const check = validateEvidenceBackedText(item);
      if (!check.ok) errors.push(`userBoundaries[${i}]`);
    });
  }
  for (const optional of [
    "recentSharedMoment",
    "currentCareFocus",
    "characterIntentionToday",
    "unresolvedMatter",
  ]) {
    if (raw[optional] != null) {
      const check = validateEvidenceBackedText(raw[optional]);
      if (!check.ok) errors.push(optional);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createRelationshipContinuityV1(input = {}) {
  const userId = String(input.userId || "local").trim() || "local";
  const companionId = String(input.companionId || "").trim();
  const relationshipId = String(input.relationshipId || "").trim()
    || relationshipIdFor(userId, companionId);
  const continuity = {
    schemaVersion: RELATIONSHIP_CONTINUITY_SCHEMA_VERSION,
    userId,
    companionId,
    relationshipId,
    localDate: String(input.localDate || "").trim(),
    recentSharedMoment: input.recentSharedMoment
      ? createEvidenceBackedText(input.recentSharedMoment)
      : undefined,
    currentCareFocus: input.currentCareFocus
      ? createEvidenceBackedText(input.currentCareFocus)
      : undefined,
    openLoops: Array.isArray(input.openLoops)
      ? input.openLoops.map((loop) => createContinuityLoop(loop))
      : [],
    userBoundaries: Array.isArray(input.userBoundaries)
      ? input.userBoundaries.map((b) => createEvidenceBackedText(b))
      : [],
    characterIntentionToday: input.characterIntentionToday
      ? createEvidenceBackedText(input.characterIntentionToday)
      : undefined,
    unresolvedMatter: input.unresolvedMatter
      ? createEvidenceBackedText(input.unresolvedMatter)
      : undefined,
    sourceFingerprint: String(input.sourceFingerprint || "").trim(),
    generatedAt: String(input.generatedAt || new Date().toISOString()),
  };
  // Drop undefined optional fields for cleaner JSON.
  for (const key of [
    "recentSharedMoment",
    "currentCareFocus",
    "characterIntentionToday",
    "unresolvedMatter",
  ]) {
    if (continuity[key] == null) delete continuity[key];
  }
  return continuity;
}
