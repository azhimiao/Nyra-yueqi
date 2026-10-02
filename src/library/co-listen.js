/**
 * 月栖 · 共听（一起听）本地状态协议
 * 字段约定供 prompt 注入与聊天系统条共用。
 */

import { t } from "../i18n/index.js";

/** Canonical persisted defaults (locale-neutral; localize at display time). */
export const STORED_DEFAULT_TRACK_TITLE = "未命名曲目";
export const STORED_DEFAULT_PLAYLIST = "未分类";
/** Marker for locally imported tracks — never store translated UI copy. */
export const STORED_LOCAL_IMPORT_PLAYLIST = "__local_import__";

const LOCAL_IMPORT_LABELS = new Set(["本地导入", "Local import", STORED_LOCAL_IMPORT_PLAYLIST]);

export function isStoredDefaultTrackTitle(title) {
  const raw = String(title || "").trim();
  return !raw || raw === STORED_DEFAULT_TRACK_TITLE;
}

/** @returns {{ artist: string }|null} */
export function parseLocalImportPlaylist(playlist) {
  const raw = String(playlist || "").trim();
  if (!raw) return null;
  if (LOCAL_IMPORT_LABELS.has(raw)) return { artist: "" };
  const match = raw.match(/^(.+?) · (本地导入|Local import|__local_import__)$/);
  if (!match) return null;
  return { artist: String(match[1] || "").trim() };
}

export function storedLocalImportPlaylist(artist = "") {
  const name = String(artist || "").trim();
  return name ? `${name} · ${STORED_LOCAL_IMPORT_PLAYLIST}` : STORED_LOCAL_IMPORT_PLAYLIST;
}

/** Normalize playlist names written in either UI language into storage form. */
export function canonicalizePlaylistName(playlist) {
  const raw = String(playlist || "").trim();
  if (!raw || raw === STORED_DEFAULT_PLAYLIST || raw === "Uncategorized") {
    return STORED_DEFAULT_PLAYLIST;
  }
  const local = parseLocalImportPlaylist(raw);
  if (local) return storedLocalImportPlaylist(local.artist);
  return raw;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function buildCoListenState({
  title = "",
  playlist = "",
  mediaId = "",
  trackId = "",
  positionSec = 0,
  durationSec = 0,
  paused = true,
  coListen = true,
  updatedAt = Date.now(),
} = {}) {
  return {
    title: String(title || "").trim() || STORED_DEFAULT_TRACK_TITLE,
    playlist: canonicalizePlaylistName(playlist),
    mediaId: String(mediaId || ""),
    trackId: String(trackId || ""),
    positionSec: Math.max(0, Number(positionSec) || 0),
    durationSec: Math.max(0, Number(durationSec) || 0),
    paused: Boolean(paused),
    coListen: coListen !== false,
    updatedAt: Number(updatedAt) || Date.now(),
  };
}

/** Persist / restore co-listen snapshot — never throws on bad input. */
export function normalizeCoListenState(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return buildCoListenState({
    title: src.title,
    playlist: src.playlist,
    mediaId: src.mediaId,
    trackId: src.trackId,
    positionSec: src.positionSec,
    durationSec: src.durationSec,
    paused: src.paused == null ? true : Boolean(src.paused),
    coListen: src.coListen == null ? true : src.coListen !== false && src.coListen !== "false",
    updatedAt: src.updatedAt,
  });
}

export function snapshotFromAudio(audio, base = {}) {
  if (!audio) {
    return buildCoListenState({ ...base, paused: true, positionSec: 0, durationSec: 0 });
  }
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  return buildCoListenState({
    ...base,
    positionSec: audio.currentTime || 0,
    durationSec: duration > 0 ? duration : base.durationSec || 0,
    paused: audio.paused,
    updatedAt: Date.now(),
  });
}

export function formatCoListenProgress(state) {
  if (!state?.title) return "";
  const pos = formatClock(state.positionSec);
  const dur = state.durationSec > 0 ? formatClock(state.durationSec) : "--:--";
  return `${pos} / ${dur}`;
}

function displayPlaylistForContext(playlist) {
  const raw = String(playlist || "").trim();
  if (!raw || raw === STORED_DEFAULT_PLAYLIST || raw === "Uncategorized") {
    return t("listen.uncategorized");
  }
  const local = parseLocalImportPlaylist(raw);
  if (local) {
    return local.artist
      ? t("listen.localImportArtist", { artist: local.artist })
      : t("listen.localImport");
  }
  return raw;
}

/** 注入外部上下文 / prompt 的一行 */
export function formatCoListenContextLine(state) {
  if (!state?.title || state.coListen === false) return "";
  const status = state.paused ? t("listen.paused") : t("listen.playing");
  const progress = formatCoListenProgress(state);
  const playlistLabel = displayPlaylistForContext(state.playlist);
  const playlist = playlistLabel ? ` · ${playlistLabel}` : "";
  return t("listen.contextLine", {
    title: state.title,
    playlist,
    status,
    progress,
  });
}

/** 聊天系统条文案 */
export function formatCoListenChatNotice(state, reason = "update") {
  if (!state?.title || state.coListen === false) return "";
  const progress = formatCoListenProgress(state);
  const title = state.title;
  if (reason === "track") {
    return t("listen.noticeTrack", { title, progress });
  }
  if (reason === "pause") {
    return t("listen.noticePause", { title, progress });
  }
  if (reason === "resume") {
    return t("listen.noticeResume", { title, progress });
  }
  if (reason === "enable") {
    return t("listen.noticeEnable", { title, progress });
  }
  if (reason === "disable") {
    return t("listen.noticeDisable");
  }
  return t("listen.noticeUpdate", { title, progress });
}

/** 一键告诉 TA 的用户消息 */
export function formatCoListenTellMessage(state) {
  if (!state?.title) return "";
  const line = formatCoListenContextLine({ ...state, coListen: true });
  return t("listen.tellMessageBody", { line });
}

/** range 0–1000 ↔ seconds */
export function progressRatio(state) {
  if (!state?.durationSec || state.durationSec <= 0) return 0;
  return Math.min(1000, Math.max(0, Math.round((state.positionSec / state.durationSec) * 1000)));
}

export function positionFromRatio(ratio, durationSec) {
  const dur = Math.max(0, Number(durationSec) || 0);
  return (Math.min(1000, Math.max(0, Number(ratio) || 0)) / 1000) * dur;
}
export function resolveCoListenAnnounce(prev, next, { enabledChanged = null } = {}) {
  if (!next) return null;
  if (enabledChanged === false) {
    return { reason: "disable", state: next };
  }
  if (next.coListen === false) return null;
  if (enabledChanged === true && next.title) {
    return { reason: "enable", state: next };
  }
  if (!prev || prev.mediaId !== next.mediaId || prev.title !== next.title) {
    if (next.title && !next.paused) return { reason: "track", state: next };
    if (next.title && prev && (prev.mediaId !== next.mediaId || prev.title !== next.title)) {
      return { reason: "track", state: next };
    }
  }
  if (prev && prev.paused !== next.paused) {
    return { reason: next.paused ? "pause" : "resume", state: next };
  }
  return null;
}
