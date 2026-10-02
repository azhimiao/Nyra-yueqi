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

export const MEMORY_MANAGER_CHANGED = Object.freeze({});
export const MEMORY_MANAGER_LAYERS = Object.freeze({});
export function deleteManagedMemory(..._args) { return removedMemory(); }
export function listManagedMemories(..._args) { return removedMemory(); }
export function listRecentMemoryHistory(..._args) { return removedMemory(); }
export function listSharedMemoryTimeline(..._args) { return removedMemory(); }
export function readManagedMemorySource(..._args) { return removedMemory(); }
export function saveManagedMemory(..._args) { return removedMemory(); }
export function setManagedMemoryRecall(..._args) { return removedMemory(); }

