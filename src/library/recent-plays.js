import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

const MAX_RECENT = 12;
const DEFAULT_N = 5;

const MOOD_RULES = [
  { re: /雨|夜|睡|低频|安静|慢/, mood: "安静", genre: "氛围" },
  { re: /通勤|日常|清晨|晨/, mood: "清醒", genre: "日常" },
  { re: /甜|暖|心动|恋/, mood: "温柔", genre: "抒情" },
  { re: /书|页|书店|阅读/, mood: "沉静", genre: "阅读配乐" },
];

export function inferTrackTags({ title = "", playlist = "", genre = "", mood = "" } = {}) {
  if (mood && genre) return { mood, genre };
  const blob = `${title} ${playlist} ${genre} ${mood}`;
  for (const rule of MOOD_RULES) {
    if (rule.re.test(blob)) {
      return {
        mood: mood || rule.mood,
        genre: genre || rule.genre,
      };
    }
  }
  return {
    mood: mood || "平静",
    genre: genre || (playlist ? String(playlist).slice(0, 12) : "未分类"),
  };
}

export function normalizeRecentPlay(entry = {}) {
  const tags = inferTrackTags(entry);
  return {
    title: String(entry.title || "").trim() || "未命名曲目",
    playlist: String(entry.playlist || "").trim() || "未分类",
    mediaId: String(entry.mediaId || ""),
    mood: tags.mood,
    genre: tags.genre,
    playedAt: entry.playedAt || new Date().toISOString(),
  };
}

export function getRecentPlays(limit = DEFAULT_N) {
  const list = readLocalObject(LOCAL_KEYS.recentPlaysKey, []) || [];
  return (Array.isArray(list) ? list : []).slice(0, Math.max(0, limit)).map(normalizeRecentPlay);
}

export function pushRecentPlay(entry, { limit = MAX_RECENT } = {}) {
  const next = normalizeRecentPlay(entry);
  const prev = getRecentPlays(MAX_RECENT);
  const deduped = [
    next,
    ...prev.filter((item) => !(item.mediaId && next.mediaId && item.mediaId === next.mediaId)
      && !(item.title === next.title && item.playlist === next.playlist)),
  ].slice(0, limit);
  writeLocalObject(LOCAL_KEYS.recentPlaysKey, deduped);
  return deduped;
}

export function formatRecentPlaysContextLine(plays = getRecentPlays(DEFAULT_N), n = DEFAULT_N) {
  const list = (plays || []).slice(0, n);
  if (!list.length) return "";
  const body = list
    .map((item) => `${item.title}[${item.mood}/${item.genre}]`)
    .join("、");
  return `最近播放（${list.length}）：${body}`;
}
