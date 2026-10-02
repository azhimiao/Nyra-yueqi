import { getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import {
  IDB_STORE,
  LS_KEYS,
  defaultManifest,
  manifestRecordId,
} from "./constants.js";
import { validateManifest } from "./schema/validate.js";

function readLs(key, fallback) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeLs(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} characterId
 */
export async function getOrCreateManifest(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return defaultManifest("");
  await openMemoryDb();
  const id = manifestRecordId(cid);
  const all = await getAllRecords(IDB_STORE);
  const found = (all || []).find((row) => row?.id === id);
  if (found?.manifest) {
    return validateManifest(found.manifest, cid).value;
  }
  const created = defaultManifest(cid);
  await saveManifest(created);
  return created;
}

/**
 * @param {object} manifest
 */
export async function saveManifest(manifest) {
  const validated = validateManifest(manifest, manifest?.characterId).value;
  validated.updatedAt = new Date().toISOString();
  await openMemoryDb();
  await storeRecord(IDB_STORE, {
    id: manifestRecordId(validated.characterId),
    kind: "manifest",
    characterId: validated.characterId,
    manifest: validated,
    updatedAt: validated.updatedAt,
  });
  return validated;
}

export function getLastCharacterId() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return "";
    return String(window.localStorage.getItem(LS_KEYS.lastCharacterId) || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} characterId
 */
export function setLastCharacterId(characterId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const cid = String(characterId || "").trim();
    if (cid) window.localStorage.setItem(LS_KEYS.lastCharacterId, cid);
  } catch {
    /* ignore */
  }
}

export function loadPrefs() {
  const raw = readLs(LS_KEYS.prefs, null);
  return {
    projectionEnabled: raw?.projectionEnabled !== false,
    dwellThresholdMs: Math.max(1000, Number(raw?.dwellThresholdMs) || 3000),
  };
}

/**
 * @param {Partial<{projectionEnabled:boolean,dwellThresholdMs:number}>} patch
 */
export function savePrefs(patch = {}) {
  const next = { ...loadPrefs(), ...patch };
  writeLs(LS_KEYS.prefs, next);
  return next;
}

/**
 * Export for backup: manifests + payloads grouped by characterId.
 */
export async function exportSidewrite() {
  await openMemoryDb();
  const all = await getAllRecords(IDB_STORE);
  /** @type {Record<string, { manifest?: object, payloads: Record<string, object> }>} */
  const byChar = {};
  for (const row of all || []) {
    const cid = String(row?.characterId || "").trim();
    if (!cid) continue;
    if (!byChar[cid]) byChar[cid] = { payloads: {} };
    if (row.kind === "manifest" && row.manifest) {
      byChar[cid].manifest = row.manifest;
    } else if (row.appKey && row.payload) {
      byChar[cid].payloads[row.appKey] = row.payload;
    }
  }
  return { manifests: byChar };
}

/**
 * @param {{ manifests?: Record<string, { manifest?: object, payloads?: Record<string, object> }> }} bag
 */
export async function importSidewrite(bag) {
  const manifests = bag?.manifests && typeof bag.manifests === "object" ? bag.manifests : {};
  for (const [cid, pack] of Object.entries(manifests)) {
    if (pack?.manifest) await saveManifest({ ...pack.manifest, characterId: cid });
    const payloads = pack?.payloads || {};
    for (const [appKey, payload] of Object.entries(payloads)) {
      const { setPayload } = await import("./payload-store.js");
      await setPayload(cid, appKey, payload);
    }
  }
}
