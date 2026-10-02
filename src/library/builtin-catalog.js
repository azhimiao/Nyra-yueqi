/**
 * Built-in first-party book + remote music catalog (name + URL only).
 * Book: bundled EPUB under /content/books — imported into local media once.
 * Music: catalog rows keep sourceUrl; first play fetches into IndexedDB media.
 */

import { importBookFile } from "./books-import.js";
import { previewFromBody } from "./books.js";
import { STORED_DEFAULT_PLAYLIST, STORED_DEFAULT_TRACK_TITLE } from "./co-listen.js";
import {
  addBook,
  addTrack,
  listBooks,
  listTracks,
  updateTrack,
  writeLibrary,
  readLibrary,
} from "../phone-shell/phone-data.js";

export const BUILTIN_LIBRARY_FLAG = "yueqi.builtin.library.v1";

export const BUILTIN_BOOK = Object.freeze({
  id: "nyra.original.001",
  title: "那里怎么样",
  author: "Nyra Original",
  subtitle: "梦境短篇",
  series: "Nyra Original",
  format: "epub",
  bundledPath: "/content/books/nyra-original-001.epub",
  metaPath: "/content/books/nyra-original-001.json",
  synopsis:
    "一个从黑暗中的女人与孩童开始，随后转向集市、雪地与普通婚姻生活的梦境短篇。作品不对其中的人生选择作明确价值判断。",
});

/**
 * Wikimedia Commons originals are OGG; Android WebView often cannot decode
 * Vorbis. Prefer Commons' MP3 transcoder so download + play work on phones.
 * Pattern: …/commons/transcoded/<path>/<file.ogg>/<file.ogg>.mp3
 */
