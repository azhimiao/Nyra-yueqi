import { formatDateKey } from "../calendar/engine.js";
import { parseIcsEvents } from "../calendar/ics.js";
import {
  defaultTitleForEventType,
} from "../calendar/event-types.js";
import {
  DEFAULT_EVENT_MODE,
  eventModeLabel,
  eventModeOptions,
  normalizeEventMode,
} from "../calendar/modes.js";
import {
  formatCoListenTellMessage,
  positionFromRatio,
  snapshotFromAudio,
  STORED_DEFAULT_TRACK_TITLE,
} from "../library/co-listen.js";
import { subscribeCoListenState } from "../library/co-listen-sync.js";
import {
  chapterFromProgress,
} from "../library/co-read.js";
import {
  displayBookAuthor,
  displayBookTitle,
  displayReadProgress,
  formatReadProgress,
  previewFromBody,
} from "../library/books.js";
import { inferTrackTags, pushRecentPlay } from "../library/recent-plays.js";
import { ingestBookChunks, deleteBookMemoryIndex } from "../library/books-import.js";
import { importBookResource, importAudioResource } from "../portability/resources/index.js";
import { persistMediaFile } from "../platform/media-files.js";
import { isCoListenEnabled } from "../ui/companion-presence-wire.js";
import { shortFileTitle } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import { localizeEventTitle } from "../calendar/seed-labels.js";
import {
  displayPlaylistName,
  displayTrackTitle,
  storedLocalImportPlaylist,
  canonicalizePlaylistName,
  listTracks,
} from "../phone-shell/phone-data.js";
import { downloadBuiltinTrack } from "../library/builtin-catalog.js";

function modeLabel(mode = DEFAULT_EVENT_MODE) {
  return eventModeLabel(mode);
}

