/**
 * Surface-scoped visual generation surfaces.
 * Each gen surface eats ONLY: VisualIdentityPack + that surface's group.
 */

import {
  VISUAL_GROUP_IDS,
  IDENTITY_KINDS,
  normalizeVisualAsset,
  defaultKindForNamespace,
  namespaceForGroupId,
} from "./schema.js";

/** Generation surfaces — never mix another surface's life images into the pack. */
export const GEN_SURFACES = Object.freeze({
  chat: Object.freeze({
    id: "chat",
    groupId: "pg-visual-chat",
    label: { zh: "聊天生图", en: "Chat images" },
    lifeKind: "chat_gen",
    maxSurfaceRefs: 3,
  }),
  moments: Object.freeze({
    id: "moments",
    groupId: "pg-visual-moments",
    label: { zh: "朋友圈生图", en: "Moments images" },
    lifeKind: "moments_image",
    maxSurfaceRefs: 3,
  }),
  character_world: Object.freeze({
    id: "character_world",
    groupId: "pg-visual-world",
    label: { zh: "角色世界生图", en: "World images" },
    lifeKind: "world_image",
    maxSurfaceRefs: 3,
  }),
});

export const SURFACE_GROUP_IDS = Object.freeze({
  chat: GEN_SURFACES.chat.groupId,
  moments: GEN_SURFACES.moments.groupId,
  character_world: GEN_SURFACES.character_world.groupId,
});

/** Prefer these identity slots first when packing 角色画像. */
export const IDENTITY_PACK_PRIORITY = Object.freeze([
  "front",
  "face_closeup",
  "bust",
  "full_body",
  "left_3q",
  "right_3q",
  "outfit_default",
  "body_ref",
  "expression_neutral",
  "expression_smile",
  "selfie_ref",
  "pet_ref",
  "expression_sad",
  "other_identity",
]);

export function resolveGenSurface(surface = "") {
  const key = String(surface || "").trim();
  return GEN_SURFACES[key] || null;
}

export function isSurfaceGroupId(groupId = "") {
  return Object.values(SURFACE_GROUP_IDS).includes(String(groupId || ""));
}

export function surfaceForGroupId(groupId = "") {
  const id = String(groupId || "");
  for (const surface of Object.values(GEN_SURFACES)) {
    if (surface.groupId === id) return surface.id;
  }
  return "";
}

/** Extended group id map used by gallery + bridge. */
export function allVisualGroupIds() {
  return {
    ...VISUAL_GROUP_IDS,
    chat: SURFACE_GROUP_IDS.chat,
    moments: SURFACE_GROUP_IDS.moments,
    character_world: SURFACE_GROUP_IDS.character_world,
  };
}

export function kindForSurfaceSave(surface = "") {
  const cfg = resolveGenSurface(surface);
  return cfg?.lifeKind || defaultKindForNamespace("life");
}

export function normalizeSurfaceAsset(input = {}, surface = "chat") {
  const cfg = resolveGenSurface(surface) || GEN_SURFACES.chat;
  return normalizeVisualAsset({
    ...input,
    namespace: "life",
    kind: input.kind || cfg.lifeKind,
  });
}

export { IDENTITY_KINDS };