function commonsMp3(transcodedPath) {
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${transcodedPath}`;
}

/** Public-domain / CC0 recordings — store name + URL only until first play. */
export const BUILTIN_TRACKS = Object.freeze([
  {
    id: "nyra.music.satie.gymnopedie1",
    title: "Gymnopédie No.1",
    artist: "Erik Satie",
    playlist: "月栖精选",
    sourceUrl: commonsMp3(
      "b/b7/Gymnopedie_No._1..ogg/Gymnopedie_No._1..ogg.mp3",
    ),
    license: "CC0 1.0",
    licenseUrl: "https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg",
  },
  {
    id: "nyra.music.chopin.nocturne.op9n2",
    title: "Nocturne No.2 in E-flat Major, Op.9 No.2",
    artist: "Frédéric Chopin",
    playlist: "月栖精选",
    sourceUrl: commonsMp3(
      "0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg.mp3",
    ),
    license: "CC0 1.0",
    licenseUrl:
      "https://commons.wikimedia.org/wiki/File:Chopin_Nocturne_No._2_in_E_Flat_Major,_Op._9.ogg",
  },
  {
    id: "nyra.music.bach.bwv1007.prelude",
    title: "Cello Suite No.1, Prelude BWV 1007",
    artist: "Johann Sebastian Bach",
    playlist: "月栖精选",
    sourceUrl: commonsMp3(
      "a/a7/Bach_Cello_Suite_1_Prelude_%28BWV_1007%29_Played_by_Chris.ogg/Bach_Cello_Suite_1_Prelude_%28BWV_1007%29_Played_by_Chris.ogg.mp3",
    ),
    license: "CC0 1.0",
    licenseUrl:
      "https://commons.wikimedia.org/wiki/File:Bach_Cello_Suite_1_Prelude_(BWV_1007)_Played_by_Chris.ogg",
  },
  {
    id: "nyra.music.beethoven.moonlight.i",
    title: "Moonlight Sonata, I. Adagio sostenuto",
    artist: "Ludwig van Beethoven",
    playlist: "月栖精选",
    sourceUrl: commonsMp3(
      "4/48/Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27%2C_op._27_no._2_-_i._adagio_sostenuto.ogg/Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27%2C_op._27_no._2_-_i._adagio_sostenuto.ogg.mp3",
    ),
    license: "Public Domain",
    licenseUrl:
      "https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_'moonlight',_op._27_no._2_-_i._adagio_sostenuto.ogg",
  },
]);

/**
 * Titles a row can carry when nothing real was ever written to it. A user
 * renaming a track to one of these is indistinguishable from corruption, and
 * restoring the catalog name is the better outcome either way.
 */
const PLACEHOLDER_TITLES = new Set([
  STORED_DEFAULT_TRACK_TITLE,
  "未命名歌曲",
  "未命名曲目",
  "Untitled track",
  "Untitled",
]);

function isPlaceholderTitle(title) {
  const raw = String(title || "").trim();
  return !raw || PLACEHOLDER_TITLES.has(raw);
}

export function catalogTrackTitle(entry) {
  return `${entry.artist} — ${entry.title}`;
}

/**
 * Patch needed to bring a stored row back in line with the catalog, or null
 * when the row is already intact. Metadata the user can edit is only restored
 * when it holds a placeholder.
 * @param {object} stored
 * @param {object} entry catalog definition
 */
function looksLikeOggUrl(url) {
  return /\.ogg(\?|#|$)/i.test(String(url || ""));
}

function looksLikeMp3Url(url) {
  return /\.mp3(\?|#|$)/i.test(String(url || ""));
}

export function asNamedFile(blob, name, type) {
  const mime = type || blob?.type || "application/octet-stream";
  try {
    return new File([blob], name, { type: mime });
  } catch {
    const copy = blob instanceof Blob && blob.type === mime ? blob : new Blob([blob], { type: mime });
    try { copy.name = name; } catch { /* ignore */ }
    return copy;
  }
}

function safeTrackFileName(track, sourceUrl, type) {
  const ext = /\b(mpeg|mp3)\b/i.test(type) || looksLikeMp3Url(sourceUrl)
    ? "mp3"
    : /\bogg\b/i.test(type) || looksLikeOggUrl(sourceUrl)
      ? "ogg"
      : /\b(mp4|m4a|aac)\b/i.test(type)
        ? "m4a"
        : "bin";
  return `${String(track?.id || "track").replace(/[^\w.-]+/g, "_")}.${ext}`;
}

export function repairBuiltinTrack(stored, entry) {
  if (!stored || !entry) return null;
  const patch = {};
  if (isPlaceholderTitle(stored.title)) patch.title = catalogTrackTitle(entry);
  const playlist = String(stored.playlist || "").trim();
  if (!playlist || playlist === STORED_DEFAULT_PLAYLIST) patch.playlist = entry.playlist;
  if (!String(stored.artist || "").trim()) patch.artist = entry.artist;
  const catalogUrl = String(entry.sourceUrl || "").trim();
  const storedUrl = String(stored.sourceUrl || "").trim();
  if (catalogUrl && storedUrl !== catalogUrl) {
    patch.sourceUrl = catalogUrl;
    // Drop cached OGG when catalog moved to MP3 — Android often cannot play it.
    if (stored.mediaId && looksLikeOggUrl(storedUrl) && looksLikeMp3Url(catalogUrl)) {
      patch.mediaId = "";
      patch.cacheState = "remote";
      patch.cacheProgress = 0;
      patch.cacheBytes = 0;
    }
  } else if (!storedUrl && catalogUrl) {
    patch.sourceUrl = catalogUrl;
  }
  if (!String(stored.license || "").trim()) patch.license = entry.license;
  if (!String(stored.licenseUrl || "").trim()) patch.licenseUrl = entry.licenseUrl;
  if (!stored.builtin) patch.builtin = true;
  return Object.keys(patch).length ? patch : null;
}

function flagBag() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem?.(BUILTIN_LIBRARY_FLAG) || "{}") || {};
  } catch {
    return {};
  }
}

function writeFlag(patch) {
  try {
    const next = { ...flagBag(), ...patch, updatedAt: new Date().toISOString() };
    globalThis.localStorage?.setItem?.(BUILTIN_LIBRARY_FLAG, JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}

/**
 * A download cannot outlive the page, so any row still marked as in progress
 * without a live fetch behind it is a leftover that would otherwise show a
 * frozen percentage forever.
 */
export function resetStaleDownloads() {
  let cleared = 0;
  for (const track of listTracks()) {
    const id = String(track.id || "");
    const state = String(track.cacheState || track.cacheState || "");
    if (track.mediaId || (state !== "downloading" && state !== "queued")) continue;
    if (inFlightDownloads.has(id)) continue;
    updateTrack(id, {
      cacheState: track.sourceUrl ? "remote" : "",
      cacheProgress: 0,
    });
    cleared += 1;
  }
  return cleared;
}

/**
 * Ensure four catalog tracks exist (URL only — no audio bytes yet) and that
 * existing rows still carry their catalog metadata.
 */
export function ensureBuiltinTracks() {
  resetStaleDownloads();
  const existing = new Map(listTracks().map((t) => [String(t.id || ""), t]));
  let added = 0;
  let repaired = 0;
  for (const track of BUILTIN_TRACKS) {
    const stored = existing.get(track.id);
    if (stored) {
      const patch = repairBuiltinTrack(stored, track);
      if (patch) {
        updateTrack(track.id, patch);
        repaired += 1;
      }
      continue;
    }
    addTrack({
      id: track.id,
      title: catalogTrackTitle(track),
      playlist: track.playlist,
      mediaId: "",
      sourceUrl: track.sourceUrl,
      artist: track.artist,
      license: track.license,
      licenseUrl: track.licenseUrl,
      builtin: true,
    });
    added += 1;
  }
  if (added || repaired) writeFlag({ tracksSeeded: true });
  return { added, repaired, total: BUILTIN_TRACKS.length };
}

/**
 * Import bundled EPUB into local book shelf + media once.
 * Always ensures a shelf row exists even if fetch/import fails (bundledPath fallback).
 * @param {{ storeMediaFile?: Function }} [deps]
 */
export async function ensureBuiltinBook(deps = {}) {
  function findBuiltin() {
    return listBooks().find((b) => b.id === BUILTIN_BOOK.id || b.title === BUILTIN_BOOK.title);
  }

  function ensureShelfRow(extra = {}) {
    const current = findBuiltin();
    if (current) {
      const library = readLibrary();
      library.books = (library.books || []).map((row) => (
        row.id === current.id || row.title === BUILTIN_BOOK.title
          ? {
            ...row,
            id: BUILTIN_BOOK.id,
            title: BUILTIN_BOOK.title,
            author: BUILTIN_BOOK.author,
            chapter: BUILTIN_BOOK.subtitle,
            synopsis: BUILTIN_BOOK.synopsis,
            bundledPath: BUILTIN_BOOK.bundledPath,
            builtin: true,
            format: row.format || "epub",
            ...extra,
          }
          : row
      ));
      writeLibrary({ books: library.books });
      return findBuiltin() || current;
    }
    return addBook({
      id: BUILTIN_BOOK.id,
      title: BUILTIN_BOOK.title,
      author: BUILTIN_BOOK.author,
      progress: "未读",
      chapter: BUILTIN_BOOK.subtitle,
      excerpt: extra.excerpt || "Nyra Original · 001",
      synopsis: BUILTIN_BOOK.synopsis,
      format: "epub",
      mediaId: extra.mediaId || "",
      bundledPath: BUILTIN_BOOK.bundledPath,
      builtin: true,
      scrollRatio: 0,
      ...extra,
    });
  }

  const existing = findBuiltin();
  // Already fully imported.
  if (existing?.mediaId) {
    writeFlag({ bookSeeded: true });
    return { ok: true, skipped: true, book: existing };
  }

  // Always show on shelf first (so first open is never empty).
  ensureShelfRow();

  const storeMediaFile = deps.storeMediaFile;
  if (typeof storeMediaFile !== "function") {
    return { ok: true, deferred: true, book: findBuiltin() };
  }

  try {
    const res = await fetch(BUILTIN_BOOK.bundledPath);
    if (!res.ok) throw new Error(`builtin_book_fetch_${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], "nyra-original-001.epub", {
      type: "application/epub+zip",
    });
    const book = await importBookFile(file);
    const body = String(book.body || book.excerpt || "");
    const excerpt = previewFromBody(body) || BUILTIN_BOOK.subtitle;
    const media = body.trim()
      ? await storeMediaFile(
        new File([body], `${BUILTIN_BOOK.id}.txt`, { type: "text/plain;charset=utf-8" }),
        "book",
      )
      : null;

    const row = ensureShelfRow({
      excerpt,
      mediaId: media?.id || "",
      fileId: book.fileId || "",
      format: book.format || "epub",
    });
    writeFlag({ bookSeeded: true, bookSeedError: "" });
    return { ok: true, bookId: BUILTIN_BOOK.id, mediaId: media?.id || "", book: row };
  } catch (error) {
    writeFlag({ bookSeedError: String(error?.message || error) });
    // Shelf row still present via bundledPath — open path can fetch later.
    return {
      ok: false,
      error: String(error?.message || error),
      book: findBuiltin(),
    };
  }
}

