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

export const MAX_MESSAGE_IDS = Object.freeze({});
export const MAX_ROUNDS_SHOWN = Object.freeze({});
export const MAX_TRANSCRIPT_CHARS = Object.freeze({});
export const SESSION_SUMMARY_KIND = Object.freeze({});
export const SESSION_SUMMARY_SOURCE = Object.freeze({});
export const SESSION_SUMMARY_SOURCE_TYPE = Object.freeze({});
export function buildChatRounds(..._args) { return removedMemory(); }
export function buildTranscriptFromIds(..._args) { return removedMemory(); }
export function collectMessageIdsForRounds(..._args) { return removedMemory(); }
export function listRecentRoundsForSummary(..._args) { return removedMemory(); }
export function messageIdsForRound(..._args) { return removedMemory(); }
export function parseConsolidatedMemoryJson(..._args) { return removedMemory(); }
export function previewSnippet(..._args) { return removedMemory(); }
export function sanitizeTurnText(..._args) { return removedMemory(); }
export function summarizeSelectedTurns(..._args) { return removedMemory(); }

