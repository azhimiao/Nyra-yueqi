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

export const SUPPRESSION_LEDGER_KEY = Object.freeze({});
export function __setSuppressionLedgerStorageForTests(..._args) { return removedMemory(); }
export function clearSuppressionLedgerForTests(..._args) { return removedMemory(); }
export function exportSuppressionLedger(..._args) { return removedMemory(); }
export function filterSuppressedHistoryMessages(..._args) { return removedMemory(); }
export function importSuppressionLedger(..._args) { return removedMemory(); }
export function isSuppressed(..._args) { return removedMemory(); }
export function isSuppressedContent(..._args) { return removedMemory(); }
export function isSuppressedEvidence(..._args) { return removedMemory(); }
export function listSuppressionKeys(..._args) { return removedMemory(); }
export function readMemoryRecallPolicy(..._args) { return removedMemory(); }
export function recordForgetSuppression(..._args) { return removedMemory(); }
export function recordSuppression(..._args) { return removedMemory(); }
export function restoreMemoryRecallPolicy(..._args) { return removedMemory(); }
export function suppressionFingerprint(..._args) { return removedMemory(); }
export function writeMemoryRecallPolicy(..._args) { return removedMemory(); }

