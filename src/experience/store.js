/**
 * Experience session store — package registry + session metadata (§13.2).
 * Does not store conversation message bodies (Conversation V2 owns those).
 */

import {
  EXPERIENCE_STORE_KEY,
  createExperienceSession,
} from "./schema.js";
import { validateExperiencePackage } from "./package-io.js";

/** @type {Storage|null} */
let _storageOverride = null;

/** @type {Map<string, object>} */
const _packageRegistry = new Map();

function nowIso() {
  return new Date().toISOString();
}

function getStorage() {
  if (_storageOverride) return _storageOverride;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * @param {Storage|null} storage
 */
export function __setExperienceStorageForTests(storage) {
  _storageOverride = storage;
}

export function __clearExperienceRegistryForTests() {
  _packageRegistry.clear();
}

function readBag() {
  const storage = getStorage();
  if (!storage) return { sessions: [], activeSessionId: "" };
  try {
    const raw = JSON.parse(storage.getItem(EXPERIENCE_STORE_KEY) || "{}") || {};
    return {
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      activeSessionId: String(raw.activeSessionId || ""),
    };
  } catch {
    return { sessions: [], activeSessionId: "" };
  }
}

function writeBag(bag) {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "no_storage" };
  try {
    storage.setItem(EXPERIENCE_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage_write_failed" };
  }
}

/**
 * Register a built-in or loaded package (in-memory).
 * @param {object} pkg
 */
export function registerPackage(pkg) {
  const validated = validateExperiencePackage(pkg);
  if (!validated.ok || !validated.value) {
    return { ok: false, errors: validated.errors };
  }
  _packageRegistry.set(validated.value.id, validated.value);
  if (validated.value.legacyScriptId) {
    _packageRegistry.set(`legacy:${validated.value.legacyScriptId}`, validated.value);
  }
  return { ok: true, value: validated.value };
}

/**
 * @param {string} packageIdOrLegacy
 */
export function getRegisteredPackage(packageIdOrLegacy) {
  const id = String(packageIdOrLegacy || "").trim();
  if (!id) return null;
  return (
    _packageRegistry.get(id) ||
    _packageRegistry.get(`legacy:${id}`) ||
    null
  );
}

export function listRegisteredPackages() {
  const seen = new Set();
  const out = [];
  for (const [key, pkg] of _packageRegistry.entries()) {
    if (key.startsWith("legacy:")) continue;
    if (seen.has(pkg.id)) continue;
    seen.add(pkg.id);
    out.push(pkg);
  }
  return out;
}

/**
 * @param {object} session
 */
export function saveExperienceSession(session) {
  if (!session?.id) return { ok: false, reason: "missing_id" };
  const next = {
    ...createExperienceSession(session),
    ...session,
    updatedAt: nowIso(),
  };
  const bag = readBag();
  const idx = bag.sessions.findIndex((s) => s.id === next.id);
  if (idx >= 0) bag.sessions[idx] = next;
  else bag.sessions.unshift(next);
  if (next.status === "active") bag.activeSessionId = next.id;
  const written = writeBag(bag);
  if (!written.ok) return written;
  return { ok: true, value: next };
}

/**
 * @param {string} sessionId
 */
export function getExperienceSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  return readBag().sessions.find((s) => s.id === id) || null;
}

export function getActiveExperienceSession() {
  const bag = readBag();
  if (bag.activeSessionId) {
    const hit = bag.sessions.find(
      (s) => s.id === bag.activeSessionId && (s.status === "active" || s.status === "paused"),
    );
    if (hit) return hit;
  }
  return bag.sessions.find((s) => s.status === "active" || s.status === "paused") || null;
}

/**
 * @param {string} characterId
 */
export function getActiveExperienceForCharacter(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return null;
  return (
    readBag().sessions.find(
      (s) =>
        s.characterId === cid && (s.status === "active" || s.status === "paused"),
    ) || null
  );
}

export function listExperienceSessions(opts = {}) {
  let rows = readBag().sessions.slice();
  if (opts.characterId) {
    const cid = String(opts.characterId);
    rows = rows.filter((s) => s.characterId === cid);
  }
  if (opts.packageId) {
    const pid = String(opts.packageId);
    rows = rows.filter((s) => s.packageId === pid);
  }
  if (opts.status) {
    const st = String(opts.status);
    rows = rows.filter((s) => s.status === st);
  }
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function clearAllExperienceSessions() {
  writeBag({ sessions: [], activeSessionId: "" });
}

export function getExperienceStoreKey() {
  return EXPERIENCE_STORE_KEY;
}
