/**
 * Project authoritative sources into MemPalace index shape (W5).
 * Pure by default; optional fileDrawer wrapper for searchable drawer sync.
 */

import {
  createPalaceIndexRecord,
  hashPalaceContent,
  PALACE_PROJECTION_VERSION,
} from "./palace-index-contract.js";

/**
 * In-memory index store for tests / Node verify (injectable).
 * @returns {{
 *   upsert(record: object): object,
 *   get(indexId: string): object|null,
 *   list(query?: object): object[],
 *   invalidate(indexId: string, at?: string): object|null,
 *   remove(indexId: string): boolean,
 *   clear(): void,
 *   size(): number,
 * }}
 */
export function createMemoryPalaceIndexStore() {
  /** @type {Map<string, object>} */
  const map = new Map();
  return {
    upsert(record) {
      const id = String(record?.indexId || "").trim();
      if (!id) throw new Error("missing_indexId");
      const next = { ...record, indexId: id };
      map.set(id, next);
      return next;
    },
    get(indexId) {
      return map.get(String(indexId || "").trim()) || null;
    },
    list(query = {}) {
      const companionId = String(query.companionId || "").trim();
      const sourceId = String(query.sourceId || "").trim();
      const sourceType = String(query.sourceType || "").trim();
      const includeInvalidated = query.includeInvalidated === true;
      return [...map.values()].filter((row) => {
        if (!includeInvalidated && row.invalidatedAt) return false;
        if (companionId && row.companionId !== companionId) return false;
        if (sourceId && row.sourceId !== sourceId) return false;
        if (sourceType && row.sourceType !== sourceType) return false;
        return true;
      });
    },
    invalidate(indexId, at = new Date().toISOString()) {
      const id = String(indexId || "").trim();
      const row = map.get(id);
      if (!row) return null;
      const next = { ...row, invalidatedAt: at, searchable: false };
      map.set(id, next);
      return next;
    },
    remove(indexId) {
      return map.delete(String(indexId || "").trim());
    },
    clear() {
      map.clear();
    },
    size() {
      return map.size;
    },
  };
}

/** @type {ReturnType<typeof createMemoryPalaceIndexStore>|null} */
let defaultStore = null;

export function getDefaultPalaceIndexStore() {
  if (!defaultStore) defaultStore = createMemoryPalaceIndexStore();
  return defaultStore;
}

export function __setDefaultPalaceIndexStoreForTests(store) {
  defaultStore = store || null;
}

export function __clearDefaultPalaceIndexStoreForTests() {
  defaultStore?.clear?.();
  defaultStore = null;
}

/**
 * @param {{
 *   sourceType: string,
 *   sourceId: string,
 *   companionId: string,
 *   searchableText?: string,
 *   body?: string,
 *   content?: string,
 *   relationshipId?: string,
 *   realityNamespace?: string,
 *   nowIso?: string,
 *   authority?: string,
 * }} source
 */
export function projectToPalace(source = {}) {
  const searchableText = String(
    source.searchableText || source.body || source.content || "",
  ).trim();
  return createPalaceIndexRecord({
    ...source,
    searchableText,
    contentHash: source.contentHash || hashPalaceContent(searchableText),
    projectionVersion: PALACE_PROJECTION_VERSION,
    authority: source.authority || "projection",
    indexedAt: source.nowIso || source.indexedAt,
  });
}

export function projectStableMemory(item = {}, opts = {}) {
  const memoryId = String(item.memoryId || item.id || "").trim();
  const companionId = String(item.companionId || item.characterId || opts.companionId || "").trim();
  return projectToPalace({
    sourceType: "stable_memory",
    sourceId: memoryId,
    companionId,
    relationshipId: item.relationshipId || opts.relationshipId,
    realityNamespace: item.realityNamespace || "reality",
    searchableText: item.body || item.content || item.claim || "",
    nowIso: opts.nowIso,
  });
}

