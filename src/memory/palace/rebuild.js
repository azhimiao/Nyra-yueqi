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

export function createMemoryPalaceIndexStore(..._args) { return removedMemory(); }
export function diaryEntriesToArtifacts(..._args) { return removedMemory(); }
export function projectArtifactRef(..._args) { return removedMemory(); }
export function projectStableMemory(..._args) { return removedMemory(); }
export function projectTimelineEvent(..._args) { return removedMemory(); }
export function rebuildPalaceFromSources(..._args) { return removedMemory(); }
export function rebuildPalaceIndex(..._args) { return removedMemory(); }
export function rebuildPalaceIndexFromAuthorities(..._args) { return removedMemory(); }
export function upsertBookChunkIndexRows(..._args) { return removedMemory(); }

