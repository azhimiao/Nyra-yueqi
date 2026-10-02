/**
 * Unified media + album ingest for generated images (F6 / G1).
 */

import { storeRecord } from "../storage/db.js";
import { persistMediaFile } from "../platform/media-files.js";
import { AI_GROUP_ID, AI_GROUP_NAME } from "../imagegen/constants.js";
import {
  addPhotoToGroup,
  listPhotoGroups,
  readLibrary,
  writeLibrary,
} from "../phone-shell/phone-data.js";

/**
 * Ensure stable AI album group exists.
 * @returns {{ id: string, name: string, createdAt: string }}
 */
export function ensureAiPhotoGroup() {
  const library = readLibrary();
  const groups = library.photoGroups || [];
  const existing = groups.find((g) => g.id === AI_GROUP_ID);
  if (existing) {
    if (existing.name !== AI_GROUP_NAME) {
      library.photoGroups = groups.map((g) => (
        g.id === AI_GROUP_ID ? { ...g, name: AI_GROUP_NAME } : g
      ));
      writeLibrary({ photoGroups: library.photoGroups });
      return library.photoGroups.find((g) => g.id === AI_GROUP_ID);
    }
    return existing;
  }
  const group = {
    id: AI_GROUP_ID,
    name: AI_GROUP_NAME,
    createdAt: new Date().toISOString(),
  };
  library.photoGroups = [...groups, group];
  writeLibrary({ photoGroups: library.photoGroups });
  return group;
}

/**
 * Persist blob into media store only (no album row).
 * @param {{ blob: Blob, name?: string, storeMediaFile?: Function }} opts
 */
export async function storeGeneratedMediaBlob(opts = {}) {
  const blob = opts.blob;
  if (!(blob instanceof Blob)) throw new Error("缺少图片数据");
  const mime = blob.type || "image/png";
  const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
  const base = String(opts.name || "ai-studio").replace(/\.[^.]+$/, "").slice(0, 40) || "ai-studio";
  const file = blob instanceof File ? blob : new File([blob], `${base}.${ext}`, { type: mime });

  if (typeof opts.storeMediaFile === "function") {
    return opts.storeMediaFile(file, "image");
  }

  const id = `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filePath = await persistMediaFile(id, file);
  const mediaRecord = {
    id,
    kind: "image",
    name: file.name,
    type: file.type || mime,
    size: file.size,
    createdAt: new Date().toISOString(),
    filePath: filePath || "",
    blob: filePath ? null : file,
  };
  await storeRecord("media", mediaRecord);
  return mediaRecord;
}

/**
 * Store media + add library photo in AI / specified group.
 * @param {{
 *   blob: Blob,
 *   title?: string,
 *   summary?: string,
 *   groupId?: string,
 *   mediaId?: string,
 *   storeMediaFile?: Function,
 * }} opts
 * @returns {Promise<{ mediaRecord: object, photo: object, mediaId: string }>}
 */
export async function importGeneratedImageBlob(opts = {}) {
  const groupId = String(opts.groupId || AI_GROUP_ID);
  if (groupId === AI_GROUP_ID) ensureAiPhotoGroup();
  else if (!listPhotoGroups().some((g) => g.id === groupId)) {
    ensureAiPhotoGroup();
  }

  let mediaRecord;
  if (opts.mediaRecord?.id) {
    mediaRecord = opts.mediaRecord;
  } else if (opts.mediaId && !opts.blob) {
    mediaRecord = { id: String(opts.mediaId), kind: "image" };
  } else if (opts.blob) {
    mediaRecord = await storeGeneratedMediaBlob({
      blob: opts.blob,
      name: opts.title,
      storeMediaFile: opts.storeMediaFile,
    });
  } else if (opts.mediaId) {
    mediaRecord = { id: String(opts.mediaId), kind: "image" };
  } else {
    throw new Error("缺少图片数据");
  }

  const resolvedGroupId = (groupId === AI_GROUP_ID || listPhotoGroups().some((g) => g.id === groupId))
    ? groupId
    : AI_GROUP_ID;
  const title = String(opts.title || "AI 创作").trim().slice(0, 24) || "AI 创作";
  const tones = ["rose", "green", "blue", "gold"];
  const photo = addPhotoToGroup(resolvedGroupId, {
    title,
    tone: tones[Math.floor(Math.random() * tones.length)],
    mediaId: mediaRecord.id,
    summary: String(opts.summary || "").slice(0, 200),
  });

  if (!photo) throw new Error("写入相册失败");

  return {
    mediaRecord,
    photo,
    mediaId: mediaRecord.id,
  };
}
