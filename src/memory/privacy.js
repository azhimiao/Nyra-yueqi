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

export const BACKUP_EXCLUDED = Object.freeze({});
export const BACKUP_INCLUDED_MODULES = Object.freeze({});
export const CLEARABLE_LOCAL_MODULES = Object.freeze({});
export function assertNoSecretsInExport(..._args) { return removedMemory(); }
export function clearLocalModules(..._args) { return removedMemory(); }
export function exportYeosGamesBag(..._args) { return removedMemory(); }
export function importAppEventsBag(..._args) { return removedMemory(); }
export function importCompanionLifeBag(..._args) { return removedMemory(); }
export function importYeosGamesBag(..._args) { return removedMemory(); }
export function importYeosSavesBag(..._args) { return removedMemory(); }
export function scrubExportPayload(..._args) { return removedMemory(); }

