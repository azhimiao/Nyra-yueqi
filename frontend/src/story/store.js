/**
 * E1 剧章 store — yueqi.story.v1
 */

import { CH1_MISSING_PAGE } from "./chapters/ch1-missing-page.js";
import { normalizeProgress } from "./engine.js";
import { validateChapter } from "./schema.js";

export const STORY_STORE_KEY = "yueqi.story.v1";

const BUILTIN = Object.freeze([CH1_MISSING_PAGE]);

function nowIso() {
  return new Date().toISOString();
}

function readRaw() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    return JSON.parse(window.localStorage.getItem(STORY_STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORY_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function listChapters() {
  return BUILTIN.map((ch) => ({ ...ch }));
}

export function getChapter(id) {
  return listChapters().find((ch) => ch.id === id) || null;
}

export function loadProgress() {
  return normalizeProgress(readRaw().progress);
}

export function saveProgress(partial = {}) {
  const prev = loadProgress();
  const next = normalizeProgress({
    ...prev,
    ...partial,
    updatedAt: nowIso(),
  });
  const bag = readRaw();
  bag.progress = next;
  writeBag(bag);
  return next;
}

export function isChapterCompleted(chapterId) {
  return loadProgress().completedChapterIds.includes(String(chapterId || ""));
}

export function getResumeNodeId(chapterId) {
  const progress = loadProgress();
  if (progress.activeChapterId === chapterId && progress.activeNodeId) {
    const chapter = getChapter(chapterId);
    if (chapter?.nodes?.some((n) => n.id === progress.activeNodeId)) {
      return progress.activeNodeId;
    }
  }
  return null;
}

export function startChapter(chapterId) {
  const chapter = getChapter(chapterId);
  if (!chapter) return null;
  const v = validateChapter(chapter);
  if (!v.ok) return null;
  return saveProgress({
    activeChapterId: chapter.id,
    activeNodeId: chapter.startNodeId,
  });
}

export function resetChapterProgress(chapterId) {
  const progress = loadProgress();
  const id = String(chapterId || "").trim();
  return saveProgress({
    activeChapterId: progress.activeChapterId === id ? "" : progress.activeChapterId,
    activeNodeId: progress.activeChapterId === id ? "" : progress.activeNodeId,
    completedChapterIds: progress.completedChapterIds.filter((item) => item !== id),
  });
}

export function markChapterCompleted(chapterId) {
  const id = String(chapterId || "").trim();
  if (!id) return loadProgress();
  const progress = loadProgress();
  const completed = [...new Set([...progress.completedChapterIds, id])];
  return saveProgress({
    activeChapterId: id,
    activeNodeId: "",
    completedChapterIds: completed,
  });
}

export function setActiveNode(chapterId, nodeId) {
  return saveProgress({
    activeChapterId: String(chapterId || ""),
    activeNodeId: String(nodeId || ""),
  });
}

/** Backup helper */
export function exportStoryBag() {
  return { progress: loadProgress() };
}

export function importStoryBag(payload) {
  if (!payload || typeof payload !== "object") return;
  writeBag({ progress: normalizeProgress(payload.progress) });
}
