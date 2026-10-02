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

export const CANDIDATE_LEDGER_KEY = Object.freeze({});
export const PROMOTE_MIN_CONFIDENCE = Object.freeze({});
export const PROMOTE_MIN_EVIDENCE = Object.freeze({});
export const STABLE_MEMORY_KEY = Object.freeze({});
export function __setCandidateLedgerStorageForTests(..._args) { return removedMemory(); }
export function clearCandidateLedgerForTests(..._args) { return removedMemory(); }
export function editStableMemoryAuthority(..._args) { return removedMemory(); }
export function forgetUnderstanding(..._args) { return removedMemory(); }
export function forgetUnderstandingByEvidenceRefs(..._args) { return removedMemory(); }
export function listStableMemoryAuthority(..._args) { return removedMemory(); }
export function promoteCandidateToStable(..._args) { return removedMemory(); }
export function recallCandidates(..._args) { return removedMemory(); }
export function recallStableMemory(..._args) { return removedMemory(); }
export function submitCandidate(..._args) { return removedMemory(); }
export function supersedeUnderstanding(..._args) { return removedMemory(); }
export function transitionCandidate(..._args) { return removedMemory(); }

