/**
 * Visual Memory store — companion-scoped VisualAsset index.
 * Bytes stay in IndexedDB media; this layer is semantics only.
 */

import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import {
  VISUAL_MEMORY_KEY,
  VISUAL_MEMORY_SCHEMA_VERSION,
  VISUAL_GROUP_IDS,
  VISUAL_NAMESPACES,
  normalizeVisualAsset,
  isUsableIdentityReference,
  namespaceForGroupId,
  groupIdForNamespace,
  defaultKindForNamespace,
} from "./schema.js";

function emptyCompanionBag(companionId = "") {
  return {
    companionId: String(companionId || "").trim(),
    identityVersion: 1,
    assets: [],
    updatedAt: new Date().toISOString(),
  };
}

function readBag() {
  const raw = readLocalObject(VISUAL_MEMORY_KEY, null);
  if (!raw || typeof raw !== "object") {
    return { schemaVersion: VISUAL_MEMORY_SCHEMA_VERSION, byCompanion: {} };
  }
  return {
    schemaVersion: VISUAL_MEMORY_SCHEMA_VERSION,
    byCompanion: raw.byCompanion && typeof raw.byCompanion === "object" ? { ...raw.byCompanion } : {},
  };
}

function writeBag(bag) {
  writeLocalObject(VISUAL_MEMORY_KEY, {
    schemaVersion: VISUAL_MEMORY_SCHEMA_VERSION,
    byCompanion: bag.byCompanion || {},
  });
}

export function getCompanionVisualBag(companionId) {
  const id = String(companionId || "").trim();
  if (!id) return emptyCompanionBag();
  const bag = readBag();
  const raw = bag.byCompanion[id];
  if (!raw || typeof raw !== "object") return emptyCompanionBag(id);
  return {
    companionId: id,
    identityVersion: Math.max(1, Number(raw.identityVersion) || 1),
    assets: Array.isArray(raw.assets)
      ? raw.assets.map(normalizeVisualAsset).filter((a) => a.mediaId)
      : [],
    updatedAt: String(raw.updatedAt || ""),
  };
}

function saveCompanionVisualBag(state) {
  const id = String(state?.companionId || "").trim();
  if (!id) return emptyCompanionBag();
  const bag = readBag();
  const next = {
    companionId: id,
    identityVersion: Math.max(1, Number(state.identityVersion) || 1),
    assets: (Array.isArray(state.assets) ? state.assets : [])
      .map(normalizeVisualAsset)
      .filter((a) => a.mediaId)
      .slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };
  bag.byCompanion[id] = next;
  writeBag(bag);
  return next;
}

export function getIdentityVersion(companionId) {
  return getCompanionVisualBag(companionId).identityVersion;
}

/** Bump identity version when appearance is intentionally revised; old assets keep prior version. */
export function bumpIdentityVersion(companionId) {
  const state = getCompanionVisualBag(companionId);
  if (!state.companionId) return 1;
  state.identityVersion += 1;
  saveCompanionVisualBag(state);
  return state.identityVersion;
}

/**
 * @param {string} companionId
 * @param {Partial<import("./schema.js").VisualAsset>} input
 */
export function upsertVisualAsset(companionId, input = {}) {
  const id = String(companionId || input.companionId || "").trim();
  if (!id || !String(input.mediaId || "").trim()) return null;
  const state = getCompanionVisualBag(id);
  const asset = normalizeVisualAsset({
    ...input,
    companionId: id,
    identityVersion: input.identityVersion || state.identityVersion,
  });
  const idx = state.assets.findIndex((row) => row.id === asset.id || (
    row.mediaId === asset.mediaId && row.namespace === asset.namespace && row.kind === asset.kind
  ));
  if (idx >= 0) {
    const prev = state.assets[idx];
    const merged = { ...prev, ...asset, id: prev.id };
    // Sync/re-register must not clobber Identity QA or curated fields.
    if (input.preserveExisting !== false) {
      if (prev.qaStatus && input.overwriteQa !== true) merged.qaStatus = prev.qaStatus;
      if (prev.significance && input.overwriteSignificance !== true) {
        merged.significance = prev.significance;
      }
      if (prev.kind && !input.kind) merged.kind = prev.kind;
      if (prev.contextSummary && !String(input.contextSummary || "").trim()) {
        merged.contextSummary = prev.contextSummary;
      }
      if (prev.title && !String(input.title || "").trim()) merged.title = prev.title;
    }
    state.assets[idx] = normalizeVisualAsset(merged);
  } else {
    state.assets.unshift(asset);
  }
  saveCompanionVisualBag(state);
  const mediaId = asset.mediaId;
  const namespace = asset.namespace;
  const kind = (idx >= 0 ? state.assets[idx].kind : asset.kind);
  return state.assets.find((row) => (
    row.mediaId === mediaId && row.namespace === namespace && row.kind === kind
  )) || state.assets[Math.max(0, idx)] || asset;
}

