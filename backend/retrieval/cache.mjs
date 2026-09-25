/**
 * Minimal in-memory TTL cache for retrieval search responses.
 */

const store = new Map();

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 256;

/**
 * @param {string} key
 */
export function cacheGet(key) {
  const k = String(key || "");
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
 * @param {unknown} value
 * @param {{ ttlMs?: number }} [opts]
 */
export function cacheSet(key, value, opts = {}) {
  const k = String(key || "");
  if (!k) return;
  const ttl = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first != null) store.delete(first);
  }
  store.set(k, { value, expiresAt: Date.now() + ttl });
}

export function cacheClear() {
  store.clear();
}

export function cacheSize() {
  return store.size;
}

export { DEFAULT_TTL_MS };
