import { enqueuePerceptionJob, summarizePhoto as summarizePhotoJob } from "../ai/perception.js";

export function normalizePhoto(photo = {}) {
  return {
    title: photo.title || "新图片",
    tone: photo.tone || "rose",
    mediaId: photo.mediaId || "",
    summary: photo.summary || "",
  };
}

export async function summarizePhotoOnImport(photo, mediaRecord, deps) {
  return enqueuePerceptionJob(async () => {
    const result = await summarizePhotoJob(photo, mediaRecord, deps);
    return {
      ...photo,
      summary: result.summary || photo.summary || "",
    };
  });
}
