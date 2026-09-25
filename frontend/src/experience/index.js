/**
 * Experience Runtime — public exports (§13.2 / W3).
 */

export {
  EXPERIENCE_SCHEMA_VERSION,
  EXPERIENCE_OUTPUT_SCHEMA_VERSION,
  EXPERIENCE_STORE_KEY,
  EXPERIENCE_SESSION_STATUSES,
  SCENE_PATCH_WHITELIST,
  FORBIDDEN_PACKAGE_GRAPH_KEYS,
  createEmptySceneState,
  createDirectorAgenda,
  createExperienceOpening,
  createExperiencePackage,
  createExperienceSession,
  createExperienceBranchSnapshot,
  normalizeExperienceContentBlocks,
  createExperienceId,
  __resetExperienceIdSeqForTests,
  normalizeExperienceOutput,
  repairExperienceOutput,
  formatExperiencePromptBlocks,
} from "./schema.js";

export {
  validateScenePatch,
  reduceScenePatch,
  reduceTurn,
  parseAndReduceModelOutput,
} from "./reducer.js";

export {
  findForbiddenGraphKeys,
  findForbiddenJsKeys,
  validateExperiencePackage,
  loadExperiencePackage,
  exportExperiencePackage,
  importExperienceBundle,
  migrateExperiencePackage,
  scrubPrivacyFromExport,
  roundTripExperiencePackage,
  validateResourceLicenses,
  validateCustomCss,
  isAllowedResourceUrl,
  getPackageOpening,
  EXPERIENCE_BUNDLE_FORMAT,
  FORBIDDEN_PACKAGE_JS_KEYS,
  EXPORT_SCRUB_KEYS,
} from "./package-io.js";

export {
  MIST_HARBOR_PACKAGE_ID,
  MIST_HARBOR_LIGHTHOUSE_PACKAGE,
  createMistHarborLighthousePackage,
} from "./presets/mist-harbor-lighthouse.js";

export {
  mountExperienceStudio,
  inspectStudioPrompt,
  startStudioSandbox,
  endStudioSandbox,
} from "./studio/index.js";

export {
  __setExperienceStorageForTests,
  __clearExperienceRegistryForTests,
  registerPackage,
  getRegisteredPackage,
  listRegisteredPackages,
  saveExperienceSession,
  getExperienceSession,
  getActiveExperienceSession,
  getActiveExperienceForCharacter,
  listExperienceSessions,
  clearAllExperienceSessions,
  getExperienceStoreKey,
} from "./store.js";

export {
  enterExperience,
  pauseExperience,
  resumeExperience,
  endExperience,
  syncExperienceBranch,
  updateExperienceAfterTurn,
  getExperienceRuntimeSnapshot,
  isExperienceBackedScript,
  NIGHT_RAIN_LEGACY_SCRIPT_ID,
} from "./runtime.js";

export {
  scenarioChatSessionId,
  isIsolatedScenarioSession,
  isScenarioHistoryRow,
  bindScenarioConversation,
  rebindAwayFromCompanionDm,
} from "./conversation-bind.js";

export {
  createDeterministicExperienceModelStub,
  assembleExperienceTurn,
  runExperienceDirectorTurn,
  runExperienceHeadlessLoop,
} from "./director.js";

export {
  NIGHT_RAIN_PACKAGE_ID,
  NIGHT_RAIN_STATION_PACKAGE,
  createNightRainStationPackage,
} from "./presets/night-rain-station.js";

export {
  createExperiencePackageFromScenario,
  ensureScenarioExperiencePackage,
  registerScenarioExperiencePackages,
} from "./scenario-package.js";

export {
  EXPERIENCE_MEMORY_STORE_KEY,
  CANDIDATE_TYPES,
  CANDIDATE_STATUSES,
  __setExperienceMemoryStorageForTests,
  __clearExperienceMemoryForTests,
  __resetExperienceMemoryIdSeqForTests,
  createExperienceMemoryId,
  projectionKey,
  normalizeCandidateStatus,
  normalizeCandidateType,
  normalizeMemoryKey,
  createExperienceMemoryCandidate,
  saveCandidate,
  getCandidate,
  listCandidates,
  findDuplicateCandidate,
  findConflictCandidates,
  proposeCandidatesFromSignals,
  acceptCandidate,
  rejectCandidate,
  revokeCandidate,
  assertProjectionAllowed,
  commitCandidateProjection,
  commitFinaleReview,
  listProjections,
  listProjectedDiaryEntries,
  retrieveAcceptedExperiences,
  assembleAcceptedExperienceContribution,
  suggestPostSceneCompanionAction,
  hasProjectedDiary,
} from "./memory.js";

export {
  RELATIONSHIP_STORE_KEY,
  __setRelationshipStorageForTests,
  __clearRelationshipForTests,
  __resetRelationshipIdSeqForTests,
  createEmptyRelationshipState,
  getRelationshipState,
  saveRelationshipState,
  applyAcceptedRelationPatch,
  listRelationshipEvents,
} from "./relationship.js";
