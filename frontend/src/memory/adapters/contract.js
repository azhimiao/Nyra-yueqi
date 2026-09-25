/**
 * FeatureMemoryAdapter contract — adapters translate feature writes into projections.
 * Adapters do not own authoritative state.
 */

/**
 * @typedef {object} FeatureMemoryAdapter
 * @property {string} featureId
 * @property {(change: object) => object | null} getSourceRef
 * @property {(change: object, scope?: object) => Promise<object[]|object> | object[] | object} [emitTimelineEvents]
 * @property {(change: object, scope?: object) => Promise<object[]|object> | object[] | object} [submitUnderstandingCandidates]
 * @property {(change: object, scope?: object) => Promise<object[]|object> | object[] | object} [buildIndexDocuments]
 * @property {(change: object, scope?: object) => Promise<object> | object} [handleSourceTombstone]
 * @property {(sourceId: string, scope?: object) => Promise<object> | object} [rebuildForSource]
 * @property {(change: object, scope?: object, opts?: object) => Promise<object> | object} [onSave]
 */

/**
 * @param {Partial<FeatureMemoryAdapter> & { featureId: string }} partial
 * @returns {FeatureMemoryAdapter}
 */
export function createFeatureMemoryAdapter(partial = {}) {
  const featureId = String(partial.featureId || "").trim();
  if (!featureId) throw new Error("createFeatureMemoryAdapter: featureId required");
  return {
    featureId,
    getSourceRef:
      typeof partial.getSourceRef === "function"
        ? partial.getSourceRef
        : () => null,
    emitTimelineEvents:
      typeof partial.emitTimelineEvents === "function"
        ? partial.emitTimelineEvents
        : async () => [],
    submitUnderstandingCandidates:
      typeof partial.submitUnderstandingCandidates === "function"
        ? partial.submitUnderstandingCandidates
        : async () => [],
    buildIndexDocuments:
      typeof partial.buildIndexDocuments === "function"
        ? partial.buildIndexDocuments
        : async () => [],
    handleSourceTombstone:
      typeof partial.handleSourceTombstone === "function"
        ? partial.handleSourceTombstone
        : async () => ({ ok: true, skipped: true }),
    rebuildForSource:
      typeof partial.rebuildForSource === "function"
        ? partial.rebuildForSource
        : async () => ({ ok: true, skipped: true }),
    onSave: typeof partial.onSave === "function" ? partial.onSave : undefined,
  };
}

export const ADAPTER_PROJECTION_KINDS = Object.freeze({
  timeline: "timeline_event",
  palace: "palace_text",
  candidate: "understanding_candidate",
});
