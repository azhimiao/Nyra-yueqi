/**
 * Diary FeatureMemoryAdapter — project repository writes to Timeline / Palace / candidates.
 * Does not own diary document state (Diary Repository is authority).
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { createMemoryIndexEntryV1 } from "../../contracts/memory-index-entry-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import { enqueueProjectionJob, isProjectionOutboxEnabled } from "../../projections/outbox.js";
import { registerProjector } from "../../projections/registry.js";
import { processProjectionQueue } from "../../projections/worker.js";
import {
  projectToPalaceIndex,
  getDefaultPalaceIndexStore,
} from "../projection/project-to-palace.js";
import { fileDrawer } from "../palace/drawer.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter, ADAPTER_PROJECTION_KINDS } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const DIARY_ADAPTER_FEATURE_ID = "diary";
export const DIARY_PALACE_PROJECTION_KIND = "palace_text";
export const DIARY_TIMELINE_PROJECTION_KIND = "timeline_event";

let registered = false;

function diaryScope(record, scope = {}) {
  const companionId = String(
    scope.companionId || record?.companionId || record?.characterId || "",
  ).trim();
  const userId = String(scope.userId || record?.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      scope.relationshipId ||
      record?.relationshipId ||
      relationshipIdFor(userId, companionId),
  });
}

/**
 * @param {object} record — DiaryRecord or legacy-shaped diary
 * @param {{ created?: boolean }} [meta]
 */
export function getDiarySourceRef(record, meta = {}) {
  if (!record || typeof record !== "object") return null;
  const sourceId = String(record.id || record.diaryId || "").trim();
  if (!sourceId) return null;
  const scope = diaryScope(record);
  const sourceVersion = Number(record.sourceVersion || record.revision || 1) || 1;
  const body = String(record.body || record.rawText || "").trim();
  const contentHash =
    String(record.contentHash || "").trim() ||
    `${sourceId}:v${sourceVersion}:${body.length}`;
  return createSourceRefV1({
    sourceType: "diary",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: String(record.realityNamespace || "reality"),
    occurredAt: String(record.updatedAt || record.createdAt || new Date().toISOString()),
    visibility: String(record.visibility || "private"),
    contentHash,
  });
}

async function emitDiaryTimeline(record, scope, meta = {}) {
  const frozen = diaryScope(record, scope);
  if (!frozen.companionId) return { ok: false, reason: "missing_companionId", events: [] };
  const sourceRef = getDiarySourceRef(record);
  const created = meta.created === true;
  const eventType = created ? "diary.completed" : "diary.updated";
  const idempotencyKey = `diary:${sourceRef.sourceId}:v${sourceRef.sourceVersion}:${eventType}`;
  const result = appendTimelineEvent({
    eventId: mintId("eventId", "diary"),
    eventType,
    source: "diary_adapter",
    sourceId: sourceRef.sourceId,
    idempotencyKey,
    actor: frozen.companionId,
    principal: frozen.userId,
    companionId: frozen.companionId,
    userId: frozen.userId,
    relationshipId: frozen.relationshipId,
    realityNamespace: sourceRef.realityNamespace,
    occurredAt: sourceRef.occurredAt,
    visibility: sourceRef.visibility,
    payload: {
      summary: created ? "diary completed" : "diary updated",
      diaryId: sourceRef.sourceId,
      diaryDay: record.diaryDay || "",
      title: String(record.title || "").trim(),
      sourceVersion: sourceRef.sourceVersion,
      sourceRef,
    },
    evidenceRefs: [`diary:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`],
  });
  return { ok: result.ok !== false, events: result.ok ? [result.value] : [], result };
}

