import * as PageFlipPackage from "page-flip";
import { diaryDayFromIso, resolveDiaryStyleId } from "../diary/fields.js";
import { getDiaryStyle, getDiaryStyleLabel } from "../diary/styles.js";
import { escapeHtml, escapeHtmlWithBreaks } from "../lib/utils.js";
import { t, getLocale } from "../i18n/index.js";

const PageFlipModule = PageFlipPackage.default || PageFlipPackage;
const PageFlipCtor = PageFlipModule?.PageFlip || PageFlipPackage?.PageFlip || PageFlipModule?.default?.PageFlip;

function intlLocale() {
  return getLocale() === "en" ? "en-US" : "zh-CN";
}

function monthTitle(date) {
  return new Intl.DateTimeFormat(intlLocale(), { year: "numeric", month: "long" }).format(date);
}

function diaryDayOf(record) {
  return record.diaryDay || diaryDayFromIso(record.createdAt);
}

function titleOf(record) {
  if (record.title) return record.title;
  const rawText = String(record.rawText || "");
  const first = rawText.split(/[。！？\n]/).find(Boolean) || t("diary.book.untitled");
  return first.length > 22 ? `${first.slice(0, 22)}…` : first;
}

function fullTextOf(record) {
  return String(record.rawText || "").trim();
}

