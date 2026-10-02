/**
 * Character Visual Memory — semantic layer over IndexedDB media + library index.
 *
 * Identity  → who they are (VisualIdentityPack references)
 * Life      → what they have lived / created visually
 * UserShared → what the user showed them
 * Relationship view → filtered projection across the three (not a fourth store)
 */

export const VISUAL_MEMORY_KEY = "yueqi.visual.memory.v1";
export const VISUAL_MEMORY_SCHEMA_VERSION = 1;

/** Stable library group ids (UI buckets) — one physical media store underneath. */
export const VISUAL_GROUP_IDS = Object.freeze({
  identity: "pg-visual-identity",
  life: "pg-visual-life",
  userShared: "pg-visual-user-shared",
});

export const VISUAL_NAMESPACES = Object.freeze([
  "identity",
  "life",
  "user_shared",
]);

/** VisualIdentityPack slot kinds — forced inputs for “draw them”. */
export const IDENTITY_KINDS = Object.freeze([
  "front",
  "left_3q",
  "right_3q",
  "full_body",
  "bust",
  "face_closeup",
  "expression_smile",
  "expression_sad",
  "expression_neutral",
  "outfit_default",
  "body_ref",
  "selfie_ref",
  "pet_ref",
  "other_identity",
]);

/** Life / context asset kinds. */
export const LIFE_KINDS = Object.freeze([
  "selfie",
  "diary_image",
  "moments_image",
  "novel_illustration",
  "gal_cg",
  "her_drawing",
  "gift_image",
  "co_listen_cover",
  "co_watch_cover",
  "relationship_memento",
  "ai_studio",
  "chat_gen",
  "world_image",
  "other_life",
]);

/** User-shared asset kinds. */
export const USER_SHARED_KINDS = Object.freeze([
  "chat_image",
  "user_selfie",
  "place",
  "pet",
  "product",
  "screenshot",
  "other_shared",
]);

/** Durability / memory weight for user-shared (and optionally life) visuals. */
export const VISUAL_SIGNIFICANCE = Object.freeze([
  "seen",
  "saved",
  "meaningful",
  "memory_linked",
]);

/** Identity QA gate — failed assets must never become identity references. */
export const VISUAL_QA_STATUS = Object.freeze([
  "n/a",
  "pending",
  "passed",
  "failed",
]);

export const NAMESPACE_LABELS = Object.freeze({
  identity: { zh: "ta自己", en: "Self / Identity" },
  life: { zh: "ta的经历", en: "Life / Context" },
  user_shared: { zh: "你给ta看过", en: "User Shared" },
  chat: { zh: "聊天生图", en: "Chat images" },
  moments: { zh: "朋友圈生图", en: "Moments images" },
  character_world: { zh: "角色世界生图", en: "World images" },
  relationship: { zh: "我们的相册", en: "Ours" },
});

/**
 * @typedef {{
 *   id: string,
 *   mediaId: string,
 *   companionId: string,
 *   namespace: "identity"|"life"|"user_shared",
 *   kind: string,
 *   sourceType: string,
 *   sourceId: string,
 *   identityVersion: number,
 *   significance: string,
 *   semanticTags: string[],
 *   contextSummary: string,
 *   qaStatus: string,
 *   relationshipRelevant: boolean,
 *   libraryPhotoId: string,
 *   libraryGroupId: string,
 *   title: string,
 *   createdAt: string,
 * }} VisualAsset
 */

export function namespaceForGroupId(groupId = "") {
  const id = String(groupId || "");
  if (id === VISUAL_GROUP_IDS.identity) return "identity";
  if (id === VISUAL_GROUP_IDS.life || id === "pg-ai-studio") return "life";
  if (id === VISUAL_GROUP_IDS.userShared) return "user_shared";
  if (id === "pg-visual-chat" || id === "pg-visual-moments" || id === "pg-visual-world") return "life";
  return "";
}

export function groupIdForNamespace(namespace = "") {
  if (namespace === "identity") return VISUAL_GROUP_IDS.identity;
  if (namespace === "life") return VISUAL_GROUP_IDS.life;
  if (namespace === "user_shared") return VISUAL_GROUP_IDS.userShared;
  return "";
}

export function defaultKindForNamespace(namespace = "") {
  if (namespace === "identity") return "other_identity";
  if (namespace === "life") return "other_life";
  if (namespace === "user_shared") return "chat_image";
  return "other_life";
}

/**
 * @param {Partial<VisualAsset>} input
 * @returns {VisualAsset}
 */
export function normalizeVisualAsset(input = {}) {
  const namespace = VISUAL_NAMESPACES.includes(input.namespace)
    ? input.namespace
    : "life";
  const significance = VISUAL_SIGNIFICANCE.includes(input.significance)
    ? input.significance
    : (namespace === "user_shared" ? "seen" : "saved");
  const qaStatus = VISUAL_QA_STATUS.includes(input.qaStatus)
    ? input.qaStatus
    : (namespace === "identity" ? "pending" : "n/a");
  const tags = Array.isArray(input.semanticTags)
    ? input.semanticTags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 24)
    : [];

  return {
    id: String(input.id || "").trim() || `va-${Date.now().toString(36)}`,
    mediaId: String(input.mediaId || "").trim(),
    companionId: String(input.companionId || "").trim(),
    namespace,
    kind: String(input.kind || defaultKindForNamespace(namespace)).trim() || defaultKindForNamespace(namespace),
    sourceType: String(input.sourceType || "").trim(),
    sourceId: String(input.sourceId || "").trim(),
    identityVersion: Math.max(1, Number(input.identityVersion) || 1),
    significance,
    semanticTags: tags,
    contextSummary: String(input.contextSummary || "").trim().slice(0, 500),
    qaStatus,
    relationshipRelevant: input.relationshipRelevant === true
      || namespace === "user_shared"
      || ["relationship_memento", "moments_image", "diary_image"].includes(String(input.kind || "")),
    libraryPhotoId: String(input.libraryPhotoId || "").trim(),
    libraryGroupId: String(input.libraryGroupId || input.groupId || "").trim(),
    title: String(input.title || "").trim().slice(0, 80),
    createdAt: String(input.createdAt || new Date().toISOString()),
  };
}

/** Only passed identity assets may seed generation references. */
export function isUsableIdentityReference(asset) {
  return asset?.namespace === "identity"
    && asset?.qaStatus === "passed"
    && Boolean(asset?.mediaId);
}