async function buildDiaryIndexDocuments(record, scope) {
  const frozen = diaryScope(record, scope);
  const sourceRef = getDiarySourceRef(record);
  if (!sourceRef) return { ok: false, documents: [] };
  const text = String(record.body || record.rawText || "").trim();
  const indexEntry = createMemoryIndexEntryV1({
    indexId: `px:diary:${frozen.companionId}:${sourceRef.sourceId}`,
    sourceRef,
    projectionKind: DIARY_PALACE_PROJECTION_KIND,
    projectionVersion: sourceRef.sourceVersion,
    title: String(record.title || "").trim(),
    text,
    summary: text.slice(0, 160),
    tags: Array.isArray(record.tags) ? record.tags : ["diary"],
    wing: record.wing || "Relationship",
    room: record.room || "Diary",
    contentHash: sourceRef.contentHash,
    stale: false,
    tombstone: null,
  });

  const projected = await projectToPalaceIndex(
    {
      kind: "diary",
      sourceType: "diary",
      // projectArtifactRef reads artifactId | id | diaryId (not sourceId)
      id: sourceRef.sourceId,
      diaryId: sourceRef.sourceId,
      sourceId: sourceRef.sourceId,
      companionId: frozen.companionId,
      relationshipId: frozen.relationshipId,
      realityNamespace: sourceRef.realityNamespace,
      title: indexEntry.title,
      body: text,
      searchableText: text,
      contentHash: sourceRef.contentHash,
      sourceRef,
      projectionKind: DIARY_PALACE_PROJECTION_KIND,
      authority: "projection",
      wing: indexEntry.wing,
      room: indexEntry.room,
      tags: indexEntry.tags,
      styleId: record.styleId,
      diaryDay: record.diaryDay,
      pinned: record.pinned,
      weight: record.weight,
    },
    { store: getDefaultPalaceIndexStore(), fileDrawer },
  );

  return {
    ok: projected.ok !== false,
    documents: [indexEntry],
    palace: projected.value || null,
  };
}

/** Rebuild the existing diary rows into the shared Palace/memory index. */
export async function projectDiaryMemoryIndex(record, scope = {}) {
  return buildDiaryIndexDocuments(record, scope);
}

/** Optional candidate stub — does not invent Stable Memory; returns empty unless explicitly requested. */
async function submitDiaryCandidates(_record, _scope, opts = {}) {
  if (opts.extractCandidates !== true) {
    return { ok: true, candidates: [], stub: true };
  }
  return { ok: true, candidates: [], stub: true };
}

async function handleDiaryTombstone(change, scope = {}) {
  const sourceId = String(change?.sourceId || change?.id || change?.diaryId || "").trim();
  const frozen = diaryScope(change, scope);
  const store = getDefaultPalaceIndexStore();
  const rows = store.list({
    sourceType: "diary",
    sourceId,
    companionId: frozen.companionId || undefined,
    includeInvalidated: true,
  });
  const at = new Date().toISOString();
  for (const row of rows) {
    store.invalidate(row.indexId, at);
  }
  return { ok: true, invalidated: rows.length, sourceId };
}

async function rebuildDiarySource(sourceId, scope = {}) {
  const id = String(sourceId || "").trim();
  if (!id) return { ok: false, reason: "missing_sourceId" };
  // Caller supplies record via scope.record when rebuilding from repository.
  const record = scope.record;
  if (!record) return { ok: false, reason: "missing_record" };
  return buildDiaryIndexDocuments(record, scope);
}

async function runSyncProjections(record, scope, meta = {}) {
  const timeline = await emitDiaryTimeline(record, scope, meta);
  const palace = await buildDiaryIndexDocuments(record, scope);
  const candidates = await submitDiaryCandidates(record, scope, meta);
  return { ok: true, mode: "sync", timeline, palace, candidates };
}

async function enqueueDiaryProjections(record, scope, meta = {}, opts = {}) {
  const sourceRef = getDiarySourceRef(record);
  if (!sourceRef) return { ok: false, reason: "missing_source_ref" };
  const force = opts.force === true;
  const operations = ["timeline", "palace", "candidate"];
  const jobs = [];
  for (const kind of [DIARY_TIMELINE_PROJECTION_KIND, DIARY_PALACE_PROJECTION_KIND]) {
    const enq = enqueueProjectionJob(
      {
        sourceRef,
        projectionKind: kind,
        operations,
        payload: {
          featureId: DIARY_ADAPTER_FEATURE_ID,
          diaryId: sourceRef.sourceId,
          created: meta.created === true,
          recordSnapshot: {
            id: record.id,
            title: record.title,
            body: String(record.body || record.rawText || "").slice(0, 4000),
            diaryDay: record.diaryDay,
            companionId: record.companionId,
            userId: record.userId,
            relationshipId: record.relationshipId,
            sourceVersion: sourceRef.sourceVersion,
            contentHash: sourceRef.contentHash,
            styleId: record.styleId,
            tags: record.tags,
            visibility: record.visibility,
            updatedAt: record.updatedAt,
            createdAt: record.createdAt,
          },
        },
      },
      { force },
    );
    jobs.push(enq);
  }
  if (opts.processNow !== false) {
    await processProjectionQueue({ limit: 20 });
  }
  return { ok: true, mode: "outbox", jobs };
}

