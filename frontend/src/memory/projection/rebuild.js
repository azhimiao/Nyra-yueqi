/**
 * Rebuild MemPalace projection index from authoritative sources (W5).
 * Best-effort; intended for injectable stores in verify / maintenance jobs.
 */

import {
  createMemoryPalaceIndexStore,
  getDefaultPalaceIndexStore,
  projectStableMemory,
  projectTimelineEvent,
  projectArtifactRef,
} from "./project-to-palace.js";

/**
 * @param {{
 *   stableMemory?: object[],
 *   timelineEvents?: object[],
 *   artifacts?: object[],
 *   store?: ReturnType<typeof createMemoryPalaceIndexStore>,
 *   companionId?: string,
 *   clearFirst?: boolean,
 *   nowIso?: string,
 * }} input
 */
export function rebuildPalaceIndex(input = {}) {
  const store = input.store || getDefaultPalaceIndexStore();
  const companionId = String(input.companionId || "").trim();
  const nowIso = String(input.nowIso || new Date().toISOString());
  const clearFirst = input.clearFirst !== false;

  if (clearFirst) {
    if (companionId && typeof store.list === "function") {
      const existing = store.list({ companionId, includeInvalidated: true });
      for (const row of existing) {
        if (typeof store.remove === "function") store.remove(row.indexId);
        else store.invalidate(row.indexId, nowIso);
      }
    } else if (typeof store.clear === "function") {
      store.clear();
    }
  }

  const projected = [];
  const errors = [];

  for (const item of Array.isArray(input.stableMemory) ? input.stableMemory : []) {
    if (item?.deleted || item?.tombstone) continue;
    if (companionId && String(item.companionId || "") !== companionId) continue;
    const created = projectStableMemory(item, { nowIso, companionId });
    if (!created.ok) {
      errors.push({ sourceType: "stable_memory", reason: created.errors });
      continue;
    }
    projected.push(store.upsert(created.value));
  }

  for (const event of Array.isArray(input.timelineEvents) ? input.timelineEvents : []) {
    if (event?.deleted || event?.status === "cancelled") continue;
    if (companionId && String(event.companionId || event.characterId || "") !== companionId) continue;
    const created = projectTimelineEvent(event, { nowIso, companionId });
    if (!created.ok) {
      errors.push({ sourceType: "timeline_event", reason: created.errors });
      continue;
    }
    projected.push(store.upsert(created.value));
  }

  for (const artifact of Array.isArray(input.artifacts) ? input.artifacts : []) {
    if (artifact?.deleted) continue;
    if (companionId && String(artifact.companionId || artifact.characterId || "") !== companionId) {
      continue;
    }
    const created = projectArtifactRef(artifact, { nowIso, companionId });
    if (!created.ok) {
      errors.push({ sourceType: "artifact", reason: created.errors });
      continue;
    }
    projected.push(store.upsert(created.value));
  }

  return {
    ok: errors.length === 0,
    projected: projected.length,
    errors,
    store,
    records: projected,
  };
}

export { createMemoryPalaceIndexStore };
