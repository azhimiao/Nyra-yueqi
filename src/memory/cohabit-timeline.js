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

export const COHABIT_MAX_EVENTS = Object.freeze({});
export const COHABIT_PROMPT_LIMIT = Object.freeze({});
export const COHABIT_TIMELINE_KEY = Object.freeze({});
export function __setCohabitStorageForTests(..._args) { return removedMemory(); }
export function appendCohabitEvent(..._args) { return removedMemory(); }
export function clearCohabitTimeline(..._args) { return removedMemory(); }
export function exportCohabitTimeline(..._args) { return removedMemory(); }
export function formatCohabitTimelineBlock(..._args) { return removedMemory(); }
export function importCohabitTimeline(..._args) { return removedMemory(); }
export function listCohabitEvents(..._args) { return removedMemory(); }

