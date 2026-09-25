/**
 * Reading FeatureMemoryAdapter — book.chunk projections with SourceRef;
 * delete cascades tombstone/stale by sourceId prefix. Preferences → Candidate only.
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { createMemoryIndexEntryV1 } from "../../contracts/memory-index-entry-v1.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { fileDrawer } from "../palace/drawer.js";
import { splitDrawerText } from "../palace/chunk.js";
import { getDefaultPalaceIndexStore } from "../projection/project-to-palace.js";
import { submitCandidate } from "../candidate-ledger.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const READING_ADAPTER_FEATURE_ID = "reading";
export const READING_PALACE_PROJECTION_KIND = "palace_chunk";

let registered = false;

function readingScope(input = {}) {
  const companionId = String(
    input.companionId || input.characterId || "library",
  ).trim() || "library";
  const userId = String(input.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      input.relationshipId || relationshipIdFor(userId, companionId),
  });
}

/**
 * Stable book id used as sourceId prefix for chunk tombstones.
 * @param {object} book
 */
export function bookSourceId(book = {}) {
  const raw =
    String(book.id || book.bookId || "").trim() ||
    `book-${book.fileId || book.title || "unknown"}`;
  return raw.replace(/\s+/g, "-").slice(0, 80);
}

/**
 * Chunk sourceId: `{bookSourceId}:c{index}` — delete matches prefix `{bookSourceId}:`.
 * @param {string} bookId
 * @param {number} index
 */
export function bookChunkSourceId(bookId, index) {
  return `${bookSourceId({ id: bookId })}:c${Number(index) || 0}`;
}

/**
 * @param {object} chunkMeta
 */
export function getBookChunkSourceRef(chunkMeta = {}) {
  const scope = readingScope(chunkMeta);
  const sourceId = String(chunkMeta.sourceId || "").trim();
  if (!sourceId) return null;
  const sourceVersion = Number(chunkMeta.sourceVersion) || 1;
  const text = String(chunkMeta.rawText || chunkMeta.text || "");
  return createSourceRefV1({
    sourceType: "book_chunk",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: "reality",
    occurredAt: String(chunkMeta.occurredAt || new Date().toISOString()),
    visibility: "private",
    contentHash:
      String(chunkMeta.contentHash || "").trim() ||
      `book_chunk:${sourceId}:v${sourceVersion}:${text.length}`,
  });
}

