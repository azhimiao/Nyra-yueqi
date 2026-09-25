/**
 * Character / World Studio public surface.
 */

export {
  STUDIO_SDK_VERSION,
  STUDIO_SDK_MIN_SUPPORTED,
  STUDIO_SDK_MAX_SUPPORTED,
  CHARACTER_JSON_SCHEMA_ID,
  WORLD_JSON_SCHEMA_ID,
  CHARACTER_INSTALL_KEY,
  WORLD_INSTALL_KEY,
  RELATION_MEMORY_KEY,
  PREVIEW_TARGETS,
  ACTION_CONTEXTS,
  RELATION_MODES,
  WORLD_FORBIDDEN_PRIVILEGES,
  parseSemver,
  compareSemver,
  validateCharacterManifest,
  validateWorldManifest,
  detectCharacterSchemaDrift,
  detectWorldSchemaDrift,
  checkStudioSdkCompatibility,
  checkPackageUpgradeCompatibility,
} from "./schema.js";

export {
  normalizeIdentity,
  identityContractHash,
} from "./identity.js";

export {
  MIN_ACTIONS,
  MIN_EXPRESSIONS,
  normalizeAppearance,
  transitionAction,
} from "./appearance.js";

export {
  normalizeActionVoiceMap,
  resolveContextPresentation,
} from "./action-voice-map.js";

export {
  normalizeMemoryPolicy,
  mayRemember,
  sensitiveTopicPolicy,
} from "./memory-policy.js";

export {
  PREVIEW_ASPECTS,
  buildPreviewTargets,
  resolvePreviewFrame,
  assertNoIdentityDrift,
} from "./preview.js";

export { runConsistencyChecks } from "./consistency.js";

export {
  resolveAssetWithFallback,
  assertSameCharacterAsset,
} from "./asset-fallback.js";

export {
  normalizeWorldPackage,
  resolveWorldSkillDependency,
} from "./world-studio.js";

export {
  assertWorldHasNoSystemPrivileges,
  assertCharacterHasNoHiddenPrivileges,
  authorizeWorldCapability,
} from "./privilege-gate.js";

export {
  validateRelationEventWrite,
  appendRelationMemory,
} from "./relation-events.js";

export {
  canonicalJson,
  hashStudioPackage,
  signPackageHash,
  verifyPackageSignature,
  verifyStudioPackageIntegrity,
  buildStudioProvenance,
} from "./signature.js";

export { buildCharacterPackage } from "./character-package.js";

export {
  DISTRIBUTION_MODE,
  DISTRIBUTION_OUT_OF_SCOPE,
  exportStudioPackage,
  importStudioPackage,
  packageCompatibilityReport,
} from "./distribution.js";

export {
  __setStudioStorageForTests,
  __resetStudioLifecycleForTests,
  listInstalledCharacters,
  getInstalledCharacter,
  listInstalledWorlds,
  getInstalledWorld,
  getRelationMemoryBag,
  getRelationMemory,
  writeValidatedRelationEvent,
  installCharacterPackage,
  upgradeCharacterPackage,
  installWorldPackage,
  uninstallCharacterPackage,
} from "./lifecycle.js";

export {
  buildCrossSurfaceIdentityFrames,
  runIdentityContract,
} from "./identity-contract.js";
