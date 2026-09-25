/**
 * MemPalace projection layer (W5) — index is rebuildable, never sole fact authority.
 *
 * Coexistence (unified-memory M1): `src/projections/*` is the SourceRef outbox path
 * gated by `memoryProjectionOutboxV1`. This W5 module stays for `palaceProjectionV1`
 * and must not be deleted or replaced by the outbox in M1.
 */

import { hasValidSourceRefs as rowHasValidSourceRefs } from "./palace-index-contract.js";

export {
  PALACE_PROJECTION_VERSION,
  PALACE_SOURCE_TYPES,
  hashPalaceContent,
  createPalaceIndexRecord,
  validatePalaceIndexRecord,
  hasValidSourceRefs,
} from "./palace-index-contract.js";

export {
  createMemoryPalaceIndexStore,
  getDefaultPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
  projectToPalace,
  projectStableMemory,
  projectTimelineEvent,
  projectArtifactRef,
  projectAndUpsert,
  projectToPalaceIndex,
} from "./project-to-palace.js";

export { sweepStalePalaceEntries, sweepAfterForget } from "./stale-sweep.js";

export { rebuildPalaceIndex } from "./rebuild.js";

/**
 * Prefer hits with valid sourceType/sourceId when palaceProjectionV1 is on.
 * Soft prefer: if any sourced hits exist, drop orphans; otherwise keep legacy
 * non-invalidated rows so pre-migration drawers still recall.
 *
 * @param {object[]} results
 * @param {{ preferSourced?: boolean, strict?: boolean }} [opts]
 */
export function preferSourcedPalaceHits(results = [], opts = {}) {
  const rows = Array.isArray(results) ? results : [];
  if (opts.preferSourced === false) return rows;
  const live = rows.filter((row) => {
    const rec = row?.record || row;
    return !rec?.invalidatedAt && !row?.invalidatedAt;
  });
  const sourced = live.filter((row) => {
    const rec = row?.record || row;
    return rowHasValidSourceRefs(rec) || rowHasValidSourceRefs(row);
  });
  if (sourced.length) return sourced;
  if (opts.strict === true) return [];
  return live;
}
