/**
 * YEOS game saves — yueqi.yeos.saves.v1
 */

export const YEOS_SAVES_STORE_KEY = "yueqi.yeos.saves.v1";

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { saves: {} };
    return JSON.parse(window.localStorage.getItem(YEOS_SAVES_STORE_KEY) || "{}") || { saves: {} };
  } catch {
    return { saves: {} };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(YEOS_SAVES_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {string} pkgId
 */
export function loadGameSave(pkgId) {
  const id = String(pkgId || "").trim();
  if (!id) return null;
  const bag = readBag();
  return bag.saves?.[id] ?? null;
}

/**
 * @param {string} pkgId
 * @param {unknown} data
 */
export function saveGameSave(pkgId, data) {
  const id = String(pkgId || "").trim();
  if (!id) return false;
  const bag = readBag();
  if (!bag.saves || typeof bag.saves !== "object") bag.saves = {};
  bag.saves[id] = data;
  writeBag(bag);
  return true;
}

/**
 * @param {string} pkgId
 */
export function clearGameSave(pkgId) {
  const id = String(pkgId || "").trim();
  if (!id) return false;
  const bag = readBag();
  if (!bag.saves || !(id in bag.saves)) return false;
  delete bag.saves[id];
  writeBag(bag);
  return true;
}

export function exportYeosSavesBag() {
  return readBag();
}

export function importYeosSavesBag(payload) {
  const saves = payload?.saves && typeof payload.saves === "object" ? payload.saves : {};
  writeBag({ saves });
  return readBag();
}
