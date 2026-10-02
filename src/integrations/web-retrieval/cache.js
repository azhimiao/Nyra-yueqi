/**
 * Short-TTL in-memory cache for web retrieval responses (client-side).
 * Not durable; not a memory authority.
 */

const DEFAULT_TTL_MS = 60_000;

/** @type {Map<string, { expiresAt: number, value: unknown }>} */
const store = new Map();

/**
 * @param {string} key
 * @param {unknown} value
 * @param {{ ttlMs?: number }} [opts]
 */
export function cacheSet(key, value, opts = {}) {
  const k = String(key || "").trim();
  if (!k) return;
  const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
  store.set(k, { expiresAt: Date.now() + ttlMs, value });
}

/**
 * @param {string} key
 */
export function cacheGet(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const hit = store.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(k);
    return null;
  }
  return hit.value;
}

/**
 * @param {string} key
 */
export function cacheDelete(key) {
  store.delete(String(key || "").trim());
}

export function cacheClear() {
  store.clear();
}

export function cacheSize() {
  return store.size;
}

export { DEFAULT_TTL_MS };
