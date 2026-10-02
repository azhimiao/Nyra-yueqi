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

export const COMPANION_MEMORY_SCOPES = Object.freeze({});
export function classifyLegacyScope(..._args) { return removedMemory(); }
export function filterRowsByCompanionScope(..._args) { return removedMemory(); }
export function freezeCompanionScope(..._args) { return removedMemory(); }
export function relationshipIdFor(..._args) { return removedMemory(); }
export function requireCompanionScope(..._args) { return removedMemory(); }
export function rowMatchesCompanionScope(..._args) { return removedMemory(); }

