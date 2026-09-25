/**
 * 栖机 · 一起听 — player UI + audio + persist (D3).
 */

import { LOCAL_KEYS } from "../constants.js";
import { escapeHtml, readLocalObject, writeLocalObject, shortFileTitle } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  formatClock,
  formatCoListenChatNotice,
  formatCoListenProgress,
  normalizeCoListenState,
  progressRatio,
  positionFromRatio,
  resolveCoListenAnnounce,
  snapshotFromAudio,
} from "../library/co-listen.js";
import {
  createCoListenTabId,
  publishCoListenState,
  subscribeCoListenState,
} from "../library/co-listen-sync.js";
import { pushRecentPlay } from "../library/recent-plays.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import {
  isListenAdapterEnabled,
  recordListenProgress,
  endListenSession,
} from "../memory/adapters/listen.js";
import { importAudioResource } from "../portability/resources/audio.js";
import {
  downloadBuiltinTrack,
  ensureBuiltinTracks,
  resolveTrackCacheState,
  formatCacheBytes,
} from "../library/builtin-catalog.js";
import { messageForPortabilityError } from "../portability/errors.js";
import { getAllRecords } from "../storage/db.js";
import { readMediaBlob, resolveNativeFileUrl } from "../platform/media-files.js";
import {
  listTracks,
  ensureTrackIds,
  addTrack,
  removeTrack,
  updateTrack,
  displayTrackTitle,
  displayPlaylistName,
  storedLocalImportPlaylist,
  canonicalizePlaylistName,
  STORED_DEFAULT_TRACK_TITLE,
  STORED_DEFAULT_PLAYLIST,
} from "./phone-data.js";
import { setSwitchState, isSwitchOn } from "./phone-controls.js";
import { getActiveCharacterId } from "../characters/store.js";
import { pt, t } from "./i18n.js";

const STATE_KEY = () => LOCAL_KEYS.coListenStateKey;
const SHEET_COLLAPSED_KEY = "yueqi.listen.sheetCollapsed";
const SHEET_LAYOUT_VERSION_KEY = "yueqi.listen.sheetLayout.v2";

function loadPersistedState() {
  return normalizeCoListenState(readLocalObject(STATE_KEY(), null) || {});
}

function savePersistedState(state) {
  const next = normalizeCoListenState(state);
  writeLocalObject(STATE_KEY(), next);
  return next;
}

