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

export const CLOSET_DISTANCE_CAP = Object.freeze({});
export const CLOSET_RANK_BOOSTS = Object.freeze({});
export function applyClosetBoost(..._args) { return removedMemory(); }
export function bm25Scores(..._args) { return removedMemory(); }
export function closetBoostForQuery(..._args) { return removedMemory(); }
export function hybridRank(..._args) { return removedMemory(); }

