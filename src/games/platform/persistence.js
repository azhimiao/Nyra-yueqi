/**
 * localStorage-backed game session persistence (platform layer).
 */

export const PLATFORM_STORE_KEY = "yueqi.games.platform.v1";

function readBag(storage) {
  try {
    const raw = storage?.getItem?.(PLATFORM_STORE_KEY) || "{}";
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { sessions: {} };
    if (!parsed.sessions || typeof parsed.sessions !== "object") parsed.sessions = {};
    return parsed;
  } catch {
    return { sessions: {} };
  }
}

function writeBag(bag, storage) {
  try {
    storage?.setItem?.(PLATFORM_STORE_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage} [storage]
 */
export function createLocalPersistence(storage = globalThis.localStorage) {
  return {
    load(id) {
      const bag = readBag(storage);
      return bag.sessions[String(id || "")] || null;
    },
    save(session) {
      if (!session?.id) return false;
      const bag = readBag(storage);
      const clone = { ...session };
      delete clone._rng;
      bag.sessions[session.id] = clone;
      return writeBag(bag, storage);
    },
    remove(id) {
      const bag = readBag(storage);
      delete bag.sessions[String(id || "")];
      return writeBag(bag, storage);
    },
    list() {
      return Object.values(readBag(storage).sessions);
    },
  };
}
