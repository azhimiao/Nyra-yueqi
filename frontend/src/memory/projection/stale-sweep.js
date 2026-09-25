/**
 * Stale MemPalace / KG sweep after forget or source delete (W5).
 * Core store ops are synchronous so forget cascades stay sync when flag is on.
 */

import { getDefaultPalaceIndexStore } from "./project-to-palace.js";

/**
 * Invalidate palace index (+ optional KG / memory adapters) for forgotten sourceIds.
 *
 * @param {{
 *   sourceIds?: string[],
 *   companionId?: string,
 *   store?: { list(q?: object): object[], invalidate(id: string, at?: string): object|null, remove?(id: string): boolean },
 *   nowIso?: string,
 *   hardDelete?: boolean,
 *   invalidateKg?: (row: object) => Promise<void>|void,
 *   deleteMemory?: (id: string) => Promise<void>|void,
 * }} input
 */
export function sweepStalePalaceEntries(input = {}) {
  const sourceIds = [...new Set(
    (Array.isArray(input.sourceIds) ? input.sourceIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  )];
  if (!sourceIds.length) {
    return { ok: true, swept: 0, indexIds: [], kgTouched: 0, memoriesDeleted: 0 };
  }

  const companionId = String(input.companionId || "").trim();
  const store = input.store || getDefaultPalaceIndexStore();
  const nowIso = String(input.nowIso || new Date().toISOString());
  const hardDelete = input.hardDelete === true;

  const candidates = store.list({
    companionId: companionId || undefined,
    includeInvalidated: true,
  });

  const sourceSet = new Set(sourceIds);
  const matched = candidates.filter((row) => {
    if (!sourceSet.has(String(row.sourceId || "").trim())) return false;
    if (companionId && row.companionId && row.companionId !== companionId) return false;
    return true;
  });

  const indexIds = [];
  let kgTouched = 0;
  let memoriesDeleted = 0;

  for (const row of matched) {
    if (hardDelete && typeof store.remove === "function") {
      store.remove(row.indexId);
    } else {
      store.invalidate(row.indexId, nowIso);
    }
    indexIds.push(row.indexId);

    if (typeof input.invalidateKg === "function") {
      try {
        const maybe = input.invalidateKg(row);
        if (maybe && typeof maybe.then === "function") maybe.catch?.(() => {});
        kgTouched += 1;
      } catch {
        /* ignore adapter errors */
      }
    }

    const memoryId = row.drawerId || row.indexId;
    if (typeof input.deleteMemory === "function" && memoryId) {
      try {
        const maybe = input.deleteMemory(memoryId);
        if (maybe && typeof maybe.then === "function") maybe.catch?.(() => {});
        memoriesDeleted += 1;
      } catch {
        /* ignore adapter errors */
      }
    }
  }

  return {
    ok: true,
    swept: indexIds.length,
    indexIds,
    sourceIds,
    kgTouched,
    memoriesDeleted,
  };
}

/**
 * Convenience: collect forgotten stable/candidate ids then sweep.
 * @param {{
 *   forgottenStable?: object[],
 *   forgottenCandidates?: object[],
 *   companionId?: string,
 *   store?: object,
 *   nowIso?: string,
 *   invalidateKg?: Function,
 *   deleteMemory?: Function,
 *   hardDelete?: boolean,
 * }} input
 */
export function sweepAfterForget(input = {}) {
  const sourceIds = [];
  for (const m of Array.isArray(input.forgottenStable) ? input.forgottenStable : []) {
    const id = String(m?.memoryId || m?.id || "").trim();
    if (id) sourceIds.push(id);
  }
  for (const c of Array.isArray(input.forgottenCandidates) ? input.forgottenCandidates : []) {
    const id = String(c?.candidateId || c?.id || "").trim();
    if (id) sourceIds.push(id);
  }
  return sweepStalePalaceEntries({
    sourceIds,
    companionId: input.companionId,
    store: input.store,
    nowIso: input.nowIso,
    invalidateKg: input.invalidateKg,
    deleteMemory: input.deleteMemory,
    hardDelete: input.hardDelete,
  });
}
