/**
 * WebEvidence V1 — sourced web retrieval result (plan §5.6 / §W7).
 * Conclusions must cite evidence; never invent sources.
 */

import { mintId } from "./ids.js";

export const WEB_EVIDENCE_SCHEMA_VERSION = 1;

export const WEB_EVIDENCE_FRESHNESS = Object.freeze([
  "live",
  "recent",
  "archival",
  "unknown",
]);

/**
 * @param {object} raw
 */
export function validateWebEvidenceV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== WEB_EVIDENCE_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of [
    "evidenceId",
    "query",
    "title",
    "url",
    "fetchedAt",
    "excerpt",
    "contentHash",
  ]) {
    if (!String(raw[key] ?? "").trim()) errors.push(key);
  }
  if (!WEB_EVIDENCE_FRESHNESS.includes(raw.freshness)) errors.push("freshness_enum");
  if (raw.publisher != null && typeof raw.publisher !== "string") errors.push("publisher");
  if (raw.publishedAt != null && typeof raw.publishedAt !== "string") errors.push("publishedAt");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createWebEvidenceV1(input = {}) {
  const freshness = WEB_EVIDENCE_FRESHNESS.includes(input.freshness)
    ? input.freshness
    : "unknown";
  const url = String(input.url || "").trim();
  const excerpt = String(input.excerpt || "").trim();
  const title = String(input.title || "").trim();
  const query = String(input.query || "").trim();
  const fetchedAt = String(input.fetchedAt || new Date().toISOString()).trim();
  const contentHash = String(
    input.contentHash || hashContent(`${url}\n${title}\n${excerpt}`),
  ).trim();

  const evidence = {
    schemaVersion: WEB_EVIDENCE_SCHEMA_VERSION,
    evidenceId: String(input.evidenceId || mintId("eventId", "wev")).trim(),
    query,
    title,
    url,
    fetchedAt,
    excerpt,
    contentHash,
    freshness,
  };
  if (input.publisher != null && String(input.publisher).trim()) {
    evidence.publisher = String(input.publisher).trim();
  }
  if (input.publishedAt != null && String(input.publishedAt).trim()) {
    evidence.publishedAt = String(input.publishedAt).trim();
  }
  return evidence;
}

/**
 * FNV-1a style hex digest for content identity (no crypto dependency in browser).
 * @param {string} text
 */
export function hashContent(text) {
  const s = String(text || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(16).padStart(8, "0")}`;
}
