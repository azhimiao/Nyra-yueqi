/**
 * Agent Profile store — install/list/get/update/delete, skill attach, enable/disable.
 */

import { AGENT_PROFILES_KEY } from "../skill-platform/schema.js";
import {
  AGENT_PROFILE_SCHEMA_VERSION,
  BUILTIN_QIJI_ASSISTANT,
  BUILTIN_WORK_AGENT,
  validateAgentProfile,
} from "./profile-schema.js";

/** @type {object|null} */
let memoryBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setAgentProfileStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
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

function emptyBag() {
  return { schemaVersion: AGENT_PROFILE_SCHEMA_VERSION, profiles: {} };
}

function readBag() {
  if (memoryBag) return memoryBag;
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  try {
    const raw = storage.getItem(AGENT_PROFILES_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: Number(parsed?.schemaVersion) || AGENT_PROFILE_SCHEMA_VERSION,
      profiles:
        parsed?.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},
    };
    return memoryBag;
  } catch {
    memoryBag = emptyBag();
    return memoryBag;
  }
}

function writeBag(bag) {
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(AGENT_PROFILES_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function clearAllAgentProfiles() {
  memoryBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(AGENT_PROFILES_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Ensure built-in 栖机助手 + 月栖 Agent exist.
 */
export function ensureBuiltinProfiles() {
  const bag = readBag();
  let changed = false;
  if (!bag.profiles[BUILTIN_QIJI_ASSISTANT.id]) {
    bag.profiles[BUILTIN_QIJI_ASSISTANT.id] = {
      ...BUILTIN_QIJI_ASSISTANT,
      installedAt: new Date().toISOString(),
    };
    changed = true;
  }
  if (!bag.profiles[BUILTIN_WORK_AGENT.id]) {
    bag.profiles[BUILTIN_WORK_AGENT.id] = {
      ...BUILTIN_WORK_AGENT,
      installedAt: new Date().toISOString(),
    };
    changed = true;
  }
  if (changed) writeBag(bag);
  return bag.profiles[BUILTIN_WORK_AGENT.id];
}

/**
 * @returns {object[]}
 */
export function listAgentProfiles() {
  ensureBuiltinProfiles();
  return Object.values(readBag().profiles).sort((a, b) =>
    String(a.name).localeCompare(String(b.name), "zh"),
  );
}

/**
 * @param {string} profileId
 */
export function getAgentProfile(profileId) {
  ensureBuiltinProfiles();
  const id = String(profileId || "").trim();
  return readBag().profiles[id] || null;
}

/**
 * Install or update a profile.
 * @param {object} profile
 */
export function installAgentProfile(profile) {
  const validated = validateAgentProfile(profile);
  if (!validated.ok) return validated;

  const bag = readBag();
  const now = new Date().toISOString();
  const existing = bag.profiles[validated.value.id];
  bag.profiles[validated.value.id] = {
    ...validated.value,
    installedAt: existing?.installedAt || now,
    updatedAt: now,
  };
  writeBag(bag);
  return { ok: true, value: bag.profiles[validated.value.id] };
}

/**
 * @param {string} profileId
 * @param {Partial<object>} patch
 */
export function updateAgentProfile(profileId, patch) {
  const existing = getAgentProfile(profileId);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.builtin && patch.id && patch.id !== existing.id) {
    return { ok: false, reason: "builtin_immutable" };
  }
  return installAgentProfile({ ...existing, ...patch, id: existing.id });
}

/**
 * @param {string} profileId
 */
export function deleteAgentProfile(profileId) {
  const id = String(profileId || "").trim();
  const profile = getAgentProfile(id);
  if (!profile) return { ok: false, reason: "not_found" };
  if (profile.builtin) return { ok: false, reason: "builtin_protected" };
  const bag = readBag();
  delete bag.profiles[id];
  writeBag(bag);
  return { ok: true };
}

/**
 * @param {string} profileId
 * @param {string} skillId
 */
export function attachSkillToProfile(profileId, skillId) {
  const profile = getAgentProfile(profileId);
  if (!profile) return { ok: false, reason: "not_found" };
  const sid = String(skillId || "").trim();
  if (!sid) return { ok: false, reason: "missing_skill_id" };
  const skillIds = [...new Set([...(profile.skillIds || []), sid])];
  return updateAgentProfile(profileId, { skillIds });
}

/**
 * @param {string} profileId
 * @param {string} skillId
 */
export function detachSkillFromProfile(profileId, skillId) {
  const profile = getAgentProfile(profileId);
  if (!profile) return { ok: false, reason: "not_found" };
  const sid = String(skillId || "").trim();
  const skillIds = (profile.skillIds || []).filter((s) => s !== sid);
  return updateAgentProfile(profileId, { skillIds });
}

/**
 * @param {string} profileId
 */
export function enableAgentProfile(profileId) {
  return updateAgentProfile(profileId, { enabled: true });
}

/**
 * @param {string} profileId
 */
export function disableAgentProfile(profileId) {
  const profile = getAgentProfile(profileId);
  if (!profile) return { ok: false, reason: "not_found" };
  if (profile.builtin) return { ok: false, reason: "builtin_protected" };
  return updateAgentProfile(profileId, { enabled: false });
}

/**
 * Find profile auto-created for a skill id.
 * @param {string} skillId
 */
export function findProfileBySkillId(skillId) {
  const sid = String(skillId || "").trim();
  return listAgentProfiles().find(
    (p) => (p.skillIds || []).includes(sid),
  ) || null;
}

export function exportAgentProfilesBag() {
  ensureBuiltinProfiles();
  return JSON.parse(JSON.stringify(readBag()));
}

/**
 * @param {object} bag
 */
export function importAgentProfilesBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false, reason: "invalid_bag" };
  writeBag({
    schemaVersion: Number(bag.schemaVersion) || AGENT_PROFILE_SCHEMA_VERSION,
    profiles: bag.profiles && typeof bag.profiles === "object" ? bag.profiles : {},
  });
  ensureBuiltinProfiles();
  return { ok: true };
}
