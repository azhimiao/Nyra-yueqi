/**
 * 栖机 · 一起看 — ReaderEngine horizontal pages + highlight co-read.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  previewFromBody,
  displayReadProgress,
  formatReadProgress,
  normalizeBook,
} from "../library/books.js";
import {
  saveCoReadAnchor,
  chapterFromProgress,
  formatCoReadQuoteMessage,
} from "../library/co-read.js";
import { importBookFile, ingestBookChunks } from "../library/books-import.js";
import { ensureBuiltinBook, BUILTIN_BOOK } from "../library/builtin-catalog.js";
import {
  addHighlight,
  listHighlights,
  updateHighlight,
  selectionToLocator,
  paintHighlightDecorations,
  toggleHighlightCommentFold,
} from "../library/book-highlights.js";
import { createReaderEngine } from "../library/reader-engine.js";
import { messageForPortabilityError } from "../portability/errors.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { getAllRecords } from "../storage/db.js";
import { readMediaBlob } from "../platform/media-files.js";
import { listBooks, updateBookProgress, ensureBookIds, addBook } from "./phone-data.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { beginHighlightChatComment, watchHighlightCommentPaint } from "../library/highlight-chat-comment.js";
import { pt } from "./i18n.js";

async function loadBodyText(book, getMediaRecord) {
  if (book?.mediaId) {
    try {
      const record = getMediaRecord
        ? await getMediaRecord(book.mediaId)
        : (await getAllRecords("media")).find((row) => row.id === book.mediaId) || null;
      if (record?.text) return String(record.text);
      const blob = await readMediaBlob(record);
      if (blob) {
        const text = await blob.text();
        if (text.trim()) return text;
      }
    } catch {
      /* fall through */
    }
  }
  if (book?.bundledPath) {
    try {
      const res = await fetch(book.bundledPath);
      if (res.ok) {
        const file = new File([await res.blob()], "book.epub", { type: "application/epub+zip" });
        const imported = await importBookFile(file);
        return String(imported.body || imported.excerpt || "");
      }
    } catch {
      /* fall through */
    }
  }
  return String(book?.excerpt || book?.body || "").trim();
}

/**
 * @param {HTMLElement} root `[data-phone-screen="read"]`
 */