function adaptersEnabled(opts = {}) {
  if (opts.force === true) return true;
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

/**
 * Ingest book chunks via fileDrawer with SourceRef + MemoryIndexEntry fields.
 * When flag/force off, returns { ok:false, reason:'flag_off' } — caller should use legacy path.
 *
 * @param {object} book
 * @param {{
 *   force?: boolean,
 *   companionId?: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   fileDrawer?: Function,
 *   palaceStore?: object,
 *   splitText?: Function,
 *   maxChunks?: number,
 *   renderMemoryState?: Function,
 * }} [opts]
 */
export async function ingestBookChunksWithSourceRef(book, opts = {}) {
  if (!adaptersEnabled(opts)) {
    return { ok: false, reason: "flag_off", saved: [] };
  }
  ensureReadingAdapterRegistered();

  const sourceText = String(book?.body || book?.excerpt || "").trim();
  if (!sourceText) return { ok: true, saved: [], documents: [] };

  const scope = readingScope({ ...book, ...opts });
  const bookId = bookSourceId(book);
  const chapterId = String(book.chapterId || book.chapter || "import").trim();
  const sourceVersion = Number(book.sourceVersion) || 1;
  const split = typeof opts.splitText === "function" ? opts.splitText : splitDrawerText;
  const drawer = typeof opts.fileDrawer === "function" ? opts.fileDrawer : fileDrawer;
  const maxChunks = Number.isFinite(opts.maxChunks) ? Number(opts.maxChunks) : 8;
  const chunks = split(sourceText).slice(0, maxChunks);
  const store = opts.palaceStore || getDefaultPalaceIndexStore();

  const saved = [];
  const documents = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const sourceId = bookChunkSourceId(bookId, index);
    const rawText = chunks[index];
    const sourceRef = getBookChunkSourceRef({
      sourceId,
      sourceVersion,
      rawText,
      companionId: scope.companionId,
      userId: scope.userId,
      relationshipId: scope.relationshipId,
    });
    const indexEntry = createMemoryIndexEntryV1({
      indexId: `px:book_chunk:${scope.companionId}:${sourceId}`,
      sourceRef,
      projectionKind: READING_PALACE_PROJECTION_KIND,
      projectionVersion: sourceVersion,
      title: String(book.title || "").trim(),
      text: rawText,
      summary: String(rawText || "").slice(0, 160),
      tags: ["书籍", book.author, book.format, "book.chunk"].filter(Boolean),
      wing: "World",
      room: "Reading",
      contentHash: sourceRef.contentHash,
      stale: false,
      tombstone: null,
    });

    const filed = await drawer({
      id: sourceId,
      drawerId: bookId,
      parentDrawerId: bookId,
      chunkIndex: index,
      chunkTotal: chunks.length,
      title: book.title,
      rawText,
      source: "book.chunk",
      weight: 0.88,
      role: "library",
      wing: "World",
      room: "Reading",
      tags: ["书籍", book.author, book.format].filter(Boolean),
      pinned: false,
      searchable: true,
      companionId: scope.companionId,
      characterId: scope.companionId,
      // SourceRef + index fields (passthrough via normalizeMemory)
      sourceRef,
      sourceType: "book_chunk",
      sourceId,
      contentHash: sourceRef.contentHash,
      projectionKind: READING_PALACE_PROJECTION_KIND,
      projectionVersion: sourceVersion,
      authority: "projection",
      stale: false,
      tombstone: null,
      bookId,
      chapterId,
      sourceVersion,
      // M7: required when palaceProjectionOnlyV1 is on
      allowProjectionWrite: true,
    });

    if (store && typeof store.upsert === "function") {
      // Plain index row (injectable store). Avoid PALACE_SOURCE_TYPES gate —
      // book_chunk is a unified-memory projection kind, not W5 companion-intel enum.
      store.upsert({
        indexId: indexEntry.indexId,
        sourceType: "book_chunk",
        sourceId,
        companionId: scope.companionId,
        relationshipId: scope.relationshipId,
        contentHash: sourceRef.contentHash,
        projectionVersion: sourceVersion,
        memoryId: filed?.id || sourceId,
        searchable: true,
        title: indexEntry.title,
        summary: indexEntry.summary,
        sourceRef,
        bookId,
        chapterId,
        stale: false,
        tombstone: null,
        invalidatedAt: null,
        indexedAt: indexEntry.indexedAt,
        authority: "projection",
      });
    }

    saved.push(filed);
    documents.push(indexEntry);
  }

  await opts.renderMemoryState?.();
  return { ok: true, saved, documents, bookId, sourceVersion };
}

/**
 * Cascade tombstone/stale for all chunks whose sourceId starts with `{bookId}:`.
 *
 * @param {string|object} bookOrId
 * @param {{
 *   companionId?: string,
 *   userId?: string,
 *   palaceStore?: object,
 *   at?: string,
 * }} [opts]
 */
