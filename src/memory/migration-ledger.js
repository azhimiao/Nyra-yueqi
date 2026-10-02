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

export const LEGACY_UNVERIFIED = Object.freeze({});
export const MIGRATION_LEDGER_KEY = Object.freeze({});
export const MIGRATION_LEDGER_VERSION = Object.freeze({});
export function __clearMigrationLedgerForTests(..._args) { return removedMemory(); }
export function __setMigrationLedgerStorageForTests(..._args) { return removedMemory(); }
export function appendMigrationRun(..._args) { return removedMemory(); }
export function beginMigrationRun(..._args) { return removedMemory(); }
export function finalizeMigrationRun(..._args) { return removedMemory(); }
export function getLatestMigrationRun(..._args) { return removedMemory(); }
export function listOrphanPalaceRows(..._args) { return removedMemory(); }
export function quarantineOrphanPalaceRows(..._args) { return removedMemory(); }
export function readMigrationLedger(..._args) { return removedMemory(); }

