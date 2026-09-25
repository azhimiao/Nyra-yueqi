/**
 * Rebuild MemPalace index from authoritative source lists (unified-memory M7).
 * Delegates to W5 `rebuildPalaceIndex` — does not invent authorities; callers
 * inject diary / stable / timeline / book chunk lists.
 */

import {
  createMemoryPalaceIndexStore,
  getDefaultPalaceIndexStore,
  projectArtifactRef,
  projectStableMemory,
  projectTimelineEvent,
  projectToPalaceIndex,
} from "../projection/project-to-palace.js";
import { rebuildPalaceIndex } from "../projection/rebuild.js";

/**
 * Map diary repository records → W5 artifact projection inputs.
 * @param {object[]} diaryEntries
 */
export function diaryEntriesToArtifacts(diaryEntries = []) {
  return (Array.isArray(diaryEntries) ? diaryEntries : [])
    .filter((row) => row && !row.deleted && !row.tombstone)
    .map((row) => ({
      kind: "diary",
      sourceType: "diary",
      artifactId: String(row.id || row.diaryId || "").trim(),
      diaryId: String(row.id || row.diaryId || "").trim(),
      id: String(row.id || row.diaryId || "").trim(),
      companionId: String(row.companionId || row.characterId || "").trim(),
      relationshipId: row.relationshipId,
      realityNamespace: row.realityNamespace || "reality",
      title: row.title,
      body: String(row.body || row.rawText || "").trim(),
      searchableText: String(row.body || row.rawText || "").trim(),
      contentHash: row.contentHash,
      sourceRef: row.sourceRef,
      authority: "projection",
    }))
    .filter((row) => row.artifactId && row.companionId);
}

/**
 * Map book chunk metadata → indexable rows (book_chunk not in W5 PALACE_SOURCE_TYPES).
 * @param {object[]} bookChunks
 * @param {ReturnType<typeof createMemoryPalaceIndexStore>} store
 * @param {string} nowIso
 */
export function upsertBookChunkIndexRows(bookChunks = [], store, nowIso, companionFilter = "") {
  const projected = [];
  const errors = [];
  const filterCompanion = String(companionFilter || "").trim();
  for (const chunk of Array.isArray(bookChunks) ? bookChunks : []) {
    if (chunk?.deleted || chunk?.tombstone) continue;
    const sourceId = String(chunk.sourceId || chunk.id || "").trim();
    const companionId = String(chunk.companionId || chunk.characterId || "").trim();
    if (filterCompanion && companionId && companionId !== filterCompanion) continue;
    const text = String(chunk.rawText || chunk.text || chunk.body || "").trim();
    if (!sourceId || !companionId || !text) {
      errors.push({ sourceType: "book_chunk", reason: "missing_fields", sourceId });
      continue;
    }
    const indexId =
      String(chunk.indexId || "").trim() ||
      `px:book_chunk:${companionId}:${sourceId}`.slice(0, 160);
    const row = {
      indexId,
      sourceType: "book_chunk",
      sourceId,
      companionId,
      relationshipId: chunk.relationshipId,
      realityNamespace: chunk.realityNamespace || "reality",
      contentHash:
        String(chunk.contentHash || "").trim() ||
        `book_chunk:${sourceId}:${text.length}`,
      projectionVersion: Number(chunk.projectionVersion || chunk.sourceVersion) || 1,
      indexedAt: String(chunk.indexedAt || nowIso),
      searchableText: text,
      title: String(chunk.title || "").trim(),
      sourceRef: chunk.sourceRef,
      authority: "projection",
      bookId: chunk.bookId,
      chapterId: chunk.chapterId,
      invalidatedAt: null,
      stale: false,
      tombstone: null,
    };
    projected.push(store.upsert(row));
  }
  return { projected, errors };
}

