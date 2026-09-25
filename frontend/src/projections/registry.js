/**
 * Projection registry — map projectionKind → async/sync handler.
 */

/** @type {Map<string, Function>} */
const handlers = new Map();

/**
 * @param {string} kind
 * @param {(job: object, ctx?: object) => unknown | Promise<unknown>} handler
 */
export function registerProjector(kind, handler) {
  const key = String(kind || "").trim();
  if (!key) throw new Error("registerProjector: kind required");
  if (typeof handler !== "function") throw new Error("registerProjector: handler required");
  handlers.set(key, handler);
  return key;
}

/**
 * @param {string} kind
 * @returns {Function | null}
 */
export function getProjector(kind) {
  return handlers.get(String(kind || "").trim()) || null;
}

/** @returns {string[]} */
export function listProjectorKinds() {
  return [...handlers.keys()];
}

export function unregisterProjector(kind) {
  return handlers.delete(String(kind || "").trim());
}

/** Test helper — clear all registered projectors. */
export function __clearProjectionRegistryForTests() {
  handlers.clear();
}
