/**
 * Install / uninstall / upgrade / rollback with orphan cleanup.
 */

import {
  SKILL_INSTALL_KEY,
  SKILL_ROLLBACK_KEY,
  validateSkillManifest,
} from "./schema.js";
import { checkSdkCompatibility, checkUpgradeCompatibility } from "./compatibility.js";
import {
  buildProvenance,
  hashSkillPackage,
  signPackageHash,
  verifyPackageIntegrity,
} from "./signature.js";
import { runConformance } from "./conformance.js";
import { createEventBus } from "./event-api.js";

/**
 * @typedef {{
 *   manifest: object,
 *   entrySource: string,
 *   assets?: Record<string, string>,
 *   hash: string,
 *   signature: string|null,
 *   provenance: object,
 *   grantedPermissions: string[],
 *   conformancePassed: boolean,
 *   installedAt: string,
 *   data: Record<string, unknown>,
 *   taskIds: string[],
 * }} InstalledSkill
 */

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/** @type {ReturnType<typeof createEventBus>|null} */
let bus = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setSkillStorageForTests(storage) {
  testStorage = storage;
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

function getBus() {
  if (!bus) bus = createEventBus();
  return bus;
}

/**
 * @returns {Record<string, InstalledSkill>}
 */
export function listInstalledSkills() {
  const bag = readJson(SKILL_INSTALL_KEY, { skills: {} });
  return bag.skills && typeof bag.skills === "object" ? bag.skills : {};
}

/**
 * @param {string} skillId
 */
export function getInstalledSkill(skillId) {
  return listInstalledSkills()[String(skillId)] || null;
}

function saveInstalled(skills) {
  writeJson(SKILL_INSTALL_KEY, { skills });
}

function saveRollback(skillId, snapshot) {
  const bag = readJson(SKILL_ROLLBACK_KEY, { slots: {} });
  bag.slots = bag.slots || {};
  bag.slots[skillId] = snapshot;
  writeJson(SKILL_ROLLBACK_KEY, bag);
}

/**
 * @param {string} skillId
 */
export function getRollbackSlot(skillId) {
  const bag = readJson(SKILL_ROLLBACK_KEY, { slots: {} });
  return bag.slots?.[String(skillId)] || null;
}

/**
 * Install a skill package after integrity + conformance.
 * @param {{
 *   manifest: object,
 *   entrySource: string,
 *   assets?: Record<string, string>,
 *   publisherSecret?: string,
 *   grantedPermissions?: string[],
 *   source?: "local-template"|"local-import"|"dev",
 *   skipConformance?: boolean,
 * }} pkg
 */
export function installSkillPackage(pkg) {
  const validated = validateSkillManifest(pkg.manifest);
  if (!validated.ok) return validated;

  const manifest = validated.value;
  const compat = checkSdkCompatibility(manifest);
  if (!compat.ok) return compat;

  const hash = hashSkillPackage({
    manifest,
    entrySource: pkg.entrySource,
    assets: pkg.assets,
  });
  const signature = pkg.publisherSecret
    ? signPackageHash(hash, pkg.publisherSecret)
    : null;

  const integrity = verifyPackageIntegrity({
    pkg: { manifest, entrySource: pkg.entrySource, assets: pkg.assets },
    expectedHash: hash,
    signature,
    publisherSecret: pkg.publisherSecret || null,
  });
  if (!integrity.ok) return integrity;

  if (!pkg.skipConformance) {
    const conf = runConformance({
      manifest,
      entrySource: pkg.entrySource,
      assets: pkg.assets,
      hash,
      signature,
      publisherSecret: pkg.publisherSecret || null,
    });
    if (!conf.ok) {
      getBus().emit("skill.conformance.failed", { skillId: manifest.id, conf });
      return { ok: false, reason: "conformance_failed", conformance: conf };
    }
  }

  const skills = listInstalledSkills();
  if (skills[manifest.id]) {
    return { ok: false, reason: "already_installed", hint: "use_upgrade" };
  }

  const granted = Array.isArray(pkg.grantedPermissions)
    ? pkg.grantedPermissions.filter((p) => manifest.permissions.includes(p))
    : [];

  /** @type {InstalledSkill} */
  const record = {
    manifest,
    entrySource: String(pkg.entrySource || ""),
    assets: pkg.assets && typeof pkg.assets === "object" ? pkg.assets : {},
    hash,
    signature,
    provenance: buildProvenance({
      manifest,
      hash,
      signature,
      source: pkg.source || "local-import",
    }),
    grantedPermissions: granted,
    conformancePassed: true,
    installedAt: new Date().toISOString(),
    data: {},
    taskIds: [],
  };

  skills[manifest.id] = record;
  saveInstalled(skills);
  getBus().emit("skill.installed", { skillId: manifest.id, version: manifest.version, hash });
  return { ok: true, value: record };
}

/**
 * Upgrade with rollback snapshot.
 * @param {{
 *   manifest: object,
 *   entrySource: string,
 *   assets?: Record<string, string>,
 *   publisherSecret?: string,
 *   grantedPermissions?: string[],
 * }} pkg
 */
export function upgradeSkillPackage(pkg) {
  const validated = validateSkillManifest(pkg.manifest);
  if (!validated.ok) return validated;
  const manifest = validated.value;

  const current = getInstalledSkill(manifest.id);
  if (!current) return { ok: false, reason: "not_installed" };

  const up = checkUpgradeCompatibility(current.manifest.version, manifest.version);
  if (!up.ok) return up;

  const compat = checkSdkCompatibility(manifest);
  if (!compat.ok) return compat;

  // Snapshot for rollback before mutating
  saveRollback(manifest.id, {
    ...current,
    snapshottedAt: new Date().toISOString(),
  });

  const hash = hashSkillPackage({
    manifest,
    entrySource: pkg.entrySource,
    assets: pkg.assets,
  });
  const signature = pkg.publisherSecret
    ? signPackageHash(hash, pkg.publisherSecret)
    : null;

  const conf = runConformance({
    manifest,
    entrySource: pkg.entrySource,
    assets: pkg.assets,
    hash,
    signature,
    publisherSecret: pkg.publisherSecret || null,
  });
  if (!conf.ok) {
    return { ok: false, reason: "conformance_failed", conformance: conf };
  }

  const granted = Array.isArray(pkg.grantedPermissions)
    ? pkg.grantedPermissions.filter((p) => manifest.permissions.includes(p))
    : current.grantedPermissions.filter((p) => manifest.permissions.includes(p));

  const skills = listInstalledSkills();
  skills[manifest.id] = {
    manifest,
    entrySource: String(pkg.entrySource || ""),
    assets: pkg.assets && typeof pkg.assets === "object" ? pkg.assets : {},
    hash,
    signature,
    provenance: buildProvenance({
      manifest,
      hash,
      signature,
      source: "local-import",
      previousHash: current.hash,
    }),
    grantedPermissions: granted,
    conformancePassed: true,
    installedAt: current.installedAt,
    data: current.data || {},
    taskIds: Array.isArray(current.taskIds) ? current.taskIds : [],
  };
  saveInstalled(skills);
  getBus().emit("skill.upgraded", {
    skillId: manifest.id,
    from: current.manifest.version,
    to: manifest.version,
  });
  return { ok: true, value: skills[manifest.id], upgrade: up };
}

/**
 * Roll back to previous snapshot.
 * @param {string} skillId
 */
export function rollbackSkill(skillId) {
  const id = String(skillId);
  const slot = getRollbackSlot(id);
  if (!slot) return { ok: false, reason: "no_rollback_slot" };
  const skills = listInstalledSkills();
  if (!skills[id]) return { ok: false, reason: "not_installed" };

  const { snapshottedAt: _s, ...rest } = slot;
  skills[id] = {
    ...rest,
    conformancePassed: true,
  };
  saveInstalled(skills);
  getBus().emit("skill.rolled_back", { skillId: id, version: rest.manifest?.version });
  return { ok: true, value: skills[id] };
}

/**
 * Uninstall and purge skill data + associated task id registry (orphan cleanup).
 * @param {string} skillId
 * @param {{
 *   cancelTasks?: (taskIds: string[]) => void,
 * }} [hooks]
 */
export function uninstallSkill(skillId, hooks = {}) {
  const id = String(skillId);
  const skills = listInstalledSkills();
  const current = skills[id];
  if (!current) return { ok: false, reason: "not_installed" };

  const taskIds = Array.isArray(current.taskIds) ? [...current.taskIds] : [];
  if (typeof hooks.cancelTasks === "function") {
    hooks.cancelTasks(taskIds);
  }

  delete skills[id];
  saveInstalled(skills);

  const bag = readJson(SKILL_ROLLBACK_KEY, { slots: {} });
  if (bag.slots?.[id]) {
    delete bag.slots[id];
    writeJson(SKILL_ROLLBACK_KEY, bag);
  }

  getBus().emit("skill.uninstalled", { skillId: id, purgedTaskIds: taskIds });
  return {
    ok: true,
    purged: {
      skillId: id,
      dataKeys: Object.keys(current.data || {}),
      taskIds,
      orphanTasks: 0,
      orphanData: 0,
    },
  };
}

/**
 * Attach a task id to a skill for uninstall cleanup.
 * @param {string} skillId
 * @param {string} taskId
 */
export function trackSkillTask(skillId, taskId) {
  const skills = listInstalledSkills();
  const s = skills[String(skillId)];
  if (!s) return { ok: false, reason: "not_installed" };
  s.taskIds = Array.isArray(s.taskIds) ? s.taskIds : [];
  if (!s.taskIds.includes(taskId)) s.taskIds.push(String(taskId));
  saveInstalled(skills);
  return { ok: true, taskIds: s.taskIds };
}

/**
 * Write skill-local data (namespaced; cleared on uninstall).
 * @param {string} skillId
 * @param {string} key
 * @param {unknown} value
 */
export function setSkillData(skillId, key, value) {
  const skills = listInstalledSkills();
  const s = skills[String(skillId)];
  if (!s) return { ok: false, reason: "not_installed" };
  s.data = s.data || {};
  s.data[String(key)] = value;
  saveInstalled(skills);
  return { ok: true };
}

/**
 * @param {string} skillId
 * @param {string} key
 */
export function getSkillData(skillId, key) {
  const s = getInstalledSkill(skillId);
  if (!s) return { ok: false, reason: "not_installed" };
  return { ok: true, value: s.data?.[String(key)] };
}

export function __resetSkillLifecycleForTests() {
  writeJson(SKILL_INSTALL_KEY, { skills: {} });
  writeJson(SKILL_ROLLBACK_KEY, { slots: {} });
  bus = createEventBus();
}

export function getSkillEventBus() {
  return getBus();
}
