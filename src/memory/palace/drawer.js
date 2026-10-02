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

export function assertPalaceProjectionWriteAllowed(..._args) { return removedMemory(); }
export function defaultRoom(..._args) { return removedMemory(); }
export function fileDrawer(..._args) { return removedMemory(); }
export function inferHall(..._args) { return removedMemory(); }
export function memoryToDrawer(..._args) { return removedMemory(); }

