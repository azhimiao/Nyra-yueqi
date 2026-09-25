/**
 * Skill platform persistence — catalog, files, installations, upgrade candidates.
 * Node verify scripts use in-memory fallback; browser uses localStorage + future IDB.
 */

import { STORAGE_KEYS, SKILL_PLATFORM_SCHEMA_VERSION } from "./schema.js";
import { sha256Text } from "./integrity.js";

/** @type {Map<string, string>} skillId/version/path → content */
const memoryFiles = new Map();
let filesHydrated = false;

/** @type {object|null} */
let memoryCatalogBag = null;

/** @type {object|null} */
let memoryInstallBag = null;

/** @type {object|null} */
let memoryUpgradeBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

const FILES_STORAGE_KEY = "yueqi.skills.files.v1";

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setSkillPlatformStorageForTests(storage) {
  testStorage = storage;
  memoryCatalogBag = null;
  memoryInstallBag = null;
  memoryUpgradeBag = null;
  memoryFiles.clear();
  filesHydrated = false;
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function hydrateFilesFromStorage() {
  if (filesHydrated) return;
  filesHydrated = true;
  const storage = ls();
  if (!storage) return;
  try {
    const raw = storage.getItem(FILES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [key, content] of Object.entries(parsed)) {
      memoryFiles.set(String(key), String(content ?? ""));
    }
  } catch {
    /* ignore */
  }
}

function persistFilesToStorage() {
  const storage = ls();
  if (!storage) return;
  try {
    const obj = Object.fromEntries(memoryFiles.entries());
    storage.setItem(FILES_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota */
  }
}

function emptyCatalogBag() {
  return { schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION, entries: {} };
}

function emptyInstallBag() {
  return { schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION, installations: {} };
}

function emptyUpgradeBag() {
  return { schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION, candidates: {} };
}

function readJson(key, empty) {
  const storage = ls();
  if (!storage) {
    if (key === STORAGE_KEYS.catalog) {
      if (!memoryCatalogBag) memoryCatalogBag = empty();
      return memoryCatalogBag;
    }
    if (key === STORAGE_KEYS.installations) {
      if (!memoryInstallBag) memoryInstallBag = empty();
      return memoryInstallBag;
    }
    if (key === STORAGE_KEYS.upgradeCandidates) {
      if (!memoryUpgradeBag) memoryUpgradeBag = empty();
      return memoryUpgradeBag;
    }
    return empty();
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) return empty();
    return JSON.parse(raw);
  } catch {
    return empty();
  }
}

function writeJson(key, bag) {
  if (key === STORAGE_KEYS.catalog) memoryCatalogBag = bag;
  if (key === STORAGE_KEYS.installations) memoryInstallBag = bag;
  if (key === STORAGE_KEYS.upgradeCandidates) memoryUpgradeBag = bag;

  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

function fileKey(skillId, version, path) {
  return `${skillId}@${version}:${path}`;
}

export function clearAllSkillPlatformData() {
  memoryFiles.clear();
  filesHydrated = true;
  memoryCatalogBag = emptyCatalogBag();
  memoryInstallBag = emptyInstallBag();
  memoryUpgradeBag = emptyUpgradeBag();
  const storage = ls();
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      storage?.removeItem?.(key);
    } catch {
      /* ignore */
    }
  }
  try {
    storage?.removeItem?.(FILES_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {Record<string, object>}
 */
export function listCatalogEntries() {
  const bag = readJson(STORAGE_KEYS.catalog, emptyCatalogBag);
  return bag.entries && typeof bag.entries === "object" ? { ...bag.entries } : {};
}

/**
 * @param {string} skillId
 */
export function getCatalogEntry(skillId) {
  const id = String(skillId || "").trim();
  return listCatalogEntries()[id] || null;
}

/**
 * @param {object} entry
 */
export function upsertCatalogEntry(entry) {
  const id = String(entry?.id || "").trim();
  if (!id) return { ok: false, reason: "missing_id" };
  const bag = readJson(STORAGE_KEYS.catalog, emptyCatalogBag);
  if (!bag.entries) bag.entries = {};
  bag.entries[id] = {
    ...entry,
    id,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.catalog, bag);
  return { ok: true, value: bag.entries[id] };
}

/**
 * @param {string} skillId
 */
export function removeCatalogEntry(skillId) {
  const id = String(skillId || "").trim();
  const bag = readJson(STORAGE_KEYS.catalog, emptyCatalogBag);
  if (!bag.entries?.[id]) return { ok: false, reason: "not_found" };
  delete bag.entries[id];
  writeJson(STORAGE_KEYS.catalog, bag);
  return { ok: true };
}

/**
 * @param {string} skillId
 * @param {string} version
 * @param {string} path
 * @param {string} content
 */
export function putSkillFile(skillId, version, path, content) {
  hydrateFilesFromStorage();
  const key = fileKey(skillId, version, path);
  memoryFiles.set(key, String(content ?? ""));
  persistFilesToStorage();
  return {
    ok: true,
    value: {
      skillId,
      version,
      path,
      content: String(content ?? ""),
      hash: sha256Text(content),
      mediaType: "text/plain",
    },
  };
}

/**
 * @param {string} skillId
 * @param {string} version
 * @param {string} [path]
 */
export function listSkillFiles(skillId, version, path) {
  hydrateFilesFromStorage();
  const prefix = fileKey(skillId, version, "");
  /** @type {object[]} */
  const out = [];
  for (const [key, content] of memoryFiles.entries()) {
    if (!key.startsWith(prefix)) continue;
    const relPath = key.slice(prefix.length);
    if (path && relPath !== path) continue;
    out.push({
      skillId,
      version,
      path: relPath,
      content,
      hash: sha256Text(content),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * True when a catalogued skill has no prompt/body files in storage (common after old in-memory-only installs).
 * @param {string} skillId
 * @param {string} [version]
 */
export function skillFilesMissing(skillId, version) {
  const id = String(skillId || "").trim();
  const ver = String(version || getCatalogEntry(id)?.version || "1.0.0").trim();
  if (!id) return true;
  return listSkillFiles(id, ver).length === 0;
}

/**
 * @param {string} skillId
 * @param {string} version
 */
export function deleteSkillFiles(skillId, version) {
  hydrateFilesFromStorage();
  const prefix = fileKey(skillId, version, "");
  for (const key of [...memoryFiles.keys()]) {
    if (key.startsWith(prefix)) memoryFiles.delete(key);
  }
  persistFilesToStorage();
}

/**
 * @returns {Record<string, object>}
 */
export function listInstallations() {
  const bag = readJson(STORAGE_KEYS.installations, emptyInstallBag);
  return bag.installations && typeof bag.installations === "object"
    ? { ...bag.installations }
    : {};
}

/**
 * @param {string} skillId
 */
export function getInstallation(skillId) {
  return listInstallations()[String(skillId || "").trim()] || null;
}

/**
 * @param {object} installation
 */
export function upsertInstallation(installation) {
  const skillId = String(installation?.skillId || "").trim();
  if (!skillId) return { ok: false, reason: "missing_skill_id" };
  const bag = readJson(STORAGE_KEYS.installations, emptyInstallBag);
  if (!bag.installations) bag.installations = {};
  bag.installations[skillId] = {
    skillId,
    version: String(installation.version || "1.0.0"),
    enabled: installation.enabled !== false,
    grants: installation.grants || { capabilities: [] },
    pinned: Boolean(installation.pinned),
    installedAt: installation.installedAt || new Date().toISOString(),
    updatedAt: installation.updatedAt || new Date().toISOString(),
    ...(installation.integrityFlag ? { integrityFlag: installation.integrityFlag } : {}),
  };
  writeJson(STORAGE_KEYS.installations, bag);
  return { ok: true, value: bag.installations[skillId] };
}

/**
 * @param {string} skillId
 */
export function removeInstallation(skillId) {
  const id = String(skillId || "").trim();
  const bag = readJson(STORAGE_KEYS.installations, emptyInstallBag);
  if (!bag.installations?.[id]) return { ok: false, reason: "not_found" };
  delete bag.installations[id];
  writeJson(STORAGE_KEYS.installations, bag);
  return { ok: true };
}

/**
 * @returns {Record<string, object>}
 */
export function listUpgradeCandidates() {
  const bag = readJson(STORAGE_KEYS.upgradeCandidates, emptyUpgradeBag);
  return bag.candidates && typeof bag.candidates === "object" ? { ...bag.candidates } : {};
}

/**
 * @param {string} skillId
 * @param {object} candidate
 */
export function setUpgradeCandidate(skillId, candidate) {
  const id = String(skillId || "").trim();
  const bag = readJson(STORAGE_KEYS.upgradeCandidates, emptyUpgradeBag);
  if (!bag.candidates) bag.candidates = {};
  bag.candidates[id] = {
    skillId: id,
    currentVersion: candidate.currentVersion,
    candidateVersion: candidate.candidateVersion,
    manifest: candidate.manifest,
    detectedAt: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.upgradeCandidates, bag);
  return { ok: true, value: bag.candidates[id] };
}

/**
 * @param {string} skillId
 */
export function clearUpgradeCandidate(skillId) {
  const id = String(skillId || "").trim();
  const bag = readJson(STORAGE_KEYS.upgradeCandidates, emptyUpgradeBag);
  if (!bag.candidates?.[id]) return { ok: false, reason: "not_found" };
  delete bag.candidates[id];
  writeJson(STORAGE_KEYS.upgradeCandidates, bag);
  return { ok: true };
}

/**
 * Export snapshot for backup/verify round-trip.
 */
export function exportSkillPlatformSnapshot() {
  const catalog = listCatalogEntries();
  const installations = listInstallations();
  const upgradeCandidates = listUpgradeCandidates();
  /** @type {Record<string, { path: string, hash: string }[]>} */
  const fileIndex = {};
  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const fileContents = {};
  for (const entry of Object.values(catalog)) {
    const id = /** @type {{ id: string, version: string }} */ (entry).id;
    const version = /** @type {{ version: string }} */ (entry).version;
    const files = listSkillFiles(id, version);
    fileIndex[id] = files.map((f) => ({
      path: f.path,
      hash: f.hash,
    }));
    fileContents[id] = { [version]: {} };
    for (const f of files) {
      fileContents[id][version][f.path] = f.content;
    }
  }
  return {
    schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION,
    catalogCount: Object.keys(catalog).length,
    catalog,
    installations,
    upgradeCandidates,
    fileIndex,
    fileContents,
    grants: Object.fromEntries(
      Object.entries(installations).map(([id, inst]) => [
        id,
        /** @type {{ grants?: object }} */ (inst).grants || {},
      ]),
    ),
  };
}

/**
 * Restore platform snapshot from backup; verify file hashes.
 * @param {object} snapshot
 * @param {{ onHashMismatch?: (skillId: string, path: string, expected: string, actual: string) => void }} [opts]
 */
export function importSkillPlatformSnapshot(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, reason: "invalid_snapshot" };
  }

  clearAllSkillPlatformData();

  const catalog = snapshot.catalog && typeof snapshot.catalog === "object" ? snapshot.catalog : {};
  for (const entry of Object.values(catalog)) {
    upsertCatalogEntry(entry);
  }

  const installations = snapshot.installations && typeof snapshot.installations === "object"
    ? snapshot.installations
    : {};
  /** @type {string[]} */
  const disabledSkills = [];

  for (const [skillId, inst] of Object.entries(installations)) {
    const version = String(/** @type {{ version?: string }} */ (inst).version || "1.0.0");
    const expectedIndex = snapshot.fileIndex?.[skillId] || [];
    const contents = snapshot.fileContents?.[skillId]?.[version] || {};
    let mismatch = false;

    for (const row of expectedIndex) {
      const content = contents[row.path];
      if (content == null) {
        mismatch = true;
        opts.onHashMismatch?.(skillId, row.path, row.hash, "missing");
        continue;
      }
      const actual = sha256Text(content);
      if (actual !== row.hash) {
        mismatch = true;
        opts.onHashMismatch?.(skillId, row.path, row.hash, actual);
      }
      putSkillFile(skillId, version, row.path, content);
    }

    upsertInstallation({
      ...inst,
      skillId,
      enabled: mismatch ? false : /** @type {{ enabled?: boolean }} */ (inst).enabled !== false,
      integrityFlag: mismatch ? "hash_mismatch" : undefined,
    });
    if (mismatch) disabledSkills.push(skillId);
  }

  const candidates = snapshot.upgradeCandidates;
  if (candidates && typeof candidates === "object") {
    const bag = readJson(STORAGE_KEYS.upgradeCandidates, emptyUpgradeBag);
    bag.candidates = candidates.candidates || candidates;
    writeJson(STORAGE_KEYS.upgradeCandidates, bag);
  }

  return { ok: true, disabledSkills };
}

/**
 * Full delete of a skill — catalog, files, installation, upgrade candidate.
 * @param {string} skillId
 */
export function deleteSkillCompletely(skillId) {
  const id = String(skillId || "").trim();
  const entry = getCatalogEntry(id);
  if (entry) {
    deleteSkillFiles(id, entry.version);
  }
  removeCatalogEntry(id);
  removeInstallation(id);
  clearUpgradeCandidate(id);
  return { ok: true };
}

/**
 * Count residual records after failed import (for negative tests).
 */
export function countSkillPlatformResidue() {
  return {
    catalog: Object.keys(listCatalogEntries()).length,
    installations: Object.keys(listInstallations()).length,
    files: memoryFiles.size,
    upgradeCandidates: Object.keys(listUpgradeCandidates()).length,
  };
}
