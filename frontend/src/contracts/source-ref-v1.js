/**
 * SourceRef V1 — every projection must trace back to an authoritative source.
 */

import { REALITY_NAMESPACES } from "./timeline-event-v1.js";

export const SOURCE_REF_SCHEMA_VERSION = 1;

export const SOURCE_REF_TYPES = Object.freeze([
  "conversation_turn",
  "diary",
  "calendar_event",
  "unified_task",
  "media_track",
  "listening_session",
  "book",
  "book_chunk",
  "reading_session",
  "experience_session",
  "life_event",
  "timeline_event",
  "stable_memory",
  "artifact",
]);

export const SOURCE_REF_VISIBILITY = Object.freeze([
  "shared",
  "private",
  "sensitive",
  "forbidden",
]);

/**
 * @param {object} raw
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSourceRefV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== SOURCE_REF_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!SOURCE_REF_TYPES.includes(raw.sourceType)) errors.push("sourceType");
  for (const key of [
    "sourceId",
    "companionId",
    "relationshipId",
    "userId",
    "occurredAt",
    "contentHash",
  ]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (typeof raw.sourceVersion !== "number" || !Number.isFinite(raw.sourceVersion) || raw.sourceVersion < 1) {
    errors.push("sourceVersion");
  }
  if (!REALITY_NAMESPACES.includes(raw.realityNamespace)) errors.push("realityNamespace");
  if (!SOURCE_REF_VISIBILITY.includes(raw.visibility)) errors.push("visibility");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createSourceRefV1(input = {}) {
  const now = new Date().toISOString();
  const sourceVersion = Number(input.sourceVersion);
  return {
    schemaVersion: SOURCE_REF_SCHEMA_VERSION,
    sourceType: SOURCE_REF_TYPES.includes(input.sourceType) ? input.sourceType : "",
    sourceId: String(input.sourceId || "").trim(),
    sourceVersion: Number.isFinite(sourceVersion) && sourceVersion >= 1 ? sourceVersion : 1,
    companionId: String(input.companionId || "").trim(),
    relationshipId: String(input.relationshipId || "").trim(),
    userId: String(input.userId || "").trim(),
    realityNamespace: REALITY_NAMESPACES.includes(input.realityNamespace)
      ? input.realityNamespace
      : "reality",
    occurredAt: String(input.occurredAt || now),
    visibility: SOURCE_REF_VISIBILITY.includes(input.visibility) ? input.visibility : "private",
    contentHash: String(input.contentHash || "").trim(),
  };
}

/**
 * Idempotency triple key: sourceId + sourceVersion + projectionKind.
 * @param {{ sourceId?: string, sourceVersion?: number } | null | undefined} sourceRef
 * @param {string} projectionKind
 */
export function sourceRefProjectionKey(sourceRef, projectionKind) {
  const id = String(sourceRef?.sourceId || "").trim();
  const ver = Number(sourceRef?.sourceVersion);
  const kind = String(projectionKind || "").trim();
  return `${id}::${Number.isFinite(ver) ? ver : 0}::${kind}`;
}

/**
 * Compact display string for Context Inspector / Prompt Spy.
 * @param {object | null | undefined} ref
 * @returns {string}
 */
export function formatSourceRefForInspector(ref) {
  if (!ref || typeof ref !== "object") return "";
  const type = String(ref.sourceType || "").trim() || "?";
  const id = String(ref.sourceId || "").trim() || "?";
  const ver = Number(ref.sourceVersion);
  const companion = String(ref.companionId || "").trim();
  const ns = String(ref.realityNamespace || "").trim();
  const parts = [`${type}:${id}`];
  if (Number.isFinite(ver) && ver >= 1) parts.push(`v${ver}`);
  if (companion) parts.push(`c=${companion}`);
  if (ns) parts.push(`ns=${ns}`);
  return parts.join(" ");
}
