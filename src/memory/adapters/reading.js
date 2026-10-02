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

export const READING_ADAPTER_FEATURE_ID = Object.freeze({});
export const READING_PALACE_PROJECTION_KIND = Object.freeze({});
export function __resetReadingAdapterRegistrationForTests(..._args) { return removedMemory(); }
export function bookChunkSourceId(..._args) { return removedMemory(); }
export function bookSourceId(..._args) { return removedMemory(); }
export function buildReadingIndexDocuments(..._args) { return removedMemory(); }
export function ensureReadingAdapterRegistered(..._args) { return removedMemory(); }
export function getBookChunkSourceRef(..._args) { return removedMemory(); }
export function handleReadingTombstone(..._args) { return removedMemory(); }
export function ingestBookChunksWithSourceRef(..._args) { return removedMemory(); }
export function isReadingAdapterEnabled(..._args) { return removedMemory(); }
export function readingFeatureMemoryAdapter(..._args) { return removedMemory(); }
export function submitReadingPreference(..._args) { return removedMemory(); }
export function tombstoneBookChunks(..._args) { return removedMemory(); }

