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

export const DIARY_ADAPTER_FEATURE_ID = Object.freeze({});
export const DIARY_PALACE_PROJECTION_KIND = Object.freeze({});
export const DIARY_TIMELINE_PROJECTION_KIND = Object.freeze({});
export function __resetDiaryAdapterRegistrationForTests(..._args) { return removedMemory(); }
export function diaryFeatureMemoryAdapter(..._args) { return removedMemory(); }
export function ensureDiaryAdapterRegistered(..._args) { return removedMemory(); }
export function getDiarySourceRef(..._args) { return removedMemory(); }
export function isDiaryRepositoryEnabled(..._args) { return removedMemory(); }
export function projectDiaryMemoryIndex(..._args) { return removedMemory(); }
export function projectDiarySave(..._args) { return removedMemory(); }

