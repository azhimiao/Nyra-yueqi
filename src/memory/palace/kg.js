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

export function addKgFact(..._args) { return removedMemory(); }
export function deleteKgFact(..._args) { return removedMemory(); }
export function extractKgFromText(..._args) { return removedMemory(); }
export function formatKgBlock(..._args) { return removedMemory(); }
export function getKgTimeline(..._args) { return removedMemory(); }
export function inferKgSubjects(..._args) { return removedMemory(); }
export function invalidateKgFacts(..._args) { return removedMemory(); }
export function isRelationalQuery(..._args) { return removedMemory(); }
export function listKgFacts(..._args) { return removedMemory(); }
export function matchKgToQuery(..._args) { return removedMemory(); }
export function queryKg(..._args) { return removedMemory(); }