export function mountPhoneReader(root, deps = {}) {
  if (!root) return { open() {}, destroy() {} };

  const {
    getMediaRecord = null,
    storeMediaFile = null,
    onContinueCoRead = null,
    onSubmitCoRead = null,
    onSessionStarted = null,
    onToast = null,
  } = deps;

  const shelfPane = root.querySelector('[data-phone-pane-view="read-shelf"]');
  const readerPane = root.querySelector('[data-phone-pane-view="read-reader"]');
  const booksFeed = root.querySelector("[data-phone-books]");
  const viewport = root.querySelector("[data-ebook-viewport]");
  const titleEl = root.querySelector("[data-phone-reader-title]");
  const progressEl = root.querySelector("[data-phone-reader-progress]");
  const pageLabel = root.querySelector("[data-ebook-page-label]");
  const chromeEls = root.querySelectorAll("[data-ebook-chrome], [data-ebook-chrome-footer]");
  const selectBar = root.querySelector("[data-ebook-select-bar]");
  const commentPane = root.querySelector("[data-ebook-comment]");
  const commentQuote = root.querySelector("[data-ebook-comment-quote]");
  const commentBody = root.querySelector("[data-ebook-comment-body]");
  const appbarTitle = root.querySelector("[data-read-appbar-title]");
  const appbarSub = root.querySelector("[data-read-appbar-sub]");
  const importBtn = root.querySelector("[data-phone-book-import]");
  const fileInput = root.querySelector("[data-phone-book-file]");
  const statusEl = root.querySelector("[data-phone-book-status]");
  const appbar = root.querySelector(".mini-appbar");

  let current = null;
  let chromeVisible = false;
  let theme = "paper";
  let pendingSelection = null;
  let activeHighlight = null;
  let selecting = false;

  const engine = createReaderEngine({
    viewport,
    pagesHost: viewport?.querySelector("[data-reader-pages]") || null,
    paragraphClass: "mini-ebook-p",
    pageClass: "mini-ebook-page",
    themeHost: readerPane,
    onTapCenter: () => {
      if (selecting || pendingSelection) return;
      setChrome(!chromeVisible);
    },
    onTapHighlight: ({ highlightId }) => {
      if (!current || !highlightId) return false;
      const next = toggleHighlightCommentFold(current.id, highlightId);
      if (!next) return false;
      paintHighlights();
      return true;
    },
    onPageChange: ({ pageIndex, pageCount }) => {
      const label = `${pageIndex + 1} / ${pageCount}`;
      if (progressEl) progressEl.textContent = label;
      if (pageLabel) pageLabel.textContent = label;
      saveProgress();
      setChrome(false);
      // Remeasure rebuilds DOM — re-apply exact marks + inline notes.
      paintHighlights();
    },
  });

  function setStatus(message = "") {
    if (!statusEl) return;
    const text = String(message || "").trim();
    statusEl.textContent = text;
    statusEl.hidden = !text;
    if (text) onToast?.(text);
  }

  function showPane(name) {
    const shelf = name === "read-shelf";
    if (shelfPane) shelfPane.hidden = !shelf;
    if (readerPane) readerPane.hidden = shelf;
    if (appbar) appbar.hidden = !shelf;
    if (importBtn) importBtn.hidden = !shelf;
    root.classList.toggle("is-reading", !shelf);
    if (appbarTitle) appbarTitle.textContent = shelf ? pt("read.shelf") : (current?.title || pt("read.shelf"));
    if (appbarSub) appbarSub.textContent = shelf ? pt("read.shelfSub") : "";
  }

  function setChrome(visible) {
    chromeVisible = Boolean(visible);
    chromeEls.forEach((el) => {
      el.hidden = !chromeVisible;
    });
  }

  function applyTheme(next) {
    theme = next || theme;
    engine.setTheme(theme);
    readerPane?.setAttribute("data-ebook-theme", theme);
  }

  function cycleTheme() {
    const order = ["paper", "cream", "night"];
    applyTheme(order[(order.indexOf(theme) + 1) % order.length]);
  }

  function paragraphs() {
    return engine.getState().paragraphs || [];
  }

  function saveProgress() {
    if (!current) return;
    const state = engine.getState();
    const ratio = state.ratio || 0;
    const progress = formatReadProgress(ratio);
    const paras = state.paragraphs || [];
    const chapter = current.chapter
      || chapterFromProgress(paras[Math.floor(ratio * Math.max(0, paras.length - 1))] || "")
      || progress;
    const excerpt = (paras[Math.min(paras.length - 1, Math.floor(ratio * paras.length))] || "").slice(0, 160);
    updateBookProgress(current.id || current.title, {
      scrollRatio: ratio,
      progress,
      chapter,
      excerpt,
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      readerDocVersion: 1,
    });
    saveCoReadAnchor({
      title: current.title,
      author: current.author,
      chapter,
      progress,
      excerpt,
      lived: true,
    });
    current = {
      ...current,
      scrollRatio: ratio,
      progress,
      chapter,
      excerpt,
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
    };
  }

  function paintHighlights() {
    const host = engine.getPagesHost();
    if (!host || !current?.id) return;
    paintHighlightDecorations(host, listHighlights(current.id), {
      escapeHtml,
      thinkingLabel: pt("read.thinking"),
      continueChatLabel: pt("read.continueChat"),
    });
  }

  function renderShelf() {
    const books = ensureBookIds(listBooks()).slice(0, 24);
    if (!booksFeed) return;
    if (!books.length) {
      booksFeed.innerHTML = `
        <div class="mini-empty">
          <p>${escapeHtml(pt("read.emptyShelf"))}</p>
          <button type="button" class="mini-app-cta" data-phone-book-import-empty>${escapeHtml(pt("read.importBook"))}</button>
        </div>`;
      refreshIcons();
      return;
    }
    booksFeed.innerHTML = books.map((book, index) => {
      const row = normalizeBook(book);
      const pct = Math.round((row.scrollRatio || 0) * 100);
      const badge = row.scrollRatio > 0
        ? `${pct}%`
        : (row.builtin ? pt("read.newBook") : pt("read.unread"));
      return `
        <button type="button" class="book-row book-shelf-card" style="--book-i:${index}"
          data-phone-book-id="${escapeHtml(row.id)}"
          data-phone-book-title="${escapeHtml(row.title)}">
          <span class="book-cover tone-${(index % 5) + 1}">
            <span class="book-cover-label">${escapeHtml(row.title)}</span>
            <span class="book-cover-progress">${escapeHtml(badge)}</span>
          </span>
          <span class="book-shelf-meta">
            <strong>${escapeHtml(row.title)}</strong>
            <em>${escapeHtml(row.author || "")}</em>
          </span>
        </button>`;
    }).join("");
    refreshIcons();
  }

  async function storeBookBody(title, body) {
    if (!storeMediaFile) return null;
    return storeMediaFile(
      new File([body], `${title || "book"}.txt`, { type: "text/plain;charset=utf-8" }),
      "book",
    );
  }

  function pickBookFiles() {
    fileInput?.click();
  }

  async function importFiles(files) {
    if (!files?.length) return;
    let imported = 0;
    for (const file of files) {
      try {
        const book = await importBookFile(file);
        const body = String(book.body || book.excerpt || "");
        const excerpt = previewFromBody(body) || String(book.excerpt || "").slice(0, 160);
        const media = body.trim() ? await storeBookBody(book.title, body) : null;
        addBook({
          title: book.title,
          author: book.author,
          progress: "未读",
          chapter: chapterFromProgress(book.progress) || "已导入",
          excerpt,
          fileId: book.fileId,
          format: book.format,
          mediaId: media?.id || "",
          scrollRatio: 0,
        });
        imported += 1;
        void ingestBookChunks({ ...book, body, excerpt }).catch(() => {});
      } catch (error) {
        setStatus(messageForPortabilityError(error) || pt("read.importFail"));
      }
    }
    if (fileInput) fileInput.value = "";
    renderShelf();
    if (imported) setStatus("");
  }

  async function openBook(book) {
    current = normalizeBook(book);
    if (!current.id) {
      const ensured = ensureBookIds([book])[0];
      current = normalizeBook(ensured);
    }
    if (!current.synopsis && current.id === BUILTIN_BOOK.id) {
      current = { ...current, synopsis: BUILTIN_BOOK.synopsis };
    }
    void Promise.resolve(onSessionStarted?.(current)).catch(() => {});
    showPane("read-reader");
    setChrome(false);
    applyTheme(theme);
    if (titleEl) titleEl.textContent = current.title;
    const text = await loadBodyText(current, getMediaRecord);
    // Wait a frame so hidden→visible layout has non-zero viewport size.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    engine.setDocument(text, {
      sourceFormat: current.format || (current.bundledPath ? "epub" : "plain"),
      ratio: current.scrollRatio || 0,
      pageIndex: current.pageIndex,
    });
    paintHighlights();
    try {
      appendCohabitEvent({
        appId: "read",
        kind: "dwell",
        summary: pt("read.cohabitDwell", {
          title: current.title,
          progress: displayReadProgress(current.scrollRatio || current.progress),
        }),
        characterId: getActiveCharacterId(),
        idempotencyKey: `read::dwell::${getActiveCharacterId()}::${current.id}`,
        meta: { bookId: current.id },
      });
    } catch { /* optional */ }
    refreshIcons();
  }

  function hideSelectBar() {
    if (selectBar) selectBar.hidden = true;
    pendingSelection = null;
  }

  function showSelectBarForSelection() {
    const sel = window.getSelection?.();
    const host = engine.getPagesHost();
    if (!sel || sel.isCollapsed || !host) {
      hideSelectBar();
      return;
    }
    const mapped = selectionToLocator(host, sel);
    if (!mapped) {
      hideSelectBar();
      return;
    }
    pendingSelection = mapped;
    if (!selectBar) return;
    selectBar.hidden = false;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const hostRect = root.getBoundingClientRect();
    const top = Math.max(8, rect.top - hostRect.top - 44);
    const left = Math.max(8, Math.min(hostRect.width - 220, rect.left - hostRect.left));
    selectBar.style.top = `${top}px`;
    selectBar.style.left = `${left}px`;
  }

  function resolveChapterTitle(paraIndex) {
    const paras = paragraphs();
    for (let i = paraIndex; i >= 0 && i >= paraIndex - 12; i -= 1) {
      const p = paras[i] || "";
      if (/^(第?\s*\d+\s*章|[Cc]hapter\s*\d+|开篇|序章|尾声|目录|扉页|第[一二三四五六七八九十]+部分)/.test(p)) {
        return p.slice(0, 40);
      }
    }
    return current?.chapter || "";
  }

  function askCompanionAboutSelection(mapped) {
    if (!mapped?.quote || !current) return;
    const hl = addHighlight({
      bookId: current.id,
      locator: mapped.locator,
      quote: mapped.quote,
      prefix: mapped.prefix,
      suffix: mapped.suffix,
    });
    if (!hl) return;
    const characterId = getActiveCharacterId();
    const character = getCharacterSync?.(characterId);
    const comment = {
      characterId,
      characterName: character?.name || "",
      text: "",
      createdAt: Date.now(),
      sentToChat: true,
    };
    const saved = updateHighlight(current.id, hl.id, { companionComment: comment });
    activeHighlight = saved || { ...hl, companionComment: comment };
    beginHighlightChatComment({
      bookId: current.id,
      highlightId: hl.id,
      characterId,
      characterName: character?.name || "",
    });
    paintHighlights();
    hideSelectBar();
    window.getSelection?.()?.removeAllRanges?.();
    if (commentPane) commentPane.hidden = true;

    saveProgress();
    const chapter = resolveChapterTitle(mapped.startPara);
    const anchor = saveCoReadAnchor({
      title: current.title || pt("read.currentBook"),
      author: current.author || "",
      chapter,
      progress: current.progress || chapter,
      excerpt: mapped.quote,
      lived: true,
    });
    const message = formatCoReadQuoteMessage(mapped.quote, {
      title: anchor?.title,
      chapter: anchor?.chapter,
    });
    if (typeof onSubmitCoRead === "function") {
      onSubmitCoRead(message);
      return;
    }
    onContinueCoRead?.(message);
  }

  function onClick(event) {
    if (event.target.closest("[data-phone-book-import], [data-phone-book-import-empty]")) {
      pickBookFiles();
      return;
    }
    if (event.target.closest("[data-ebook-theme-toggle]")) {
      cycleTheme();
      return;
    }
    if (event.target.closest("[data-ebook-prev]")) {
      engine.goPage(-1);
      return;
    }
    if (event.target.closest("[data-ebook-next]")) {
      engine.goPage(1);
      return;
    }
    if (event.target.closest("[data-phone-reader-back]")) {
      saveProgress();
      current = null;
      hideSelectBar();
      if (commentPane) commentPane.hidden = true;
      showPane("read-shelf");
      renderShelf();
      return;
    }
    if (event.target.closest("[data-ebook-hl]")) {
      if (pendingSelection && current) {
        addHighlight({
          bookId: current.id,
          locator: pendingSelection.locator,
          quote: pendingSelection.quote,
          prefix: pendingSelection.prefix,
          suffix: pendingSelection.suffix,
        });
        paintHighlights();
        onToast?.(pt("read.highlighted"));
      }
      hideSelectBar();
      window.getSelection?.()?.removeAllRanges?.();
      return;
    }
    if (event.target.closest("[data-ebook-ask]")) {
      askCompanionAboutSelection(pendingSelection);
      return;
    }
    if (event.target.closest("[data-ebook-copy]")) {
      const quote = pendingSelection?.quote || "";
      if (quote && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(quote);
        onToast?.(pt("read.copied"));
      }
      hideSelectBar();
      return;
    }
    if (event.target.closest("[data-ebook-comment-close]")) {
      if (commentPane) commentPane.hidden = true;
      return;
    }
    const noteChat = event.target.closest("[data-ebook-note-chat], [data-ebook-continue-chat]");
    if (noteChat) {
      const hlId = noteChat.getAttribute("data-ebook-note-chat") || activeHighlight?.id || "";
      const hl = (hlId && listHighlights(current?.id || "").find((row) => row.id === hlId))
        || activeHighlight;
      const quote = hl?.quote || "";
      saveProgress();
      if (quote) {
        saveCoReadAnchor({
          title: current?.title || pt("read.currentBook"),
          author: current?.author || "",
          chapter: current?.chapter || "",
          progress: current?.progress || current?.chapter || "",
          excerpt: quote,
          lived: true,
        });
      }
      onContinueCoRead?.("");
      return;
    }

    // Paging / chrome taps are handled by ReaderEngine pointer gestures.
    // Keep click path for shelf covers only.

    const cover = event.target.closest("[data-phone-book-id], [data-phone-book-title]");
    if (cover && booksFeed?.contains(cover)) {
      const id = cover.dataset.phoneBookId;
      const title = cover.dataset.phoneBookTitle;
      const books = ensureBookIds(listBooks());
      const book = books.find((row) => (id && row.id === id) || row.title === title);
      if (book) void openBook(book);
    }
  }

  function onSelectionChange() {
    if (!readerPane || readerPane.hidden) return;
    window.clearTimeout(onSelectionChange._t);
    onSelectionChange._t = window.setTimeout(() => {
      const sel = window.getSelection?.();
      selecting = Boolean(sel && !sel.isCollapsed);
      readerPane.classList.toggle("is-selecting", selecting);
      if (selecting) showSelectBarForSelection();
      else if (!pendingSelection) hideSelectBar();
    }, 180);
  }

  root.addEventListener("click", onClick);
  document.addEventListener("selectionchange", onSelectionChange);
  fileInput?.addEventListener("change", () => {
    void importFiles(Array.from(fileInput.files || []));
  });

  function open() {
    void ensureBuiltinBook({ storeMediaFile }).then(() => {
      ensureBookIds(listBooks());
      renderShelf();
    });
    ensureBookIds(listBooks());
    showPane("read-shelf");
    renderShelf();
    refreshIcons();
  }

  const unwatchComment = watchHighlightCommentPaint(() => {
    if (current?.id) paintHighlights();
  });

  function destroy() {
    unwatchComment?.();
    root.removeEventListener("click", onClick);
    document.removeEventListener("selectionchange", onSelectionChange);
    engine.destroy();
  }

  return { open, destroy, openBook };
}