function excerptOf(record, max = 78) {
  const text = fullTextOf(record).replace(/\s+/g, " ");
  if (!text) return t("diary.book.emptyExcerpt");
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/[，,。！？、\s]+$/u, "")}…`;
}

function styleBadge(record) {
  const style = getDiaryStyle(resolveDiaryStyleId(record));
  return `<span class="diary-style-badge">${escapeHtml(style.emoji)} ${escapeHtml(getDiaryStyleLabel(style))}</span>`;
}

function formatLongDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("diary.book.unknownDate");
  return new Intl.DateTimeFormat(intlLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function clampPage(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function createDiaryPage(record, index, total) {
  const page = document.createElement("article");
  page.className = "diary-flip-page";
  page.dataset.diaryId = record.id;
  page.dataset.density = "soft";
  const lifeRunId = String(record.lifeRunId || record.runId || "").trim();
  const lifeEventId = String(record.lifeEventId || record.eventId || "").trim();
  if (lifeRunId) page.dataset.lifeRunId = lifeRunId;
  if (lifeEventId) page.dataset.lifeEventId = lifeEventId;
  if (record.source) page.dataset.diarySource = String(record.source);
  const full = fullTextOf(record);
  const needsExpand = full.replace(/\s+/g, " ").length > 78;
  page.innerHTML = `
    <div class="diary-flip-page-inner">
      <header class="diary-flip-page-head">
        <p class="diary-page-label">${escapeHtml(formatLongDate(diaryDayOf(record)))}</p>
        <div class="diary-flip-badges">
          ${styleBadge(record)}
          <span>${record.pinned ? escapeHtml(t("diary.book.pinned")) : escapeHtml(t("diary.book.entryTag"))}</span>
        </div>
      </header>
      <h3 class="diary-page-title">${escapeHtml(titleOf(record))}</h3>
      <div class="diary-page-body">
        <p class="diary-page-excerpt">${escapeHtml(excerptOf(record))}</p>
        ${needsExpand ? `<button type="button" class="diary-page-expand" data-diary-open-full="${escapeHtml(record.id)}">${escapeHtml(t("diary.book.readFull"))}</button>` : ""}
      </div>
      <footer class="diary-flip-page-foot">
        <span>${escapeHtml(record.role || t("diary.book.defaultRole"))}</span>
        <span>${index + 1} / ${total}</span>
      </footer>
    </div>
  `;
  return page;
}

function createEmptyPage() {
  const page = document.createElement("article");
  page.className = "diary-flip-page diary-flip-page-empty";
  page.dataset.density = "soft";
  page.innerHTML = `
    <div class="diary-flip-page-inner">
      <p class="diary-page-label">${escapeHtml(t("diary.book.bookLabel"))}</p>
      <h3 class="diary-page-title">${escapeHtml(t("diary.book.emptyTitle"))}</h3>
      <p class="diary-page-body diary-page-muted">${escapeHtml(t("diary.book.emptyBody"))}</p>
    </div>
  `;
  return page;
}

export function createDiaryBook(root, callbacks = {}) {
  if (!root) return { render() {}, openToDiaryId() {}, open() {} };

  const cover = root.querySelector("[data-diary-book-cover]");
  const interior = root.querySelector("[data-diary-book-interior]");
  const coverMeta = root.querySelector("[data-diary-book-cover-meta]");
  const calTitle = root.querySelector("[data-diary-cal-title]");
  const calGrid = root.querySelector("[data-diary-cal-grid]");
  const calPrev = root.querySelector("[data-diary-cal-prev]");
  const calNext = root.querySelector("[data-diary-cal-next]");
  const stage = root.querySelector("[data-diary-book-stage]");
  const flipBook = root.querySelector("[data-diary-flip-book]");
  const pageIndicator = root.querySelector("[data-diary-page-indicator]");
  const pageFooter = root.querySelector("[data-diary-page-footer]");
  const pagePin = root.querySelector("[data-diary-page-pin]");
  const pageEdit = root.querySelector("[data-diary-page-edit]");
  const pageDelete = root.querySelector("[data-diary-page-delete]");
  const pagePrev = root.querySelector("[data-diary-page-prev]");
  const pageNext = root.querySelector("[data-diary-page-next]");
  const closeButton = root.querySelector("[data-diary-book-close]");
  const calToggle = root.querySelector("[data-diary-cal-toggle]");
  const calPanel = root.querySelector("[data-diary-cal-panel]");
  const calIndex = root.querySelector("[data-diary-book-calendar]");

  let diaries = [];
  /** Single source of truth for page UI (indicator, disabled, content). */
  let currentPage = 0;
  let open = false;
  let pageFlip = null;
  let useStaticFallback = false;
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let flipSizeLocked = null;
  let settleTimer = 0;
  let ignoreClickUntil = 0;
  let swipePointerId = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeActive = false;
  const inMiniShell = Boolean(root.closest(".mini-phone") || root.closest(".mini-diary"));
  const compactViewport = typeof window !== "undefined"
    && window.matchMedia?.("(max-width: 720px)")?.matches === true;
  // App-parity overlay reader inside the phone should keep App calendar/toolbar UX.
  const overlayReaderMode = Boolean(
    root.classList.contains("memory-diary-reader") || cover?.hasAttribute("hidden"),
  );
  const inPhone = inMiniShell && !overlayReaderMode;
  const SWIPE_THRESHOLD = 36;

  // PageFlip is useful for the desktop book, but its hidden canvas and
  // gesture arbitration are a poor fit for a narrow WebView. Phone pages use
  // the same data and controls through a deterministic static renderer.
  useStaticFallback = inMiniShell || compactViewport;

  function ensureReader() {
    let reader = root.querySelector("[data-diary-reader]");
    if (reader) return reader;
    reader = document.createElement("div");
    reader.className = "diary-reader";
    reader.dataset.diaryReader = "";
    reader.hidden = true;
    reader.innerHTML = `
      <div class="diary-reader__sheet" role="dialog" aria-modal="true" aria-labelledby="diary-reader-title">
        <header class="diary-reader__head">
          <div>
            <p class="diary-reader__date" data-diary-reader-date></p>
            <h3 id="diary-reader-title" data-diary-reader-title></h3>
          </div>
          <button type="button" class="diary-reader__close" data-diary-reader-close aria-label="${escapeHtml(t("diary.book.closeReader"))}">${escapeHtml(t("diary.book.closeReader"))}</button>
        </header>
        <div class="diary-reader__body" data-diary-reader-body></div>
      </div>
    `;
    root.append(reader);
    reader.querySelector("[data-diary-reader-close]")?.addEventListener("click", closeReader);
    reader.addEventListener("click", (event) => {
      if (event.target === reader) closeReader();
    });
    return reader;
  }

  function openReader(diaryId) {
    const diary = diaries.find((record) => record.id === diaryId) || currentDiary();
    if (!diary) return;
    const reader = ensureReader();
    const dateNode = reader.querySelector("[data-diary-reader-date]");
    const titleNode = reader.querySelector("[data-diary-reader-title]");
    const bodyNode = reader.querySelector("[data-diary-reader-body]");
    if (dateNode) dateNode.textContent = formatLongDate(diaryDayOf(diary));
    if (titleNode) titleNode.textContent = titleOf(diary);
    if (bodyNode) bodyNode.innerHTML = escapeHtmlWithBreaks(fullTextOf(diary) || t("diary.book.emptyExcerpt"));
    reader.hidden = false;
    root.classList.add("is-reading");
  }

  function closeReader() {
    const reader = root.querySelector("[data-diary-reader]");
    if (reader) reader.hidden = true;
    root.classList.remove("is-reading");
  }

  const diaryByDay = () => {
    const map = new Map();
    diaries.forEach((record) => map.set(diaryDayOf(record), record));
    return map;
  };

  function currentDiary() {
    return diaries[currentPage] || null;
  }

  function destroyPageFlip() {
    if (!pageFlip) return;
    try {
      pageFlip.destroy();
    } catch {
      /* ignore */
    }
    pageFlip = null;
  }

  function setCalendarExpanded(expanded) {
    if (!calToggle && !calPanel) return;
    const next = Boolean(expanded);
    if (calPanel) calPanel.hidden = !next;
    if (calToggle) {
      calToggle.setAttribute("aria-expanded", next ? "true" : "false");
      calToggle.textContent = next ? t("diary.book.calendarCollapse") : t("diary.book.calendarExpand");
    }
    calIndex?.classList.toggle("is-cal-expanded", next);
    // Do NOT destroy/remount PageFlip here — resizing mid-session clears the book.
    // Calendar overlays the stage instead so flip dimensions stay stable.
    if (next) renderCalendar();
  }

  function collapseCalendar() {
    setCalendarExpanded(false);
  }

  const overlayReader = Boolean(root.classList.contains("memory-diary-reader") || cover?.hidden);

  function setOpen(next) {
    open = next;
    root.classList.toggle("is-open", open);
    if (cover) cover.setAttribute("aria-expanded", open ? "true" : "false");
    if (overlayReader) {
      root.hidden = !open;
      if (interior) interior.hidden = false;
    } else if (interior) {
      interior.hidden = !open;
    }
    if (!open) {
      closeReader();
      collapseCalendar();
      flipSizeLocked = null;
      useStaticFallback = inMiniShell || compactViewport;
      window.clearTimeout(settleTimer);
      destroyPageFlip();
      if (flipBook) flipBook.innerHTML = "";
      return;
    }

    const host = root.closest(".mini-diary-host");
    if (host) host.scrollTop = 0;
    if (inPhone) collapseCalendar();
    syncCalendarToPage();
    renderCalendar();

    const paintOpen = () => {
      if (!open) return;
      renderPages();
      if (!inPhone && !root.closest(".mini-phone") && window.matchMedia("(max-width: 720px)").matches) {
        root.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      callbacks.onOpen?.();
    };

    // Interior was hidden — wait one frame so stage width is measurable for fixed PageFlip size.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(paintOpen);
    });
  }

  function syncCalendarToPage() {
    const diary = currentDiary();
    if (!diary) return;
    const anchor = new Date(diaryDayOf(diary));
    if (!Number.isNaN(anchor.getTime())) {
      calendarMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    }
  }

  function jumpToDiaryId(id) {
    const index = diaries.findIndex((record) => record.id === id);
    if (index < 0) return false;
    goToPage(index);
    return true;
  }

  function jumpToDay(day) {
    const index = diaries.findIndex((record) => diaryDayOf(record) === day);
    if (index < 0) return false;
    goToPage(index);
    return true;
  }

  function renderCover() {
    if (!coverMeta) return;
    if (!diaries.length) {
      coverMeta.textContent = t("diary.book.coverEmpty");
      return;
    }
    const latest = diaries[0];
    const day = diaryDayOf(latest);
    coverMeta.textContent = t("diary.book.coverMeta", {
      n: diaries.length,
      date: day.slice(5).replace("-", "."),
    });
  }

  function renderCalendar() {
    if (!calGrid || !calTitle) return;
    calTitle.textContent = monthTitle(calendarMonth);
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = diaryByDay();
    const activeDay = currentDiary() ? diaryDayOf(currentDiary()) : "";
    const today = new Date().toISOString().slice(0, 10);

    calGrid.innerHTML = "";
    for (let i = 0; i < firstWeekday; i += 1) {
      const pad = document.createElement("span");
      pad.className = "diary-cal-pad";
      pad.setAttribute("aria-hidden", "true");
      calGrid.append(pad);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "diary-cal-day";
      button.textContent = String(day);
      button.dataset.diaryCalDay = iso;
      if (byDay.has(iso)) button.classList.add("has-entry");
      if (iso === today) button.classList.add("is-today");
      if (iso === activeDay) button.classList.add("is-active");
      if (!byDay.has(iso)) button.disabled = true;
      calGrid.append(button);
    }
  }

  function renderCalendarActive() {
    const diary = currentDiary();
    if (!diary) return;
    const activeDay = diaryDayOf(diary);
    calGrid?.querySelectorAll(".diary-cal-day").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.diaryCalDay === activeDay);
    });
  }

  function renderFooter() {
    const diary = currentDiary();
    if (!diary) {
      if (pageIndicator) pageIndicator.textContent = "0 / 0";
      if (pageFooter) pageFooter.hidden = true;
      if (pagePrev) pagePrev.disabled = true;
      if (pageNext) pageNext.disabled = true;
      return;
    }

    if (pageFooter) pageFooter.hidden = false;
    if (pageIndicator) pageIndicator.textContent = `${currentPage + 1} / ${diaries.length}`;
    if (pagePin) {
      pagePin.textContent = diary.pinned ? t("diary.book.unpin") : t("diary.book.pin");
      pagePin.dataset.diaryId = diary.id;
    }
    if (pageEdit) pageEdit.dataset.diaryId = diary.id;
    if (pageDelete) pageDelete.dataset.diaryId = diary.id;
    if (pagePrev) pagePrev.disabled = currentPage <= 0;
    if (pageNext) pageNext.disabled = currentPage >= diaries.length - 1;
    renderCalendarActive();
  }

  function flipSettings() {
    if (inPhone) {
      const stage = root.querySelector("[data-diary-book-stage]");
      const stageWidth = Math.max(180, Math.floor(stage?.clientWidth || root.clientWidth || 280));
      const stageHeight = Math.max(240, Math.floor(stage?.clientHeight || 340));
      const width = flipSizeLocked?.width
        || Math.min(248, Math.max(200, stageWidth - 24));
      const height = flipSizeLocked?.height
        || Math.min(340, Math.max(280, Math.round(width * 1.32)), stageHeight - 12);
      flipSizeLocked = { width, height };
      return {
        width,
        height,
        size: "fixed",
        minWidth: width,
        maxWidth: width,
        minHeight: height,
        maxHeight: height,
        drawShadow: true,
        maxShadowOpacity: 0.18,
        flippingTime: 650,
        usePortrait: true,
        autoSize: false,
        showCover: false,
        mobileScrollSupport: false,
        clickEventForward: true,
        // Stage owns swipe/buttons; library finger-drag would fight them.
        useMouseEvents: false,
        // Hover corner peek is a common source of leftover tilt — disable.
        showPageCorners: false,
        disableFlipByClick: true,
        swipeDistance: 30,
      };
    }
    return {
      width: 360,
      height: 500,
      size: "stretch",
      minWidth: 280,
      maxWidth: 420,
      minHeight: 360,
      maxHeight: 560,
      drawShadow: true,
      maxShadowOpacity: 0.24,
      flippingTime: 700,
      usePortrait: true,
      autoSize: true,
      showCover: false,
      mobileScrollSupport: true,
      clickEventForward: true,
      // Stage pointer swipe is the single gesture entry (buttons update currentPage).
      useMouseEvents: false,
      showPageCorners: false,
      disableFlipByClick: true,
      swipeDistance: 30,
    };
  }

  function pagesAreCrooked() {
    if (!flipBook) return false;
    return Array.from(flipBook.querySelectorAll(".stf__item")).some((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const transform = node.style.transform || "";
      return /rotate/i.test(transform);
    });
  }

  /**
   * Library fold can leave rotate/clip-path if touch is cancelled mid-gesture.
   * Only remount when state is READ and a leftover tilt is still visible.
   */
  function settleIfCrooked() {
    if (!open || !pageFlip || !flipBook) return;
    let state = "";
    try {
      state = pageFlip.getState?.() || "";
    } catch {
      return;
    }
    if (state !== "read") return;
    if (!pagesAreCrooked()) return;

    const pages = buildPages();
    try {
      pageFlip.updateFromHtml(pages);
      pageFlip.turnToPage(currentPage);
    } catch {
      try {
        pageFlip.turnToPage(currentPage);
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleSettle() {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settleIfCrooked, 90);
  }

  function bindFlipSafety() {
    // After library processes mouseup/touchend, repair any leftover fold pose.
    const onPointerLifeEnd = () => {
      if (!open || !pageFlip) return;
      ignoreClickUntil = performance.now() + 280;
      scheduleSettle();
    };
    window.addEventListener("mouseup", onPointerLifeEnd, true);
    window.addEventListener("touchend", onPointerLifeEnd, true);
    window.addEventListener("touchcancel", onPointerLifeEnd, true);
    window.addEventListener("pointercancel", onPointerLifeEnd, true);
    return () => {
      window.removeEventListener("mouseup", onPointerLifeEnd, true);
      window.removeEventListener("touchend", onPointerLifeEnd, true);
      window.removeEventListener("touchcancel", onPointerLifeEnd, true);
      window.removeEventListener("pointercancel", onPointerLifeEnd, true);
    };
  }

  const unbindFlipSafety = bindFlipSafety();

  function buildPages() {
    if (!diaries.length) return [createEmptyPage()];
    return diaries.map((record, index) => createDiaryPage(record, index, diaries.length));
  }

  function renderStaticPage(pages) {
    if (!flipBook) return;
    flipBook.innerHTML = "";
    const list = pages || buildPages();
    flipBook.append(list[clampPage(currentPage, list.length)] || list[0]);
  }

  function enterStaticFallback(pages) {
    destroyPageFlip();
    useStaticFallback = true;
    renderStaticPage(pages);
  }

  function syncLibraryToCurrentPage() {
    if (!pageFlip) {
      renderStaticPage();
      return false;
    }
    try {
      // flipNext/flipPrev no-op when disableFlipByClick is true (library corner check).
      // turnToPage always updates the page collection and fires "flip".
      pageFlip.turnToPage(currentPage);
      return true;
    } catch {
      enterStaticFallback();
      return false;
    }
  }

  function renderPages() {
    const pages = buildPages();
    currentPage = clampPage(currentPage, diaries.length);

    if (!flipBook || !PageFlipCtor || useStaticFallback) {
      renderStaticPage(pages);
      renderFooter();
      return;
    }

    if (!pageFlip) {
      flipBook.innerHTML = "";
      try {
        pageFlip = new PageFlipCtor(flipBook, flipSettings());
        pageFlip.on("flip", (event) => {
          currentPage = clampPage(Number(event.data) || 0, diaries.length);
          syncCalendarToPage();
          renderCalendar();
          renderFooter();
          scheduleSettle();
        });
        pageFlip.on("changeOrientation", () => {
          renderFooter();
        });
        pageFlip.on("changeState", (event) => {
          if (event.data === "read") scheduleSettle();
        });
        pageFlip.loadFromHTML(pages);
      } catch {
        enterStaticFallback(pages);
        renderFooter();
        return;
      }
    } else {
      try {
        pageFlip.updateFromHtml(pages);
      } catch {
        enterStaticFallback(pages);
        renderFooter();
        return;
      }
    }

    window.requestAnimationFrame(() => {
      if (!pageFlip) {
        renderStaticPage(pages);
        renderFooter();
        return;
      }
      try {
        pageFlip.turnToPage(currentPage);
      } catch {
        currentPage = 0;
        try {
          pageFlip.turnToPage(0);
        } catch {
          enterStaticFallback(pages);
        }
      }
      renderFooter();
      scheduleSettle();
    });
  }

  function goToPage(index) {
    if (!diaries.length) {
      currentPage = 0;
      renderFooter();
      return;
    }
    const nextIndex = clampPage(index, diaries.length);
    if (nextIndex === currentPage) {
      renderFooter();
      return;
    }
    currentPage = nextIndex;
    syncCalendarToPage();
    renderCalendar();
    renderFooter();

    if (!PageFlipCtor || useStaticFallback) {
      renderStaticPage();
      return;
    }

    if (!pageFlip) {
      // Library not mounted yet — paint DOM content immediately, mount on next renderPages.
      renderStaticPage();
      return;
    }

    syncLibraryToCurrentPage();
    scheduleSettle();
  }

  function turnPage(delta) {
    if (!diaries.length) return;
    const target = currentPage + delta;
    if (target < 0 || target >= diaries.length) return;
    goToPage(target);
  }

  function render(records = []) {
    diaries = records
      .filter((record) => {
        const source = String(record.source || "diary.memory");
        return source === "diary.memory" || source === "life";
      })
      .sort((a, b) => new Date(diaryDayOf(b)) - new Date(diaryDayOf(a)));
    currentPage = clampPage(currentPage, diaries.length);
    renderCover();
    if (open) {
      syncCalendarToPage();
      renderCalendar();
      renderPages();
    }
  }

  cover?.addEventListener("click", () => setOpen(true));
  closeButton?.addEventListener("click", () => setOpen(false));

  calPrev?.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext?.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  calToggle?.addEventListener("click", () => {
    const expanded = calToggle.getAttribute("aria-expanded") === "true";
    setCalendarExpanded(!expanded);
  });

  calGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-diary-cal-day]");
    if (!button || button.disabled) return;
    jumpToDay(button.dataset.diaryCalDay);
    if (inPhone) setCalendarExpanded(false);
  });

  pagePrev?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    turnPage(-1);
  });
  pageNext?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    turnPage(1);
  });

  function swipeTargetIsChrome(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        "[data-diary-page-prev], [data-diary-page-next], [data-diary-cal-prev], [data-diary-cal-next], [data-diary-cal-toggle], [data-diary-cal-day], [data-diary-book-close], button, a, [data-diary-open-full]",
      ),
    );
  }

  function onStagePointerDown(event) {
    if (!open || !diaries.length) return;
    if (swipeTargetIsChrome(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipePointerId = event.pointerId;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeActive = true;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onStagePointerMove(event) {
    if (!swipeActive || event.pointerId !== swipePointerId) return;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      event.preventDefault();
    }
  }

  function endStageSwipe(event, cancelled = false) {
    if (!swipeActive || event.pointerId !== swipePointerId) return;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    swipeActive = false;
    swipePointerId = null;
    try {
      if (stage.hasPointerCapture?.(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (cancelled) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    ignoreClickUntil = performance.now() + 280;
    // Left swipe → next page; right swipe → previous page.
    if (dx < 0) turnPage(1);
    else turnPage(-1);
  }

  function onStagePointerUp(event) {
    endStageSwipe(event, false);
  }

  function onStagePointerCancel(event) {
    endStageSwipe(event, true);
  }

  stage?.addEventListener("pointerdown", onStagePointerDown);
  stage?.addEventListener("pointermove", onStagePointerMove);
  stage?.addEventListener("pointerup", onStagePointerUp);
  stage?.addEventListener("pointercancel", onStagePointerCancel);

  // Edge tap only — do not steal the library's follow-finger drag (desktop).
  flipBook?.addEventListener("click", (event) => {
    if (!open || !diaries.length) return;
    if (performance.now() < ignoreClickUntil) return;
    if (event.target.closest("button, a, [data-diary-open-full]")) return;
    const rect = flipBook.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio <= 0.18) turnPage(-1);
    else if (ratio >= 0.82) turnPage(1);
  });

  flipBook?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-diary-open-full]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openReader(button.dataset.diaryOpenFull);
  }, true);

  pagePin?.addEventListener("click", async () => {
    const diary = currentDiary();
    if (!diary) return;
    await callbacks.onPin?.(diary.id);
  });
  pageEdit?.addEventListener("click", () => {
    const diary = currentDiary();
    if (diary) callbacks.onEdit?.(diary);
  });
  pageDelete?.addEventListener("click", async () => {
    const diary = currentDiary();
    if (!diary) return;
    await callbacks.onDelete?.(diary.id);
  });

  if (calGrid && !root.querySelector(".diary-book-cal-weekdays")) {
    const weekdays = document.createElement("div");
    weekdays.className = "diary-book-cal-weekdays";
    weekdays.setAttribute("aria-hidden", "true");
    const labels = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(2024, 0, 1 + dayIndex);
      return new Intl.DateTimeFormat(intlLocale(), { weekday: "short" }).format(date);
    });
    weekdays.innerHTML = labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("");
    calGrid.before(weekdays);
  }

  if (inPhone) collapseCalendar();

  document.addEventListener("yueqi:locale-changed", () => {
    renderCover();
    if (open) {
      renderCalendar();
      renderPages();
    }
  });

  return {
    render,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    openToDiaryId(id) {
      setOpen(true);
      return jumpToDiaryId(id);
    },
    destroy() {
      window.clearTimeout(settleTimer);
      unbindFlipSafety();
      stage?.removeEventListener("pointerdown", onStagePointerDown);
      stage?.removeEventListener("pointermove", onStagePointerMove);
      stage?.removeEventListener("pointerup", onStagePointerUp);
      stage?.removeEventListener("pointercancel", onStagePointerCancel);
      setOpen(false);
    },
  };
}
