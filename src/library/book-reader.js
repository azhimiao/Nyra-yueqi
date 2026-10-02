/**
 * App shell book reader — ReaderEngine horizontal pages (same engine as 小手机).
 */

import { formatReadProgress } from "./books.js";
import {
  chapterFromProgress,
  formatCoReadQuoteMessage,
  saveCoReadAnchor,
} from "./co-read.js";
import { createReaderEngine } from "./reader-engine.js";
import {
  addHighlight,
  listHighlights,
  updateHighlight,
  selectionToLocator,
  paintHighlightDecorations,
  toggleHighlightCommentFold,
} from "./book-highlights.js";
import { importBookFile } from "./books-import.js";
import { beginHighlightChatComment, watchHighlightCommentPaint } from "./highlight-chat-comment.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import { refreshIcons } from "../lib/icons.js";

/**
 * Immersive paginated reader — 划线 / TA说说（接到聊天，和写日记、放音乐同一含义）.
 */
export function createBookReader(deps = {}) {
  const {
    getMediaRecord,
    readMediaBlob,
    setPanel,
    input,
    form,
    persistLibraryState,
    onProgressSaved = null,
    onAnchorSaved = null,
    onSessionStarted = null,
    refreshIcons: refresh = refreshIcons,
  } = deps;

  const root = document.querySelector("#bookReader");
  const viewport = document.querySelector("[data-book-reader-viewport]")
    || root?.querySelector(".book-reader-viewport");
  const titleEl = document.querySelector("[data-book-reader-title]");
  const progressEl = document.querySelector("[data-book-reader-progress]");
  const pageLabel = document.querySelector("[data-book-reader-page-label]");
  const selectBar = document.querySelector("[data-book-select-bar]");
  const noteSheet = document.querySelector("#bookNoteSheet");
  const noteQuote = document.querySelector("[data-book-note-quote]");
  const noteOpinion = document.querySelector("[data-book-note-opinion]");
  const closeBtn = document.querySelector("[data-book-reader-close]");
  const themeBtn = document.querySelector("[data-book-reader-theme]");
  const shareBtn = document.querySelector("[data-book-select-share]");
  const hlBtn = document.querySelector("[data-book-select-hl]");
  const copyBtn = document.querySelector("[data-book-select-copy]");
  const noteSend = document.querySelector("[data-book-note-send]");
  const noteCancel = document.querySelector("[data-book-note-cancel]");
  const noteBackdrop = document.querySelector("[data-book-note-close]");
  const chromeEls = root
    ? root.querySelectorAll("[data-book-reader-chrome], [data-book-reader-chrome-footer], .book-reader-chrome")
    : [];

  let current = null;
  let selectedExcerpt = "";
  let pendingSelection = null;
  let activeHighlight = null;
  let scrollTimer = 0;
  let chromeVisible = false;
  let theme = "paper";
  let selecting = false;

  const engine = createReaderEngine({
    viewport,
    pagesHost: viewport?.querySelector("[data-reader-pages]") || null,
    paragraphClass: "book-reader-p",
    pageClass: "book-reader-page",
    themeHost: root,
    onTapCenter: () => {
      if (selecting || pendingSelection) return;
      setChrome(!chromeVisible);
    },
    onTapHighlight: ({ highlightId }) => {
      if (!current || !highlightId) return false;
      const bookId = current.id || current.mediaId || current.title;
      const next = toggleHighlightCommentFold(bookId, highlightId);
      if (!next) return false;
      paintHighlights();
      return true;
    },
    onPageChange: ({ pageIndex, pageCount, ratio }) => {
      const label = `${pageIndex + 1} / ${pageCount}`;
      if (progressEl) progressEl.textContent = label;
      if (pageLabel) pageLabel.textContent = label;
      setChrome(false);
      if (current) {
        current.scrollRatio = ratio;
        current.progress = formatReadProgress(ratio);
        persistProgress();
      }
      paintHighlights();
    },
  });

  function paintHighlights() {
    const host = engine.getPagesHost();
    if (!host || !current?.id) return;
    paintHighlightDecorations(host, listHighlights(current.id), {
      escapeHtml,
      thinkingLabel: t("phone.read.thinking"),
      continueChatLabel: t("phone.read.continueChat"),
    });
  }

  function isOpen() {
    return root && !root.hasAttribute("hidden");
  }

  async function loadBodyText(book) {
    if (book?.mediaId && getMediaRecord) {
      const record = await getMediaRecord(book.mediaId);
      if (record?.text) return String(record.text);
      if (readMediaBlob) {
        const blob = await readMediaBlob(record);
        if (blob) {
          const text = await blob.text();
          if (text.trim()) return text;
        }
      }
    }
    if (book?.bundledPath) {
      try {
        const res = await fetch(book.bundledPath);
        if (res.ok) {
          const file = new File([await res.blob()], "book.epub", { type: "application/epub+zip" });
          const imported = await importBookFile(file);
          const body = String(imported.body || imported.excerpt || "").trim();
          if (body) return body;
        }
      } catch (error) {
        console.warn("[yueqi.book-reader] bundled fetch failed", error);
      }
    }
    return String(book?.excerpt || book?.body || "").trim();
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
    root?.setAttribute("data-ebook-theme", theme);
  }

  function cycleTheme() {
    const order = ["paper", "cream", "night"];
    applyTheme(order[(order.indexOf(theme) + 1) % order.length]);
  }

  function hideSelectBar() {
    if (!selectBar) return;
    selectBar.hidden = true;
    selectBar.style.top = "";
    selectBar.style.left = "";
    pendingSelection = null;
  }

  function showSelectBar(rect) {
    if (!selectBar || !root) return;
    const rootRect = root.getBoundingClientRect();
    const barWidth = selectBar.offsetWidth || 200;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - barWidth / 2 - rootRect.left, 8),
      rootRect.width - barWidth - 8,
    );
    const top = Math.max(rect.top - rootRect.top - 48, 56);
    selectBar.style.left = `${left}px`;
    selectBar.style.top = `${top}px`;
    selectBar.hidden = false;
  }

  function syncSelectFromSelection() {
    if (!isOpen()) {
      hideSelectBar();
      return;
    }
    const host = engine.getPagesHost();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !host) {
      hideSelectBar();
      selectedExcerpt = "";
      return;
    }
    const mapped = selectionToLocator(host, selection);
    if (!mapped) {
      hideSelectBar();
      selectedExcerpt = "";
      return;
    }
    pendingSelection = mapped;
    selectedExcerpt = mapped.quote.slice(0, 800);
    showSelectBar(selection.getRangeAt(0).getBoundingClientRect());
  }

  function openNoteSheet(excerpt) {
    if (!noteSheet || !excerpt) return;
    selectedExcerpt = excerpt;
    if (noteQuote) noteQuote.textContent = excerpt;
    if (noteOpinion) noteOpinion.value = "";
    noteSheet.hidden = false;
    noteSheet.setAttribute("aria-hidden", "false");
    noteSheet.classList.add("is-open");
    hideSelectBar();
    window.getSelection()?.removeAllRanges();
    noteOpinion?.focus();
    refresh();
  }

  function closeNoteSheet() {
    if (!noteSheet) return;
    noteSheet.classList.remove("is-open");
    noteSheet.setAttribute("aria-hidden", "true");
    noteSheet.hidden = true;
  }

  function detectChapter() {
    const paras = engine.getState().paragraphs || [];
    const ratio = engine.getState().ratio || 0;
    const idx = Math.floor(ratio * Math.max(0, paras.length - 1));
    for (let i = idx; i >= 0 && i >= idx - 12; i -= 1) {
      const p = paras[i] || "";
      if (/^(第?\s*\d+\s*章|[Cc]hapter\s*\d+|开篇|序章|尾声|目录|扉页|第[一二三四五六七八九十]+部分)/.test(p)) {
        return p.slice(0, 40);
      }
    }
    return current?.chapter || chapterFromProgress(current?.progress) || "阅读中";
  }

  /**
   * TA说说：把划线接到聊天，和「写日记」「放首歌」一样是一轮对话。
   */
  function askCompanionAboutSelection(mapped) {
    if (!mapped?.quote || !current) return;
    const bookId = current.id || current.mediaId || current.title;
    const hl = addHighlight({
      bookId,
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
    const saved = updateHighlight(bookId, hl.id, { companionComment: comment });
    activeHighlight = saved || { ...hl, companionComment: comment };
    beginHighlightChatComment({
      bookId,
      highlightId: hl.id,
      characterId,
      characterName: character?.name || "",
    });
    paintHighlights();
    hideSelectBar();
    window.getSelection()?.removeAllRanges();
    sendCoRead({ excerpt: mapped.quote, skipHighlight: true });
  }

  function continueChatFromHighlight(hl) {
    const quote = hl?.quote || selectedExcerpt || "";
    const chapter = detectChapter();
    const anchor = saveCoReadAnchor({
      title: current?.title || "当前书籍",
      author: current?.author || "",
      chapter,
      progress: current?.progress || chapter,
      excerpt: quote,
      lived: true,
    });
    onAnchorSaved?.(anchor);
    close();
    setPanel?.("chat");
  }

  function persistProgress() {
    if (!current) return;
    const state = engine.getState();
    const scrollRatio = state.ratio || 0;
    const progress = formatReadProgress(scrollRatio);
    const chapter = detectChapter();
    current.scrollRatio = scrollRatio;
    current.progress = progress;
    current.chapter = chapter;
    current.pageIndex = state.pageIndex;
    current.pageCount = state.pageCount;
    onProgressSaved?.({
      mediaId: current.mediaId || "",
      title: current.title,
      scrollRatio,
      progress,
      chapter,
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      readerDocVersion: 1,
    });
    persistLibraryState?.();
  }

  function sendCoRead({ excerpt, opinion = "", skipHighlight = false }) {
    const text = String(excerpt || "").trim();
    if (!text) {
      window.alert(t("alerts.coReadNeedExcerpt"));
      return;
    }
    const chapter = detectChapter();
    const anchor = saveCoReadAnchor({
      title: current?.title || "当前书籍",
      author: current?.author || "",
      chapter,
      progress: current?.progress || chapter,
      excerpt: text,
      lived: true,
    });
    onAnchorSaved?.(anchor);
    if (!skipHighlight && (current?.mediaId || current?.id)) {
      addHighlight({
        bookId: current.id || current.mediaId || current.title,
        locator: pendingSelection?.locator,
        quote: text,
        prefix: pendingSelection?.prefix || "",
        suffix: pendingSelection?.suffix || "",
      });
    }
    const message = formatCoReadQuoteMessage(text, {
      title: anchor?.title,
      chapter: anchor?.chapter,
      opinion,
    });
    closeNoteSheet();
    close();
    setPanel?.("chat");
    if (input) {
      input.value = message;
      if (form) form.dataset.routeIntent = "companion_chat";
      form?.requestSubmit();
    }
  }

  async function open(book = {}) {
    if (!root || !viewport) return;
    current = {
      id: book.id || book.mediaId || "",
      title: book.title || "未命名书籍",
      author: book.author || "",
      mediaId: book.mediaId || "",
      excerpt: book.excerpt || "",
      synopsis: book.synopsis || "",
      body: book.body || "",
      chapter: book.chapter || "",
      progress: book.progress || "在读",
      scrollRatio: Number(book.scrollRatio) || 0,
      pageIndex: book.pageIndex,
      format: book.format || "",
      bundledPath: book.bundledPath || "",
      row: book.row || null,
    };
    void Promise.resolve(onSessionStarted?.(current)).catch((error) => {
      console.warn("[yueqi.co-read] session projection failed", error);
    });
    if (titleEl) titleEl.textContent = current.title;
    if (progressEl) progressEl.textContent = formatReadProgress(current.scrollRatio);
    const text = await loadBodyText(current);
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    document.body.classList.add("book-reader-open");
    setChrome(false);
    applyTheme(theme);
    hideSelectBar();
    closeNoteSheet();
    // Wait until the fixed overlay has a real box (hidden→visible).
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    engine.setDocument(text, {
      sourceFormat: current.format || (current.bundledPath ? "epub" : "plain"),
      ratio: current.scrollRatio || 0,
      pageIndex: current.pageIndex,
    });
    requestAnimationFrame(() => {
      engine.remasure?.(true);
      paintHighlights();
    });
    refresh();
  }

  function close() {
    if (!isOpen()) return;
    persistProgress();
    hideSelectBar();
    closeNoteSheet();
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    root.hidden = true;
    document.body.classList.remove("book-reader-open");
    current = null;
    selectedExcerpt = "";
    pendingSelection = null;
    window.getSelection()?.removeAllRanges();
  }

  closeBtn?.addEventListener("click", () => close());
  themeBtn?.addEventListener("click", () => cycleTheme());

  // TA说说 → 接到聊天（自动发出这一句）
  shareBtn?.addEventListener("click", () => {
    if (!pendingSelection) syncSelectFromSelection();
    if (!pendingSelection?.quote) {
      window.alert(t("alerts.coReadNeedExcerpt"));
      return;
    }
    askCompanionAboutSelection(pendingSelection);
  });

  hlBtn?.addEventListener("click", () => {
    if (!pendingSelection) syncSelectFromSelection();
    if (!pendingSelection?.quote || !current) return;
    addHighlight({
      bookId: current.id || current.mediaId || current.title,
      locator: pendingSelection.locator,
      quote: pendingSelection.quote,
      prefix: pendingSelection.prefix || "",
      suffix: pendingSelection.suffix || "",
    });
    paintHighlights();
    hideSelectBar();
    window.getSelection()?.removeAllRanges();
  });

  copyBtn?.addEventListener("click", () => {
    const quote = selectedExcerpt || pendingSelection?.quote || "";
    if (quote && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(quote);
    }
    hideSelectBar();
  });

  noteCancel?.addEventListener("click", () => closeNoteSheet());
  noteBackdrop?.addEventListener("click", () => closeNoteSheet());

  noteSend?.addEventListener("click", () => {
    // Legacy sheet kept for optional hand-off; primary path is inline 想法.
    sendCoRead({
      excerpt: selectedExcerpt || noteQuote?.textContent || "",
      opinion: noteOpinion?.value || "",
    });
  });

  root?.addEventListener("click", (event) => {
    const chatBtn = event.target.closest("[data-ebook-note-chat]");
    if (!chatBtn || !current) return;
    const hlId = chatBtn.getAttribute("data-ebook-note-chat") || "";
    const hl = listHighlights(current.id || current.mediaId || current.title)
      .find((row) => row.id === hlId)
      || activeHighlight;
    if (hl) continueChatFromHighlight(hl);
  });

  document.addEventListener("selectionchange", () => {
    if (!isOpen()) return;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const sel = window.getSelection();
      selecting = Boolean(sel && !sel.isCollapsed);
      root?.classList.toggle("is-selecting", selecting);
      syncSelectFromSelection();
    }, 80);
  });

  watchHighlightCommentPaint(() => {
    if (isOpen()) paintHighlights();
  });

  // Paging / chrome: ReaderEngine pointer gestures (swipe + long-press select).

  document.addEventListener("keydown", (event) => {
    if (!isOpen()) return;
    if (event.key === "Escape") {
      if (noteSheet?.classList.contains("is-open")) closeNoteSheet();
      else close();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      engine.goPage(1);
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      engine.goPage(-1);
    }
  });

  return {
    open,
    close,
    isOpen,
    getCurrent: () => current,
    destroy: () => engine.destroy(),
  };
}
