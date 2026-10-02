/**
 * Bridge legacy yueqi.library.v1 photo groups → Visual Memory buckets.
 * Does not delete media or library; ensures semantic + surface gen groups exist.
 */

import {
  readLibrary,
  writeLibrary,
  listPhotos,
  ensureAiPhotoGroup,
} from "../phone-shell/phone-data.js";
import {
  VISUAL_GROUP_IDS,
  NAMESPACE_LABELS,
} from "./schema.js";
import { GEN_SURFACES } from "./surfaces.js";
import { registerLibraryPhotoAsVisual, getCompanionVisualBag, listRelationshipVisuals } from "./store.js";

export const RELATIONSHIP_VIEW_ID = "pg-visual-relationship";

const SEMANTIC_GROUPS = [
  { id: VISUAL_GROUP_IDS.identity, nameKey: "identity" },
  { id: VISUAL_GROUP_IDS.life, nameKey: "life" },
  { id: VISUAL_GROUP_IDS.userShared, nameKey: "user_shared" },
];

const SURFACE_GROUPS = Object.values(GEN_SURFACES).map((surface) => ({
  id: surface.groupId,
  nameKey: surface.id,
  surface: surface.id,
}));

const ALL_CORE = [...SEMANTIC_GROUPS, ...SURFACE_GROUPS];

function labelFor(namespace, locale = "zh") {
  const row = NAMESPACE_LABELS[namespace];
  if (!row) return namespace;
  return locale === "en" ? row.en : row.zh;
}

function ensureLockedGroups({ locale = "zh" } = {}) {
  ensureAiPhotoGroup();
  const library = readLibrary();
  const groups = [...(library.photoGroups || [])];
  const byId = new Map(groups.map((g) => [g.id, g]));
  let changed = false;

  for (const def of ALL_CORE) {
    const name = labelFor(def.nameKey, locale);
    const found = byId.get(def.id);
    if (!found) {
      groups.push({
        id: def.id,
        name,
        createdAt: new Date().toISOString(),
        semantic: def.surface ? "life" : def.nameKey,
        surface: def.surface || "",
        locked: true,
      });
      changed = true;
    } else if (
      found.name !== name
      || found.locked !== true
      || (def.surface && found.surface !== def.surface)
    ) {
      found.name = name;
      found.semantic = def.surface ? "life" : def.nameKey;
      found.surface = def.surface || found.surface || "";
      found.locked = true;
      changed = true;
    }
  }

  const ai = groups.find((g) => g.id === "pg-ai-studio");
  if (ai && (ai.semantic !== "life" || ai.parentSemantic !== "life")) {
    ai.semantic = "life";
    ai.parentSemantic = "life";
    ai.locked = true;
    changed = true;
  }

  if (changed) writeLibrary({ photoGroups: groups });
  return readLibrary().photoGroups || [];
}

/** Ensure Identity / Life / UserShared + chat/moments/world gen groups exist. */
export function ensureVisualMemoryGroups({ locale = "zh" } = {}) {
  return ensureLockedGroups({ locale });
}

/**
 * Groups shown in gallery UI.
 */
export function listSemanticGalleryGroups({
  locale = "zh",
  includeAiStudio = true,
  includeRelationshipView = true,
  includeSurfaceGroups = true,
  companionId = "",
} = {}) {
  ensureLockedGroups({ locale });

  const library = readLibrary();
  const photos = library.photos || [];
  const byId = new Map((library.photoGroups || []).map((g) => [g.id, g]));

  const core = SEMANTIC_GROUPS.map((def) => {
    const g = byId.get(def.id) || { id: def.id, name: labelFor(def.nameKey, locale) };
    return {
      ...g,
      name: labelFor(def.nameKey, locale),
      semantic: def.nameKey,
      locked: true,
      // Only identity refs are required for likeness / selfie generation.
      required: def.nameKey === "identity",
      count: photos.filter((p) => p.groupId === def.id).length,
    };
  });

  const extras = [];

  if (includeSurfaceGroups) {
    for (const def of SURFACE_GROUPS) {
      const g = byId.get(def.id) || { id: def.id, name: labelFor(def.nameKey, locale) };
      extras.push({
        ...g,
        name: labelFor(def.nameKey, locale),
        semantic: "life",
        surface: def.surface,
        locked: true,
        count: photos.filter((p) => p.groupId === def.id).length,
      });
    }
  }

  if (includeRelationshipView) {
    const relCount = companionId
      ? listRelationshipVisuals(companionId).length
      : photos.filter((p) => p.groupId === VISUAL_GROUP_IDS.userShared
        || p.groupId === VISUAL_GROUP_IDS.life).length;
    extras.push({
      id: RELATIONSHIP_VIEW_ID,
      name: labelFor("relationship", locale),
      semantic: "relationship",
      locked: true,
      virtual: true,
      count: relCount,
      createdAt: new Date().toISOString(),
    });
  }

  if (includeAiStudio && byId.has("pg-ai-studio")) {
    const ai = byId.get("pg-ai-studio");
    extras.push({
      ...ai,
      semantic: "life",
      parentSemantic: "life",
      locked: true,
      count: photos.filter((p) => p.groupId === "pg-ai-studio").length,
    });
  }

  const reserved = new Set([
    ...SEMANTIC_GROUPS.map((d) => d.id),
    ...SURFACE_GROUPS.map((d) => d.id),
    "pg-ai-studio",
    RELATIONSHIP_VIEW_ID,
  ]);
  for (const g of library.photoGroups || []) {
    if (reserved.has(g.id)) continue;
    extras.push({
      ...g,
      semantic: g.semantic || "custom",
      locked: Boolean(g.locked),
      count: photos.filter((p) => p.groupId === g.id).length,
    });
  }

  return [...core, ...extras];
}

/**
 * Backfill visual-memory index from existing library photos for a companion.
 * Only refreshes assets already owned by this companion — never copies the
 * device-global album into another character's bag.
 */
export function syncLibraryIntoVisualMemory(companionId, { locale = "zh" } = {}) {
  const id = String(companionId || "").trim();
  if (!id) return getCompanionVisualBag("");
  ensureVisualMemoryGroups({ locale });
  const ownedMedia = new Set(
    getCompanionVisualBag(id).assets.map((a) => a.mediaId).filter(Boolean),
  );
  const photos = listPhotos().filter((photo) => {
    if (!photo?.mediaId) return false;
    if (ownedMedia.has(photo.mediaId)) return true;
    // Allow first-time bind only when photo is explicitly tagged for this companion.
    return String(photo.companionId || "").trim() === id;
  });
  for (const photo of photos) {
    registerLibraryPhotoAsVisual(photo, {
      companionId: id,
      sourceType: "library_sync",
      allowCreate: String(photo.companionId || "").trim() === id,
      contextSummary: photo.summary || "",
    });
  }
  return getCompanionVisualBag(id);
}

export { VISUAL_GROUP_IDS, NAMESPACE_LABELS, GEN_SURFACES };