/**
 * @param {{ storeMediaFile?: Function }} [deps]
 */
export async function ensureBuiltinLibrary(deps = {}) {
  const tracks = ensureBuiltinTracks();
  const book = await ensureBuiltinBook(deps);
  return { tracks, book };
}

/** Minimum gap between persisted progress writes — each one rerenders the list. */
const PROGRESS_WRITE_INTERVAL_MS = 250;

/** Downloads in flight, keyed by track id, so play + cache taps share one fetch. */
const inFlightDownloads = new Map();

/**
 * Monotonic, throttled progress reporter. Percentages that arrive out of order
 * (or a second caller starting at zero) must never rewind what the user sees.
 * @param {string} trackId
 * @param {(pct: number) => void} [onProgress]
 * @param {{ now?: () => number, write?: Function }} [io]
 */
export function createProgressReporter(trackId, onProgress, io = {}) {
  const now = io.now || (() => Date.now());
  const write = io.write || updateTrack;
  let lastPct = -1;
  let lastBytes = 0;
  let lastWriteAt = 0;
  return function report(value, { force = false, bytes = 0 } = {}) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    const received = Math.max(0, Math.floor(Number(bytes) || 0));
    if (pct <= lastPct && received <= lastBytes && !force) return lastPct;
    const stamp = now();
    const throttled = lastPct >= 0 && pct < 100 && stamp - lastWriteAt < PROGRESS_WRITE_INTERVAL_MS;
    if (!force && throttled && received <= lastBytes) return lastPct;
    lastPct = Math.max(lastPct, pct);
    lastBytes = Math.max(lastBytes, received);
    lastWriteAt = stamp;
    write(trackId, {
      cacheState: lastPct >= 100 ? "cached" : "downloading",
      cacheProgress: lastPct,
      ...(lastBytes > 0 ? { cacheBytes: lastBytes } : {}),
    });
    onProgress?.(lastPct);
    return lastPct;
  };
}