export function projectTimelineEvent(event = {}, opts = {}) {
  const sourceId = String(event.eventId || event.id || "").trim();
  const companionId = String(event.companionId || event.characterId || opts.companionId || "").trim();
  const text = [event.title, event.summary, event.notes, event.body]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
  return projectToPalace({
    sourceType: "timeline_event",
    sourceId,
    companionId,
    relationshipId: event.relationshipId || opts.relationshipId,
    realityNamespace: event.realityNamespace || "reality",
    searchableText: text,
    nowIso: opts.nowIso,
  });
}

export function projectArtifactRef(artifact = {}, opts = {}) {
  const sourceType = String(artifact.sourceType || opts.sourceType || "artifact").trim();
  const sourceId = String(artifact.artifactId || artifact.id || artifact.diaryId || "").trim();
  const companionId = String(
    artifact.companionId || artifact.characterId || opts.companionId || "",
  ).trim();
  return projectToPalace({
    sourceType: sourceType === "diary" ? "diary" : sourceType === "branch_summary" ? "branch_summary" : "artifact",
    sourceId,
    companionId,
    relationshipId: artifact.relationshipId || opts.relationshipId,
    realityNamespace: artifact.realityNamespace || "reality",
    searchableText: artifact.searchableText || artifact.body || artifact.content || artifact.title || "",
    nowIso: opts.nowIso,
    authority: artifact.authority || "projection",
  });
}

/**
 * Upsert projection into store; optionally mirror into palace drawer via fileDrawer.
 * @param {object} source — stable / timeline / artifact shaped input, or { kind, ... }
 * @param {{
 *   store?: ReturnType<typeof createMemoryPalaceIndexStore>,
 *   fileDrawer?: (params: object) => Promise<object|null>,
 *   nowIso?: string,
 *   skipStoreUpsert?: boolean,
 * }} [opts]
 */
export async function projectAndUpsert(source = {}, opts = {}) {
  const kind = String(source.kind || source.sourceType || "").trim();
  let created;
  if (kind === "stable_memory" || source.memoryId) {
    created = projectStableMemory(source, opts);
  } else if (kind === "timeline_event" || source.eventId) {
    created = projectTimelineEvent(source, opts);
  } else if (
    kind === "diary" ||
    kind === "artifact" ||
    kind === "branch_summary" ||
    source.artifactId
  ) {
    created = projectArtifactRef(source, { ...opts, sourceType: kind || "artifact" });
  } else if (kind === "book_chunk") {
    // book_chunk is outside W5 PALACE_SOURCE_TYPES — build a plain indexable row.
    const sourceId = String(source.sourceId || source.id || "").trim();
    const companionId = String(source.companionId || source.characterId || "").trim();
    const searchableText = String(
      source.searchableText || source.body || source.content || source.rawText || "",
    ).trim();
    if (!sourceId || !companionId) {
      created = { ok: false, errors: ["missing_sourceId_or_companionId"] };
    } else {
      created = {
        ok: true,
        value: {
          indexId:
            String(source.indexId || "").trim() ||
            `px:book_chunk:${companionId}:${sourceId}`.slice(0, 160),
          sourceType: "book_chunk",
          sourceId,
          companionId,
          relationshipId: source.relationshipId,
          realityNamespace: source.realityNamespace || "reality",
          contentHash: source.contentHash || hashPalaceContent(searchableText),
          projectionVersion: Number(source.projectionVersion || source.sourceVersion) || 1,
          indexedAt: source.nowIso || source.indexedAt || new Date().toISOString(),
          searchableText,
          authority: "projection",
          sourceRef: source.sourceRef,
          invalidatedAt: null,
        },
      };
    }
  } else {
    created = projectToPalace(source);
  }
  if (!created.ok) return created;

  const store = opts.store || getDefaultPalaceIndexStore();
  const saved =
    opts.skipStoreUpsert === true ? { ...created.value } : store.upsert(created.value);

  let drawer = null;
  if (typeof opts.fileDrawer === "function" && saved.searchableText) {
    const projectionKind =
      String(source.projectionKind || "").trim() ||
      (saved.sourceType === "book_chunk" ? "palace_chunk" : "palace_text");
    drawer = await opts.fileDrawer({
      rawText: saved.searchableText,
      companionId: saved.companionId,
      characterId: saved.companionId,
      source: `palace.projection.${saved.sourceType}`,
      title: String(source.title || "").trim(),
      tags: ["palace", "projection", saved.sourceType],
      sourceType: saved.sourceType,
      sourceId: saved.sourceId,
      contentHash: saved.contentHash,
      projectionVersion: saved.projectionVersion,
      indexedAt: saved.indexedAt,
      authority: "projection",
      drawerId: saved.drawerId || saved.indexId,
      sourceRef: source.sourceRef || {
        sourceType: saved.sourceType,
        sourceId: saved.sourceId,
        companionId: saved.companionId,
      },
      projectionKind,
      allowProjectionWrite: true,
      wing: source.wing,
      room: source.room,
      weight: source.weight,
      pinned: source.pinned,
      styleId: source.styleId,
      diaryDay: source.diaryDay,
      createdAt: source.createdAt || saved.indexedAt,
    });
    if (drawer?.drawerId || drawer?.id) {
      saved.drawerId = drawer.drawerId || drawer.id;
      if (opts.skipStoreUpsert !== true) store.upsert(saved);
    }
  }

  return { ok: true, value: saved, drawer };
}

