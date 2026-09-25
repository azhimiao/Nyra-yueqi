/**
 * Data access for 小手机 apps — shared storage, independent of App-mode panels.
 */

import { LOCAL_KEYS, defaultLibrary, defaultProfile } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { normalizeEvent, migrateEvents, eventsForDate, formatDateKey } from "../calendar/engine.js";
import { normalizeBook, formatReadProgress } from "../library/books.js";
import { getAllRecords, normalizeMemory, storeRecord, deleteRecord } from "../storage/db.js";
import { searchMemories } from "../memory/rag.js";
import { filterRowsByCompanionScope } from "../memory/companion-scope.js";
import { getThemeId, saveThemeId, applyTheme, THEMES } from "../ui/theme.js";
import { getLocale, setLocale, LOCALES, t } from "../i18n/index.js";
import {
  STORED_DEFAULT_TRACK_TITLE,
  STORED_DEFAULT_PLAYLIST,
  parseLocalImportPlaylist,
  canonicalizePlaylistName,
} from "../library/co-listen.js";
import { getFeatureFlags, saveFeatureFlags, isFeatureEnabled } from "../features/flags.js";
import { onCalendarCommitted } from "../memory/adapters/calendar.js";
import { getVoiceSettings, saveVoiceSettings } from "../settings/voice-preferences.js";
import { emitAppEvent } from "../world/app-events.js";
import { getDiarySettings, saveDiarySettings } from "../settings/preferences.js";
import { getSecret, setSecret } from "../platform/secure-store.js";
import { DIARY_STYLES } from "../diary/styles.js";
import { ensureDiaryMemoryProjection, listDiaries } from "../diary/records.js";
import { rescheduleProactiveScheduler } from "../proactive/scheduler.js";

const APP_MODE_KEY = "yueqi.app.mode";

export { STORED_DEFAULT_TRACK_TITLE, STORED_DEFAULT_PLAYLIST };

const SEED_TRACK_TITLE_KEYS = Object.freeze({
  夜航书页: "listen.seed.nightPages",
  雨后低频: "listen.seed.afterRain",
  旧书店灯光: "listen.seed.bookstoreLight",
});

const SEED_PLAYLIST_KEYS = Object.freeze({
  我的歌单: "listen.seed.myPlaylist",
  睡前: "listen.seed.beforeSleep",
  日常: "listen.seed.daily",
  沈既白的歌单: "listen.seed.myPlaylist",
});

/** Legacy demo titles shipped before empty product baseline — strip on read. */
const DEMO_TRACK_TITLES = new Set(Object.keys(SEED_TRACK_TITLE_KEYS));
const DEMO_BOOK_TITLES = new Set(["挪威的森林", "平原上的摩西", "山茶文具店"]);
const DEMO_EVENT_SEED_KEYS = new Set(["freeWindow", "eveningReminder", "bedtimeLine", "bedtimeTime"]);
const LIBRARY_DEMO_SCRUB_KEY = "yueqi.library.demoScrub.v1";

/** Localized label for a stored track title (keeps canonical value in storage). */
export function displayTrackTitle(title, { short = false } = {}) {
  const raw = String(title || "").trim();
  if (!raw || raw === STORED_DEFAULT_TRACK_TITLE) {
    return t(short ? "listen.untitledShort" : "listen.untitledTrack");
  }
  const seedKey = SEED_TRACK_TITLE_KEYS[raw];
  if (seedKey) return t(seedKey);
  return raw;
}

/** Localized label for a stored playlist name. */
export function displayPlaylistName(playlist) {
  const raw = String(playlist || "").trim();
  if (!raw || raw === STORED_DEFAULT_PLAYLIST || raw === "Uncategorized") {
    return t("listen.uncategorized");
  }
  const seedKey = SEED_PLAYLIST_KEYS[raw];
  if (seedKey) return t(seedKey);
  const local = parseLocalImportPlaylist(raw);
  if (local) {
    return local.artist
      ? t("listen.localImportArtist", { artist: local.artist })
      : t("listen.localImport");
  }
  return raw;
}