/**
 * Fetch remote audio into local media and attach mediaId on the track.
 * Concurrent calls for the same track share a single fetch.
 * @param {object} track
 * @param {{
 *   storeMediaFile: Function,
 *   onProgress?: (pct: number) => void,
 * }} deps
 */
export function downloadBuiltinTrack(track, deps = {}) {
  const key = String(track?.id || "");
  const running = key ? inFlightDownloads.get(key) : null;
  if (running) return running;
  const pending = runBuiltinTrackDownload(track, deps);
  if (!key) return pending;
  inFlightDownloads.set(key, pending);
  return pending.finally(() => {
    if (inFlightDownloads.get(key) === pending) inFlightDownloads.delete(key);
  });
}

async function runBuiltinTrackDownload(track, deps = {}) {
  const storeMediaFile = deps.storeMediaFile;
  const sourceUrl = String(track?.sourceUrl || track?.url || "").trim();
  if (!sourceUrl) throw new Error("track_no_source_url");
  if (!storeMediaFile) throw new Error("store_media_unavailable");
  if (track.mediaId) {
    return {
      ...track,
      cacheState: "cached",
      cacheProgress: 100,
    };
  }

  updateTrack(track.id, {
    cacheState: "downloading",
    cacheProgress: 0,
    sourceUrl,
  });
  deps.onProgress?.(0);
  const report = createProgressReporter(track.id, deps.onProgress);

  const { isNativePlatform } = await import("../platform/runtime.js");
  if (isNativePlatform() && typeof deps.storeMediaFile === "function") {
    try {
      const { persistRemoteMedia } = await import("../platform/media-files.js");
      const downloadId = `audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const filePath = await persistRemoteMedia(downloadId, sourceUrl, {
        onProgress: (pct, bytes) => report(pct, { bytes }),
      });
      if (filePath) {
        const type = looksLikeMp3Url(sourceUrl) ? "audio/mpeg" : "audio/ogg";
        const media = await deps.storeMediaFile({
          name: safeTrackFileName(track, sourceUrl, type),
          type,
          size: 0,
          nativePath: filePath,
        }, "audio");
        if (media?.id) {
          const row = updateTrack(track.id, {
            mediaId: media.id,
            sourceUrl,
            builtin: true,
            cacheState: "cached",
            cacheProgress: 100,
          });
          report(100, { force: true });
          return row || {
            ...track,
            mediaId: media.id,
            sourceUrl,
            cacheState: "cached",
            cacheProgress: 100,
          };
        }
      }
    } catch (error) {
      console.warn("[yueqi.listen] native audio download failed; falling back", error);
    }
  }

  const res = await fetch(sourceUrl, { mode: "cors" });
  if (!res.ok) {
    updateTrack(track.id, { cacheState: "error", cacheProgress: 0 });
    throw new Error(`audio_fetch_${res.status}`);
  }

  const total = Number(res.headers.get("content-length") || 0);
  let blob;
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength || value.length || 0;
      // CORS often hides Content-Length. Still write bytes so the row can
      // show "下载中 · 1.2 MB" instead of a frozen arrow.
      if (total > 0) report(Math.min(99, (received / total) * 100), { bytes: received });
      else report(0, { bytes: received });
    }
    blob = new Blob(chunks, {
      type: res.headers.get("content-type")
        || (looksLikeMp3Url(sourceUrl) ? "audio/mpeg" : "audio/ogg"),
    });
  } else {
    blob = await res.blob();
  }

  const headerType = String(res.headers.get("content-type") || "").split(";")[0].trim();
  const type = blob.type || headerType || "audio/mpeg";
  if (/html|json|text\//i.test(type) && !/audio|mpeg|ogg|mp4|mp3/i.test(type)) {
    updateTrack(track.id, { cacheState: "error", cacheProgress: 0 });
    throw new Error("audio_payload_not_audio");
  }
  if (!blob || blob.size < 2048) {
    updateTrack(track.id, { cacheState: "error", cacheProgress: 0 });
    throw new Error("audio_payload_empty");
  }
  const safeName = safeTrackFileName(track, sourceUrl, type);
  const file = asNamedFile(blob, safeName, type || "audio/mpeg");
  const media = await storeMediaFile(file, "audio");
  if (!media?.id) {
    updateTrack(track.id, { cacheState: "error", cacheProgress: 0 });
    throw new Error("store_media_failed");
  }
  const row = updateTrack(track.id, {
    mediaId: media?.id || "",
    sourceUrl,
    builtin: true,
    cacheState: "cached",
    cacheProgress: 100,
    cacheBytes: blob.size || 0,
  });
  report(100, { force: true });
  return row || {
    ...track,
    mediaId: media?.id || "",
    sourceUrl,
    cacheState: "cached",
    cacheProgress: 100,
    cacheBytes: blob.size || 0,
  };
}

export function resolveTrackCacheState(track = {}) {
  if (track.mediaId || track.cacheState === "cached") return "cached";
  if (track.cacheState === "downloading" || track.cacheState === "queued") {
    return track.cacheState;
  }
  if (track.cacheState === "error") return "error";
  if (track.sourceUrl || track.url) return "remote";
  return "remote";
}

export function formatCacheBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
