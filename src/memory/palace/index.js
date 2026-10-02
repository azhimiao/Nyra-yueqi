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
export function assertPalaceProjectionWriteAllowed(..._args) { return removedMemory(); }
export function bm25Scores(..._args) { return removedMemory(); }
export function buildCandidatePool(..._args) { return removedMemory(); }
export function buildClosetIndex(..._args) { return removedMemory(); }
export function buildWakeUpContext(..._args) { return removedMemory(); }
export function classifyRecall(..._args) { return removedMemory(); }
export function classifyRecallDepth(..._args) { return removedMemory(); }
export function classifyRecallReason(..._args) { return removedMemory(); }
export function closetBoostForQuery(..._args) { return removedMemory(); }
export function closetBoostMap(..._args) { return removedMemory(); }
export function consumeWakeUpBlock(..._args) { return removedMemory(); }
export function diaryEntriesToArtifacts(..._args) { return removedMemory(); }
export function embedPalaceText(..._args) { return removedMemory(); }
export function enhancedEmbedText(..._args) { return removedMemory(); }
export function expandWithNeighbors(..._args) { return removedMemory(); }
export function extractKgFromText(..._args) { return removedMemory(); }
export function fileDrawer(..._args) { return removedMemory(); }
export function filterDrawers(..._args) { return removedMemory(); }
export function filterPalaceHitsBySourceRef(..._args) { return removedMemory(); }
export function flagOrphanPalaceHits(..._args) { return removedMemory(); }
export function formatKgBlock(..._args) { return removedMemory(); }
export function formatSessionDiaryBlock(..._args) { return removedMemory(); }
export function getKgTimeline(..._args) { return removedMemory(); }
export function getPalaceStatus(..._args) { return removedMemory(); }
export function getTaxonomy(..._args) { return removedMemory(); }
export function hashEmbedText(..._args) { return removedMemory(); }
export function hybridRank(..._args) { return removedMemory(); }
export function inferHall(..._args) { return removedMemory(); }
export function inferKgSubjects(..._args) { return removedMemory(); }
export function inferWingRoom(..._args) { return removedMemory(); }
export function invalidateKgFacts(..._args) { return removedMemory(); }
export function isPalaceProjectionOnlyEnabled(..._args) { return removedMemory(); }
export function isRelationalQuery(..._args) { return removedMemory(); }
export function listDrawers(..._args) { return removedMemory(); }
export function listRooms(..._args) { return removedMemory(); }
export function listWings(..._args) { return removedMemory(); }
export function memoryToDrawer(..._args) { return removedMemory(); }
export function palaceRoomLabel(..._args) { return removedMemory(); }
export function palaceRoomSummary(..._args) { return removedMemory(); }
export function palaceWingLabel(..._args) { return removedMemory(); }
export function peekWakeUpBlock(..._args) { return removedMemory(); }
export function projectToPalaceIndex(..._args) { return removedMemory(); }
export function queryKg(..._args) { return removedMemory(); }
export function rankCandidatePool(..._args) { return removedMemory(); }
export function readSessionDiary(..._args) { return removedMemory(); }
export function rebuildPalaceFromSources(..._args) { return removedMemory(); }
export function rebuildPalaceIndexFromAuthorities(..._args) { return removedMemory(); }
export function rowHasUsableSourceRef(..._args) { return removedMemory(); }
export function searchClosets(..._args) { return removedMemory(); }
export function searchDrawers(..._args) { return removedMemory(); }
export function searchPalace(..._args) { return removedMemory(); }
export function setWakeUpContext(..._args) { return removedMemory(); }
export function shouldChunkText(..._args) { return removedMemory(); }
export function shouldRecall(..._args) { return removedMemory(); }
export function splitDrawerText(..._args) { return removedMemory(); }
export function validatePalaceSearchHit(..._args) { return removedMemory(); }
export function writeSessionDiary(..._args) { return removedMemory(); }

