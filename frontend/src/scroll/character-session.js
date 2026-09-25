/**
 * 漫卷按角色会话存储（与内置作品 workId 会话并存）。
 */

export const SCROLL_CHAR_STORE_KEY = "yueqi.scroll.char.v1";

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { sessions: {} };
    const raw = JSON.parse(window.localStorage.getItem(SCROLL_CHAR_STORE_KEY) || "{}");
    return { sessions: raw?.sessions && typeof raw.sessions === "object" ? raw.sessions : {} };
  } catch {
    return { sessions: {} };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(SCROLL_CHAR_STORE_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

function emptySession(characterId) {
  return {
    characterId,
    chapterIndex: 0,
    chapterTitle: "第一章",
    frames: [],
    frameIndex: 0,
    options: null,
    ending: null,
    historyMessages: [],
    updatedAt: nowIso(),
  };
}

export function getCharacterScrollSession(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return emptySession("");
  const bag = readBag();
  const raw = bag.sessions[id];
  if (!raw || typeof raw !== "object") return emptySession(id);
  return {
    characterId: id,
    chapterIndex: Number(raw.chapterIndex) || 0,
    chapterTitle: String(raw.chapterTitle || "第一章").slice(0, 40),
    frames: Array.isArray(raw.frames) ? raw.frames : [],
    frameIndex: Math.max(0, Number(raw.frameIndex) || 0),
    options: Array.isArray(raw.options) ? raw.options : null,
    ending: raw.ending && typeof raw.ending === "object" ? raw.ending : null,
    historyMessages: Array.isArray(raw.historyMessages) ? raw.historyMessages.slice(-40) : [],
    updatedAt: String(raw.updatedAt || nowIso()),
  };
}

export function saveCharacterScrollSession(characterId, patch = {}) {
  const id = String(characterId || "").trim();
  if (!id) return { ok: false };
  const bag = readBag();
  const prev = getCharacterScrollSession(id);
  const next = {
    ...prev,
    ...patch,
    characterId: id,
    updatedAt: nowIso(),
  };
  bag.sessions[id] = next;
  return { ok: writeBag(bag), session: next };
}

export function clearCharacterScrollSession(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return false;
  const bag = readBag();
  delete bag.sessions[id];
  return writeBag(bag);
}

import { pushExperienceProjectionWithDelivery } from "../experience/projections-feed.js";

/** Minimal memory projection hook for chat / diary consumers. */
export function projectScrollMemory(characterId, summary, meta = {}) {
  void pushExperienceProjectionWithDelivery({
    kind: "scroll",
    characterId,
    entityId: String(meta.entityId || characterId || "").trim(),
    summary,
    meta: { appId: "scroll", ...meta },
  });
}
