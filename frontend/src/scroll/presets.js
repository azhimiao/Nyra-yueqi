/**
 * 漫卷不再附带任何默认角色/默认剧本。
 * 立绘与桌宠 / 头像 / 林星梨样例资产隔离。
 */

import { normalizeScrollPack, normalizeScrollWork, validateScrollWork } from "./schema.js";

/** @deprecated empty — no bundled works */
export const NIGHT_RAIN_SCROLL_ID = "";
export const NIGHT_RAIN_RETURN = null;
export const LATE_TRAIN_WHISPER = null;

const WORKS = [];

WORKS.forEach((work) => {
  const issues = validateScrollWork(work);
  if (issues.length) console.warn(`[scroll] 作品 ${work.id} 校验异常`, issues);
});

export function listScrollWorks() {
  return WORKS.map((work) => ({
    id: work.id,
    title: work.title,
    subtitle: work.subtitle,
    synopsis: work.synopsis,
    tags: work.tags,
    accent: work.accent,
    cover: work.cover,
    chapterCount: work.chapters.length,
  }));
}

export function getScrollWork(workId) {
  const id = String(workId || "").trim();
  return WORKS.find((work) => work.id === id) || null;
}

export function getScrollChapter(work, chapterId) {
  if (!work) return null;
  const id = String(chapterId || "").trim();
  return work.chapters.find((chapter) => chapter.id === id) || work.chapters[0] || null;
}

export function listBundledScrollPacks() {
  return [];
}

export function getBundledScrollPack() {
  return null;
}

// Keep schema helpers reachable for tests / tooling without shipping content.
void normalizeScrollPack;
void normalizeScrollWork;
