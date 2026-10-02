/**
 * Character Visual Memory public API.
 */

export {
  VISUAL_MEMORY_KEY,
  VISUAL_GROUP_IDS,
  VISUAL_NAMESPACES,
  IDENTITY_KINDS,
  LIFE_KINDS,
  USER_SHARED_KINDS,
  VISUAL_SIGNIFICANCE,
  VISUAL_QA_STATUS,
  NAMESPACE_LABELS,
  normalizeVisualAsset,
  isUsableIdentityReference,
  namespaceForGroupId,
  groupIdForNamespace,
  defaultKindForNamespace,
} from "./schema.js";

export {
  getCompanionVisualBag,
  getIdentityVersion,
  bumpIdentityVersion,
  upsertVisualAsset,
  listVisualAssets,
  listIdentityReferences,
  listIdentityGenerationReferences,
  listRelationshipVisuals,
  markVisualQa,
  markVisualQaByMedia,
  setVisualSignificance,
  registerLibraryPhotoAsVisual,
  removeVisualAssetsForPhoto,
} from "./store.js";

export {
  ensureVisualMemoryGroups,
  listSemanticGalleryGroups,
  syncLibraryIntoVisualMemory,
  RELATIONSHIP_VIEW_ID,
  GEN_SURFACES,
} from "./bridge-library.js";

export {
  GEN_SURFACES as VISUAL_GEN_SURFACES,
  SURFACE_GROUP_IDS,
  IDENTITY_PACK_PRIORITY,
  resolveGenSurface,
  isSurfaceGroupId,
  surfaceForGroupId,
  kindForSurfaceSave,
} from "./surfaces.js";

export {
  assembleVisualGenPack,
  assembleVisualGenPrompt,
} from "./prompt-assemble.js";
