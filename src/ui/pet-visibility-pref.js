export const BROWSER_PET_KEY = "yueqi.browserPetEnabled";

function resolveStorage(storage) {
  return storage || globalThis.localStorage;
}

export function readBrowserPetEnabled(storage) {
  try {
    return resolveStorage(storage)?.getItem(BROWSER_PET_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeBrowserPetEnabled(enabled, storage) {
  try {
    resolveStorage(storage)?.setItem(BROWSER_PET_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