/**
 * After authoritative repository save: project Timeline + Palace (+ candidate stub).
 * Uses outbox when `memoryProjectionOutboxV1` is on or opts.force; otherwise sync project.
 *
 * @param {object} record
 * @param {{ created?: boolean, scope?: object, force?: boolean, processNow?: boolean, extractCandidates?: boolean }} [opts]
 */
export async function projectDiarySave(record, opts = {}) {
  const scope = opts.scope || diaryScope(record);
  const meta = { created: opts.created === true, extractCandidates: opts.extractCandidates === true };
  const useOutbox = opts.force === true || isProjectionOutboxEnabled();
  ensureDiaryAdapterRegistered();
  if (useOutbox) {
    return enqueueDiaryProjections(record, scope, meta, opts);
  }
  return runSyncProjections(record, scope, meta);
}

async function diaryProjectorHandler(job) {
  const snap = job?.payload?.recordSnapshot || {};
  const record = {
    ...snap,
    id: snap.id || job?.sourceRef?.sourceId,
    rawText: snap.body,
    sourceVersion: job?.sourceRef?.sourceVersion || snap.sourceVersion,
  };
  const scope = diaryScope(record, {
    companionId: job?.sourceRef?.companionId,
    userId: job?.sourceRef?.userId,
    relationshipId: job?.sourceRef?.relationshipId,
  });
  const kind = String(job.projectionKind || "");
  if (kind === DIARY_TIMELINE_PROJECTION_KIND || kind === ADAPTER_PROJECTION_KINDS.timeline) {
    return emitDiaryTimeline(record, scope, { created: job?.payload?.created === true });
  }
  if (kind === DIARY_PALACE_PROJECTION_KIND || kind === "palace_text") {
    return buildDiaryIndexDocuments(record, scope);
  }
  return { ok: true, skipped: true, kind };
}

export function ensureDiaryAdapterRegistered() {
  if (registered) return diaryFeatureMemoryAdapter;
  registerProjector(DIARY_PALACE_PROJECTION_KIND, diaryProjectorHandler);
  registerProjector(DIARY_TIMELINE_PROJECTION_KIND, diaryProjectorHandler);
  registerFeatureMemoryAdapter(DIARY_ADAPTER_FEATURE_ID, diaryFeatureMemoryAdapter);
  registered = true;
  return diaryFeatureMemoryAdapter;
}

/** Reset registration flag after test clears (projectors must be re-bound). */
export function __resetDiaryAdapterRegistrationForTests() {
  registered = false;
}

export const diaryFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: DIARY_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getDiarySourceRef(change),
  emitTimelineEvents: (change, scope) => emitDiaryTimeline(change, scope, { created: change?.created === true }),
  submitUnderstandingCandidates: (change, scope) => submitDiaryCandidates(change, scope),
  buildIndexDocuments: (change, scope) => buildDiaryIndexDocuments(change, scope),
  handleSourceTombstone: (change, scope) => handleDiaryTombstone(change, scope),
  rebuildForSource: (sourceId, scope) => rebuildDiarySource(sourceId, scope),
  onSave: (change, scope, opts) =>
    projectDiarySave(change, { ...opts, scope, created: change?.created === true }),
});

/** Convenience: is diary repository authority path enabled? */
export function isDiaryRepositoryEnabled() {
  try {
    return isFeatureEnabled("diaryRepositoryV1") === true;
  } catch {
    return false;
  }
}
