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
export function createPalaceIndexRecord(..._args) { return removedMemory(); }
export function hasValidSourceRefs(..._args) { return removedMemory(); }
export function hashPalaceContent(..._args) { return removedMemory(); }
export function validatePalaceIndexRecord(..._args) { return removedMemory(); }