function truncatePrompt(text = "", max = 28) {
  const value = String(text || "").trim().replace(/\s+/g, " ");
  if (!value) return t("calendar.promptFallback");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Library panel: tracks, photos, books, ICS, audio player, co-listen UI.
 */
export function wireLibraryPanel(deps) {
  const {
    calendarState,
    trackList,
    eventList,
    bookList,
    addTrackButton,
    addEventButton,
    addBookButton,
    importBookButton,
    importIcsButton,
    trackFileInput,
    bookFileInput,
    icsFileInput,
    audioPlayer,
    audioToggle,
    nowTitle,
    nowSeek,
    coListenToggle,
    coListenTell,
    coListenSyncHint,
    coListenTabId,
    coListenState,
    persistLibraryState,
    renderCalendarGrid,
    rescheduleProactiveScheduler,
    refreshIcons,
    openFileImport,
    removeEditableItem,
    storeMediaFile,
    storeRecord = null,
    getAllRecords = null,
    getMediaRecord,
    resolveMediaUrl,
    refreshCoListenUi,
    publishLocalCoListen,
    announceCoListenIfNeeded,
    syncCoListenFromAudio,
    applyExternalGrants,
    collectExternalGrants,
    renderMemoryState,
    scheduleCapabilityRefresh,
    refreshLifeContextStrip,
    setPanel,
    input,
    form,
    getNowPlaying,
    setNowPlaying,
    bookReader = null,
    onEventCommitted = null,
    readMediaBlob,
  } = deps;

  const eventEditSheet = document.getElementById("eventEditSheet");
  const eventEditHeading = eventEditSheet?.querySelector("[data-event-edit-heading]");
  const eventEditTime = eventEditSheet?.querySelector("[data-event-edit-time]");
  const eventEditTitle = eventEditSheet?.querySelector("[data-event-edit-title]");
  const eventEditPrompt = eventEditSheet?.querySelector("[data-event-edit-prompt]");
  const eventEditMode = eventEditSheet?.querySelector("[data-event-edit-mode]");
  let editingEventRow = null;

  function newEventId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createTrackRow() {
    const row = document.createElement("article");
    row.className = "track-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `
    <span class="track-row__index" data-track-index>01</span>
    <span class="track-row__art" aria-hidden="true"></span>
    <div class="track-row__meta">
      <strong class="track-row__title" data-track-title>${t("listen.untitledTrack")}</strong>
      <span class="track-row__artist" data-track-playlist>${t("listen.uncategorized")}</span>
    </div>
    <button type="button" class="track-row__more" data-remove-track aria-label="${t("common.delete")}">
      <i data-lucide="trash-2"></i><span class="icon-fallback">⌫</span>
    </button>
  `;
    return row;
  }

  function trackMetaFromRow(row) {
    const title =
      row?.dataset.title
      || row?.querySelector("[data-track-title]")?.textContent?.trim()
      || row?.querySelector("input")?.value
      || t("listen.untitledTrack");
    const playlist = canonicalizePlaylistName(
      row?.dataset.playlist
      || row?.querySelector("[data-track-playlist]")?.textContent?.trim()
      || row?.querySelectorAll("input")?.[1]?.value
      || t("listen.uncategorized"),
    );
    return { title, playlist };
  }

  function syncTrackRowView(row) {
    if (!row) return;
    const titleNode = row.querySelector("[data-track-title]");
    const playlistNode = row.querySelector("[data-track-playlist]");
    const title = displayTrackTitle(row.dataset.title) || t("listen.untitledTrack");
    const playlist = displayPlaylistName(row.dataset.playlist) || t("listen.uncategorized");
    if (titleNode) titleNode.textContent = title;
    if (playlistNode) playlistNode.textContent = playlist;
    row.setAttribute("aria-label", `${title} · ${playlist}`);
  }

  function refreshTrackListChrome() {
    const rows = Array.from(trackList?.querySelectorAll(".track-row") || []);
    rows.forEach((row, index) => {
      const indexNode = row.querySelector("[data-track-index]");
      if (indexNode) indexNode.textContent = String(index + 1).padStart(2, "0");
    });
    const countNode = document.querySelector("[data-track-count]");
    if (countNode) {
      const n = rows.length;
      countNode.hidden = n === 0;
      countNode.textContent = t("listen.trackCount", { count: n });
    }
    const emptyNode = document.querySelector("[data-music-empty]");
    if (emptyNode) emptyNode.hidden = rows.length > 0;
  }

  function setMusicView(view) {
    const root = document.querySelector(".music-library");
    if (!root) return;
    const next = view === "player" ? "player" : "list";
    root.dataset.musicView = next;
    root.querySelectorAll("[data-music-pane]").forEach((pane) => {
      const active = pane.dataset.musicPane === next;
      pane.hidden = !active;
    });
    refreshIcons();
  }

  function syncEventRowView(row) {
    if (!row) return;
    const time = row.dataset.time || "21:00";
    const rawTitle = row.dataset.title || t("calendar.newReminder");
    const title = localizeEventTitle(rawTitle);
    const prompt = row.dataset.prompt || "";
    const mode = row.dataset.mode || "proactive_message";
    row.dataset.eventType = "generic";
    const timeNode = row.querySelector("[data-event-time]");
    const titleNode = row.querySelector("[data-event-title]");
    const metaNode = row.querySelector("[data-event-meta]");
    if (timeNode) timeNode.textContent = time;
    if (titleNode) titleNode.textContent = title;
    if (metaNode) metaNode.textContent = `${truncatePrompt(prompt)} · ${modeLabel(mode)}`;
    row.setAttribute("aria-label", `${time} ${title}`);
  }

  function createEventRow() {
    const row = document.createElement("article");
    row.className = "event-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.dataset.eventId = newEventId();
    row.dataset.eventType = "generic";
    row.dataset.time = "21:00";
    row.dataset.title = t("calendar.newReminder");
    row.dataset.prompt = "";
    row.dataset.mode = "proactive_message";
    row.innerHTML = `
    <div class="event-alarm-main">
      <time class="event-alarm-time" data-event-time>21:00</time>
      <div class="event-alarm-copy">
        <strong data-event-title>${t("calendar.newReminder")}</strong>
        <span data-event-meta>${t("calendar.aiReminderHint")}</span>
      </div>
    </div>
    <span class="event-alarm-chevron" aria-hidden="true"><i data-lucide="chevron-right"></i><span class="icon-fallback">›</span></span>
  `;
    syncEventRowView(row);
    return row;
  }

  function coverToneForTitle(title = "") {
    const tones = ["ink", "moss", "clay", "dusk", "sea", "sand"];
    const text = String(title || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 3)) % 997;
    return tones[hash % tones.length];
  }

  function createBookRow() {
    const row = document.createElement("article");
    row.className = "book-row book-shelf-card";
    row.innerHTML = `
    <button class="book-cover" type="button" data-open-book aria-label="${t("appShell.library.openReading")}">
      <span class="book-cover-spine" aria-hidden="true"></span>
      <span class="book-cover-label" data-book-cover-label></span>
    </button>
    <div class="book-shelf-meta">
      <strong data-book-title>${t("appShell.library.newBook")}</strong>
      <span data-book-author>${t("phone.read.unknownAuthor")}</span>
      <em class="book-progress-label" data-book-progress>${t("phone.read.toRead")}</em>
    </div>
    <button type="button" class="book-shelf-remove" data-remove-book aria-label="${t("common.delete")}">
      <i data-lucide="x"></i><span class="icon-fallback">×</span>
    </button>
  `;
    return row;
  }

  function renderTrackRow(track = {}) {
    const row = createTrackRow();
    if (track.id) row.dataset.trackId = track.id;
    if (track.mediaId) row.dataset.mediaId = track.mediaId;
    if (track.fileName) row.dataset.fileName = track.fileName;
    if (track.resourceId) row.dataset.resourceId = track.resourceId;
    if (track.sourceUrl) row.dataset.sourceUrl = track.sourceUrl;
    if (track.artist) row.dataset.artist = track.artist;
    if (track.license) row.dataset.license = track.license;
    if (track.licenseUrl) row.dataset.licenseUrl = track.licenseUrl;
    if (track.builtin) row.dataset.builtin = "1";
    if (track.cacheState) row.dataset.cacheState = track.cacheState;
    if (track.cacheProgress != null) row.dataset.cacheProgress = String(track.cacheProgress);
    if (track.cacheBytes != null) row.dataset.cacheBytes = String(track.cacheBytes);
    const tags = inferTrackTags(track);
    row.dataset.mood = tags.mood;
    row.dataset.genre = tags.genre;
    // Dataset carries the stored value; syncTrackRowView localizes for display.
    // Localizing here would let a persist round-trip write UI copy into storage.
    row.dataset.title = String(track.title || "").trim() || STORED_DEFAULT_TRACK_TITLE;
    row.dataset.playlist = canonicalizePlaylistName(track.playlist);
    syncTrackRowView(row);
    return row;
  }

  function renderEventRow(event = {}) {
    const row = createEventRow();
    const date = event.date || calendarState.selectedDate || formatDateKey();
    const title = event.title || defaultTitleForEventType();
    const mode = normalizeEventMode(event.mode || DEFAULT_EVENT_MODE);
    const prompt = String(event.prompt || "").trim();
    row.dataset.eventId = event.id || row.dataset.eventId || newEventId();
    row.dataset.date = date;
    row.dataset.eventType = "generic";
    row.dataset.time = event.time || "21:00";
    row.dataset.title = title;
    row.dataset.prompt = prompt;
    row.dataset.mode = mode;
    syncEventRowView(row);
    return row;
  }

  function closeEventEditor({ discardNew = false } = {}) {
    if (!eventEditSheet) return;
    const row = editingEventRow;
    editingEventRow = null;
    eventEditSheet.classList.remove("is-open");
    window.setTimeout(() => {
      eventEditSheet.hidden = true;
      eventEditSheet.setAttribute("aria-hidden", "true");
    }, 180);
    if (discardNew && row?.dataset.isNew === "1") {
      row.remove();
      persistLibraryState();
      renderCalendarGrid();
      rescheduleProactiveScheduler();
    }
  }

  function openEventEditor(row, { isNew = false } = {}) {
    if (!eventEditSheet || !row) return;
    editingEventRow = row;
    if (isNew) row.dataset.isNew = "1";
    else delete row.dataset.isNew;
    if (eventEditHeading) eventEditHeading.textContent = t(isNew ? "appShell.calendar.createReminder" : "appShell.calendar.editReminder");
    if (eventEditTime) eventEditTime.value = row.dataset.time || "21:00";
    if (eventEditTitle) eventEditTitle.value = row.dataset.title || t("calendar.newReminder");
    if (eventEditPrompt) {
      eventEditPrompt.value = row.dataset.prompt || "";
    }
    if (eventEditMode) {
      eventEditMode.innerHTML = eventModeOptions()
        .map((item) => `<option value="${item.value}">${item.label}</option>`)
        .join("");
      eventEditMode.value = normalizeEventMode(row.dataset.mode || DEFAULT_EVENT_MODE);
    }
    eventEditSheet.hidden = false;
    eventEditSheet.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => eventEditSheet.classList.add("is-open"));
    refreshIcons();
    window.setTimeout(() => (isNew ? eventEditPrompt : eventEditTitle)?.focus(), 40);
  }

  function saveEventEditor() {
    const row = editingEventRow;
    if (!row) {
      closeEventEditor();
      return;
    }
    const title = (eventEditTitle?.value || "").trim() || t("calendar.newReminder");
    row.dataset.time = eventEditTime?.value || "21:00";
    row.dataset.title = title;
    row.dataset.eventType = "generic";
    row.dataset.prompt = (eventEditPrompt?.value || "").trim();
    row.dataset.mode = eventEditMode?.value || "proactive_message";
    delete row.dataset.isNew;
    syncEventRowView(row);
    closeEventEditor();
    persistLibraryState();
    renderCalendarGrid();
    rescheduleProactiveScheduler();
    refreshIcons();
    void Promise.resolve(onEventCommitted?.({
      id: row.dataset.eventId || "",
      date: row.dataset.date || "",
      time: row.dataset.time || "",
      title: row.dataset.title || title,
      prompt: row.dataset.prompt || "",
      mode: row.dataset.mode || "proactive_message",
    }));
  }

  function deleteEditingEvent() {
    const row = editingEventRow;
    if (!row) {
      closeEventEditor();
      return;
    }
    editingEventRow = null;
    closeEventEditor();
    row.classList.add("is-removing");
    window.setTimeout(() => {
      row.remove();
      persistLibraryState();
      renderCalendarGrid();
      rescheduleProactiveScheduler();
    }, 180);
  }

  function findEventRow(ref = {}) {
    if (!eventList) return null;
    if (ref instanceof HTMLElement) return ref.closest(".event-row");
    if (ref.id) {
      const byId = Array.from(eventList.querySelectorAll(".event-row"))
        .find((row) => row.dataset.eventId === ref.id);
      if (byId) return byId;
    }
    return Array.from(eventList.querySelectorAll(".event-row")).find((row) => (
      (!ref.date || row.dataset.date === ref.date)
      && (!ref.time || row.dataset.time === ref.time)
      && (!ref.title || row.dataset.title === ref.title)
    )) || null;
  }

  function renderBookRow(book = {}) {
    const row = createBookRow();
    const title = book.title || t("appShell.library.newBook");
    const author = book.author || t("phone.read.unknownAuthor");
    if (book.id) row.dataset.bookId = book.id;
    if (book.fileId) row.dataset.fileId = book.fileId;
    if (book.format) row.dataset.format = book.format;
    if (book.excerpt) row.dataset.excerpt = book.excerpt;
    if (book.synopsis) row.dataset.synopsis = book.synopsis;
    if (book.chapter) row.dataset.chapter = book.chapter;
    if (book.mediaId) row.dataset.mediaId = book.mediaId;
    if (book.bundledPath) row.dataset.bundledPath = book.bundledPath;
    if (book.builtin) row.dataset.builtin = "1";
    if (book.resourceId) row.dataset.resourceId = book.resourceId;
    if (book.scrollRatio != null) row.dataset.scrollRatio = String(book.scrollRatio);
    row.dataset.title = title;
    row.dataset.author = author;
    row.dataset.progress = String(book.progress || "");
    row.dataset.coverTone = coverToneForTitle(title);
    row.classList.add(`tone-${row.dataset.coverTone}`);

    const titleEl = row.querySelector("[data-book-title]");
    const authorEl = row.querySelector("[data-book-author]");
    const coverLabel = row.querySelector("[data-book-cover-label]");
    if (titleEl) titleEl.textContent = displayBookTitle(title);
    if (authorEl) authorEl.textContent = displayBookAuthor(author);
    if (coverLabel) coverLabel.textContent = displayBookTitle(title);

    const progressLabel = row.querySelector("[data-book-progress]");
    if (progressLabel) {
      progressLabel.textContent = displayReadProgress(
        book.progress || formatReadProgress(book.scrollRatio) || book.chapter || "待读",
      );
    }
    return row;
  }

  function bookPayloadFromRow(row) {
    if (!row) return null;
    return {
      id: row.dataset.bookId || "",
      title: row.dataset.title || row.querySelector("[data-book-title]")?.textContent || t("phone.read.unnamed"),
      author: row.dataset.author || row.querySelector("[data-book-author]")?.textContent || t("phone.read.unknownAuthor"),
      progress: row.dataset.progress || "在读",
      chapter: row.dataset.chapter || "",
      excerpt: row.dataset.excerpt || "",
      synopsis: row.dataset.synopsis || "",
      mediaId: row.dataset.mediaId || "",
      resourceId: row.dataset.resourceId || "",
      fileId: row.dataset.fileId || "",
      format: row.dataset.format || "",
      bundledPath: row.dataset.bundledPath || "",
      builtin: row.dataset.builtin === "1",
      scrollRatio: Number(row.dataset.scrollRatio) || 0,
      row,
    };
  }

  async function storeBookBody(title, body) {
    const text = String(body || "");
    if (!text.trim()) return null;
    const file = new File([text], `${String(title || "book").slice(0, 40)}.txt`, {
      type: "text/plain;charset=utf-8",
    });
    return storeMediaFile(file, "book");
  }

  async function openBookRow(row) {
    const book = bookPayloadFromRow(row);
    if (!book) return;
    await bookReader?.open(book);
  }

  async function playTrackRow(row) {
    if (!audioPlayer || !row) return;
    if (!row.dataset.mediaId && row.dataset.sourceUrl && storeMediaFile) {
      const track = listTracks().find((item) => item.id === row.dataset.trackId) || {
        id: row.dataset.trackId,
        sourceUrl: row.dataset.sourceUrl,
        title: row.dataset.title,
        playlist: row.dataset.playlist,
      };
      try {
        const cached = await downloadBuiltinTrack(track, {
          storeMediaFile,
          onProgress: () => {
            const live = listTracks().find((item) => item.id === track.id);
            if (!live) return;
            row.dataset.cacheState = live.cacheState || "";
            row.dataset.cacheProgress = String(live.cacheProgress || 0);
            if (live.mediaId) row.dataset.mediaId = live.mediaId;
          },
        });
        if (cached?.mediaId) row.dataset.mediaId = cached.mediaId;
        persistLibraryState();
      } catch {
        return;
      }
    }
    if (!row.dataset.mediaId) return;
    const record = await getMediaRecord(row.dataset.mediaId);
    const url = await resolveMediaUrl(record);
    if (!url) return;
    const { title, playlist } = trackMetaFromRow(row);
    const tags = inferTrackTags({
      title,
      playlist,
      mood: row.dataset.mood || "",
      genre: row.dataset.genre || "",
    });
    row.dataset.mood = tags.mood;
    row.dataset.genre = tags.genre;
    const prev = getNowPlaying();
    const base = {
      title,
      playlist,
      mediaId: row.dataset.mediaId || record.id || "",
      coListen: isCoListenEnabled(),
      mood: tags.mood,
      genre: tags.genre,
    };
    coListenState.suppressAnnounce = true;
    try {
      audioPlayer.src = url;
      await audioPlayer.play();
      setNowPlaying(snapshotFromAudio(audioPlayer, base));
    } finally {
      coListenState.suppressAnnounce = false;
    }
    pushRecentPlay({
      title,
      playlist,
      mediaId: base.mediaId,
      mood: tags.mood,
      genre: tags.genre,
    });
    refreshCoListenUi(getNowPlaying());
    publishLocalCoListen(getNowPlaying(), { force: true });
    await announceCoListenIfNeeded(prev, getNowPlaying());
    refreshLifeContextStrip();
    scheduleCapabilityRefresh(80);
    setMusicView("player");
  }

  function resourceMediaDeps() {
    if (typeof storeRecord !== "function" || typeof getAllRecords !== "function") return {};
    return { storeRecord, getAllRecords, persistMediaFile };
  }

  async function importTrackFiles(files) {
    if (!trackList || !files?.length) return;
    for (const file of files) {
      try {
        const imported = await importAudioResource(file, { deps: resourceMediaDeps() });
        let mediaId = imported.mediaId;
        if (!mediaId && storeMediaFile) {
          const media = await storeMediaFile(file, "audio");
          mediaId = media?.id || "";
        }
        const row = renderTrackRow({
          title: imported.track.title || shortFileTitle(file.name),
          playlist: imported.track.artist
            ? storedLocalImportPlaylist(imported.track.artist)
            : storedLocalImportPlaylist(),
          mediaId,
          fileName: file.name,
          resourceId: imported.sha256 ? `sha256:${imported.sha256}` : imported.track.resourceId || "",
        });
        trackList.prepend(row);
      } catch (error) {
        window.alert(error?.message || t("alerts.bookImportFail"));
      }
    }
    persistLibraryState();
    refreshTrackListChrome();
    applyExternalGrants({ ...collectExternalGrants(), music: true, 音乐: true });
    refreshIcons();
    refreshCoListenUi(getNowPlaying());
  }

  async function importPhotoFiles() {
    // App album is mounted via shared phone gallery; imports happen inside a group.
  }

  async function importBookFiles(files) {
    if (!bookList || !files?.length) return;
    for (const file of files) {
      try {
        const imported = await importBookResource(file, { deps: resourceMediaDeps() });
        const book = imported.book;
        const body = String(book.body || book.excerpt || "");
        const excerpt = previewFromBody(body) || String(book.excerpt || "").slice(0, 160);
        const media = body.trim() ? await storeBookBody(book.title, body) : null;
        const row = renderBookRow({
          title: book.title,
          author: book.author,
          progress: "未读",
          chapter: chapterFromProgress(book.progress) || "已导入",
          excerpt,
          fileId: book.fileId,
          format: book.format,
          mediaId: media?.id || "",
          resourceId: book.resourceId || "",
          scrollRatio: 0,
        });
        bookList.prepend(row);
        await ingestBookChunks({ ...book, body, excerpt }, { renderMemoryState });
      } catch (error) {
        window.alert(error.message || t("alerts.bookImportFail"));
      }
    }
    persistLibraryState();
    refreshIcons();
  }

  async function importIcsFile(file) {
    if (!file || !eventList) return;
    const text = await file.text();
    const events = parseIcsEvents(text);
    events.forEach((event) => eventList.append(renderEventRow(event)));
    persistLibraryState();
    applyExternalGrants({ ...collectExternalGrants(), calendar: true, 日历: true });
    renderCalendarGrid();
    rescheduleProactiveScheduler();
    refreshIcons();
  }

  addTrackButton?.addEventListener("click", async () => {
    if (trackFileInput) {
      await openFileImport(trackFileInput);
      return;
    }
    if (!trackList) return;
    const row = renderTrackRow();
    trackList.prepend(row);
    refreshTrackListChrome();
    persistLibraryState();
    refreshIcons();
  });

  document.querySelectorAll("[data-add-track]").forEach((button) => {
    if (button === addTrackButton) return;
    button.addEventListener("click", () => addTrackButton?.click());
  });

  document.querySelector("[data-open-music-list]")?.addEventListener("click", () => {
    setMusicView("list");
  });

  document.querySelector("[data-music-back-player]")?.addEventListener("click", () => {
    setMusicView("player");
  });

  addEventButton?.addEventListener("click", () => {
    if (!eventList) return;
    const row = renderEventRow({
      date: calendarState.selectedDate || formatDateKey(),
      title: t("calendar.newReminder"),
      mode: "proactive_message",
      prompt: "",
    });
    eventList.prepend(row);
    persistLibraryState();
    renderCalendarGrid();
    rescheduleProactiveScheduler();
    refreshIcons();
    openEventEditor(row, { isNew: true });
  });

  addBookButton?.addEventListener("click", () => {
    if (!bookList) return;
    const row = renderBookRow();
    bookList.prepend(row);
    row.querySelector("input")?.focus();
    persistLibraryState();
    refreshIcons();
  });

  importBookButton?.addEventListener("click", () => openFileImport(bookFileInput));
  importIcsButton?.addEventListener("click", () => openFileImport(icsFileInput));

  bookFileInput?.addEventListener("change", async () => {
    await importBookFiles(Array.from(bookFileInput.files || []));
    bookFileInput.value = "";
  });

  trackFileInput?.addEventListener("change", async () => {
    await importTrackFiles(Array.from(trackFileInput.files || []));
    trackFileInput.value = "";
  });

  icsFileInput?.addEventListener("change", async () => {
    await importIcsFile(icsFileInput.files?.[0]);
    icsFileInput.value = "";
  });

  trackList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-track]");
    if (removeButton) {
      removeEditableItem(removeButton, ".track-row");
      window.setTimeout(() => {
        refreshTrackListChrome();
        persistLibraryState();
        refreshCoListenUi(getNowPlaying());
      }, 220);
      return;
    }
    const row = event.target.closest(".track-row");
    if (!row || !trackList.contains(row)) return;
    playTrackRow(row).catch(() => {});
  });

  trackList?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest?.(".track-row");
    if (!row || event.target.closest("[data-remove-track]")) return;
    event.preventDefault();
    playTrackRow(row).catch(() => {});
  });

  document.querySelector("[data-open-music-player]")?.addEventListener("click", () => {
    setMusicView("player");
  });

  setMusicView("player");

  nowSeek?.addEventListener("input", () => {
    const nowPlaying = getNowPlaying();
    if (!audioPlayer || !nowPlaying?.durationSec) return;
    const nextPos = positionFromRatio(nowSeek.value, nowPlaying.durationSec);
    audioPlayer.currentTime = nextPos;
    setNowPlaying({ ...nowPlaying, positionSec: nextPos, updatedAt: Date.now() });
    refreshCoListenUi(getNowPlaying());
    publishLocalCoListen(getNowPlaying(), { force: true });
  });

  coListenTell?.addEventListener("click", () => {
    const nowPlaying = getNowPlaying();
    if (!nowPlaying?.title) {
      window.alert(t("listen.playFirst"));
      return;
    }
    const message = formatCoListenTellMessage(nowPlaying);
    if (!message) return;
    setPanel("chat");
    if (input) {
      input.value = message;
      form?.requestSubmit();
    }
  });

  subscribeCoListenState(coListenTabId, (remote) => {
    if (!remote?.coListen || !remote.title) return;
    coListenState.applyingRemote = true;
    try {
      setNowPlaying({ ...remote, coListen: isCoListenEnabled() && remote.coListen !== false });
      refreshCoListenUi(getNowPlaying());
      if (coListenSyncHint) {
        coListenSyncHint.hidden = false;
        window.clearTimeout(coListenSyncHint._hideTimer);
        coListenSyncHint._hideTimer = window.setTimeout(() => {
          coListenSyncHint.hidden = true;
        }, 2500);
      }
      const nowPlaying = getNowPlaying();
      if (
        audioPlayer
        && nowPlaying.mediaId
        && audioPlayer.src
        && Math.abs((audioPlayer.currentTime || 0) - (nowPlaying.positionSec || 0)) > 2.5
      ) {
        try {
          audioPlayer.currentTime = nowPlaying.positionSec || 0;
        } catch {
          // ignore seek failures
        }
      }
    } finally {
      coListenState.applyingRemote = false;
    }
  });

  audioToggle?.addEventListener("click", async () => {
    if (!audioPlayer) return;
    if (audioPlayer.paused && audioPlayer.src) {
      await audioPlayer.play();
    } else {
      audioPlayer.pause();
    }
  });

  function playableTrackRows() {
    return Array.from(trackList?.querySelectorAll(".track-row") || []).filter((row) => row.dataset.mediaId);
  }

  function skipTrack(delta) {
    const rows = playableTrackRows();
    if (!rows.length) return;
    const mediaId = getNowPlaying()?.mediaId || "";
    const idx = mediaId ? rows.findIndex((row) => row.dataset.mediaId === mediaId) : -1;
    const nextIdx = idx < 0 ? 0 : idx + delta;
    if (nextIdx < 0 || nextIdx >= rows.length) return;
    playTrackRow(rows[nextIdx]).catch(() => {});
  }

  document.querySelector("[data-audio-prev]")?.addEventListener("click", () => skipTrack(-1));
  document.querySelector("[data-audio-next]")?.addEventListener("click", () => skipTrack(1));

  audioPlayer?.addEventListener("timeupdate", () => {
    if (!getNowPlaying()?.title) return;
    syncCoListenFromAudio({}, { announce: false });
  });

  audioPlayer?.addEventListener("play", () => {
    syncCoListenFromAudio({ paused: false }, { announce: true });
  });

  audioPlayer?.addEventListener("pause", () => {
    syncCoListenFromAudio({ paused: true }, { announce: true });
  });

  audioPlayer?.addEventListener("ended", () => {
    syncCoListenFromAudio({ paused: true, positionSec: getNowPlaying()?.durationSec || 0 }, { announce: true });
  });

  coListenToggle?.addEventListener("change", () => {
    const enabled = isCoListenEnabled();
    const prev = getNowPlaying();
    if (prev) {
      setNowPlaying({ ...prev, coListen: enabled, updatedAt: Date.now() });
    } else {
      setNowPlaying(snapshotFromAudio(audioPlayer, {
        title: nowTitle?.textContent || "",
        coListen: enabled,
      }));
    }
    refreshCoListenUi(getNowPlaying());
    publishLocalCoListen(getNowPlaying());
    announceCoListenIfNeeded(prev, getNowPlaying(), { enabledChanged: enabled });
  });

  eventList?.addEventListener("click", (event) => {
    const row = event.target.closest(".event-row");
    if (!row || !eventList.contains(row)) return;
    openEventEditor(row);
  });

  eventList?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".event-row");
    if (!row || !eventList.contains(row)) return;
    event.preventDefault();
    openEventEditor(row);
  });

  eventEditSheet?.querySelectorAll("[data-event-edit-close]").forEach((button) => {
    button.addEventListener("click", () => closeEventEditor({ discardNew: true }));
  });
  eventEditSheet?.querySelector("[data-event-edit-save]")?.addEventListener("click", saveEventEditor);
  eventEditSheet?.querySelector("[data-event-edit-delete]")?.addEventListener("click", deleteEditingEvent);
  eventEditTitle?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEventEditor();
    }
  });

  bookList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-book]");
    if (removeButton) {
      const row = removeButton.closest(".book-row");
      const payload = bookPayloadFromRow(row);
      if (payload) {
        try {
          deleteBookMemoryIndex(payload, { force: true });
        } catch {
          /* index tombstone is best-effort; shelf delete still proceeds */
        }
      }
      removeEditableItem(removeButton, ".book-row");
      window.setTimeout(persistLibraryState, 220);
      return;
    }
    const row = event.target.closest(".book-row");
    if (!row) return;
    openBookRow(row).catch(() => {});
  });

  [trackList, bookList].forEach((listNode) => {
    listNode?.addEventListener("input", () => {
      persistLibraryState();
    });
    listNode?.addEventListener("change", () => {
      persistLibraryState();
    });
  });

  document.addEventListener("yueqi:locale-changed", () => {
    eventList?.querySelectorAll(".event-row").forEach((row) => syncEventRowView(row));
    trackList?.querySelectorAll(".track-row").forEach((row) => syncTrackRowView(row));
    refreshTrackListChrome();
  });

  refreshTrackListChrome();

  return {
    renderTrackRow,
    renderEventRow,
    renderBookRow,
    playTrackRow,
    importTrackFiles,
    importPhotoFiles,
    importBookFiles,
    importIcsFile,
    openEventEditor,
    findEventRow,
    refreshTrackListChrome,
    setMusicView,
  };
}
