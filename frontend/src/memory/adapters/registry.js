/**
 * Feature memory adapter registry (stub + lookup).
 */

/** @type {Map<string, import("./contract.js").FeatureMemoryAdapter>} */
const adapters = new Map();

/**
 * @param {string} featureId
 * @param {import("./contract.js").FeatureMemoryAdapter} adapter
 */
export function registerFeatureMemoryAdapter(featureId, adapter) {
  const key = String(featureId || "").trim();
  if (!key) throw new Error("registerFeatureMemoryAdapter: featureId required");
  if (!adapter || typeof adapter !== "object") {
    throw new Error("registerFeatureMemoryAdapter: adapter required");
  }
  adapters.set(key, adapter);
  return key;
}

/**
 * @param {string} featureId
 * @returns {import("./contract.js").FeatureMemoryAdapter | null}
 */
export function getFeatureMemoryAdapter(featureId) {
  return adapters.get(String(featureId || "").trim()) || null;
}

/** @returns {string[]} */
export function listFeatureMemoryAdapterIds() {
  return [...adapters.keys()];
}

export function unregisterFeatureMemoryAdapter(featureId) {
  return adapters.delete(String(featureId || "").trim());
}

/** Test helper */
export function __clearFeatureMemoryAdaptersForTests() {
  adapters.clear();
}
