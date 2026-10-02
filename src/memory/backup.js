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

export const BACKUP_AUTHORITY_MANIFEST = Object.freeze({});
export function buildExportPayload(..._args) { return removedMemory(); }
export function buildFullBackupZip(..._args) { return removedMemory(); }
export function collectSettings(..._args) { return removedMemory(); }
export function downloadBackupZip(..._args) { return removedMemory(); }
export function downloadJson(..._args) { return removedMemory(); }
export function downloadNyraArchive(..._args) { return removedMemory(); }
export function restoreFullBackupZip(..._args) { return removedMemory(); }
export function restoreImportPayload(..._args) { return removedMemory(); }

