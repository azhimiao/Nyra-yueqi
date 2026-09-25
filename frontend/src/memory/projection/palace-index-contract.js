/**
 * MemPalace index contract (W5) — projection rows must be source-traceable.
 */

export const PALACE_PROJECTION_VERSION = 1;

export const PALACE_SOURCE_TYPES = Object.freeze([
  "stable_memory",
  "authored_origin_memory",
  "timeline_event",
  "diary",
  "artifact",
  "branch_summary",
]);

/** FNV-1a 32-bit hex — deterministic, no Node crypto required in browser. */
export function hashPalaceContent(text) {
  let hash = 2166136261;
  const seed = String(text || "");
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * @param {object} input
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function createPalaceIndexRecord(input = {}) {
  const sourceType = String(input.sourceType || "").trim();
  const sourceId = String(input.sourceId || "").trim();
  const companionId = String(input.companionId || input.characterId || "").trim();
  const searchableText = String(input.searchableText || input.body || input.content || "").trim();
  const contentHash = String(input.contentHash || "").trim() || hashPalaceContent(searchableText);
  const indexedAt = String(input.indexedAt || input.nowIso || new Date().toISOString());
  const indexId =
    String(input.indexId || "").trim() ||
    `px:${sourceType}:${companionId}:${sourceId}`.slice(0, 160);

  const record = {
    indexId,
    sourceType,
    sourceId,
    companionId,
    relationshipId: String(input.relationshipId || "").trim() || undefined,
    realityNamespace: String(input.realityNamespace || "reality").trim() || "reality",
    contentHash,
    projectionVersion: Number(input.projectionVersion) || PALACE_PROJECTION_VERSION,
    indexedAt,
    searchableText,
    embedding: Array.isArray(input.embedding) ? input.embedding : undefined,
    authority: String(input.authority || "projection").trim() || "projection",
    invalidatedAt: input.invalidatedAt ? String(input.invalidatedAt) : null,
    drawerId: String(input.drawerId || "").trim() || undefined,
  };

  const validated = validatePalaceIndexRecord(record);
  if (!validated.ok) return validated;
  return { ok: true, value: record };
}

/**
 * @param {object} raw
 * @returns {{ ok: boolean, errors?: string[], value?: object }}
 */
export function validatePalaceIndexRecord(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (!String(raw.indexId || "").trim()) errors.push("missing_indexId");
  if (!PALACE_SOURCE_TYPES.includes(String(raw.sourceType || "").trim())) {
    errors.push("invalid_sourceType");
  }
  if (!String(raw.sourceId || "").trim()) errors.push("missing_sourceId");
  if (!String(raw.companionId || "").trim()) errors.push("missing_companionId");
  if (!String(raw.contentHash || "").trim()) errors.push("missing_contentHash");
  if (!String(raw.indexedAt || "").trim()) errors.push("missing_indexedAt");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: raw };
}

/** True when a hit/row carries usable projection provenance. */
export function hasValidSourceRefs(row = {}) {
  const sourceType = String(row.sourceType || "").trim();
  const sourceId = String(row.sourceId || "").trim();
  if (!sourceId) return false;
  if (sourceType && !PALACE_SOURCE_TYPES.includes(sourceType)) return false;
  return Boolean(sourceType && sourceId);
}