/**
 * Internal projector API for FeatureMemoryAdapters (M7).
 * Always tags authority=projection and carries sourceRef / projectionKind so
 * `fileDrawer` is allowed under `palaceProjectionOnlyV1`.
 *
 * @param {object} entry — MemoryIndexEntry-like or projectAndUpsert source
 * @param {{
 *   store?: ReturnType<typeof createMemoryPalaceIndexStore>,
 *   fileDrawer?: (params: object) => Promise<object|null>,
 *   nowIso?: string,
 *   skipStoreUpsert?: boolean,
 * }} [opts]
 */
export async function projectToPalaceIndex(entry = {}, opts = {}) {
  const sourceRef =
    entry.sourceRef && typeof entry.sourceRef === "object" ? entry.sourceRef : null;
  const sourceType = String(
    entry.sourceType ||
      sourceRef?.sourceType ||
      entry.kind ||
      (entry.memoryId ? "stable_memory" : "") ||
      (entry.eventId ? "timeline_event" : "") ||
      (entry.diaryId ? "diary" : "") ||
      "artifact",
  ).trim();
  const sourceId = String(
    entry.sourceId ||
      sourceRef?.sourceId ||
      entry.memoryId ||
      entry.eventId ||
      entry.diaryId ||
      entry.artifactId ||
      entry.id ||
      "",
  ).trim();
  const projectionKind =
    String(entry.projectionKind || "").trim() ||
    (sourceType === "book_chunk" ? "palace_chunk" : "palace_text");
  const searchableText = String(
    entry.searchableText || entry.text || entry.body || entry.content || entry.rawText || "",
  ).trim();

  return projectAndUpsert(
    {
      ...entry,
      kind: sourceType,
      sourceType,
      sourceId,
      companionId:
        entry.companionId || entry.characterId || sourceRef?.companionId || "",
      relationshipId: entry.relationshipId || sourceRef?.relationshipId,
      realityNamespace: entry.realityNamespace || sourceRef?.realityNamespace || "reality",
      searchableText,
      body: searchableText,
      contentHash: entry.contentHash || sourceRef?.contentHash,
      sourceRef: sourceRef || {
        sourceType,
        sourceId,
        companionId: entry.companionId || entry.characterId || "",
      },
      projectionKind,
      authority: "projection",
    },
    opts,
  );
}
