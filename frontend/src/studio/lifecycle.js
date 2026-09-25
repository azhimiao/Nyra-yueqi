/**
 * Install / upgrade character & world packages.
 * Package upgrade MUST NOT overwrite user relation memory.
 */

import {
  CHARACTER_INSTALL_KEY,
  WORLD_INSTALL_KEY,
  RELATION_MEMORY_KEY,
  STUDIO_ROLLBACK_KEY,
  checkPackageUpgradeCompatibility,
} from "./schema.js";
import { buildCharacterPackage } from "./character-package.js";
import { normalizeWorldPackage } from "./world-studio.js";
import {
  hashStudioPackage,
  signPackageHash,
  verifyStudioPackageIntegrity,
  buildStudioProvenance,
} from "./signature.js";
import {
  appendRelationMemory,
  validateRelationEventWrite,
} from "./relation-events.js";

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setStudioStorageForTests(storage) {
  testStorage = storage;
}

export function __resetStudioLifecycleForTests() {
  const storage = ls();
  if (!storage) return;
  storage.removeItem?.(CHARACTER_INSTALL_KEY);
  storage.removeItem?.(WORLD_INSTALL_KEY);
  storage.removeItem?.(RELATION_MEMORY_KEY);
  storage.removeItem?.(STUDIO_ROLLBACK_KEY);
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

function readJson(key, fallback) {
  const storage = ls();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const storage = ls();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function listInstalledCharacters() {
  const bag = readJson(CHARACTER_INSTALL_KEY, { packages: {} });
  return bag.packages && typeof bag.packages === "object" ? bag.packages : {};
}

export function getInstalledCharacter(id) {
  return listInstalledCharacters()[String(id)] || null;
}

export function listInstalledWorlds() {
  const bag = readJson(WORLD_INSTALL_KEY, { packages: {} });
  return bag.packages && typeof bag.packages === "object" ? bag.packages : {};
}

export function getInstalledWorld(id) {
  return listInstalledWorlds()[String(id)] || null;
}

/**
 * User relation memory — stored separately from package blobs.
 * @returns {Record<string, object[]>}
 */
export function getRelationMemoryBag() {
  const bag = readJson(RELATION_MEMORY_KEY, { byCharacter: {} });
  return bag.byCharacter && typeof bag.byCharacter === "object" ? bag.byCharacter : {};
}

function saveRelationMemoryBag(byCharacter) {
  writeJson(RELATION_MEMORY_KEY, { byCharacter });
}

/**
 * @param {string} characterId
 */
export function getRelationMemory(characterId) {
  return getRelationMemoryBag()[String(characterId)] || [];
}

/**
 * Write a scene relation event after validation (never via package upgrade path).
 */
export function writeValidatedRelationEvent(proposed) {
  const validated = validateRelationEventWrite(proposed);
  if (!validated.ok) return validated;
  const bag = getRelationMemoryBag();
  const next = appendRelationMemory(bag, validated.value);
  saveRelationMemoryBag(next);
  return { ok: true, value: validated.value };
}

/**
 * Install character package.
 * @param {{
 *   manifest: object,
 *   assets?: Record<string, string>,
 *   publisherSecret?: string,
 *   source?: "local-template"|"local-import"|"private-share"|"dev",
 * }} pkg
 */
export function installCharacterPackage(pkg) {
  const built = buildCharacterPackage(pkg.manifest, { assets: pkg.assets });
  if (!built.ok) return built;

  const id = built.value.manifest.id;
  if (getInstalledCharacter(id)) {
    return { ok: false, reason: "already_installed", hint: "use upgradeCharacterPackage" };
  }

  const hash = hashStudioPackage({
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
  });
  const signature = pkg.publisherSecret
    ? signPackageHash(hash, pkg.publisherSecret)
    : null;

  const integrity = verifyStudioPackageIntegrity({
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
    expectedHash: hash,
    signature,
    publisherSecret: pkg.publisherSecret || null,
  });
  if (!integrity.ok) return integrity;

  const record = {
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
    identityHash: built.value.identityHash,
    identityKey: built.value.identityKey,
    hash,
    signature,
    provenance: buildStudioProvenance({
      kind: "character",
      manifest: built.value.manifest,
      hash,
      signature,
      source: pkg.source || "local-import",
    }),
    installedAt: new Date().toISOString(),
  };

  const packages = listInstalledCharacters();
  packages[id] = record;
  writeJson(CHARACTER_INSTALL_KEY, { packages });

  // Ensure relation memory slot exists but is empty — never seed from package
  const mem = getRelationMemoryBag();
  if (!Array.isArray(mem[id])) {
    mem[id] = [];
    saveRelationMemoryBag(mem);
  }

  return { ok: true, value: record };
}

/**
 * Upgrade character package — preserves relation memory verbatim.
 */
export function upgradeCharacterPackage(pkg) {
  const built = buildCharacterPackage(pkg.manifest, { assets: pkg.assets });
  if (!built.ok) return built;

  const id = built.value.manifest.id;
  const existing = getInstalledCharacter(id);
  if (!existing) {
    return { ok: false, reason: "not_installed" };
  }

  const compat = checkPackageUpgradeCompatibility(
    existing.manifest.version,
    built.value.manifest.version,
  );
  if (!compat.ok) return compat;

  // Snapshot relation memory BEFORE any package writes
  const memoryBefore = structuredCloneSafe(getRelationMemory(id));

  const hash = hashStudioPackage({
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
  });
  const signature = pkg.publisherSecret
    ? signPackageHash(hash, pkg.publisherSecret)
    : null;

  const integrity = verifyStudioPackageIntegrity({
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
    expectedHash: hash,
    signature,
    publisherSecret: pkg.publisherSecret || null,
  });
  if (!integrity.ok) return integrity;

  // Rollback slot (package only — never relation memory)
  const rollbackBag = readJson(STUDIO_ROLLBACK_KEY, { slots: {} });
  rollbackBag.slots = rollbackBag.slots || {};
  rollbackBag.slots[`character:${id}`] = {
    kind: "character",
    package: existing,
    savedAt: new Date().toISOString(),
  };
  writeJson(STUDIO_ROLLBACK_KEY, rollbackBag);

  const record = {
    kind: "character",
    manifest: built.value.manifest,
    assets: built.value.assets,
    identityHash: built.value.identityHash,
    identityKey: built.value.identityKey,
    hash,
    signature,
    provenance: buildStudioProvenance({
      kind: "character",
      manifest: built.value.manifest,
      hash,
      signature,
      source: pkg.source || "local-import",
      previousHash: existing.hash,
    }),
    installedAt: existing.installedAt,
    upgradedAt: new Date().toISOString(),
  };

  const packages = listInstalledCharacters();
  packages[id] = record;
  writeJson(CHARACTER_INSTALL_KEY, { packages });

  // CRITICAL: restore relation memory exactly — package must not overwrite
  const mem = getRelationMemoryBag();
  mem[id] = memoryBefore;
  saveRelationMemoryBag(mem);

  // Reject any attempt by package to embed relationMemory
  if (pkg.manifest?.relationMemory !== undefined || pkg.assets?.["relation-memory.json"]) {
    // Memory already preserved; flag soft warning but stay ok
    return {
      ok: true,
      value: record,
      relationMemoryPreserved: true,
      ignoredPackageRelationMemory: true,
    };
  }

  return { ok: true, value: record, relationMemoryPreserved: true };
}

/**
 * Install world package.
 */
export function installWorldPackage(pkg) {
  const built = normalizeWorldPackage(pkg.manifest);
  if (!built.ok) return built;

  const id = built.value.id;
  if (getInstalledWorld(id)) {
    return { ok: false, reason: "already_installed" };
  }

  const hash = hashStudioPackage({
    kind: "world",
    manifest: built.value,
    assets: pkg.assets,
  });
  const signature = pkg.publisherSecret
    ? signPackageHash(hash, pkg.publisherSecret)
    : null;

  const integrity = verifyStudioPackageIntegrity({
    kind: "world",
    manifest: built.value,
    assets: pkg.assets,
    expectedHash: hash,
    signature,
    publisherSecret: pkg.publisherSecret || null,
  });
  if (!integrity.ok) return integrity;

  const record = {
    kind: "world",
    manifest: built.value,
    assets: pkg.assets && typeof pkg.assets === "object" ? pkg.assets : {},
    hash,
    signature,
    provenance: buildStudioProvenance({
      kind: "world",
      manifest: built.value,
      hash,
      signature,
      source: pkg.source || "local-import",
    }),
    installedAt: new Date().toISOString(),
  };

  const packages = listInstalledWorlds();
  packages[id] = record;
  writeJson(WORLD_INSTALL_KEY, { packages });
  return { ok: true, value: record };
}

export function uninstallCharacterPackage(characterId) {
  const id = String(characterId || "").trim();
  const packages = listInstalledCharacters();
  if (!packages[id]) return { ok: false, reason: "not_installed" };
  delete packages[id];
  writeJson(CHARACTER_INSTALL_KEY, { packages });
  // Relation memory retained unless caller explicitly clears
  return { ok: true, relationMemoryRetained: true };
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}
