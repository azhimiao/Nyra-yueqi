/**
 * Gateway entry alias — mounts retrieval routes (plan §11.2 / C4).
 */
export {
  mountRetrievalRoutes,
  runSearch,
  getSearchProviderStatus,
  selectSearchProvider,
  resolveProviderId,
  handleSearchBody,
  handleFetchBody,
  cacheClear,
  clearRateLimits,
  clearAuditEntries,
  getAuditEntries,
  setAuditSink,
} from "./index.mjs";