export { canonicalizePlaylistName, storedLocalImportPlaylist } from "../library/co-listen.js";

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeTrack(track = {}, index = 0) {
  const sourceUrl = String(track.sourceUrl || track.url || "").trim();
  const mediaId = String(track.mediaId || "");
  // Download code historically wrote cacheState/cacheProgress; the store only
  // keeps cacheState/cacheProgress. Accept both so a live download is not erased.
  let cacheState = String(track.cacheState || track.cacheState || "").trim();
  if (!cacheState) {
    cacheState = mediaId ? "cached" : (sourceUrl ? "remote" : "remote");
  }
  if (mediaId) cacheState = "cached";
  return {
    id: String(track.id || `trk-${Date.now().toString(36)}-${index.toString(16)}`),
    title: String(track.title || STORED_DEFAULT_TRACK_TITLE).trim() || STORED_DEFAULT_TRACK_TITLE,
    playlist: canonicalizePlaylistName(track.playlist || STORED_DEFAULT_PLAYLIST),
    mediaId,
    sourceUrl,
    artist: String(track.artist || "").trim(),
    license: String(track.license || "").trim(),
    licenseUrl: String(track.licenseUrl || "").trim(),
    builtin: Boolean(track.builtin),
    cacheState,
    cacheProgress: Math.max(0, Math.min(100, Math.floor(Number(track.cacheProgress ?? track.cacheProgress) || 0))),
    cacheBytes: Math.max(0, Math.floor(Number(track.cacheBytes ?? track.cacheBytes) || 0)),
    mood: String(track.mood || ""),
    genre: String(track.genre || ""),
  };
}

/** Ensure library.tracks have stable ids; persist if any were missing. */
export function ensureTrackIds(tracks) {
  const list = Array.isArray(tracks) ? tracks : listTracks();
  let dirty = false;
  const next = list.map((track, index) => {
    const normalized = normalizeTrack(track, index);
    if (!track?.id || String(track.playlist || "").trim() !== normalized.playlist) dirty = true;
    return normalized;
  });
  if (dirty) writeLibrary({ tracks: next });
  return next;
}

/** Ensure library.books have ids. */
export function ensureBookIds(books) {
  const list = Array.isArray(books) ? books : listBooks();
  let dirty = false;
  const next = list.map((book, index) => {
    const row = normalizeBook(book);
    if (row.id) return row;
    dirty = true;
    return { ...row, id: `book-${Date.now().toString(36)}-${index.toString(16)}` };
  });
  if (dirty) writeLibrary({ books: next });
  return next;
}

