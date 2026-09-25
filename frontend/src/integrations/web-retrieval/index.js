/**
 * Web retrieval client surface (W7).
 */

export {
  searchWeb,
  fetchWebPage,
  resolveGatewayBase,
  clearWebRetrievalClientCache,
  DEFAULT_TIMEOUT_MS,
} from "./client.js";

export {
  mayRequestWeb,
  memoryWritePolicy,
  buildSourcedArtifact,
  requireWebEvidenceSources,
} from "./policy.js";

export {
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheClear,
  cacheSize,
  DEFAULT_TTL_MS,
} from "./cache.js";