export function tombstoneBookChunks(bookOrId, opts = {}) {
  ensureReadingAdapterRegistered();
  const bookId =
    typeof bookOrId === "string"
      ? bookSourceId({ id: bookOrId })
      : bookSourceId(bookOrId);
  if (!bookId) return { ok: false, reason: "missing_bookId", invalidated: 0 };
  const scope = readingScope({ ...opts, ...(typeof bookOrId === "object" ? bookOrId : {}) });
  const store = opts.palaceStore || getDefaultPalaceIndexStore();
  const at = String(opts.at || new Date().toISOString());
  const prefix = `${bookId}:`;

  const rows =
    typeof store.list === "function"
      ? store.list({
          sourceType: "book_chunk",
          companionId: scope.companionId || undefined,
          includeInvalidated: true,
        })
      : [];

  let invalidated = 0;
  for (const row of rows) {
    const sid = String(row.sourceId || "").trim();
    if (sid !== bookId && !sid.startsWith(prefix)) continue;
    if (typeof store.invalidate === "function") {
      store.invalidate(row.indexId, at);
    } else if (typeof store.upsert === "function") {
      store.upsert({
        ...row,
        stale: true,
        searchable: false,
        invalidatedAt: at,
        tombstone: { reason: "book_deleted", at, sourceId: bookId },
      });
    }
    invalidated += 1;
  }

  return { ok: true, bookId, invalidated, prefix };
}

/**
 * Preference signal → Candidate only (never accepted Context Graph).
 */
export function submitReadingPreference(input = {}, deps = {}) {
  const scope = readingScope(input);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId" };
  const bookId = String(input.bookId || input.id || "").trim();
  const title = String(input.title || "").trim();
  const claim =
    String(input.claim || "").trim() ||
    `喜欢这本书${title ? `：${title}` : ""}`;
  const submit =
    typeof deps.submitCandidate === "function" ? deps.submitCandidate : submitCandidate;

  const result = submit({
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    claim,
    category: "preference",
    source: "reading_adapter",
    userStated: true,
    confidence: 0.9,
    status: "pending",
    realityNamespace: "reality",
    evidenceRefs: bookId ? [`book:${bookId}`] : [],
    idempotencyKey: `reading-pref:${scope.companionId}:${bookId || claim.slice(0, 40)}`,
    meta: { bookId, title, graphIngest: false },
  });

  return {
    ok: result?.ok !== false,
    candidate: result?.value || result,
    graphIngested: false,
    result,
  };
}

export async function handleReadingTombstone(change, scope = {}) {
  return tombstoneBookChunks(change?.bookId || change?.sourceId || change?.id || change, {
    ...scope,
    ...change,
  });
}

export async function buildReadingIndexDocuments(change, scope = {}) {
  return ingestBookChunksWithSourceRef(change, { ...scope, force: true });
}

export function ensureReadingAdapterRegistered() {
  if (registered) return readingFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(READING_ADAPTER_FEATURE_ID, readingFeatureMemoryAdapter);
  registered = true;
  return readingFeatureMemoryAdapter;
}

export function __resetReadingAdapterRegistrationForTests() {
  registered = false;
}

export function isReadingAdapterEnabled() {
  return adaptersEnabled({});
}

export const readingFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: READING_ADAPTER_FEATURE_ID,
  getSourceRef: (change) =>
    getBookChunkSourceRef({
      ...change,
      sourceId:
        change?.sourceId ||
        (change?.bookId != null && change?.chunkIndex != null
          ? bookChunkSourceId(change.bookId, change.chunkIndex)
          : bookSourceId(change)),
    }),
  emitTimelineEvents: async () => ({ ok: true, events: [], stub: true }),
  submitUnderstandingCandidates: (change, scope) =>
    submitReadingPreference({ ...change, ...scope }),
  buildIndexDocuments: (change, scope) => buildReadingIndexDocuments(change, scope),
  handleSourceTombstone: (change, scope) => handleReadingTombstone(change, scope),
  rebuildForSource: async (sourceId, scope = {}) => {
    if (scope.record) {
      return ingestBookChunksWithSourceRef(scope.record, { ...scope, force: true });
    }
    return { ok: false, reason: "missing_record", sourceId };
  },
  onSave: (change, scope, opts) =>
    ingestBookChunksWithSourceRef(change, { ...opts, ...scope, force: opts?.force }),
});