export function listVisualAssets(companionId, {
  namespace = "",
  kind = "",
  significanceMin = "",
  relationshipOnly = false,
  identityVersion = 0,
  usableIdentityOnly = false,
} = {}) {
  let rows = getCompanionVisualBag(companionId).assets;
  if (namespace && VISUAL_NAMESPACES.includes(namespace)) {
    rows = rows.filter((a) => a.namespace === namespace);
  }
  if (kind) rows = rows.filter((a) => a.kind === kind);
  if (relationshipOnly) rows = rows.filter((a) => a.relationshipRelevant);
  if (identityVersion > 0) {
    rows = rows.filter((a) => a.identityVersion === identityVersion);
  }
  if (usableIdentityOnly) {
    rows = rows.filter(isUsableIdentityReference);
  }
  if (significanceMin) {
    const order = ["seen", "saved", "meaningful", "memory_linked"];
    const min = order.indexOf(significanceMin);
    if (min >= 0) {
      rows = rows.filter((a) => order.indexOf(a.significance) >= min);
    }
  }
  return rows;
}

/** VisualIdentityPack refs for strict consumers — latest passed identity assets only. */
export function listIdentityReferences(companionId, { kinds = [] } = {}) {
  const version = getIdentityVersion(companionId);
  let rows = listVisualAssets(companionId, {
    namespace: "identity",
    usableIdentityOnly: true,
  }).filter((a) => a.identityVersion === version);
  if (Array.isArray(kinds) && kinds.length) {
    const allow = new Set(kinds);
    rows = rows.filter((a) => allow.has(a.kind));
  }
  return rows;
}

/**
 * Identity photos the image generator may actually use. Newly imported album
 * photos are pending manual QA, but they are still explicit user-provided
 * identity evidence; only failed assets are excluded here.
 */
export function listIdentityGenerationReferences(companionId, { kinds = [] } = {}) {
  const version = getIdentityVersion(companionId);
  let rows = listVisualAssets(companionId, {
    namespace: "identity",
  }).filter((asset) => asset.identityVersion === version && asset.qaStatus !== "failed");
  if (Array.isArray(kinds) && kinds.length) {
    const allow = new Set(kinds);
    rows = rows.filter((row) => allow.has(row.kind));
  }
  return rows;
}

/** Relationship view — 「我们的相册」projection, not a fourth store. */
export function listRelationshipVisuals(companionId, { limit = 80 } = {}) {
  return listVisualAssets(companionId, { relationshipOnly: true }).slice(0, Math.max(1, limit));
}

export function markVisualQa(companionId, assetId, qaStatus) {
  const state = getCompanionVisualBag(companionId);
  const nextStatus = ["pending", "passed", "failed", "n/a"].includes(qaStatus) ? qaStatus : "pending";
  let found = null;
  state.assets = state.assets.map((row) => {
    if (row.id !== assetId) return row;
    found = { ...row, qaStatus: nextStatus };
    return found;
  });
  if (!found) return null;
  saveCompanionVisualBag(state);
  return found;
}