/**
 * Rebuild searchable palace index from injectable authoritative lists.
 *
 * @param {{
 *   diaryEntries?: object[],
 *   stableMemory?: object[],
 *   timelineSummaries?: object[],
 *   timelineEvents?: object[],
 *   bookChunks?: object[],
 *   store?: ReturnType<typeof createMemoryPalaceIndexStore>,
 *   companionId?: string,
 *   clearFirst?: boolean,
 *   nowIso?: string,
 *   projectDrawers?: boolean,
 *   fileDrawer?: Function,
 * }} input
 */
export async function rebuildPalaceFromSources(input = {}) {
  const store = input.store || getDefaultPalaceIndexStore();
  const companionId = String(input.companionId || "").trim();
  const nowIso = String(input.nowIso || new Date().toISOString());
  const clearFirst = input.clearFirst !== false;

  const artifacts = diaryEntriesToArtifacts(input.diaryEntries);
  const timelineEvents = Array.isArray(input.timelineSummaries)
    ? input.timelineSummaries
    : Array.isArray(input.timelineEvents)
      ? input.timelineEvents
      : [];

  const base = rebuildPalaceIndex({
    store,
    companionId: companionId || undefined,
    clearFirst,
    nowIso,
    stableMemory: Array.isArray(input.stableMemory) ? input.stableMemory : [],
    timelineEvents,
    artifacts,
  });

  const bookResult = upsertBookChunkIndexRows(input.bookChunks, store, nowIso, companionId);
  const errors = [...(base.errors || []), ...bookResult.errors];
  const records = [...(base.records || []), ...bookResult.projected];

  const drawers = [];
  if (input.projectDrawers === true && typeof input.fileDrawer === "function") {
    for (const row of records) {
      const result = await projectToPalaceIndex(
        {
          kind: row.sourceType,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          memoryId: row.sourceType === "stable_memory" ? row.sourceId : undefined,
          eventId: row.sourceType === "timeline_event" ? row.sourceId : undefined,
          diaryId: row.sourceType === "diary" ? row.sourceId : undefined,
          artifactId: row.sourceId,
          companionId: row.companionId,
          relationshipId: row.relationshipId,
          realityNamespace: row.realityNamespace,
          body: row.searchableText,
          searchableText: row.searchableText,
          title: row.title,
          contentHash: row.contentHash,
          sourceRef: row.sourceRef || {
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            companionId: row.companionId,
          },
          projectionKind:
            row.sourceType === "book_chunk" ? "palace_chunk" : "palace_text",
          authority: "projection",
        },
        {
          store,
          fileDrawer: input.fileDrawer,
          nowIso,
          skipStoreUpsert: true,
        },
      );
      if (result?.drawer) drawers.push(result.drawer);
    }
  }

  return {
    ok: errors.length === 0,
    projected: records.length,
    errors,
    store,
    records,
    drawers,
    from: {
      diary: artifacts.length,
      stable: Array.isArray(input.stableMemory) ? input.stableMemory.filter((r) => !r?.deleted).length : 0,
      timeline: timelineEvents.length,
      bookChunks: bookResult.projected.length,
    },
  };
}

/**
 * Prefer M1 outbox rebuild when `listSources` is supplied; else sync W5 index rebuild.
 *
 * @param {object} opts
 */
export async function rebuildPalaceIndexFromAuthorities(opts = {}) {
  if (typeof opts.listSources === "function") {
    const { rebuildProjectionsFromSources } = await import("../../projections/rebuild.js");
    const outboxResult = await rebuildProjectionsFromSources({
      listSources: opts.listSources,
      projectionKinds: opts.projectionKinds || ["palace_text", "palace_chunk"],
      operations: opts.operations || ["palace"],
      process: opts.process !== false,
      enqueueOpts: opts.enqueueOpts,
    });
    return { ok: (outboxResult.errors || []).length === 0, mode: "outbox", ...outboxResult };
  }
  const result = await rebuildPalaceFromSources(opts);
  return { ...result, mode: "sync_index" };
}

export {
  rebuildPalaceIndex,
  createMemoryPalaceIndexStore,
  projectStableMemory,
  projectTimelineEvent,
  projectArtifactRef,
};
