/**
 * User actions on context memories: edit, delete, freeze, forbid proactive use.
 */

import { deleteItem, getItem, updateItem } from "./store.js";
import { PRIVACY_LEVELS, RETENTION_POLICIES, validateContextItem } from "./schema.js";

/**
 * @param {string} id
 * @param {{
 *   content?: string,
 *   summary?: string,
 *   privacyLevel?: string,
 *   retention?: string,
 *   whyRemembered?: string,
 *   tags?: string[],
 *   confidence?: number,
 * }} patch
 */
export function editMemory(id, patch = {}) {
  const existing = getItem(id);
  if (!existing) return { ok: false, error: "not found" };
  if (existing.frozen && patch.content && patch.content !== existing.content) {
    // allow metadata edits while frozen; content edit unfreezes? keep frozen and reject content change
    return { ok: false, error: "frozen; unfreeze before editing content" };
  }
  /** @type {Record<string, unknown>} */
  const next = {};
  if (patch.content != null) next.content = String(patch.content).trim();
  if (patch.summary != null) next.summary = String(patch.summary).trim().slice(0, 240);
  if (patch.whyRemembered != null) next.whyRemembered = String(patch.whyRemembered).trim();
  if (patch.tags) next.tags = patch.tags.map(String);
  if (patch.confidence != null) next.confidence = Number(patch.confidence);
  if (patch.privacyLevel && PRIVACY_LEVELS.includes(patch.privacyLevel)) {
    next.privacyLevel = patch.privacyLevel;
    if (patch.privacyLevel === "forbidden") next.forbidProactive = true;
  }
  if (patch.retention && RETENTION_POLICIES.includes(patch.retention)) {
    next.retention = patch.retention;
  }
  // resolve conflict when user explicitly edits
  if (patch.content != null) {
    next.conflictState = "resolved";
  }
  const updated = updateItem(id, next);
  if (!updated.ok) return updated;
  const v = validateContextItem(updated.value);
  return v.ok ? { ok: true, value: updated.value } : { ok: false, error: v.errors.join("; ") };
}

/**
 * Hard isolation delete: tombstone so all retrieval misses it.
 * @param {string} id
 */
export function deleteMemory(id) {
  const existing = getItem(id);
  if (!existing) {
    // still tombstone id for cache safety
    return deleteItem(id);
  }
  return deleteItem(id);
}

/**
 * @param {string} id
 * @param {boolean} [frozen=true]
 */
export function freezeMemory(id, frozen = true) {
  const existing = getItem(id);
  if (!existing) return { ok: false, error: "not found" };
  return updateItem(id, {
    frozen: Boolean(frozen),
    forbidProactive: frozen ? true : existing.forbidProactive,
  });
}

/**
 * @param {string} id
 * @param {boolean} [forbid=true]
 */
export function forbidProactiveUse(id, forbid = true) {
  const existing = getItem(id);
  if (!existing) return { ok: false, error: "not found" };
  return updateItem(id, { forbidProactive: Boolean(forbid) });
}

/**
 * Viewer projection: why remembered, source, last used.
 * @param {string} id
 */
export function getMemoryViewerModel(id) {
  const item = getItem(id);
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    content: item.content,
    summary: item.summary,
    whyRemembered: item.whyRemembered,
    source: item.source,
    sourceRef: item.sourceRef,
    occurredAt: item.occurredAt,
    lastUsedAt: item.lastUsedAt,
    confidence: item.confidence,
    privacyLevel: item.privacyLevel,
    retention: item.retention,
    conflictState: item.conflictState,
    frozen: item.frozen,
    forbidProactive: item.forbidProactive,
    characterId: item.characterId,
    workspaceId: item.workspaceId,
    tags: item.tags,
    actions: {
      canEdit: !item.frozen,
      canDelete: true,
      canFreeze: true,
      canForbidProactive: true,
    },
  };
}
