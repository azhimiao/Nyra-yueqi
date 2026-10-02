/**
 * E7 games score store — yueqi.games.v1
 */
import { t } from "../i18n/index.js";

export const GAMES_STORE_KEY = "yueqi.games.v1";

const GAME_IDS = ["match-pairs", "tap-rhythm"];

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { scores: {} };
    return JSON.parse(window.localStorage.getItem(GAMES_STORE_KEY) || "{}") || { scores: {} };
  } catch {
    return { scores: {} };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(GAMES_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @returns {{ scores: Record<string, { high: number, last: number, plays: number, updatedAt: string }> }}
 */
export function loadGamesBag() {
  const bag = readBag();
  if (!bag.scores || typeof bag.scores !== "object") bag.scores = {};
  return bag;
}

export function getGameScore(gameId) {
  const id = String(gameId || "");
  const row = loadGamesBag().scores[id];
  return {
    high: Number(row?.high) || 0,
    last: Number(row?.last) || 0,
    plays: Number(row?.plays) || 0,
    updatedAt: String(row?.updatedAt || ""),
  };
}

export function recordGameScore(gameId, score) {
  const id = String(gameId || "").trim();
  if (!GAME_IDS.includes(id)) return getGameScore(id);
  const bag = loadGamesBag();
  const prev = getGameScore(id);
  const value = Math.max(0, Math.floor(Number(score) || 0));
  bag.scores[id] = {
    high: Math.max(prev.high, value),
    last: value,
    plays: prev.plays + 1,
    updatedAt: nowIso(),
  };
  writeBag(bag);
  return bag.scores[id];
}

export function listGameMeta() {
  return [
    {
      id: "match-pairs",
      title: t("games.matchPairs"),
      blurb: t("games.builtins.matchPairsBlurb"),
      tone: "mint",
    },
    {
      id: "tap-rhythm",
      title: t("games.tapRhythm"),
      blurb: t("games.builtins.tapRhythmBlurb"),
      tone: "coral",
    },
  ];
}

export function exportGamesBag() {
  return loadGamesBag();
}

export function importGamesBag(payload) {
  if (!payload || typeof payload !== "object") return;
  const scores = payload.scores && typeof payload.scores === "object" ? payload.scores : {};
  writeBag({ scores });
}
