/**
 * ScreenCaptureGate
 * Screen frames require an explicit stored grant. No silent / implied capture.
 */

import {
  CAPTURE_SURFACES,
  GRANT_SCOPES,
  HOST_SCHEMA_VERSION,
  SCREEN_CAPTURE_GRANT_KEY,
} from "./constants.js";

/**
 * @typedef {{
 *   schemaVersion: number,
 *   granted: true,
 *   surface: string,
 *   scope: "session"|"persistent",
 *   grantedAt: string,
 *   expiresAt: string|null,
 *   grantId: string,
 * }} ScreenCaptureGrant
 */

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

let defaultStorage = null;

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  if (!defaultStorage) defaultStorage = memoryStorage();
  return defaultStorage;
}

function nowIso() {
  return new Date().toISOString();
}

function makeGrantId() {
  return `scg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @returns {ScreenCaptureGrant|null}
 */
export function parseGrant(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (obj.granted !== true) return null;
  if (!CAPTURE_SURFACES.includes(obj.surface)) return null;
  if (!GRANT_SCOPES.includes(obj.scope)) return null;
  if (typeof obj.grantedAt !== "string" || !obj.grantedAt) return null;
  if (obj.expiresAt != null && typeof obj.expiresAt !== "string") return null;
  if (typeof obj.grantId !== "string" || !obj.grantId) return null;
  return {
    schemaVersion: HOST_SCHEMA_VERSION,
    granted: true,
    surface: obj.surface,
    scope: obj.scope,
    grantedAt: obj.grantedAt,
    expiresAt: obj.expiresAt ?? null,
    grantId: obj.grantId,
  };
}

/**
 * @param {ScreenCaptureGrant|null} grant
 */
export function isGrantActive(grant, { now = Date.now() } = {}) {
  if (!grant || grant.granted !== true) return false;
  if (grant.expiresAt) {
    const exp = Date.parse(grant.expiresAt);
    if (!Number.isFinite(exp) || exp <= now) return false;
  }
  return true;
}

/**
 * Create a ScreenCaptureGate bound to a storage backend.
 * @param {{ storage?: { getItem(k:string): string|null, setItem(k:string,v:string): void, removeItem(k:string): void } }} [opts]
 */
export function createScreenCaptureGate(opts = {}) {
  const storage = resolveStorage(opts.storage);

  function read() {
    return parseGrant(storage.getItem(SCREEN_CAPTURE_GRANT_KEY));
  }

  function write(grant) {
    storage.setItem(SCREEN_CAPTURE_GRANT_KEY, JSON.stringify(grant));
  }

  function clear() {
    storage.removeItem(SCREEN_CAPTURE_GRANT_KEY);
  }

  return {
    key: SCREEN_CAPTURE_GRANT_KEY,
    schemaVersion: HOST_SCHEMA_VERSION,

    /** @returns {ScreenCaptureGrant|null} */
    getGrant() {
      const grant = read();
      if (!isGrantActive(grant)) {
        if (grant) clear();
        return null;
      }
      return grant;
    },

    hasActiveGrant() {
      return this.getGrant() != null;
    },

    /**
     * Explicit user consent — only call from UI toggle / system consent callback.
     * @param {{ surface: string, scope?: "session"|"persistent", ttlMs?: number }} input
     */
    grant(input = {}) {
      const surface = String(input.surface || "");
      if (!CAPTURE_SURFACES.includes(surface)) {
        return { ok: false, reason: "invalid_surface" };
      }
      const scope = GRANT_SCOPES.includes(input.scope) ? input.scope : "session";
      const ttlMs = Number(input.ttlMs);
      let expiresAt = null;
      if (scope === "session") {
        const ms = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 4 * 60 * 60 * 1000;
        expiresAt = new Date(Date.now() + ms).toISOString();
      } else if (Number.isFinite(ttlMs) && ttlMs > 0) {
        expiresAt = new Date(Date.now() + ttlMs).toISOString();
      }
      /** @type {ScreenCaptureGrant} */
      const record = {
        schemaVersion: HOST_SCHEMA_VERSION,
        granted: true,
        surface,
        scope,
        grantedAt: nowIso(),
        expiresAt,
        grantId: makeGrantId(),
      };
      write(record);
      return { ok: true, grant: record };
    },

    revoke() {
      clear();
      return { ok: true };
    },

    /**
     * @returns {{ ok: true, grant: ScreenCaptureGrant } | { ok: false, reason: string }}
     */
    assertCanCapture({ surface } = {}) {
      const grant = this.getGrant();
      if (!grant) {
        return { ok: false, reason: "no_grant" };
      }
      if (surface && grant.surface !== surface && grant.surface !== "simulator") {
        return { ok: false, reason: "surface_mismatch" };
      }
      return { ok: true, grant };
    },

    canCapture(opts2) {
      return this.assertCanCapture(opts2).ok === true;
    },
  };
}

/** Default singleton for browser / tests (injectable via __setScreenCaptureStorageForTests). */
let sharedGate = createScreenCaptureGate();

export function getScreenCaptureGate() {
  return sharedGate;
}

/** @param {{ getItem: Function, setItem: Function, removeItem: Function }|null} storage */
export function __setScreenCaptureStorageForTests(storage) {
  sharedGate = createScreenCaptureGate({ storage: storage || memoryStorage() });
  return sharedGate;
}

export { memoryStorage as __memoryStorageForTests };
