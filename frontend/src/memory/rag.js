import { searchDrawers } from "./palace/search.js";

export { searchDrawers } from "./palace/search.js";
export { filterDrawers } from "./palace/filter.js";

/** Legacy RAG entry — delegates to MemPalace hybrid drawer search. */
export async function searchMemories(query, options = {}) {
  return searchDrawers(query, options);
}

export { deleteMemory, updateMemory } from "./rag-ops.js";
