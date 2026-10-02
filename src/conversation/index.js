/**
 * Conversation Runtime V2 — public exports.
 * Single spine for Pop chat + immersive scenario turns (ConversationGraph).
 */

export {
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_STORE_KEY,
  CONVERSATION_STORE_KEY_V1,
  CONVERSATION_BACKUP_KEY_V1,
  CONVERSATION_MODES,
  BRANCH_STATUSES,
  CANDIDATE_STATUSES,
  createConversationId,
  createConversationSession,
  createConversationBranch,
  createMessageNode,
  createTurnCandidate,
  createConversationTurn,
  createModeContext,
  validateConversationSession,
  getActiveCandidate,
  __resetConversationIdSeqForTests,
} from "./schema.js";

export {
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  clearAllConversations,
  getConversationStoreKey,
  listSessions,
  getSession,
  getSessionMutable,
  saveSession,
  persistSession,
  appendTurn,
  rollbackLastTurn,
  updateMode,
  ensureSession,
  getActiveSessionForCharacter,
  exportConversationBag,
  importConversationBag,
} from "./store.js";

export {
  migrateSessionV1ToV2,
  migrateBagV1ToV2,
  migrateStorageV1ToV2,
  ensureConversationMigrated,
} from "./migration.js";

export {
  CONVERSATION_EVENTS,
  onConversationEvent,
  offConversationEvent,
  emitConversationEvent,
  getConversationAuditLog,
  __resetConversationEventsForTests,
} from "./events.js";

export {
  selectBranchMessageChain,
  selectVisibleHistory,
  selectLinearTurns,
  selectChildMessages,
  messageHasDescendants,
  selectActiveBranch,
} from "./selectors.js";

export {
  getOrCreateActiveSession,
  sendUser,
  appendSystemNote,
  appendAssistantCandidate,
  regenerate,
  switchCandidate,
  updateMessageMeta,
  editUserMessage,
  editMessageContent,
  deleteMessage,
  forkFromMessage,
  checkpoint,
  switchBranch,
  archiveBranch,
  archiveCandidate,
  rollbackHead,
  saveUiState,
  // V1-compatible names
  appendUserTurn,
  appendAssistantTurn,
  enterImmersive,
  exitImmersive,
  getSharedHistory,
  rollbackTurn,
  replaceLastAssistant,
} from "./runtime.js";

export {
  turnToChatMessage,
  mirrorTurnToChat,
  appendChatTurnBestEffort,
  regenerateChatBestEffort,
} from "./bridge-chat.js";

export {
  resolveCompanionConversationSession,
  writeCompanionTurn,
  writeCompanionSystemNote,
} from "./companion-write.js";

export {
  freezeTurnExecutionScope,
  createPendingTurnBuckets,
} from "./turn-scope.js";