export function readLibrary() {
  const raw = readLocalObject(LOCAL_KEYS.libraryKey, null);
  const base = raw && typeof raw === "object" ? raw : defaultLibrary;
  const before = Array.isArray(base.photos) ? base.photos : defaultLibrary.photos;
  const photos = scrubLibraryPhotos(before);
  const hadGroups = Array.isArray(base.photoGroups) && base.photoGroups.length > 0;
  const photoGroups = normalizePhotoGroups(base.photoGroups, photos)
    .filter((group) => {
      // Drop empty auto "默认分组" left after scrubbing fake seed photos
      if (group.id === "pg-default") {
        return photos.some((photo) => photo.groupId === group.id);
      }
      return true;
    });
  const rawTracks = Array.isArray(base.tracks) ? base.tracks : [];
  const rawBooks = Array.isArray(base.books) ? base.books : [];
  const rawEvents = Array.isArray(base.events) ? base.events : [];
  const tracks = scrubDemoTracks(rawTracks);
  const books = scrubDemoBooks(rawBooks);
  const events = scrubDemoEvents(migrateEvents(rawEvents));
  const scrubbed = photos.length !== before.length
    || (Array.isArray(base.photoGroups) && base.photoGroups.length !== photoGroups.length)
    || tracks.length !== rawTracks.length
    || books.length !== rawBooks.length
    || events.length !== rawEvents.length;
  const next = {
    ...defaultLibrary,
    ...base,
    events,
    books: books.map((book, index) => {
      const row = normalizeBook(book);
      return row.id ? row : { ...row, id: `book-${index}` };
    }),
    tracks: tracks.map((track, index) => normalizeTrack(track, index)),
    photos,
    photoGroups,
    grants: { ...defaultLibrary.grants, ...(base.grants || {}) },
    notificationSettings: {
      ...defaultLibrary.notificationSettings,
      ...(base.notificationSettings || {}),
    },
  };
  if (scrubbed || (!hadGroups && photoGroups.length)) {
    writeLocalObject(LOCAL_KEYS.libraryKey, next);
    try {
      window.localStorage.setItem(LIBRARY_DEMO_SCRUB_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  return next;
}

function scrubDemoTracks(tracks = []) {
  return (Array.isArray(tracks) ? tracks : []).filter((track) => {
    const title = String(track?.title || "").trim();
    const playlist = String(track?.playlist || "").trim();
    const hasMedia = Boolean(
      track?.src
      || track?.url
      || track?.sourceUrl
      || track?.mediaId
      || track?.path
      || track?.builtin,
    );
    if (hasMedia) return true;
    if (DEMO_TRACK_TITLES.has(title)) return false;
    if (playlist === "沈既白的歌单") return false;
    return true;
  });
}

function scrubDemoBooks(books = []) {
  return (Array.isArray(books) ? books : []).filter((book) => {
    const title = String(book?.title || "").trim();
    const hasContent = Boolean(
      book?.content
      || book?.text
      || book?.fileId
      || book?.mediaId
      || book?.bundledPath
      || book?.builtin
      || String(book?.id || "").startsWith("nyra.original."),
    );
    if (hasContent) return true;
    return !DEMO_BOOK_TITLES.has(title);
  });
}

function scrubDemoEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter((event) => {
    const seedKey = String(event?.seedKey || "").trim();
    if (seedKey && DEMO_EVENT_SEED_KEYS.has(seedKey)) return false;
    return true;
  });
}

export function writeLibrary(patch) {
  const next = { ...readLibrary(), ...patch };
  writeLocalObject(LOCAL_KEYS.libraryKey, next);
  return next;
}

export function listEvents() {
  return readLibrary().events || [];
}

export function listUpcomingEvents(limit = 12) {
  const today = formatDateKey(new Date());
  const events = listEvents()
    .slice()
    .sort((a, b) => String(a.date || today).localeCompare(String(b.date || today))
      || String(a.time || "").localeCompare(String(b.time || "")));
  return events.slice(0, limit);
}

export function addEvent({ title, time, prompt, date, mode, companionId, characterId, userId, relationshipId } = {}) {
  const library = readLibrary();
  const event = normalizeEvent({
    id: `phone-event-${Date.now()}`,
    title: String(title || "新提醒").trim() || "新提醒",
    time: String(time || "21:00").trim() || "21:00",
    prompt: String(prompt || "").trim(),
    date: date || formatDateKey(new Date()),
    mode: mode || "proactive_message",
    type: "generic",
    companionId: companionId || characterId || "",
    characterId: characterId || companionId || "",
  }, date || formatDateKey(new Date()));
  library.events = [...(library.events || []), event];
  writeLibrary({ events: library.events });
  try {
    rescheduleProactiveScheduler();
  } catch {
    /* scheduler may be unbound in unit tests */
  }
  projectPhoneCalendarLifecycle(event, {
    op: "create",
    scope: { companionId: companionId || characterId || "", userId, relationshipId },
  });
  return event;
}

export function removeEvent(id, opts = {}) {
  const library = readLibrary();
  const removed = (library.events || []).find((item) => item.id === id) || null;
  library.events = (library.events || []).filter((item) => item.id !== id);
  writeLibrary({ events: library.events });
  try {
    rescheduleProactiveScheduler();
  } catch {
    /* scheduler may be unbound in unit tests */
  }
  if (removed) {
    projectPhoneCalendarLifecycle(removed, {
      op: "cancel",
      scope: {
        companionId: opts.companionId || removed.companionId || removed.characterId || "",
        userId: opts.userId,
        relationshipId: opts.relationshipId,
      },
    });
  }
  return library.events;
}

/** Flag-gated Timeline lifecycle; Calendar repository remains sole state authority. */
function projectPhoneCalendarLifecycle(event, opts = {}) {
  try {
    if (!isFeatureEnabled("unifiedMemoryAdaptersV1")) return;
    onCalendarCommitted(event, opts);
  } catch {
    /* non-fatal */
  }
}

export function eventsToday() {
  return eventsForDate(listEvents(), formatDateKey(new Date()));
}

export function listBooks() {
  return readLibrary().books || [];
}

export function listTracks() {
  return readLibrary().tracks || [];
}

export function addTrack(track = {}) {
  const library = readLibrary();
  const next = normalizeTrack({
    ...track,
    id: track.id || uid("trk"),
  }, (library.tracks || []).length);
  library.tracks = [next, ...(library.tracks || [])];
  writeLibrary({ tracks: library.tracks });
  return next;
}

export function removeTrack(id) {
  const key = String(id || "").trim();
  if (!key) return listTracks();
  const library = readLibrary();
  library.tracks = (library.tracks || []).filter((track) => track.id !== key);
  writeLibrary({ tracks: library.tracks });
  return library.tracks;
}

export function updateTrack(id, patch = {}) {
  const key = String(id || "").trim();
  if (!key) return null;
  const library = readLibrary();
  let hit = null;
  library.tracks = (library.tracks || []).map((track, index) => {
    const row = normalizeTrack(track, index);
    if (row.id !== key) return row;
    hit = normalizeTrack({ ...row, ...patch, id: row.id }, index);
    return hit;
  });
  writeLibrary({ tracks: library.tracks });
  return hit;
}

/**
 * Persist co-read progress onto library.books[] (+ optional id match / title fallback).
 */
export function updateBookProgress(bookKey, patch = {}) {
  const library = readLibrary();
  const key = String(bookKey || "").trim();
  let hit = false;
  library.books = (library.books || []).map((book, index) => {
    const row = normalizeBook(book);
    const id = row.id || `book-${index}`;
    const match = key && (id === key || row.title === key || book.id === key);
    if (!match) return { ...row, id };
    hit = true;
    const scrollRatio = Math.max(0, Math.min(1, Number(patch.scrollRatio ?? row.scrollRatio) || 0));
    const progress = String(patch.progress || formatReadProgress(scrollRatio) || row.progress || "在读");
    return {
      ...row,
      id,
      scrollRatio,
      progress,
      chapter: String(patch.chapter ?? row.chapter ?? progress),
      excerpt: String(patch.excerpt ?? row.excerpt ?? "").slice(0, 480),
      pageIndex: Number.isFinite(Number(patch.pageIndex))
        ? Math.max(0, Math.floor(Number(patch.pageIndex)))
        : row.pageIndex,
      pageCount: Number.isFinite(Number(patch.pageCount))
        ? Math.max(1, Math.floor(Number(patch.pageCount)))
        : row.pageCount,
      readerDocVersion: Number(patch.readerDocVersion) || row.readerDocVersion || 1,
      updatedAt: new Date().toISOString(),
    };
  });
  if (!hit && key) {
    library.books = [
      ...library.books,
      normalizeBook({
        id: `book-${Date.now().toString(36)}`,
        title: key,
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
    ];
  }
  writeLibrary({ books: library.books });
  return library.books;
}

export function addBook(book = {}) {
  const library = readLibrary();
  const next = normalizeBook({
    ...book,
    id: book.id || uid("book"),
    updatedAt: book.updatedAt || new Date().toISOString(),
  });
  library.books = [next, ...(library.books || [])];
  writeLibrary({ books: library.books });
  return next;
}

export function removeBook(id) {
  const key = String(id || "").trim();
  if (!key) return listBooks();
  const library = readLibrary();
  library.books = (library.books || []).filter((book) => {
    const row = normalizeBook(book);
    return row.id !== key && String(book.id || "") !== key;
  });
  writeLibrary({ books: library.books });
  return library.books;
}

export function normalizeLibraryPhoto(photo = {}) {
  return {
    id: String(photo.id || uid("photo")),
    title: String(photo.title || "新图片").trim() || "新图片",
    tone: photo.tone || "rose",
    mediaId: String(photo.mediaId || ""),
    summary: String(photo.summary || ""),
    createdAt: photo.createdAt || new Date().toISOString(),
    groupId: photo.groupId ? String(photo.groupId) : "",
    companionId: String(photo.companionId || "").trim(),
  };
}

/** Album photos must be real user media — never desk-pet / package stills. */
export function isGallerySafePhotoUrl(url) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (u.startsWith("data:image/") || u.startsWith("blob:")) return true;
  if (/^https:\/\//i.test(u)) return true;
  if (/\/assets\/(avatars\/xingli|characters|pet-poses)\//i.test(u)) return false;
  if (/portrait\.png/i.test(u)) return false;
  if (/\/clips\//i.test(u)) return false;
  return false;
}

function scrubLibraryPhotos(photos = []) {
  return (Array.isArray(photos) ? photos : [])
    .map(normalizeLibraryPhoto)
    .filter((photo) => Boolean(photo.mediaId));
}

function normalizePhotoGroups(rawGroups, photos = []) {
  const groups = [];
  const seen = new Set();
  for (const item of Array.isArray(rawGroups) ? rawGroups : []) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    groups.push({
      id,
      name: String(item.name || "未命名分组").trim().slice(0, 24) || "未命名分组",
      createdAt: item.createdAt || new Date().toISOString(),
      locked: Boolean(item.locked),
      semantic: String(item.semantic || ""),
      surface: String(item.surface || ""),
      parentSemantic: String(item.parentSemantic || ""),
    });
  }

  // Only migrate real imported photos (with mediaId) into a default group.
  const ungrouped = photos.filter((photo) => photo.mediaId && !photo.groupId);
  if (!groups.length && ungrouped.length) {
    const id = "pg-default";
    groups.push({ id, name: "默认分组", createdAt: new Date().toISOString() });
    ungrouped.forEach((photo) => {
      photo.groupId = id;
    });
  }

  return groups;
}

export function listPhotoGroups() {
  return readLibrary().photoGroups || [];
}

export function listPhotos(groupId = "") {
  const photos = readLibrary().photos || [];
  if (!groupId) return photos;
  return photos.filter((photo) => photo.groupId === groupId);
}

export function createPhotoGroup(name = "新分组") {
  const library = readLibrary();
  const group = {
    id: uid("pg"),
    name: String(name || "新分组").trim().slice(0, 24) || "新分组",
    createdAt: new Date().toISOString(),
  };
  library.photoGroups = [...(library.photoGroups || []), group];
  writeLibrary({ photoGroups: library.photoGroups });
  return group;
}

/** Stable AI 创作 group for 绘境 (F6). */
export function ensureAiPhotoGroup() {
  const library = readLibrary();
  const groups = library.photoGroups || [];
  const existing = groups.find((g) => g.id === "pg-ai-studio");
  if (existing) {
    if (existing.name !== "AI 创作") {
      library.photoGroups = groups.map((g) => (
        g.id === "pg-ai-studio" ? { ...g, name: "AI 创作" } : g
      ));
      writeLibrary({ photoGroups: library.photoGroups });
      return library.photoGroups.find((g) => g.id === "pg-ai-studio");
    }
    return existing;
  }
  const group = {
    id: "pg-ai-studio",
    name: "AI 创作",
    createdAt: new Date().toISOString(),
  };
  library.photoGroups = [...groups, group];
  writeLibrary({ photoGroups: library.photoGroups });
  return group;
}

export function renamePhotoGroup(id, name) {
  const library = readLibrary();
  const nextName = String(name || "").trim().slice(0, 24);
  if (!nextName) return null;
  library.photoGroups = (library.photoGroups || []).map((group) => (
    group.id === id ? { ...group, name: nextName } : group
  ));
  writeLibrary({ photoGroups: library.photoGroups });
  return library.photoGroups.find((group) => group.id === id) || null;
}

export function deletePhotoGroup(id) {
  const target = String(id || "").trim();
  const locked = new Set([
    "pg-visual-identity",
    "pg-visual-life",
    "pg-visual-user-shared",
    "pg-visual-relationship",
    "pg-visual-chat",
    "pg-visual-moments",
    "pg-visual-world",
    "pg-ai-studio",
  ]);
  if (locked.has(target)) return readLibrary().photoGroups || [];
  const library = readLibrary();
  const group = (library.photoGroups || []).find((item) => item.id === target);
  if (group?.locked) return library.photoGroups || [];
  library.photoGroups = (library.photoGroups || []).filter((item) => item.id !== target);
  library.photos = (library.photos || []).map((photo) => (
    photo.groupId === target ? { ...photo, groupId: "" } : photo
  ));
  writeLibrary({ photoGroups: library.photoGroups, photos: library.photos });
  return library.photoGroups;
}

export function addPhotoToGroup(groupId, photo = {}) {
  const library = readLibrary();
  if (!(library.photoGroups || []).some((group) => group.id === groupId)) return null;
  const next = normalizeLibraryPhoto({
    ...photo,
    id: photo.id || uid("photo"),
    groupId,
    createdAt: photo.createdAt || new Date().toISOString(),
  });
  library.photos = [next, ...(library.photos || [])];
  writeLibrary({ photos: library.photos, grants: { ...library.grants, album: true } });
  emitAppEvent("gallery.photo.created", {
    appId: "gallery",
    photoId: next.id,
    groupId,
  });
  return next;
}

export function removePhoto(id) {
  const library = readLibrary();
  library.photos = (library.photos || []).filter((photo) => photo.id !== id);
  writeLibrary({ photos: library.photos });
  return library.photos;
}

export function readProfile() {
  const raw = readLocalObject(LOCAL_KEYS.profileKey, null);
  if (!raw || typeof raw !== "object") return JSON.parse(JSON.stringify(defaultProfile));
  return {
    ...defaultProfile,
    ...raw,
    fields: Array.isArray(raw.fields) && raw.fields.length
      ? [...defaultProfile.fields.map((v, i) => raw.fields[i] ?? v)]
      : [...defaultProfile.fields],
    ranges: Array.isArray(raw.ranges) && raw.ranges.length
      ? [...defaultProfile.ranges.map((v, i) => raw.ranges[i] ?? v)]
      : [...defaultProfile.ranges],
    tokens: Array.isArray(raw.tokens) ? raw.tokens : [...defaultProfile.tokens],
    status: { ...defaultProfile.status, ...(raw.status || {}) },
  };
}

export function writeProfile(patch) {
  const current = readProfile();
  const next = {
    ...current,
    ...patch,
    fields: patch.fields || current.fields,
    ranges: patch.ranges || current.ranges,
    tokens: patch.tokens || current.tokens,
    status: { ...current.status, ...(patch.status || {}) },
  };
  writeLocalObject(LOCAL_KEYS.profileKey, next);
  return next;
}

export function profileSummary() {
  const profile = readProfile();
  const unnamed = t("listen.untitledShort");
  return {
    name: profile.fields[0] || unnamed,
    alias: profile.fields[1] || profile.fields[0] || unnamed,
    identity: profile.fields[2] || "",
    model: profile.fields[3] || "",
    base: profile.fields[4] || "",
    ranges: profile.ranges,
    tokens: profile.tokens,
  };
}

export async function memoryCount(companionId = "") {
  const cid = String(companionId || "").trim();
  if (!cid) return 0;
  await ensureDiaryMemoryProjection(cid).catch(() => {});
  const memories = (await getAllRecords("memories")).map(normalizeMemory);
  return filterRowsByCompanionScope(
    memories.filter((record) => record.searchable),
    { companionId: cid, userId: "local", allowGlobal: false },
  ).length;
}

export async function listMemoryPreview(limit = 20, companionId = "") {
  const cid = String(companionId || "").trim();
  if (!cid) return [];
  await ensureDiaryMemoryProjection(cid).catch(() => {});
  const memories = (await getAllRecords("memories"))
    .map(normalizeMemory)
    .filter((record) => record.searchable)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return filterRowsByCompanionScope(memories, {
    companionId: cid,
    userId: "local",
    allowGlobal: false,
  }).slice(0, limit);
}

export async function searchPhoneMemories(query, companionId = "") {
  const cid = String(companionId || "").trim();
  if (!cid) return [];
  await ensureDiaryMemoryProjection(cid).catch(() => {});
  const q = String(query || "").trim();
  if (!q) return listMemoryPreview(24, cid);
  try {
    const hits = await searchMemories(q, {
      topK: 24,
      companionId: cid,
      characterId: cid,
    });
    return (Array.isArray(hits) ? hits : [])
      .filter((hit) => filterRowsByCompanionScope([hit], {
        companionId: cid,
        userId: "local",
        allowGlobal: false,
      }).length)
      .map((hit) => ({
        id: hit.id || hit.drawerId || "",
        title: hit.title || hit.room || "记忆",
        rawText: hit.rawText || hit.text || hit.content || hit.snippet || "",
        createdAt: hit.createdAt || "",
      }));
  } catch {
    return [];
  }
}

export async function listWorldbook() {
  return (await getAllRecords("worldbook")) || [];
}

export async function saveWorldbookEntry(entry) {
  const next = {
    id: entry.id || `wb-${Date.now()}`,
    title: String(entry.title || "未命名").trim() || "未命名",
    category: entry.category || "氛围",
    triggers: Array.isArray(entry.triggers) ? entry.triggers : String(entry.triggersText || "")
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    content: String(entry.content || "").trim(),
    injectSlot: entry.injectSlot || "system",
    priority: Number(entry.priority) || 50,
    enabled: entry.enabled !== false,
  };
  await storeRecord("worldbook", next);
  return next;
}

export async function deleteWorldbookEntry(id) {
  await deleteRecord("worldbook", id);
}

export function readProvider() {
  return {
    kind: "openai",
    baseUrl: "",
    model: "",
    ...readLocalObject(LOCAL_KEYS.providerKey, {}),
  };
}

export function writeProvider(patch) {
  const next = { ...readProvider(), ...patch };
  writeLocalObject(LOCAL_KEYS.providerKey, next);
  return next;
}

export async function readApiKey() {
  try {
    return (await getSecret("provider.apiKey")) || "";
  } catch {
    return "";
  }
}

export async function writeApiKey(value) {
  await setSecret("provider.apiKey", String(value || "").trim());
}

export function readEcosystem() {
  return {
    loggedIn: false,
    username: "",
    token: "",
    serviceBase: "",
    ...readLocalObject(LOCAL_KEYS.ecosystemKey, {}),
  };
}

export function writeEcosystem(patch) {
  const next = {
    ...readEcosystem(),
    ...patch,
    loggedIn: false,
    authMode: "offline",
    token: "",
    cloudSave: false,
    modelSource: "byok",
    billingBalance: 0,
    username: "本机",
  };
  writeLocalObject(LOCAL_KEYS.ecosystemKey, next);
  return next;
}

export function getAppMode() {
  try {
    const stored = localStorage.getItem(APP_MODE_KEY);
    if (stored === "phone" || stored === "app") return stored;
  } catch {
    /* ignore */
  }
  // Unset = product default for handsets (matches resolveDefaultAppMode).
  try {
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 1079px)")?.matches) {
      return "phone";
    }
  } catch {
    /* ignore */
  }
  return "phone";
}

export function setAppModePref(mode) {
  const next = mode === "phone" ? "phone" : "app";
  try {
    localStorage.setItem(APP_MODE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export {
  getThemeId,
  saveThemeId,
  applyTheme,
  THEMES,
  getLocale,
  setLocale,
  LOCALES,
  getFeatureFlags,
  saveFeatureFlags,
  getVoiceSettings,
  saveVoiceSettings,
  getDiarySettings,
  saveDiarySettings,
  DIARY_STYLES,
  listDiaries,
  formatDateKey,
};
