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

export function __clearDefaultPalaceIndexStoreForTests(..._args) { return removedMemory(); }
export function __setDefaultPalaceIndexStoreForTests(..._args) { return removedMemory(); }
export function createMemoryPalaceIndexStore(..._args) { return removedMemory(); }
export function getDefaultPalaceIndexStore(..._args) { return removedMemory(); }
export function projectAndUpsert(..._args) { return removedMemory(); }
export function projectArtifactRef(..._args) { return removedMemory(); }
export function projectStableMemory(..._args) { return removedMemory(); }
export function projectTimelineEvent(..._args) { return removedMemory(); }
export function projectToPalace(..._args) { return removedMemory(); }
export function projectToPalaceIndex(..._args) { return removedMemory(); }

