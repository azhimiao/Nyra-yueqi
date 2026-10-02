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

export const TASK_ADAPTER_FEATURE_ID = Object.freeze({});
export function __resetTaskAdapterRegistrationForTests(..._args) { return removedMemory(); }
export function emitTaskLifecycle(..._args) { return removedMemory(); }
export function ensureTaskAdapterRegistered(..._args) { return removedMemory(); }
export function getTaskSourceRef(..._args) { return removedMemory(); }
export function onTaskStatusChanged(..._args) { return removedMemory(); }
export function taskFeatureMemoryAdapter(..._args) { return removedMemory(); }