function readSheetCollapsed() {
  try {
    // The playlist is a secondary drawer. Older builds opened it by default,
    // which pushed the primary playback controls below the first viewport.
    // Migrate the layout once while still respecting subsequent user choices.
    if (localStorage.getItem(SHEET_LAYOUT_VERSION_KEY) !== "1") {
      localStorage.setItem(SHEET_LAYOUT_VERSION_KEY, "1");
      localStorage.setItem(SHEET_COLLAPSED_KEY, "1");
      return true;
    }
    return localStorage.getItem(SHEET_COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeSheetCollapsed(collapsed) {
  try {
    localStorage.setItem(SHEET_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

async function resolveTrackUrl(mediaId, getMediaRecord) {
  if (!mediaId) return "";
  try {
    const record = getMediaRecord
      ? await getMediaRecord(mediaId)
      : (await getAllRecords("media")).find((row) => row.id === mediaId) || null;
    if (!record) return "";
    if (record.filePath) {
      const nativeUrl = await resolveNativeFileUrl(record.filePath);
      if (nativeUrl) return nativeUrl;
    }
    const blob = await readMediaBlob(record);
    if (blob) return URL.createObjectURL(blob);
    if (record.url) return String(record.url);
  } catch {
    /* offline / missing */
  }
  return "";
}

/**
 * @param {HTMLElement} root screen root `[data-phone-screen="listen"]`
 * @param {object} deps
 */
export function mountPhoneListen(root, deps = {}) {
  if (!root) return { open() {}, destroy() {} };

  const {
    getMediaRecord = null,
    getNowPlaying = null,
    setNowPlaying = null,
    storeMediaFile = null,
    onAnnounce = null,
  } = deps;

  const audio = root.querySelector("[data-listen-audio]") || document.createElement("audio");
  if (!audio.isConnected) {
    audio.setAttribute("data-listen-audio", "");
    audio.hidden = true;
    root.append(audio);
  }

  const trackEl = root.querySelector("[data-listen-track]");
  const playlistEl = root.querySelector("[data-listen-playlist]");
  const seekEl = root.querySelector("[data-listen-seek]");
  const posEl = root.querySelector("[data-listen-pos]");
  const durEl = root.querySelector("[data-listen-dur]");
  const playBtn = root.querySelector("[data-listen-play]");
  const coSwitch = root.querySelector("[data-listen-colisten]");
  const hintEl = root.querySelector("[data-listen-hint]");
  const feed = root.querySelector("[data-phone-tracks]");
  const stage = root.querySelector(".mini-listen-stage");
  const vinylLabel = root.querySelector("[data-listen-vinyl-label]");
  const sheet = root.querySelector("[data-listen-sheet]");
  const sheetToggle = root.querySelector("[data-listen-sheet-toggle]");
  const trackCountEl = root.querySelector("[data-listen-track-count]");
  const editBtn = root.querySelector("[data-listen-edit]");
  const importBtn = root.querySelector("[data-listen-import]");
  const fileInput = root.querySelector("[data-listen-file]");

  let state = loadPersistedState();
  let objectUrl = "";
  let seeking = false;
  let persistTimer = 0;
  let lastAnnounce = null;
  let editing = false;
  let sheetCollapsed = readSheetCollapsed();
  const tabId = createCoListenTabId();
  let applyingRemote = false;

  function tintVinylLabel(title = "") {
    if (!vinylLabel) return;
    const seed = String(title || "yueqi");
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    const hue = Math.abs(hash) % 360;
    vinylLabel.style.background = `linear-gradient(145deg, hsl(${hue} 42% 62%), hsl(${(hue + 40) % 360} 38% 42%))`;
  }

  function syncSheetChrome() {
    sheet?.classList.toggle("is-collapsed", sheetCollapsed);
    sheet?.classList.toggle("is-editing", editing);
    root.classList.toggle("is-listen-editing", editing);
    if (sheetToggle) sheetToggle.setAttribute("aria-expanded", sheetCollapsed ? "false" : "true");
    if (editBtn) {
      editBtn.classList.toggle("is-active", editing);
      editBtn.setAttribute("aria-label", editing ? pt("listen.doneEditing") : pt("listen.editPlaylist"));
      const icon = editBtn.querySelector("[data-lucide]");
      if (icon) icon.setAttribute("data-lucide", editing ? "check" : "pencil");
    }
    refreshIcons();
  }

  function syncPlayButton() {
    if (!playBtn) return;
    const canPlay = Boolean(state.mediaId || audio.src || state.trackId);
    playBtn.disabled = !canPlay && !listTracks().length;
    playBtn.classList.toggle("is-loading", playBtn.dataset.loading === "1");
    playBtn.classList.toggle("is-playing", !state.paused && Boolean(audio.src || state.mediaId));
    playBtn.setAttribute("aria-label", state.paused ? pt("listen.play") : pt("listen.pause"));
    const icon = playBtn.querySelector("[data-lucide]");
    if (icon) icon.setAttribute("data-lucide", state.paused ? "play" : "pause");
    refreshIcons();
  }

  function syncSeekUi() {
    if (seekEl && !seeking) {
      const indeterminate = !(state.durationSec > 0);
      seekEl.disabled = indeterminate || !state.mediaId;
      seekEl.value = String(progressRatio(state));
    }
    if (posEl) posEl.textContent = formatClock(state.positionSec);
    if (durEl) durEl.textContent = state.durationSec > 0 ? formatClock(state.durationSec) : "--:--";
  }

  function currentTrackFromStore() {
    const tracks = ensureTrackIds(listTracks());
    return tracks.find((row) => row.id === state.trackId)
      || tracks.find((row) => state.mediaId && row.mediaId === state.mediaId)
      || tracks.find((row) => state.title && row.title === state.title)
      || null;
  }

  function headerCacheSuffix(track) {
    if (!track) return "";
    const cacheState = resolveTrackCacheState(track);
    const pct = Math.max(0, Math.min(100, Number(track.cacheProgress) || 0));
    if (cacheState === "cached") return pt("listen.headerCached");
    if (cacheState === "downloading") {
      const streaming = state.mediaId || audio.src;
      const size = formatCacheBytes(track.cacheBytes);
      if (pct <= 0) {
        if (size) {
          return streaming
            ? pt("listen.headerStreamingBytes", { size })
            : pt("listen.headerDownloadingBytes", { size });
        }
        return streaming
          ? pt("listen.headerStreamingCaching")
          : pt("listen.headerCaching");
      }
      return streaming
        ? pt("listen.headerStreamingCache", { pct })
        : pt("listen.headerDownloading", { pct });
    }
    if (cacheState === "error") return pt("listen.headerError");
    if (cacheState === "queued") return pt("listen.headerQueued");
    if (track.sourceUrl) return pt("listen.headerRemote");
    return "";
  }

  function syncStage() {
    if (trackEl) {
      trackEl.textContent = (state.mediaId || state.trackId || state.title)
        ? displayTrackTitle(state.title)
        : pt("listen.pickTrack");
    }
    if (playlistEl) {
      const base = state.playlist
        ? displayPlaylistName(state.playlist)
        : pt("listen.localPlaylist");
      const suffix = headerCacheSuffix(currentTrackFromStore());
      playlistEl.textContent = suffix ? `${base} · ${suffix}` : base;
    }
    if (coSwitch) setSwitchState(coSwitch, state.coListen !== false);
    const playing = !state.paused && Boolean(audio.src || state.mediaId);
    stage?.classList.toggle("is-playing", playing);
    stage?.classList.toggle("is-idle", !(state.mediaId || state.trackId || state.title));
    tintVinylLabel(state.title);
    if (hintEl) {
      const hasSomething = Boolean(state.mediaId || state.trackId || listTracks().length);
      hintEl.hidden = hasSomething;
      hintEl.textContent = hasSomething ? "" : pt("listen.noAudioHint");
    }
    syncPlayButton();
    syncSeekUi();
    if (feed && !editing) {
      feed.querySelectorAll("[data-track-id]").forEach((row) => {
        row.classList.toggle("is-active", row.dataset.trackId === state.trackId
          || (state.title && row.querySelector("[data-track-title]")?.dataset?.trackTitle === state.title));
      });
    }
  }

  function persist(next, { announce = false, publish = true } = {}) {
    const prev = state;
    state = normalizeCoListenState({ ...state, ...next, updatedAt: Date.now() });
    savePersistedState(state);
    try {
      setNowPlaying?.(state);
    } catch {
      /* optional */
    }
    syncStage();
    if (publish && !applyingRemote) {
      publishCoListenState(tabId, state);
    }
    if (announce && !applyingRemote) {
      const resolved = resolveCoListenAnnounce(prev, state, {
        enabledChanged: prev.coListen !== state.coListen ? state.coListen : null,
      });
      if (resolved) {
        const text = formatCoListenChatNotice(resolved.state, resolved.reason);
        if (text && text !== lastAnnounce) {
          lastAnnounce = text;
          onAnnounce?.(text, resolved);
        }
      }
    }
  }

  function schedulePersist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      const snap = snapshotFromAudio(audio, state);
      persist(snap, { announce: false, publish: true });
    }, 400);
  }

  function clearPlayback() {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      objectUrl = "";
    }
    audio.removeAttribute("src");
    try { audio.load(); } catch { /* ignore */ }
  }

  function trackStatusLabel(track) {
    const state = resolveTrackCacheState(track);
    const pct = Math.max(0, Math.min(100, Number(track.cacheProgress) || 0));
    if (state === "cached") {
      const size = formatCacheBytes(track.cacheBytes);
      return size ? pt("listen.cachedWithSize", { size }) : pt("listen.cached");
    }
    if (state === "downloading") {
      if (pct > 0) return pt("listen.downloadingPct", { pct });
      const size = formatCacheBytes(track.cacheBytes);
      return size ? pt("listen.downloadingBytes", { size }) : pt("listen.downloading");
    }
    if (state === "queued") return pt("listen.queued");
    if (state === "error") return pt("listen.downloadFailRetry");
    return pt("listen.remoteHint");
  }

  function trackStatusIcon(track) {
    const state = resolveTrackCacheState(track);
    if (state === "cached") return "✓";
    if (state === "downloading") {
      const pct = Math.max(0, Number(track.cacheProgress) || 0);
      return pct > 0 ? `${pct}%` : "…";
    }
    if (state === "error") return "!";
    return "↓";
  }

  function renderTracks() {
    if (!feed) return;
    const tracks = ensureTrackIds(listTracks());
    if (trackCountEl) trackCountEl.textContent = pt("listen.trackCount", { count: tracks.length });

    if (!tracks.length) {
      feed.innerHTML = `
        <div class="mini-empty mini-listen-empty">
          <p>${escapeHtml(pt("listen.playlistEmpty"))}</p>
          <span>${escapeHtml(pt("listen.importHintCorner"))}</span>
          <button type="button" class="mini-app-cta" data-listen-import-empty>${escapeHtml(pt("listen.importAudio"))}</button>
        </div>`;
      refreshIcons();
      return;
    }

    feed.innerHTML = tracks.map((track) => {
      const active = track.id === state.trackId || track.title === state.title;
      if (editing) {
        return `
          <article class="mini-listen-row is-editing${active ? " is-active" : ""}"
            data-track-id="${escapeHtml(track.id || "")}"
            data-media-id="${escapeHtml(track.mediaId || "")}">
            <button type="button" class="mini-listen-row__delete" data-listen-remove="${escapeHtml(track.id || "")}" aria-label="${escapeHtml(pt("listen.delete"))}">
              <i data-lucide="trash-2"></i>
            </button>
            <span class="mini-listen-row__art" aria-hidden="true"></span>
            <div class="mini-listen-row__fields">
              <input type="text" data-listen-title-input value="${escapeHtml(track.title || "")}" aria-label="${escapeHtml(pt("listen.trackNameLabel"))}" />
              <input type="text" data-listen-playlist-input value="${escapeHtml(displayPlaylistName(track.playlist))}" aria-label="${escapeHtml(pt("listen.playlistNameLabel"))}" />
            </div>
          </article>`;
      }
      const cacheState = resolveTrackCacheState(track);
      return `
        <div class="mini-listen-row${active ? " is-active" : ""}" data-track-id="${escapeHtml(track.id || "")}">
          <button type="button" class="mini-listen-row__main"
            data-track-play="${escapeHtml(track.id || "")}"
            data-track-title="${escapeHtml(track.title || "")}"
            data-track-playlist="${escapeHtml(track.playlist || "")}"
            data-media-id="${escapeHtml(track.mediaId || "")}">
            <span class="mini-listen-row__art" aria-hidden="true"></span>
            <span>
              <strong>${escapeHtml(displayTrackTitle(track.title, { short: true }))}</strong>
              <em>${escapeHtml(displayPlaylistName(track.playlist))}</em>
              <span class="mini-listen-row__meta-line">${escapeHtml(trackStatusLabel(track))}</span>
            </span>
          </button>
          <button type="button"
            class="mini-listen-row__status${cacheState === "error" ? " is-error" : ""}${cacheState === "downloading" ? " is-downloading" : ""}"
            style="--cache-pct: ${Math.max(0, Math.min(100, Number(track.cacheProgress) || 0))}"
            data-track-cache="${escapeHtml(track.id || "")}"
            aria-label="${escapeHtml(trackStatusLabel(track))}">${escapeHtml(trackStatusIcon(track))}</button>
        </div>`;
    }).join("");
    refreshIcons();
  }

  function refreshCacheUi() {
    const tracks = ensureTrackIds(listTracks());
    if (!feed?.querySelector("[data-track-cache]") || tracks.length !== feed.querySelectorAll(".mini-listen-row").length) {
      renderTracks();
      syncStage();
      return;
    }
    for (const track of tracks) {
      const btn = feed.querySelector(`[data-track-cache="${track.id}"]`);
      if (!btn) continue;
      const state = resolveTrackCacheState(track);
      btn.textContent = trackStatusIcon(track);
      btn.setAttribute("aria-label", trackStatusLabel(track));
      btn.classList.toggle("is-error", state === "error");
      btn.classList.toggle("is-downloading", state === "downloading");
      btn.style.setProperty("--cache-pct", String(Math.max(0, Math.min(100, Number(track.cacheProgress) || 0))));
      const line = btn.parentElement?.querySelector(".mini-listen-row__meta-line");
      if (line) line.textContent = trackStatusLabel(track);
    }
    syncStage();
  }

  async function cacheTrackOnly(track) {
    if (!track?.sourceUrl || track.mediaId || !storeMediaFile) return track;
    try {
      const cached = await downloadBuiltinTrack(track, {
        storeMediaFile,
        onProgress: () => refreshCacheUi(),
      });
      refreshCacheUi();
      return cached;
    } catch (error) {
      console.warn("[yueqi.listen] cache-only failed", error);
      refreshCacheUi();
      return null;
    }
  }

  function waitUntilAudible(el, { timeoutMs = 4500 } = {}) {
    return new Promise((resolve) => {
      if (!el) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        el.removeEventListener("playing", onPlaying);
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("error", onErr);
        window.clearTimeout(timer);
        resolve(ok);
      };
      const onPlaying = () => {
        if ((el.duration || 0) > 0 || el.currentTime > 0 || el.readyState >= 3) finish(true);
      };
      const onTime = () => {
        if (el.currentTime > 0.05) finish(true);
      };
      const onErr = () => finish(false);
      const timer = window.setTimeout(() => {
        finish(el.currentTime > 0.05 || ((el.duration || 0) > 0 && el.readyState >= 2 && !el.paused));
      }, timeoutMs);
      el.addEventListener("playing", onPlaying);
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("error", onErr);
      if (el.currentTime > 0.05) finish(true);
    });
  }

  async function beginPlayFromUrl(url, nextBase, { autoplay = true } = {}) {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      objectUrl = "";
    }
    // Remote stream URLs are not object URLs; only blob/object URLs get revoked later.
    if (String(url || "").startsWith("blob:")) objectUrl = url;
    audio.src = url;
    persist({ ...nextBase, paused: !autoplay }, { announce: true });
    pushRecentPlay({
      title: nextBase.title,
      playlist: nextBase.playlist,
      mediaId: nextBase.mediaId,
    });
    try {
      const characterId = getActiveCharacterId();
      if (isListenAdapterEnabled()) {
        recordListenProgress({
          trackId: nextBase.trackId || nextBase.mediaId || nextBase.title,
          position: 0,
          companionId: characterId,
          characterId,
          title: nextBase.title,
          coListen: nextBase.coListen !== false,
          kind: nextBase.coListen !== false ? "co_listen" : "start",
        });
      } else {
        appendCohabitEvent({
          appId: "listen",
          kind: "play",
          summary: t("listen.playEventSummary", {
            title: nextBase.title,
            progress: formatCoListenProgress({ ...nextBase, paused: false }),
          }),
          characterId,
          idempotencyKey: `listen::play::${characterId}::${nextBase.trackId || nextBase.title}`,
          meta: { trackId: nextBase.trackId },
        });
      }
    } catch { /* optional */ }

    if (autoplay) {
      try {
        await audio.play();
        const heard = await waitUntilAudible(audio);
        if (!heard) {
          persist({ ...state, paused: true }, { announce: false });
          showPlaybackFailure();
          throw new Error("playback_empty");
        }
        if (hintEl) hintEl.hidden = true;
        persist(snapshotFromAudio(audio, { ...state, paused: false }), { announce: true });
      } catch {
        persist({ ...state, paused: true }, { announce: false });
        showPlaybackFailure();
        throw new Error("playback_failed");
      }
    }
  }

  function showPlaybackFailure() {
    if (!hintEl) return;
    const code = audio?.error?.code;
    // MEDIA_ERR_SRC_NOT_SUPPORTED = 4 (common for OGG on Android WebView)
    hintEl.hidden = false;
    hintEl.textContent = code === 4
      ? pt("listen.formatUnsupported")
      : pt("listen.playFailed");
  }

  async function loadTrack(track, { autoplay = true } = {}) {
    let playable = track;
    const nextBase = {
      title: track.title || STORED_DEFAULT_TRACK_TITLE,
      playlist: track.playlist || STORED_DEFAULT_PLAYLIST,
      mediaId: track.mediaId || "",
      trackId: track.id || "",
      positionSec: 0,
      durationSec: 0,
      paused: true,
      coListen: state.coListen !== false,
    };
    clearPlayback();
    persist(nextBase, { announce: false, publish: true });

    async function playLocalOrFail(mediaId, base) {
      const url = await resolveTrackUrl(mediaId, getMediaRecord);
      if (!url) return false;
      await beginPlayFromUrl(url, { ...base, mediaId }, { autoplay });
      return true;
    }

    // Cached: play local media. If the blob is gone, fall through and re-download.
    if (playable.mediaId) {
      if (playBtn) playBtn.dataset.loading = "1";
      syncPlayButton();
      try {
        const ok = await playLocalOrFail(playable.mediaId, nextBase);
        if (playBtn) playBtn.dataset.loading = "0";
        if (ok) {
          refreshCacheUi();
          return;
        }
      } catch {
        if (playBtn) playBtn.dataset.loading = "0";
        if (!playable.sourceUrl) {
          persist({ ...nextBase, paused: true }, { announce: false });
          showPlaybackFailure();
          return;
        }
      }
      updateTrack(playable.id, { mediaId: "", cacheState: "remote", cacheProgress: 0 });
      playable = { ...playable, mediaId: "" };
      nextBase.mediaId = "";
    }

    // Remote: download first so progress is visible and empty play is not faked.
    if (playable.sourceUrl) {
      if (playBtn) playBtn.dataset.loading = "1";
      syncPlayButton();
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = pt("listen.downloading");
      }
      refreshCacheUi();
      if (!storeMediaFile) {
        try {
          await beginPlayFromUrl(playable.sourceUrl, nextBase, { autoplay });
        } catch {
          persist({ ...nextBase, paused: true }, { announce: true });
          if (hintEl) {
            hintEl.hidden = false;
            hintEl.textContent = pt("listen.downloadFail");
          }
        }
        if (playBtn) playBtn.dataset.loading = "0";
        syncPlayButton();
        return;
      }
      try {
        playable = await downloadBuiltinTrack(playable, {
          storeMediaFile,
          onProgress: () => {
            refreshCacheUi();
            const live = currentTrackFromStore();
            if (hintEl && live && resolveTrackCacheState(live) === "downloading") {
              hintEl.hidden = false;
              hintEl.textContent = trackStatusLabel(live);
            }
          },
        });
        nextBase.mediaId = playable.mediaId || "";
        refreshCacheUi();
        if (!playable.mediaId) throw new Error("download_no_media");
        const ok = await playLocalOrFail(playable.mediaId, nextBase);
        if (!ok) throw new Error("download_unreadable");
      } catch (error) {
        console.warn("[yueqi.listen] builtin download failed", error);
        refreshCacheUi();
        if (playBtn) playBtn.dataset.loading = "0";
        persist({ ...nextBase, paused: true }, { announce: true });
        if (hintEl) {
          hintEl.hidden = false;
          hintEl.textContent = String(error?.message || "").includes("playback")
            ? (audio?.error?.code === 4 ? pt("listen.formatUnsupported") : pt("listen.playFailed"))
            : pt("listen.downloadFail");
        }
        return;
      }
      if (playBtn) playBtn.dataset.loading = "0";
      syncPlayButton();
      return;
    }

    persist({ ...nextBase, paused: true }, { announce: true });
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = pt("listen.trackNoAudio");
    }
  }

  async function togglePlay() {
    if (!audio.src && !state.mediaId) {
      const tracks = ensureTrackIds(listTracks());
      const track = tracks.find((row) => row.id === state.trackId || row.mediaId === state.mediaId)
        || tracks[0]
        || { title: state.title, playlist: state.playlist, mediaId: state.mediaId, id: state.trackId };
      if (!track?.id && !track?.mediaId && !track?.sourceUrl) return;
      await loadTrack(track, { autoplay: true });
      return;
    }
    if (!audio.src && state.mediaId) {
      const tracks = ensureTrackIds(listTracks());
      const track = tracks.find((row) => row.id === state.trackId || row.mediaId === state.mediaId)
        || { title: state.title, playlist: state.playlist, mediaId: state.mediaId, id: state.trackId };
      await loadTrack(track, { autoplay: true });
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
        if (hintEl) hintEl.hidden = true;
        persist(snapshotFromAudio(audio, { ...state, paused: false }), { announce: true });
      } catch {
        persist({ ...state, paused: true }, { announce: false });
        showPlaybackFailure();
      }
    } else {
      audio.pause();
      persist(snapshotFromAudio(audio, { ...state, paused: true }), { announce: true });
    }
  }

  async function importFiles(files) {
    if (!storeMediaFile || !files?.length) {
      if (!storeMediaFile && hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = pt("listen.importUnavailable");
      }
      return;
    }
    for (const file of files) {
      try {
        const imported = await importAudioResource(file, { storeBytes: false });
        let media = null;
        if (storeMediaFile) {
          media = await storeMediaFile(file, "audio");
        }
        addTrack({
          title: imported.track.title || shortFileTitle(file.name) || STORED_DEFAULT_TRACK_TITLE,
          playlist: storedLocalImportPlaylist(imported.track.artist || ""),
          mediaId: media?.id || imported.mediaId || "",
          resourceId: imported.track.resourceId || "",
        });
      } catch (error) {
        if (hintEl) {
          hintEl.hidden = false;
          hintEl.textContent = messageForPortabilityError(error) || pt("listen.importUnavailable");
        }
      }
    }
    if (sheetCollapsed) {
      sheetCollapsed = false;
      writeSheetCollapsed(false);
      syncSheetChrome();
    }
    renderTracks();
    syncStage();
  }

  function commitEditRow(row) {
    if (!row) return;
    const id = row.dataset.trackId;
    if (!id) return;
    const title = row.querySelector("[data-listen-title-input]")?.value?.trim() || STORED_DEFAULT_TRACK_TITLE;
    const playlist = canonicalizePlaylistName(
      row.querySelector("[data-listen-playlist-input]")?.value?.trim() || STORED_DEFAULT_PLAYLIST,
    );
    updateTrack(id, { title, playlist });
    if (state.trackId === id) {
      persist({ title, playlist }, { announce: false, publish: true });
    }
  }

  function commitAllEdits() {
    if (!feed) return;
    feed.querySelectorAll(".mini-listen-row.is-editing").forEach((row) => commitEditRow(row));
  }

  function removeTrackById(id) {
    const key = String(id || "");
    if (!key) return;
    const wasCurrent = state.trackId === key;
    removeTrack(key);
    if (wasCurrent) {
      clearPlayback();
      persist({
        title: "",
        playlist: "",
        mediaId: "",
        trackId: "",
        positionSec: 0,
        durationSec: 0,
        paused: true,
      }, { announce: false, publish: true });
    }
    renderTracks();
    syncStage();
  }

  function onTimeUpdate() {
    if (seeking) return;
    const snap = snapshotFromAudio(audio, state);
    state = normalizeCoListenState({ ...state, ...snap });
    syncSeekUi();
    stage?.classList.toggle("is-playing", !audio.paused);
    schedulePersist();
    // Flag on: progress ticks go through adapter coalesce (no Timeline per tick).
    if (isListenAdapterEnabled() && state.trackId) {
      try {
        recordListenProgress({
          trackId: state.trackId || state.mediaId || state.title,
          position: Number(state.positionSec) || 0,
          duration: Number(state.durationSec) || 0,
          companionId: getActiveCharacterId(),
          characterId: getActiveCharacterId(),
          title: state.title,
          coListen: state.coListen !== false,
          kind: "progress",
        });
      } catch { /* optional */ }
    }
  }

  function onClick(event) {
    if (event.target.closest("[data-listen-play]")) {
      event.preventDefault();
      togglePlay();
      return;
    }

    if (event.target.closest("[data-listen-sheet-toggle]")) {
      event.preventDefault();
      sheetCollapsed = !sheetCollapsed;
      writeSheetCollapsed(sheetCollapsed);
      if (sheetCollapsed && editing) {
        commitAllEdits();
        editing = false;
      }
      syncSheetChrome();
      return;
    }

    if (event.target.closest("[data-listen-edit]")) {
      event.preventDefault();
      if (editing) commitAllEdits();
      editing = !editing;
      if (editing && sheetCollapsed) {
        sheetCollapsed = false;
        writeSheetCollapsed(false);
      }
      syncSheetChrome();
      renderTracks();
      return;
    }

    if (event.target.closest("[data-listen-import], [data-listen-import-empty]")) {
      event.preventDefault();
      fileInput?.click();
      return;
    }

    const removeBtn = event.target.closest("[data-listen-remove]");
    if (removeBtn) {
      event.preventDefault();
      event.stopPropagation();
      removeTrackById(removeBtn.getAttribute("data-listen-remove") || removeBtn.dataset.listenRemove);
      return;
    }

    if (editing) return;

    const cacheBtn = event.target.closest("[data-track-cache]");
    if (cacheBtn && feed?.contains(cacheBtn)) {
      event.preventDefault();
      event.stopPropagation();
      const trackId = cacheBtn.getAttribute("data-track-cache") || "";
      const fromStore = ensureTrackIds(listTracks()).find((t) => t.id === trackId);
      if (!fromStore) return;
      if (resolveTrackCacheState(fromStore) === "cached") return;
      void cacheTrackOnly(fromStore);
      return;
    }

    const playBtnRow = event.target.closest("[data-track-play]");
    if (playBtnRow && feed?.contains(playBtnRow)) {
      event.preventDefault();
      const trackId = playBtnRow.getAttribute("data-track-play") || playBtnRow.dataset.trackPlay || "";
      const fromStore = ensureTrackIds(listTracks()).find((t) => t.id === trackId);
      void loadTrack(fromStore || {
        id: trackId,
        title: playBtnRow.dataset.trackTitle,
        playlist: playBtnRow.dataset.trackPlaylist,
        mediaId: playBtnRow.dataset.mediaId,
      }, { autoplay: true });
    }
  }

  function onSwitchClick(event) {
    const btn = event.target.closest("[data-listen-colisten]");
    if (!btn) return;
    const next = !isSwitchOn(btn);
    setSwitchState(btn, next);
    persist({ coListen: next }, { announce: true });
  }

  function onSeekInput() {
    seeking = true;
    if (!seekEl) return;
    const pos = positionFromRatio(seekEl.value, state.durationSec || audio.duration || 0);
    if (posEl) posEl.textContent = formatClock(pos);
  }

  function onSeekChange() {
    seeking = false;
    if (!seekEl || !(state.durationSec > 0 || audio.duration > 0)) return;
    const dur = state.durationSec || audio.duration || 0;
    const pos = positionFromRatio(seekEl.value, dur);
    try {
      audio.currentTime = pos;
    } catch { /* ignore */ }
    persist({ ...snapshotFromAudio(audio, state), positionSec: pos }, { announce: false });
  }

  function onFileChange() {
    const files = Array.from(fileInput?.files || []);
    if (fileInput) fileInput.value = "";
    importFiles(files).catch(() => {});
  }

  function onFieldChange(event) {
    const row = event.target.closest(".mini-listen-row.is-editing");
    if (!row) return;
    if (event.target.matches("[data-listen-title-input], [data-listen-playlist-input]")) {
      commitEditRow(row);
      if (trackCountEl) trackCountEl.textContent = pt("listen.trackCount", { count: listTracks().length });
    }
  }

  const unsub = subscribeCoListenState(tabId, (remote) => {
    if (!remote) return;
    applyingRemote = true;
    try {
      persist(normalizeCoListenState(remote), { announce: false, publish: false });
      if (audio.src && Math.abs((audio.currentTime || 0) - (state.positionSec || 0)) > 2.5) {
        try { audio.currentTime = state.positionSec || 0; } catch { /* ignore */ }
      }
      if (state.paused && !audio.paused) audio.pause();
    } finally {
      applyingRemote = false;
    }
  });

  root.addEventListener("click", onClick);
  root.addEventListener("click", onSwitchClick);
  root.addEventListener("change", onFieldChange);
  seekEl?.addEventListener("input", onSeekInput);
  seekEl?.addEventListener("change", onSeekChange);
  fileInput?.addEventListener("change", onFileChange);
  audio.addEventListener("timeupdate", onTimeUpdate);
  audio.addEventListener("error", () => {
    persist({ ...state, paused: true }, { announce: false });
    showPlaybackFailure();
    syncPlayButton();
  });
  audio.addEventListener("loadedmetadata", () => {
    if (hintEl && (audio.duration || 0) > 0 && audio.currentTime >= 0) {
      hintEl.hidden = true;
    }
    persist(snapshotFromAudio(audio, state), { announce: false });
  });
  audio.addEventListener("ended", () => {
    const snap = {
      ...snapshotFromAudio(audio, state),
      paused: true,
      positionSec: state.durationSec || audio.currentTime,
    };
    persist(snap, { announce: true });
    if (isListenAdapterEnabled() && (state.trackId || state.mediaId)) {
      try {
        endListenSession({
          trackId: state.trackId || state.mediaId || state.title,
          position: Number(snap.positionSec) || 0,
          companionId: getActiveCharacterId(),
          characterId: getActiveCharacterId(),
          title: state.title,
          coListen: state.coListen !== false,
        });
      } catch { /* optional */ }
    }
  });

  function open() {
    ensureBuiltinTracks();
    ensureTrackIds(listTracks());
    const live = getNowPlaying?.();
    if (live?.title) {
      state = normalizeCoListenState({ ...state, ...live });
    } else {
      state = loadPersistedState();
    }
    sheetCollapsed = readSheetCollapsed();
    syncSheetChrome();
    renderTracks();
    syncStage();
    if (state.mediaId && state.positionSec > 0 && audio.src) {
      try { audio.currentTime = state.positionSec; } catch { /* ignore */ }
    }
  }

  function refreshLocale() {
    renderTracks();
    syncSheetChrome();
    if (editBtn) {
      editBtn.setAttribute("aria-label", editing ? pt("listen.doneEditing") : pt("listen.editPlaylist"));
      editBtn.title = editing ? pt("listen.doneEditing") : pt("listen.editPlaylist");
    }
    if (importBtn) importBtn.setAttribute("aria-label", pt("listen.importAudio"));
    if (playBtn) {
      playBtn.setAttribute("aria-label", audio.paused ? pt("listen.play") : pt("listen.pause"));
    }
    if (trackEl && !String(state?.title || "").trim()) {
      trackEl.textContent = pt("listen.pickTrack");
    }
    if (playlistEl && !String(state?.playlist || "").trim()) {
      playlistEl.textContent = pt("listen.localPlaylist");
    }
  }

  syncSheetChrome();

  async function playTrackById(trackId, opts = {}) {
    ensureBuiltinTracks();
    const tracks = ensureTrackIds(listTracks());
    const key = String(trackId || "").trim();
    const track = (key && tracks.find((row) => row.id === key))
      || tracks.find((row) => row.mediaId)
      || tracks[0]
      || null;
    if (!track) return { ok: false, reason: "no_track" };
    await loadTrack(track, { autoplay: opts.autoplay !== false });
    return { ok: true, track };
  }

  const onExternalPlayRequest = (event) => {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    void playTrackById(detail.trackId, detail).catch((error) => {
      console.warn("[yueqi.listen] external play failed", error);
    });
  };
  document.addEventListener("yueqi:listen-play-request", onExternalPlayRequest);

  function destroy() {
    window.clearTimeout(persistTimer);
    if (editing) commitAllEdits();
    root.removeEventListener("click", onClick);
    root.removeEventListener("click", onSwitchClick);
    root.removeEventListener("change", onFieldChange);
    seekEl?.removeEventListener("input", onSeekInput);
    seekEl?.removeEventListener("change", onSeekChange);
    fileInput?.removeEventListener("change", onFileChange);
    document.removeEventListener("yueqi:listen-play-request", onExternalPlayRequest);
    unsub?.();
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
    }
  }

  return { open, destroy, getState: () => state, renderTracks, refreshLocale, playTrackById };
}
