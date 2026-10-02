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

export const LISTEN_ADAPTER_FEATURE_ID = Object.freeze({});
export function __clearListenSessionsForTests(..._args) { return removedMemory(); }
export function __resetListenAdapterRegistrationForTests(..._args) { return removedMemory(); }
export function emitListenTimelineEvents(..._args) { return removedMemory(); }
export function endListenSession(..._args) { return removedMemory(); }
export function ensureListenAdapterRegistered(..._args) { return removedMemory(); }
export function getListenSessionSourceRef(..._args) { return removedMemory(); }
export function isListenAdapterEnabled(..._args) { return removedMemory(); }
export function listenFeatureMemoryAdapter(..._args) { return removedMemory(); }
export function recordListenProgress(..._args) { return removedMemory(); }
export function submitListenPreference(..._args) { return removedMemory(); }
export function submitListenUnderstandingCandidates(..._args) { return removedMemory(); }

