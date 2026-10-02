import { LOCAL_KEYS } from "../constants.js";
import { t } from "../i18n/index.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

const UNREAD_PROGRESS = /^(未读|待读|已导入|unread|to-?read|imported)?$/i;
const LIVED_PROGRESS = /在读|读完|已读完|reading|finished|\d+\s*%/i;
const LIVED_PLACE = /第\s*\d+|Chapter\s*\d+/i;

export function normalizeCoReadAnchor(anchor = {}) {
  const src = anchor && typeof anchor === "object" ? anchor : {};
  const excerpt = String(src.excerpt || "").trim();
  if (!excerpt && !src.title) return null;
  return {
    title: String(src.title || "").trim() || t("phone.read.currentBook"),
    author: String(src.author || "").trim() || "",
    chapter: String(src.chapter || src.progress || "").trim() || t("phone.read.currentPlace"),
    progress: String(src.progress || src.chapter || "").trim() || t("phone.read.reading"),
    excerpt: excerpt.slice(0, 480),
    lived: src.lived === true,
    updatedAt: src.updatedAt || new Date().toISOString(),
  };
}

/** Shelf seeds and unread catalog rows are not a shared reading session. */
export function isLivedCoReadAnchor(anchor = {}) {
  const normalized = normalizeCoReadAnchor(anchor);
  if (!normalized?.excerpt) return false;
  if (normalized.lived === true) return true;
  const progress = String(normalized.progress || "").trim();
  const chapter = String(normalized.chapter || "").trim();
  if (UNREAD_PROGRESS.test(progress)) return false;
  if (LIVED_PROGRESS.test(progress) || LIVED_PLACE.test(progress) || LIVED_PLACE.test(chapter)) return true;
  return false;
}

export function getCoReadAnchor() {
  const next = normalizeCoReadAnchor(readLocalObject(LOCAL_KEYS.coReadAnchorKey, null) || {});
  return isLivedCoReadAnchor(next) ? next : null;
}

export function saveCoReadAnchor(anchor) {
  const next = normalizeCoReadAnchor(anchor);
  if (!next) return null;
  writeLocalObject(LOCAL_KEYS.coReadAnchorKey, next);
  return next;
}

export function formatCoReadContextLine(anchor = getCoReadAnchor()) {
  const normalized = normalizeCoReadAnchor(anchor || {});
  if (!normalized || !isLivedCoReadAnchor(normalized)) return "";
  const where = normalized.chapter ? ` · ${normalized.chapter}` : "";
  return t("phone.read.contextLine", {
    title: normalized.title,
    where,
    excerpt: normalized.excerpt.slice(0, 120),
  });
}

export function formatCoReadQuoteMessage(excerpt, { title = "", chapter = "", opinion = "" } = {}) {
  const text = String(excerpt || "").trim();
  if (!text) return "";
  const head = title
    ? t("phone.read.quoteHeadTitled", {
      title,
      chapter: chapter ? ` · ${chapter}` : "",
    })
    : t("phone.read.quoteHeadPassage");
  const note = String(opinion || "").trim();
  if (note) {
    return t("phone.read.quoteWithOpinion", { head, text, note });
  }
  return t("phone.read.quoteAsk", { head, text });
}

export function formatContinueCoReadMessage(anchor = getCoReadAnchor()) {
  const normalized = normalizeCoReadAnchor(anchor || {});
  if (!normalized?.excerpt) return "";
  return t("phone.read.continueMessage", {
    title: normalized.title,
    chapter: normalized.chapter ? ` · ${normalized.chapter}` : "",
    excerpt: normalized.excerpt,
  });
}

/** Derive a short chapter/progress label from free text. */
export function chapterFromProgress(progress = "") {
  const text = String(progress || "").trim();
  if (!text) return "";
  const match = text.match(/(第?\s*\d+\s*章|[Cc]hapter\s*\d+|开篇|序章|尾声)/);
  return match?.[0]?.replace(/\s+/g, "") || text.slice(0, 24);
}
