/**
 * Post-promote Graph + Palace projection (M6).
 * When `contextGraphProjectionOnlyV1` is on, Stable is the understanding authority;
 * Graph/Palace are projections keyed by stable sourceRef.
 *
 * Outbox when `memoryProjectionOutboxV1` (or opts.force); otherwise sync project.
 */

import { createSourceRefV1 } from "../contracts/source-ref-v1.js";
import { ingestCandidate } from "../context/pipeline.js";
import { isFeatureEnabled } from "../features/flags.js";
import { enqueueProjectionJob, isProjectionOutboxEnabled } from "../projections/outbox.js";
import { relationshipIdFor } from "./companion-scope.js";
import { hashPalaceContent } from "./projection/palace-index-contract.js";
import {
  getDefaultPalaceIndexStore,
  projectStableMemory,
} from "./projection/index.js";

export const STABLE_GRAPH_PROJECTION_KIND = "stable_graph";
export const STABLE_PALACE_PROJECTION_KIND = "stable_palace";

/**
 * @param {object} memory — StableMemoryV1 row
 */
export function buildStableSourceRef(memory) {
  const memoryId = String(memory?.memoryId || memory?.id || "").trim();
  const companionId = String(memory?.companionId || "").trim();
  const userId = String(memory?.userId || "local").trim() || "local";
  const body = String(memory?.body || memory?.content || "").trim();
  const relationshipId =
    String(memory?.relationshipId || "").trim() || relationshipIdFor(userId, companionId);
  return createSourceRefV1({
    sourceType: "stable_memory",
    sourceId: memoryId,
    sourceVersion: Math.max(1, Number(memory?.version) || 1),
    companionId,
    relationshipId,
    userId,
    realityNamespace: String(memory?.realityNamespace || "reality"),
    occurredAt: String(memory?.updatedAt || memory?.createdAt || new Date().toISOString()),
    visibility: "private",
    contentHash: String(memory?.contentHash || "").trim() || hashPalaceContent(body || memoryId),
  });
}

/**
 * Sync Context Graph mirror tagged as projection with sourceRef → stable id.
 * @param {object} memory
 * @param {{ nowIso?: string }} [opts]
 */
export function projectStableToGraph(memory, opts = {}) {
  const memoryId = String(memory?.memoryId || memory?.id || "").trim();
  const companionId = String(memory?.companionId || "").trim();
  const body = String(memory?.body || "").trim();
  if (!memoryId || !companionId || !body) {
    return { ok: false, reason: "missing_stable_fields" };
  }
  return ingestCandidate(
    {
      content: body,
      summary: body.slice(0, 240),
      kind: memory.category || "semantic",
      source: "candidate_promotion",
      sourceRef: `stable:${memoryId}`,
      confidence: 0.95,
      characterId: companionId,
      workspaceId: companionId,
      evidenceRefs: Array.isArray(memory.evidenceRefs) ? memory.evidenceRefs : [],
      memoryStatus: "accepted",
      authority: "projection",
      whyRemembered: "promoted_stable_projection",
      tags: ["projection", "stable_mirror", "m6"],
      meta: {
        authority: "projection",
        sourceStableId: memoryId,
        companionId,
        relationshipId: memory.relationshipId || "",
        userId: memory.userId || "local",
      },
    },
    { nowIso: opts.nowIso, projectionMirror: true },
  );
}

/**
 * Sync palace index upsert for a stable memory.
 * @param {object} memory
 * @param {{ store?: object, nowIso?: string }} [opts]
 */
export function projectStableToPalace(memory, opts = {}) {
  const created = projectStableMemory(memory, { nowIso: opts.nowIso });
  if (!created.ok) return created;
  try {
    const store = opts.store || getDefaultPalaceIndexStore();
    store?.upsert?.(created.value);
  } catch {
    /* best-effort */
  }
  return created;
}

/**
 * After promoteCandidateToStable: enqueue graph+palace or sync project.
 * No-op when `contextGraphProjectionOnlyV1` is off (flag-off promote unchanged),
 * unless opts.force === true (tests).
 *
 * @param {object} memory
 * @param {{ force?: boolean, forceOutbox?: boolean, store?: object, nowIso?: string, processNow?: boolean }} [opts]
 */
export function projectStableUnderstanding(memory, opts = {}) {
  const memoryId = String(memory?.memoryId || memory?.id || "").trim();
  if (!memoryId) return { ok: false, reason: "missing_memoryId" };

  const gateOn = isFeatureEnabled("contextGraphProjectionOnlyV1") === true || opts.force === true;
  if (!gateOn) return { ok: true, skipped: true };

  const sourceRef = buildStableSourceRef(memory);
  const useOutbox = isProjectionOutboxEnabled() || opts.forceOutbox === true;

  if (useOutbox) {
    const graphJob = enqueueProjectionJob(
      {
        sourceRef,
        projectionKind: STABLE_GRAPH_PROJECTION_KIND,
        operations: ["graph"],
        payload: { memoryId, body: memory.body, companionId: memory.companionId },
      },
      { force: true },
    );
    const palaceJob = enqueueProjectionJob(
      {
        sourceRef,
        projectionKind: STABLE_PALACE_PROJECTION_KIND,
        operations: ["palace"],
        payload: { memoryId, body: memory.body, companionId: memory.companionId },
      },
      { force: true },
    );
    return {
      ok: true,
      mode: "outbox",
      sourceRef,
      jobs: [graphJob, palaceJob],
    };
  }

  const graph = projectStableToGraph(memory, opts);
  const palace = projectStableToPalace(memory, opts);
  return {
    ok: Boolean(graph?.ok !== false || palace?.ok),
    mode: "sync",
    sourceRef,
    graph,
    palace,
  };
}
