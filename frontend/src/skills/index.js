/**
 * Developer Skill SDK public surface.
 */

export {
  SKILL_SDK_VERSION,
  SKILL_SDK_MIN_SUPPORTED,
  SKILL_SDK_MAX_SUPPORTED,
  SKILL_JSON_SCHEMA_ID,
  SKILL_INSTALL_KEY,
  SKILL_ROLLBACK_KEY,
  SKILL_PERMISSIONS,
  UI_SLOTS,
  SKILL_EVENT_TYPES,
  parseSemver,
  compareSemver,
  validateSkillManifest,
  detectSchemaDrift,
} from "./schema.js";

export {
  checkSdkCompatibility,
  checkUpgradeCompatibility,
  canBindCapability,
} from "./compatibility.js";

export {
  normalizePermissions,
  checkPermission,
  assertPermissions,
  grantDeclaredSubset,
} from "./permissions.js";

export {
  isValidRisk,
  compareRisk,
  checkSkillRisk,
  riskRequiresApproval,
  isExternalWriteRisk,
  RISK_LEVELS,
} from "./risk.js";

export {
  SANDBOX_DEFAULT_DENY,
  createSandbox,
  isSurfaceBlocked,
} from "./sandbox.js";

export {
  canonicalJson,
  hashSkillPackage,
  signPackageHash,
  verifyPackageSignature,
  buildProvenance,
  verifyPackageIntegrity,
} from "./signature.js";

export {
  defineSkillCapability,
  bindCapabilityToRegistry,
} from "./capability-api.js";

export {
  isValidUiSlot,
  contributeUiSlot,
  listUiSlotContributions,
  clearUiSlotsForSkill,
} from "./ui-slot-api.js";

export {
  createEventBus,
  validateSkillEvent,
} from "./event-api.js";

export {
  runConformance,
  assertConformanceForProduction,
} from "./conformance.js";

export {
  runSkillSimulator,
  runSimulatorFaultMatrix,
  __resetSimulatorForTests,
} from "./simulator.js";

export {
  canReadCharacterMemory,
  filterMemoryForSkill,
  thirdPartyMemoryContext,
} from "./memory-gate.js";

export {
  __setSkillStorageForTests,
  __resetSkillLifecycleForTests,
  listInstalledSkills,
  getInstalledSkill,
  installSkillPackage,
  upgradeSkillPackage,
  rollbackSkill,
  uninstallSkill,
  trackSkillTask,
  setSkillData,
  getSkillData,
  getRollbackSlot,
  getSkillEventBus,
} from "./lifecycle.js";

export {
  loadSkillIntoProduction,
  unloadSkillFromProduction,
  listProductionSkills,
  getProductionCapability,
  invokeProductionSkill,
  productionReadinessReport,
  __resetProductionRuntimeForTests,
} from "./runtime.js";
