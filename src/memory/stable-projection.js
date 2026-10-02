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

export const STABLE_GRAPH_PROJECTION_KIND = Object.freeze({});
export const STABLE_PALACE_PROJECTION_KIND = Object.freeze({});
export function buildStableSourceRef(..._args) { return removedMemory(); }
export function projectStableToGraph(..._args) { return removedMemory(); }
export function projectStableToPalace(..._args) { return removedMemory(); }
export function projectStableUnderstanding(..._args) { return removedMemory(); }

