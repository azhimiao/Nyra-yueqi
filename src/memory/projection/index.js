/* Open-source tree: the memory pipeline implementation has been removed. */
function removedMemory() {
  const bag = [];
  const proxy = new Proxy(bag, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "length") return 0;
      if (typeof prop === "symbol") return undefined;
      const method = Array.prototype[prop];
      if (typeof method === "function") return method.bind(bag);
      return proxy;
    },
  });
  return proxy;
}

export const PALACE_PROJECTION_VERSION = Object.freeze({});
export const PALACE_SOURCE_TYPES = Object.freeze({});
export function __clearDefaultPalaceIndexStoreForTests(..._args) { return removedMemory(); }
export function __setDefaultPalaceIndexStoreForTests(..._args) { return removedMemory(); }
export function createMemoryPalaceIndexStore(..._args) { return removedMemory(); }
export function createPalaceIndexRecord(..._args) { return removedMemory(); }
export function getDefaultPalaceIndexStore(..._args) { return removedMemory(); }
export function hasValidSourceRefs(..._args) { return removedMemory(); }
export function hashPalaceContent(..._args) { return removedMemory(); }
export function preferSourcedPalaceHits(..._args) { return removedMemory(); }
export function projectAndUpsert(..._args) { return removedMemory(); }
export function projectArtifactRef(..._args) { return removedMemory(); }
export function projectStableMemory(..._args) { return removedMemory(); }
export function projectTimelineEvent(..._args) { return removedMemory(); }
export function projectToPalace(..._args) { return removedMemory(); }
export function projectToPalaceIndex(..._args) { return removedMemory(); }
export function rebuildPalaceIndex(..._args) { return removedMemory(); }
export function sweepAfterForget(..._args) { return removedMemory(); }
export function sweepStalePalaceEntries(..._args) { return removedMemory(); }
export function validatePalaceIndexRecord(..._args) { return removedMemory(); }

