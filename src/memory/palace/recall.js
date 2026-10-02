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

export function classifyRecall(..._args) { return removedMemory(); }
export function classifyRecallDepth(..._args) { return removedMemory(); }
export function classifyRecallReason(..._args) { return removedMemory(); }
export function inferWingRoom(..._args) { return removedMemory(); }
export function shouldRecall(..._args) { return removedMemory(); }

