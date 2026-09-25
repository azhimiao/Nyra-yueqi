/**
 * Personal Context Graph — public API ().
 */

export {
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_GRAPH_KEY,
  MEMORY_KINDS,
  PRIVACY_LEVELS,
  RETENTION_POLICIES,
  CONFLICT_STATES,
  PIPELINE_STAGES,
  validateContextItem,
  buildContextItem,
  inferKind,
  nextContextId,
  __resetContextIdSeqForTests,
} from "./schema.js";

export {
  __setContextStorageForTests,
  getContextStoreKey,
  clearAllContextItems,
  putItem,
  getItem,
  deleteItem,
  updateItem,
  listItems,
  touchLastUsed,
  touchLastUsedMany,
  getMigrationMeta,
  setMigrationMeta,
  exportContextBag,
  importContextBag,
  countActiveItems,
} from "./store.js";

export {
  ingestCandidate,
  ingestMany,
  normalizeContentKey,
  extractFactSubject,
  classifyPrivacy,
  applyRetentionPolicy,
  findDuplicate,
  findConflicts,
} from "./pipeline.js";

export {
  retrieveContext,
  recallPreference,
  countExpiredMisuse,
} from "./retrieve.js";

export {
  formatContextGraphBlock,
  loadContextGraphPromptBlock,
  chatTextsToCandidates,
  ingestChatTurnBestEffort,
} from "./hot-path.js";

export {
  migrateIntoContextGraph,
  lifeEventToCandidate,
  diaryToCandidate,
  cohabitToCandidate,
  relationToCandidate,
} from "./migrate.js";

export {
  editMemory,
  deleteMemory,
  freezeMemory,
  forbidProactiveUse,
  getMemoryViewerModel,
} from "./actions.js";

export {
  CONTEXT_CONTRACT_VERSION,
  CONTEXT_BUDGET_PROFILES,
  CONTEXT_PURPOSES,
  resolveContextBudgetProfile,
  normalizeContextRequest,
  createContextEnvelope,
  validateContextRequest,
} from "./contract.js";

export { prepareShortTermContext } from "./short-term.js";
export { resolveAuthoritativeHistory } from "./history-authority.js";
export { projectCohabitContext } from "./cohabit-projector.js";
export { projectMomentsContext } from "./moments-projector.js";
export {
  BRANCH_SUMMARY_KEY,
  getBranchSummary,
  listBranchSummaryVersions,
  invalidateBranchSummary,
  commitBranchSummary,
  refreshBranchSummary,
  formatBranchSummaryBlock,
  __setBranchSummaryStorageForTests,
  exportBranchSummaryBag,
  importBranchSummaryBag,
} from "./branch-summary.js";
export {
  SESSION_MAP_KEY,
  SESSION_MAP_VERSION,
  inferConversationKind,
  resolveOwnerKey,
  resolveConversationBinding,
  listSessionMappings,
  touchSessionMappingReconcile,
  exportSessionMapBag,
  importSessionMapBag,
  __setSessionMapStorageForTests,
} from "./session-map.js";
export { buildContextEnvelope, formatImplicitEnvelope } from "./broker.js";
export {
  coordinateBrokerRetrieval,
  dedupeBlocksBySourceRef,
  retrievePalaceForBroker,
  normalizeSourceRefKey,
} from "./retrieval-coordinator.js";
export {
  CONTEXT_INSPECTOR_KEY,
  CONTEXT_INSPECTOR_LIMIT,
  __setContextInspectorStorageForTests,
  recordContextEnvelope,
  listContextTraces,
  getContextTrace,
  clearContextTraces,
  exportContextInspectorBag,
  importContextInspectorBag,
} from "./inspector.js";
export {
  MEMORY_OPERATION_TYPES,
  parseMemoryOperations,
  applyMemoryOperations,
  extractAndApplyMemoryOperations,
} from "./extraction.js";
