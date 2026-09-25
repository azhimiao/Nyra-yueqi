/**
 * MemoryIndexEntry V1 — rebuildable index row; never editable business state.
 */

import { createSourceRefV1, validateSourceRefV1 } from "./source-ref-v1.js";

export const MEMORY_INDEX_ENTRY_SCHEMA_VERSION = 1;

export const MEMORY_PROJECTION_KINDS = Object.freeze([
  "palace_text",
  "palace_chunk",
  "graph_node",
  "graph_edge",
  "kg_fact",
]);

/**
 * @param {object} raw
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateMemoryIndexEntryV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== MEMORY_INDEX_ENTRY_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!String(raw.indexId || "").trim()) errors.push("indexId");
  if (!raw.sourceRef || typeof raw.sourceRef !== "object") {
    errors.push("sourceRef");
  } else {
    const ref = validateSourceRefV1(raw.sourceRef);
    if (!ref.ok) errors.push(...ref.errors.map((e) => `sourceRef.${e}`));
  }
  if (!MEMORY_PROJECTION_KINDS.includes(raw.projectionKind)) errors.push("projectionKind");
  if (typeof raw.projectionVersion !== "number" || !Number.isFinite(raw.projectionVersion) || raw.projectionVersion < 1) {
    errors.push("projectionVersion");
  }
  if (!String(raw.contentHash || "").trim()) errors.push("contentHash");
  if (typeof raw.stale !== "boolean") errors.push("stale");
  if (raw.tombstone != null && typeof raw.tombstone !== "object") errors.push("tombstone");
  if (!String(raw.indexedAt || "").trim()) errors.push("indexedAt");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createMemoryIndexEntryV1(input = {}) {
  const sourceRef =
    input.sourceRef && typeof input.sourceRef === "object"
      ? createSourceRefV1(input.sourceRef)
      : null;
  const projectionVersion = Number(input.projectionVersion);
  const contentHash =
    String(input.contentHash || "").trim() ||
    String(sourceRef?.contentHash || "").trim();
  return {
    schemaVersion: MEMORY_INDEX_ENTRY_SCHEMA_VERSION,
    indexId: String(input.indexId || "").trim(),
    sourceRef,
    projectionKind: MEMORY_PROJECTION_KINDS.includes(input.projectionKind)
      ? input.projectionKind
      : "",
    title: String(input.title || ""),
    text: String(input.text || ""),
    summary: String(input.summary || ""),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t)) : [],
    wing: String(input.wing || ""),
    room: String(input.room || ""),
    embeddingVersion: String(input.embeddingVersion || ""),
    projectionVersion:
      Number.isFinite(projectionVersion) && projectionVersion >= 1 ? projectionVersion : 1,
    contentHash,
    indexedAt: String(input.indexedAt || new Date().toISOString()),
    stale: Boolean(input.stale),
    tombstone: input.tombstone && typeof input.tombstone === "object" ? input.tombstone : null,
  };
}
