/**
 * Companion listen-play from chat intent.
 * Seeds catalog → picks a real track → asks the listen player to autoplay.
 * Speech must follow the action result (no roleplay-only “正在放歌”).
 */

import { LOCAL_KEYS } from "../constants.js";
import { writeLocalObject } from "../lib/utils.js";
import { buildCoListenState } from "../library/co-listen.js";
import { ensureBuiltinTracks, BUILTIN_TRACKS } from "../library/builtin-catalog.js";
import { listTracks } from "../phone-shell/phone-data.js";

const LISTEN_PLAY_PATTERNS = [
  /(?:播放|放|听).{0,10}(?:音乐|歌|曲子|曲目|曲)/,
  /放首歌|来点音乐|播首歌|听首歌|放点音乐/,
  /一起听/,
  /play\s+(some\s+)?(music|a\s+song|songs?)/i,
  /put\s+on\s+(some\s+)?music/i,
  /(?:can\s+you\s+)?play\s+music/i,
];

const LISTEN_VIEW_ONLY = /(?:打开|去).{0,4}一起听|(?:open).{0,8}listen/i;

/** Prefer gentle piano for sleep / calm asks; otherwise first catalog picks. */
const SOFT_TRACK_IDS = Object.freeze([
  "nyra.music.satie.gymnopedie1",
  "nyra.music.chopin.nocturne.op9n2",
  "nyra.music.beethoven.moonlight.i",
]);

const DEFAULT_TRACK_IDS = Object.freeze([
  "nyra.music.satie.gymnopedie1",
  "nyra.music.bach.bwv1007.prelude",
  "nyra.music.chopin.nocturne.op9n2",
  "nyra.music.beethoven.moonlight.i",
]);

export const LISTEN_PLAY_EVENT = "yueqi:listen-play-request";

/**
 * @param {string} text
 */
export function detectListenPlayIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (LISTEN_VIEW_ONLY.test(raw) && !/(?:播放|放歌|听歌|play)/i.test(raw)) return false;
  if (/日记|自拍|拍照|视频通话/.test(raw)) return false;
  return LISTEN_PLAY_PATTERNS.some((re) => re.test(raw));
}

function shortTrackLabel(title) {
  const raw = String(title || "").trim();
  if (!raw) return "这首";
  // "Artist — Title" → Title when long
  const parts = raw.split(/\s+[—–-]\s+/);
  const label = parts.length > 1 ? parts[parts.length - 1] : raw;
  return label.slice(0, 40);
}

/**
 * @param {object[]} tracks
 * @param {string} [userText]
 */
export function pickCompanionListenTrack(tracks = [], userText = "") {
  const list = (Array.isArray(tracks) ? tracks : []).filter((row) => row && (row.id || row.sourceUrl || row.mediaId));
  if (!list.length) return null;
  const soft = /睡|休息|安静|舒缓|轻柔|夜|night|sleep|calm|soft|quiet/i.test(String(userText || ""));
  const order = soft ? SOFT_TRACK_IDS : DEFAULT_TRACK_IDS;
  for (const id of order) {
    const hit = list.find((row) => String(row.id) === id);
    if (hit) return hit;
  }
  return list.find((row) => row.mediaId) || list[0];
}

/**
 * @param {{
 *   userText?: string,
 *   companionId?: string,
 *   openApp?: boolean,
 *   autoplay?: boolean,
 *   ensureTracksFn?: () => unknown,
 *   listTracksFn?: () => object[],
 * }} opts
 */
export async function requestCompanionListen(opts = {}) {
  const ensureFn = typeof opts.ensureTracksFn === "function" ? opts.ensureTracksFn : ensureBuiltinTracks;
  const listFn = typeof opts.listTracksFn === "function" ? opts.listTracksFn : listTracks;
  try {
    ensureFn();
  } catch (error) {
    return {
      ok: false,
      reason: "CATALOG_FAILED",
      message: `歌单还没准备好：${String(error?.message || error).slice(0, 120)}`,
    };
  }

  let tracks = [];
  try {
    tracks = listFn() || [];
  } catch {
    tracks = [];
  }
  // Catalog seed may have just written; fall back to static ids for the event.
  const track = pickCompanionListenTrack(tracks, opts.userText)
    || (BUILTIN_TRACKS[0]
      ? {
        id: BUILTIN_TRACKS[0].id,
        title: `${BUILTIN_TRACKS[0].artist} — ${BUILTIN_TRACKS[0].title}`,
        playlist: BUILTIN_TRACKS[0].playlist,
        sourceUrl: BUILTIN_TRACKS[0].sourceUrl,
      }
      : null);

  if (!track?.id) {
    return {
      ok: false,
      reason: "NO_TRACKS",
      message: "歌单还空着。你可以先打开「一起听」导入音频，或等精选曲目就绪。",
    };
  }

  const title = String(track.title || "").trim() || "未命名曲目";
  const playlist = String(track.playlist || "").trim() || "月栖精选";
  const detail = {
    trackId: String(track.id),
    title,
    playlist,
    mediaId: String(track.mediaId || ""),
    sourceUrl: String(track.sourceUrl || ""),
    companionId: String(opts.companionId || "").trim(),
    openApp: opts.openApp !== false,
    autoplay: opts.autoplay !== false,
  };

  try {
    writeLocalObject(LOCAL_KEYS.coListenStateKey, buildCoListenState({
      title,
      playlist,
      mediaId: detail.mediaId,
      trackId: detail.trackId,
      paused: true,
      coListen: true,
    }));
  } catch {
    /* persist best-effort */
  }

  if (typeof document !== "undefined" && document.dispatchEvent) {
    document.dispatchEvent(new CustomEvent(LISTEN_PLAY_EVENT, { detail }));
  }

  const label = shortTrackLabel(title);
  return {
    ok: true,
    reason: "succeeded",
    message: `好呀，正在放《${label}》。想换或关掉随时跟我说。`,
    speech: `好呀，正在放《${label}》。想换或关掉随时跟我说。`,
    trackId: detail.trackId,
    title,
    playlist,
    mediaId: detail.mediaId,
    deepLink: "yueqi://phone/listen",
  };
}
