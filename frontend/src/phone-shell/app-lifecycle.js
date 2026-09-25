/**
 * Phone App Lifecycle — UI state preserve / restore (§10.4 / §13.5).
 * Keep apps mounted or serialize scroll / draft / branch / scene.
 */

import { pt } from "./i18n.js";

const STORAGE_KEY = "yueqi.phone.appLifecycle.v1";

/**
 * @returns {Storage|null}
 */
function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private mode */
  }
  return null;
}

/**
 * @returns {Record<string, object>}
 */
function readBag() {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, object>} bag
 */
function writeBag(bag) {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} appId
 * @param {object} state
 */
export function saveAppUiState(appId, state = {}) {
  const id = String(appId || "").trim();
  if (!id) return { ok: false, reason: "missing_app_id" };
  const bag = readBag();
  bag[id] = {
    ...(bag[id] || {}),
    ...state,
    updatedAt: new Date().toISOString(),
  };
  writeBag(bag);
  return { ok: true, value: bag[id] };
}

/**
 * @param {string} appId
 */
export function loadAppUiState(appId) {
  const id = String(appId || "").trim();
  if (!id) return null;
  return readBag()[id] || null;
}

/**
 * @param {string} appId
 */
export function clearAppUiState(appId) {
  const id = String(appId || "").trim();
  if (!id) return { ok: false };
  const bag = readBag();
  delete bag[id];
  writeBag(bag);
  return { ok: true };
}

/**
 * In-memory registry for live app controllers (keep-alive while on Home).
 */
export function createAppLifecycleRegistry() {
  /** @type {Map<string, {
   *   capture?: () => object,
   *   restore?: (state: object) => void,
   *   onBackground?: () => void,
   *   onForeground?: () => void,
   *   getBackgroundJob?: () => { busy?: boolean, label?: string }|null,
   * }>} */
  const controllers = new Map();
  /** @type {Array<{ id: string, appId: string, label: string, createdAt: number, payload?: object }>} */
  let notifications = [];
  /** @type {Set<(n: object) => void>} */
  const listeners = new Set();

  function emit(n) {
    for (const fn of listeners) {
      try {
        fn(n);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    register(appId, controller = {}) {
      const id = String(appId || "").trim();
      if (!id) return;
      controllers.set(id, controller);
    },
    unregister(appId) {
      controllers.delete(String(appId || ""));
    },
    /**
     * Leaving an app → Home: capture UI + mark background.
     */
    background(appId) {
      const id = String(appId || "");
      const ctrl = controllers.get(id);
      if (!ctrl) return null;
      let state = null;
      try {
        state = ctrl.capture?.() || null;
      } catch {
        state = null;
      }
      if (state) saveAppUiState(id, state);
      try {
        ctrl.onBackground?.();
      } catch {
        /* ignore */
      }
      return state;
    },
    /**
     * Re-entering an app: restore UI.
     */
    foreground(appId) {
      const id = String(appId || "");
      const ctrl = controllers.get(id);
      if (!ctrl) return null;
      const saved = loadAppUiState(id);
      try {
        ctrl.onForeground?.();
        if (saved) ctrl.restore?.(saved);
      } catch {
        /* ignore */
      }
      return saved;
    },
    /**
     * Push a completion toast when a background job finishes.
     * @param {{ appId: string, label: string, payload?: object }} note
     */
    notifyComplete(note) {
      const entry = {
        id: `note-${Date.now().toString(36)}`,
        appId: String(note.appId || ""),
        label: String(note.label || pt("toast.done")),
        createdAt: Date.now(),
        payload: note.payload || {},
      };
      notifications = [entry, ...notifications].slice(0, 12);
      emit(entry);
      return entry;
    },
    listNotifications() {
      return notifications.slice();
    },
    consumeNotification(id) {
      const hit = notifications.find((n) => n.id === id) || null;
      notifications = notifications.filter((n) => n.id !== id);
      return hit;
    },
    onNotification(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getBackgroundJob(appId) {
      try {
        return controllers.get(String(appId || ""))?.getBackgroundJob?.() || null;
      } catch {
        return null;
      }
    },
  };
}

/** Shared singleton for phone shell (same page lifetime). */
let sharedRegistry = null;

export function getSharedAppLifecycle() {
  if (!sharedRegistry) sharedRegistry = createAppLifecycleRegistry();
  return sharedRegistry;
}

export function __resetAppLifecycleForTests() {
  sharedRegistry = createAppLifecycleRegistry();
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
