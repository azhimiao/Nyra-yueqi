/**
 * E8 联机 prefs — default deferred / disabled.
 */

export const MULTIPLAYER_STORE_KEY = "yueqi.multiplayer.v1";

/**
 * @typedef {{
 *   enabled: boolean,
 *   mode: "deferred"|"local",
 *   lastRoomCode?: string,
 * }} MultiplayerPrefs
 */

/** @returns {MultiplayerPrefs} */
export function defaultMultiplayerPrefs() {
  return {
    enabled: false,
    mode: "deferred",
  };
}

/**
 * Pure normalize — used by verify + UI.
 * @param {unknown} raw
 * @returns {MultiplayerPrefs}
 */
export function normalizeMultiplayerPrefs(raw) {
  const base = defaultMultiplayerPrefs();
  if (!raw || typeof raw !== "object") return { ...base };
  const bag = /** @type {Record<string, unknown>} */ (raw);
  const mode = bag.mode === "local" ? "local" : "deferred";
  const enabled = bag.enabled === true;
  const prefs = {
    enabled,
    mode,
  };
  if (mode === "local" && bag.lastRoomCode) {
    prefs.lastRoomCode = String(bag.lastRoomCode).replace(/\D/g, "").slice(0, 6);
  }
  return prefs;
}

export function loadMultiplayerPrefs() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return defaultMultiplayerPrefs();
    }
    const raw = JSON.parse(window.localStorage.getItem(MULTIPLAYER_STORE_KEY) || "{}");
    return normalizeMultiplayerPrefs(raw);
  } catch {
    return defaultMultiplayerPrefs();
  }
}

export function saveMultiplayerPrefs(partial = {}) {
  const next = normalizeMultiplayerPrefs({
    ...loadMultiplayerPrefs(),
    ...partial,
  });
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(MULTIPLAYER_STORE_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  return next;
}

export function exportMultiplayerBag() {
  return loadMultiplayerPrefs();
}

export function importMultiplayerBag(payload) {
  saveMultiplayerPrefs(normalizeMultiplayerPrefs(payload));
}