export function setVisualSignificance(companionId, assetId, significance) {
  const state = getCompanionVisualBag(companionId);
  let found = null;
  state.assets = state.assets.map((row) => {
    if (row.id !== assetId) return row;
    found = normalizeVisualAsset({ ...row, significance });
    return found;
  });
  if (!found) return null;
  saveCompanionVisualBag(state);
  return found;
}

/**
 * Register a library photo into visual memory for a companion.
 * Existing QA / significance / kind are preserved unless meta.overwrite* is set.
 * @param {object} photo — library photo row ({ id, mediaId, groupId, title, summary, companionId? })
 * @param {object} meta
 */
export function registerLibraryPhotoAsVisual(photo, meta = {}) {
  const companionId = String(meta.companionId || photo?.companionId || "").trim();
  const mediaId = String(photo?.mediaId || "").trim();
  if (!companionId || !mediaId) return null;
  const namespace = namespaceForGroupId(photo?.groupId) || meta.namespace || "life";
  const kind = meta.kind || defaultKindForNamespace(namespace);
  const state = getCompanionVisualBag(companionId);
  const existing = state.assets.find((row) => (
    row.mediaId === mediaId && row.namespace === namespace && row.kind === kind
  )) || state.assets.find((row) => (
    row.mediaId === mediaId && row.namespace === namespace
  ));

  // Bulk library sync must never invent ownership of unrelated album photos.
  if (meta.sourceType === "library_sync" && !existing && meta.allowCreate !== true) {
    return existing || null;
  }

  return upsertVisualAsset(companionId, {
    id: existing?.id,
    mediaId,
    libraryPhotoId: String(photo?.id || existing?.libraryPhotoId || ""),
    libraryGroupId: String(photo?.groupId || existing?.libraryGroupId || ""),
    namespace,
    kind: meta.kind || existing?.kind || kind,
    sourceType: meta.sourceType || existing?.sourceType || "library",
    sourceId: meta.sourceId || String(photo?.id || existing?.sourceId || ""),
    title: photo?.title || meta.title || existing?.title || "",
    contextSummary: meta.contextSummary || photo?.summary || existing?.contextSummary || "",
    significance: meta.significance,
    semanticTags: meta.semanticTags,
    qaStatus: meta.qaStatus,
    relationshipRelevant: meta.relationshipRelevant,
    createdAt: existing?.createdAt || photo?.createdAt,
    preserveExisting: true,
    overwriteQa: meta.overwriteQa === true,
    overwriteSignificance: meta.overwriteSignificance === true,
  });
}

/** Remove semantic rows that point at a deleted library photo / media id. */
export function removeVisualAssetsForPhoto({ companionId = "", libraryPhotoId = "", mediaId = "" } = {}) {
  const photoId = String(libraryPhotoId || "").trim();
  const mid = String(mediaId || "").trim();
  if (!photoId && !mid) return 0;

  const bag = readBag();
  let removed = 0;
  const ids = companionId
    ? [String(companionId).trim()].filter(Boolean)
    : Object.keys(bag.byCompanion || {});

  for (const id of ids) {
    const state = getCompanionVisualBag(id);
    const next = state.assets.filter((row) => {
      const hit = (photoId && row.libraryPhotoId === photoId) || (mid && row.mediaId === mid);
      if (hit) removed += 1;
      return !hit;
    });
    if (next.length !== state.assets.length) {
      state.assets = next;
      saveCompanionVisualBag(state);
    }
  }
  return removed;
}

/** Mark Identity QA by mediaId (gallery lightbox path). */
export function markVisualQaByMedia(companionId, mediaId, qaStatus) {
  const id = String(companionId || "").trim();
  const mid = String(mediaId || "").trim();
  if (!id || !mid) return null;
  const state = getCompanionVisualBag(id);
  const row = state.assets.find((a) => a.mediaId === mid && a.namespace === "identity")
    || state.assets.find((a) => a.mediaId === mid);
  if (!row) return null;
  return markVisualQa(id, row.id, qaStatus);
}

export {
  VISUAL_GROUP_IDS,
  groupIdForNamespace,
  namespaceForGroupId,
  defaultKindForNamespace,
};
