import { diaryDayFromIso, resolveDiaryStyleId, todayDiaryDay } from "../diary/fields.js";
import { DIARY_STYLES, getDiaryStyle, getDiaryStyleLabel } from "../diary/styles.js";
import { escapeHtml } from "../lib/utils.js";
import { t, getLocale } from "../i18n/index.js";
import { isImagegenConfigured } from "../settings/imagegen-preferences.js";
import { getDiarySettings } from "../settings/preferences.js";
import { pinSheetToViewport, restoreSheetFromViewport } from "./viewport-sheet.js";

function intlLocale() {
  return getLocale() === "en" ? "en-US" : "zh-CN";
}

/** Normalize any diary day string / Date / ISO timestamp to YYYY-MM-DD (local). */
export function normalizeDiaryDay(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return todayDiaryDay(value);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // ISO with time: prefer local calendar day, not UTC slice.
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return todayDiaryDay(parsed);
  return diaryDayFromIso(raw);
}

function dayOf(record) {
  return normalizeDiaryDay(record?.diaryDay || record?.createdAt) || "";
}

/** Strip hollow / bullet-only diary payloads so cards never show a lone "•". */
export function normalizeJournalText(value) {
  if (value == null) return "";
  const text = String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/^(?:[-*•·–—]\s+)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  // Lone bullets / punctuation / ellipses — not a real diary body.
  if (/^[\s•·\-–—*。．.、，,…‥]+$/.test(text)) return "";
  if (/^(?:[\s]*[-*•·][\s]*)+$/m.test(text) && !/[A-Za-z\u4e00-\u9fff]{2,}/.test(text)) {
    return "";
  }
  return text;
}

function bodyOf(record) {
  return normalizeJournalText(record?.rawText || record?.body || record?.text || "");
}

function titleOf(record) {
  const cleanedTitle = normalizeJournalText(record?.title);
  if (cleanedTitle) return cleanedTitle.length > 28 ? `${cleanedTitle.slice(0, 28)}…` : cleanedTitle;
  const raw = bodyOf(record);
  if (!raw) return "";
  const first = raw.split(/[。！？\n.!?\r]/).find((part) => normalizeJournalText(part)) || "";
  if (!first) return "";
  return first.length > 28 ? `${first.slice(0, 28)}…` : first;
}

function sceneImageOf(record) {
  const url = String(
    record?.sceneImage || record?.coverUrl || record?.imageUrl || record?.mediaUrl || "",
  ).trim();
  if (!url) return "";
  if (url.startsWith("data:image/") || url.startsWith("blob:")) return url;
  if (/^https?:\/\//i.test(url) || /^\/assets\//i.test(url)) return url;
  return "";
}

function toIsoDay(date) {
  return todayDiaryDay(date);
}

function parseIsoDay(iso) {
  const day = normalizeDiaryDay(iso);
  if (!day) return null;
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(1);
  return d;
}

function weekNumber(date) {
  const first = new Date(date.getFullYear(), 0, 1);
  const dayMs = 86400000;
  return Math.ceil((((date - first) / dayMs) + first.getDay() + 1) / 7);
}

function partOfDay(record) {
  const time = new Date(record.createdAt || `${dayOf(record)}T21:00:00`).getTime();
  if (Number.isNaN(time)) return "evening";
  const hour = new Date(time).getHours();
  if (hour < 5) return "night";
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function formatCardDateLine(iso, record) {
  const date = parseIsoDay(iso);
  if (!date) return iso;
  const monthDay = getLocale() === "en"
    ? new Intl.DateTimeFormat(intlLocale(), { month: "short", day: "numeric" }).format(date)
    : `${date.getMonth() + 1}月${date.getDate()}日`;
  const weekday = new Intl.DateTimeFormat(intlLocale(), { weekday: "short" }).format(date);
  const partKey = `memoryGallery.part.${partOfDay(record || {})}`;
  const part = t(partKey);
  const partText = part && part !== partKey ? ` · ${part}` : "";
  return `${monthDay} · ${weekday}${partText}`;
}

function formatClock(record) {
  const date = new Date(record.createdAt || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function padIndex(index) {
  return String(Math.max(1, index + 1)).padStart(2, "0");
}

/**
 * Memory tab gallery: magazine cards + week strip + soft weekly recap.
 */
export function createMemoryDiaryGallery(root, {
  onOpenDiary,
  onGenerateDiary,
  onReviewWeek,
  onSelectDay,
  onSearch,
  onOpenCharacter,
  getDefaultStyleId,
} = {}) {
  if (!root) {
    return { render() {}, setTogetherDays() {}, selectDay() {}, openCompose() {} };
  }

  const daysNode = root.querySelector("[data-memory-together-label]");
  const weekRoot = root.querySelector("[data-memory-week]");
  const weekLabel = root.querySelector("[data-memory-week-label]");
  const weekViewport = root.querySelector("[data-memory-week-viewport]") || weekRoot;
  const weekTrack = root.querySelector("[data-memory-week-track]");
  const monthSheet = root.querySelector("[data-memory-month-sheet]");
  const monthTitle = root.querySelector("[data-memory-month-title]");
  const monthGrid = root.querySelector("[data-memory-month-grid]");
  const monthWeekdays = root.querySelector("[data-memory-month-weekdays]");
  const composeSheet = root.querySelector("[data-memory-compose-sheet]");
  const composeStyles = root.querySelector("[data-memory-compose-styles]");
  const composeImage = root.querySelector("[data-memory-compose-image]");
  const composeImageHint = root.querySelector("[data-memory-compose-image-hint]");
  const composeImageRow = composeImage?.closest(".memory-compose-image");
  const composeConfirm = root.querySelector("[data-memory-compose-confirm]");
  const feed = root.querySelector("[data-memory-feed]");
  const recap = root.querySelector("[data-memory-recap]");
  const searchToggle = root.querySelector("[data-memory-search-toggle]");
  const searchPanel = root.querySelector("[data-memory-search-panel]");
  const searchInput = root.querySelector("[data-memory-gallery-search]");
  const avatarButton = root.querySelector("[data-memory-open-character]");

  let selectedDay = toIsoDay(new Date());
  let feedScope = "day"; // "day" | "week"
  let diaries = [];
  let diaryByDay = new Map();
  let togetherDaysValue = 1;
  let calendarMonth = startOfMonth(parseIsoDay(selectedDay) || new Date());
  let weekSwipeX = 0;
  let weekSwipeActive = false;
  let weekSwipeLocked = "";
  let weekAnimTimer = 0;
  let weekWheelLockUntil = 0;
  let composeStyleId = "literary";
  let composeSourceButton = null;
  let weekSuppressClick = false;
  let weekPointerDay = "";
  let weekPointerId = null;

  function setTogetherDays(n) {
    if (!daysNode) return;
    togetherDaysValue = Math.max(1, Number(n) || 1);
    const label = t("memoryGallery.togetherDays", { days: "\u0000" });
    const parts = label.split("\u0000");
    daysNode.innerHTML = `${escapeHtml(parts[0] || "")}<strong>${togetherDaysValue}</strong>${escapeHtml(parts[1] || "")}`;
  }

  function buildWeekDays() {
    const anchor = parseIsoDay(selectedDay) || new Date();
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }

  function renderWeekMeta(days) {
    if (!weekLabel) return;
    const mid = days[3] || days[0];
    const month = new Intl.DateTimeFormat(intlLocale(), { month: "short" }).format(mid);
    const week = weekNumber(mid);
    weekLabel.innerHTML = `
      <strong>${escapeHtml(month)}</strong>
      <span>/ ${escapeHtml(t("memoryGallery.weekOf", { week }))}</span>
    `;
  }

  function dayButtonHtml(date) {
    const iso = toIsoDay(date);
    const has = diaryByDay.has(iso);
    const isToday = iso === toIsoDay(new Date());
    const isActive = iso === selectedDay;
    const weekday = new Intl.DateTimeFormat(intlLocale(), {
      weekday: getLocale() === "en" ? "short" : "narrow",
    }).format(date);
    const num = String(date.getDate()).padStart(2, "0");
    return `
      <button type="button"
        class="memory-week__day${has ? " has-entry" : ""}${isToday ? " is-today" : ""}${isActive ? " is-active" : ""}"
        data-memory-day="${escapeHtml(iso)}"
        aria-pressed="${isActive ? "true" : "false"}">
        <span class="memory-week__weekday">${escapeHtml(weekday)}</span>
        <strong class="memory-week__num">${num}</strong>
        <i class="memory-week__dot" aria-hidden="true"></i>
      </button>
    `;
  }

  function renderWeek({ animate = "" } = {}) {
    if (!weekTrack) return;
    const days = buildWeekDays();
    renderWeekMeta(days);
    weekTrack.innerHTML = days.map(dayButtonHtml).join("");
    if (animate) {
      weekTrack.classList.remove("is-slide-from-left", "is-slide-from-right");
      void weekTrack.offsetWidth;
      weekTrack.classList.add(animate === "next" ? "is-slide-from-right" : "is-slide-from-left");
      window.clearTimeout(weekAnimTimer);
      weekAnimTimer = window.setTimeout(() => {
        weekTrack.classList.remove("is-slide-from-left", "is-slide-from-right");
      }, 220);
    }
  }

  function shiftWeek(deltaWeeks, { keepWeekday = true } = {}) {
    const current = parseIsoDay(selectedDay) || new Date();
    const weekday = keepWeekday ? current.getDay() : 0;
    const nextWeekStart = startOfWeek(current);
    nextWeekStart.setDate(nextWeekStart.getDate() + (deltaWeeks * 7) + weekday);
    const animate = deltaWeeks > 0 ? "next" : "prev";
    selectDay(toIsoDay(nextWeekStart), { animate });
  }

  function setMonthSheetOpen(open) {
    if (!monthSheet) return;
    monthSheet.hidden = !open;
    monthSheet.setAttribute("aria-hidden", open ? "false" : "true");
    weekRoot?.classList.toggle("is-month-open", open);
    if (open) {
      calendarMonth = startOfMonth(parseIsoDay(selectedDay) || new Date());
      renderMonthSheet();
      pinSheetToViewport(monthSheet);
    } else {
      restoreSheetFromViewport(monthSheet);
    }
  }

  function defaultComposeStyleId() {
    if (typeof getDefaultStyleId === "function") {
      return getDefaultStyleId() || "literary";
    }
    return getDiarySettings().style || "literary";
  }

  function renderComposeStyles() {
    if (!composeStyles) return;
    composeStyles.innerHTML = DIARY_STYLES.map((style) => {
      const active = style.id === composeStyleId;
      return `
        <button type="button"
          class="diary-style-card${active ? " is-active" : ""}"
          data-memory-compose-style="${escapeHtml(style.id)}"
          role="radio"
          aria-checked="${active ? "true" : "false"}">
          <strong>${escapeHtml(style.emoji)} ${escapeHtml(getDiaryStyleLabel(style))}</strong>
          <em>${escapeHtml(style.tagline)}</em>
        </button>
      `;
    }).join("");
  }

  function syncComposeImageOption() {
    const ready = isImagegenConfigured();
    if (composeImage) {
      composeImage.disabled = !ready;
      if (!ready) composeImage.checked = false;
    }
    composeImageRow?.classList.toggle("is-disabled", !ready);
    if (composeImageHint) {
      composeImageHint.textContent = ready
        ? t("memoryGallery.composeImageHint")
        : t("memoryGallery.composeImageNeedConfig");
    }
  }

  function setComposeSheetOpen(open, { sourceButton = null } = {}) {
    if (!composeSheet) return;
    if (open) setMonthSheetOpen(false);
    composeSourceButton = open ? sourceButton : null;
    if (open) {
      composeStyleId = defaultComposeStyleId();
      renderComposeStyles();
      syncComposeImageOption();
      pinSheetToViewport(composeSheet);
    } else {
      restoreSheetFromViewport(composeSheet);
    }
    composeSheet.hidden = !open;
    composeSheet.setAttribute("aria-hidden", open ? "false" : "true");
  }

  async function confirmCompose() {
    const styleId = composeStyleId || defaultComposeStyleId();
    const withImage = Boolean(composeImage?.checked) && isImagegenConfigured();
    const sourceButton = composeSourceButton || composeConfirm;
    setComposeSheetOpen(false);
    await onGenerateDiary?.(selectedDay, sourceButton, { styleId, withImage });
  }

  function renderMonthWeekdays() {
    if (!monthWeekdays) return;
    const base = startOfWeek(new Date());
    monthWeekdays.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const label = new Intl.DateTimeFormat(intlLocale(), {
        weekday: getLocale() === "en" ? "narrow" : "narrow",
      }).format(d);
      return `<span>${escapeHtml(label)}</span>`;
    }).join("");
  }

  function renderMonthSheet() {
    if (!monthGrid || !monthTitle) return;
    renderMonthWeekdays();
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    monthTitle.textContent = new Intl.DateTimeFormat(intlLocale(), {
      year: "numeric",
      month: "long",
    }).format(calendarMonth);
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = toIsoDay(new Date());
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(`<span class="memory-month-pad" aria-hidden="true"></span>`);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const has = diaryByDay.has(iso);
      const isToday = iso === today;
      const isActive = iso === selectedDay;
      cells.push(`
        <button type="button"
          class="memory-month-day${has ? " has-entry" : ""}${isToday ? " is-today" : ""}${isActive ? " is-active" : ""}"
          data-memory-month-day="${escapeHtml(iso)}"
          aria-pressed="${isActive ? "true" : "false"}">
          <span>${day}</span>
          <i aria-hidden="true"></i>
        </button>
      `);
    }
    monthGrid.innerHTML = cells.join("");
  }

  function onWeekPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("[data-memory-open-calendar], [data-memory-month-sheet]")) return;
    weekSwipeActive = true;
    weekSwipeLocked = "";
    weekSwipeX = event.clientX;
    weekPointerId = event.pointerId;
    weekPointerDay = event.target.closest("[data-memory-day]")?.dataset.memoryDay || "";
    weekSuppressClick = false;
    // Defer setPointerCapture until a real horizontal swipe locks —
    // capturing on down retargets click to the viewport and day buttons never fire.
  }

  function onWeekPointerMove(event) {
    if (!weekSwipeActive || !weekTrack) return;
    if (weekPointerId != null && event.pointerId !== weekPointerId) return;
    const dx = event.clientX - weekSwipeX;
    if (!weekSwipeLocked) {
      if (Math.abs(dx) < 10) return;
      weekSwipeLocked = "x";
      try {
        weekViewport?.setPointerCapture?.(event.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (weekSwipeLocked !== "x") return;
    event.preventDefault();
    const offset = Math.max(-72, Math.min(72, dx * 0.35));
    weekTrack.style.transform = `translateX(${offset}px)`;
    weekTrack.style.opacity = String(Math.max(0.72, 1 - Math.abs(offset) / 180));
  }

  function onWeekPointerUp(event) {
    if (!weekSwipeActive) return;
    if (weekPointerId != null && event.pointerId !== weekPointerId) return;
    weekSwipeActive = false;
    const dx = event.clientX - weekSwipeX;
    const locked = weekSwipeLocked;
    const day = weekPointerDay;
    weekPointerDay = "";
    weekPointerId = null;
    if (weekTrack) {
      weekTrack.style.transform = "";
      weekTrack.style.opacity = "";
    }
    try {
      weekViewport?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    if (locked === "x" && Math.abs(dx) >= 48) {
      weekSuppressClick = true;
      shiftWeek(dx < 0 ? 1 : -1);
    } else if (day && locked !== "x") {
      // Tap: select that day even if click was swallowed elsewhere.
      weekSuppressClick = true;
      selectDay(day);
      window.setTimeout(() => {
        weekSuppressClick = false;
      }, 0);
    }
    weekSwipeLocked = "";
  }

  function emptyCardHtml(day) {
    const dateLine = formatCardDateLine(day, { createdAt: `${day}T20:00:00` })
      .replace(/\s·\s(?:清晨|午后|夜晚|深夜|morning|afternoon|evening|night)$/i, "");
    return `
      <article class="editorial-journal-card editorial-journal-card--empty" data-memory-empty-day="${escapeHtml(day)}">
        <header class="journal-card-meta">
          <span>${escapeHtml(dateLine)}</span>
        </header>
        <h3 class="journal-card-title">${escapeHtml(t("memoryGallery.emptyTitle"))}</h3>
        <i class="journal-card-rule" aria-hidden="true"></i>
        <p class="journal-card-body">${escapeHtml(t("memoryGallery.emptyBody"))}</p>
        <footer class="journal-card-footer">
          <button type="button" class="journal-card-cta" data-memory-write-today>${escapeHtml(t("memoryGallery.organize"))}</button>
        </footer>
      </article>
    `;
  }

  function weekEmptyCardHtml() {
    return `
      <article class="editorial-journal-card editorial-journal-card--empty" data-memory-week-empty>
        <header class="journal-card-meta">
          <span>${escapeHtml(weekRangeLabel(buildWeekDays()))}</span>
        </header>
        <h3 class="journal-card-title">${escapeHtml(t("memoryGallery.recapEmptyTitle"))}</h3>
        <i class="journal-card-rule" aria-hidden="true"></i>
        <p class="journal-card-body">${escapeHtml(t("memoryGallery.recapEmptyBody"))}</p>
        <footer class="journal-card-footer">
          <button type="button" class="journal-card-cta" data-memory-write-today>${escapeHtml(t("memoryGallery.organize"))}</button>
        </footer>
      </article>
    `;
  }

  function editorialCardHtml(record, index, body) {
    const iso = dayOf(record);
    const style = getDiaryStyle(resolveDiaryStyleId(record));
    const clock = formatClock(record);
    const indexLabel = padIndex(index);
    const heading = t("memoryGallery.herDiary");
    const sub = titleOf(record);
    return `
      <article class="editorial-journal-card" data-diary-id="${escapeHtml(record.id)}" data-card-index="${escapeHtml(indexLabel)}">
        <header class="journal-card-meta">
          <span>${escapeHtml(formatCardDateLine(iso, record))}</span>
          <span class="journal-card-index">${escapeHtml(indexLabel)}</span>
        </header>
        <h3 class="journal-card-title">${escapeHtml(heading)}</h3>
        ${sub && sub !== heading ? `<p class="journal-card-kicker">${escapeHtml(sub)}</p>` : ""}
        <i class="journal-card-rule" aria-hidden="true"></i>
        <p class="journal-card-body">${escapeHtml(body)}</p>
        <footer class="journal-card-footer">
          <span class="journal-card-tag">${escapeHtml(getDiaryStyleLabel(style))}</span>
          <span>${escapeHtml(clock || "")}</span>
        </footer>
      </article>
    `;
  }

  function sceneCardHtml(record, index, body, imageUrl) {
    const iso = dayOf(record);
    const style = getDiaryStyle(resolveDiaryStyleId(record));
    const clock = formatClock(record);
    const indexLabel = padIndex(index);
    const heading = titleOf(record) || t("memoryGallery.herDiary");
    return `
      <article class="scene-journal-card" data-diary-id="${escapeHtml(record.id)}" data-card-index="${escapeHtml(indexLabel)}">
        <img class="scene-journal-card__img" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" data-scene-fallback />
        <div class="scene-journal-card__veil" aria-hidden="true"></div>
        <div class="scene-journal-card__content">
          <header class="journal-card-meta journal-card-meta--on-scene">
            <span>${escapeHtml(formatCardDateLine(iso, record))}</span>
            <span class="journal-card-index">${escapeHtml(indexLabel)}</span>
          </header>
          <h3 class="journal-card-title journal-card-title--on-scene">${escapeHtml(heading)}</h3>
          <p class="journal-card-body journal-card-body--on-scene">${escapeHtml(body)}</p>
          <footer class="journal-card-footer journal-card-footer--on-scene">
            <span class="journal-card-tag journal-card-tag--on-scene">${escapeHtml(getDiaryStyleLabel(style))}</span>
            <span>${escapeHtml(clock || "")}</span>
          </footer>
        </div>
      </article>
    `;
  }

  function cardHtml(record, index) {
    const body = bodyOf(record);
    if (!body) return "";
    const imageUrl = sceneImageOf(record);
    if (imageUrl) return sceneCardHtml(record, index, body, imageUrl);
    return editorialCardHtml(record, index, body);
  }

  function cardsForSelectedDay() {
    return diaries
      .filter((record) => dayOf(record) === selectedDay && bodyOf(record))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function cardsForSelectedWeek() {
    const weekIso = new Set(buildWeekDays().map(toIsoDay));
    return diaries
      .filter((record) => weekIso.has(dayOf(record)) && bodyOf(record))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderFeed() {
    if (!feed) return;
    const cards = feedScope === "week" ? cardsForSelectedWeek() : cardsForSelectedDay();
    if (!cards.length) {
      feed.innerHTML = feedScope === "week" ? weekEmptyCardHtml() : emptyCardHtml(selectedDay);
      return;
    }
    const heading = feedScope === "week"
      ? `<header class="memory-feed__scope"><strong>${escapeHtml(t("memoryGallery.recapTitle"))}</strong><span>${escapeHtml(weekRangeLabel(buildWeekDays()))}</span></header>`
      : "";
    feed.innerHTML = `${heading}${cards.map((record, i) => cardHtml(record, i)).filter(Boolean).join("")}`;

    feed.querySelectorAll("[data-scene-fallback]").forEach((img) => {
      img.addEventListener("error", () => {
        const card = img.closest(".scene-journal-card");
        const id = card?.dataset.diaryId;
        const record = diaries.find((item) => item.id === id);
        if (!card || !record) return;
        const index = Number(card.dataset.cardIndex) - 1 || 0;
        card.outerHTML = editorialCardHtml(record, index, bodyOf(record));
      }, { once: true });
    });
  }

  function weekRangeLabel(days) {
    const first = days[0];
    const last = days[6];
    if (!first || !last) return "";
    const fmt = (d) => `${d.getMonth() + 1}.${d.getDate()}`;
    return `${fmt(first)} — ${fmt(last)}`;
  }

  function renderRecap() {
    if (!recap) return;
    const days = togetherDaysValue;
    const diaryCount = diaries.filter((record) => bodyOf(record)).length;
    if (days < 7 && diaryCount < 3) {
      recap.hidden = true;
      recap.innerHTML = "";
      return;
    }

    const weekDays = buildWeekDays();
    const weekIso = new Set(weekDays.map(toIsoDay));
    const weekDiaries = diaries.filter((record) => weekIso.has(dayOf(record)));
    const nightsTogether = Math.min(7, Math.max(weekDiaries.length, 0));

    recap.hidden = false;
    recap.innerHTML = `
      <div class="memory-recap__lead">
        <span class="memory-recap__icon" aria-hidden="true">🌱</span>
        <div>
          <strong>${escapeHtml(t("memoryGallery.recapTitle"))}</strong>
          <span>${escapeHtml(weekRangeLabel(weekDays))}</span>
        </div>
      </div>
      <div class="memory-recap__stats">
        <div><strong>${nightsTogether || "—"}</strong><span>${escapeHtml(t("memoryGallery.recapNights"))}</span></div>
        <div><strong>${weekDiaries.length}</strong><span>${escapeHtml(t("memoryGallery.recapDiaries"))}</span></div>
        <div><strong>${diaryCount}</strong><span>${escapeHtml(t("memoryGallery.recapLines"))}</span></div>
      </div>
      <button type="button" class="memory-recap__cta" data-memory-review-week>
        ${escapeHtml(t("memoryGallery.recapAction"))}
        <span aria-hidden="true">→</span>
      </button>
    `;
  }

  function selectDay(day, { silent = false, animate = "" } = {}) {
    const next = normalizeDiaryDay(day) || toIsoDay(new Date());
    selectedDay = next;
    feedScope = "day";
    renderWeek({ animate });
    renderFeed();
    renderRecap();
    if (monthSheet && !monthSheet.hidden) renderMonthSheet();
    if (!silent) onSelectDay?.(selectedDay);
  }

  function reviewWeek() {
    feedScope = "week";
    renderFeed();
    renderRecap();
    feed?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    onReviewWeek?.(buildWeekDays().map(toIsoDay));
  }

  weekViewport?.addEventListener("click", (event) => {
    if (weekSuppressClick) {
      weekSuppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const button = event.target.closest("[data-memory-day]");
    if (!button) return;
    selectDay(button.dataset.memoryDay);
  });

  weekLabel?.addEventListener("click", () => {
    setMonthSheetOpen(true);
  });

  weekViewport?.addEventListener("pointerdown", onWeekPointerDown);
  weekViewport?.addEventListener("pointermove", onWeekPointerMove);
  weekViewport?.addEventListener("pointerup", onWeekPointerUp);
  weekViewport?.addEventListener("pointercancel", onWeekPointerUp);
  weekViewport?.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = Date.now();
      if (now < weekWheelLockUntil) return;
      if (Math.abs(event.deltaX) < 10) return;
      weekWheelLockUntil = now + 320;
      shiftWeek(event.deltaX > 0 ? 1 : -1);
    },
    { passive: false },
  );

  monthSheet?.addEventListener("click", (event) => {
    if (event.target.closest("[data-memory-month-close]")) {
      setMonthSheetOpen(false);
      return;
    }
    if (event.target.closest("[data-memory-month-prev]")) {
      calendarMonth = startOfMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
      renderMonthSheet();
      return;
    }
    if (event.target.closest("[data-memory-month-next]")) {
      calendarMonth = startOfMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
      renderMonthSheet();
      return;
    }
    if (event.target.closest("[data-memory-month-today]")) {
      selectDay(toIsoDay(new Date()));
      setMonthSheetOpen(false);
      return;
    }
    const dayButton = event.target.closest("[data-memory-month-day]");
    if (dayButton?.dataset.memoryMonthDay) {
      selectDay(dayButton.dataset.memoryMonthDay);
      setMonthSheetOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (composeSheet && !composeSheet.hidden) {
      setComposeSheetOpen(false);
      return;
    }
    if (monthSheet && !monthSheet.hidden) setMonthSheetOpen(false);
  });

  composeSheet?.addEventListener("click", (event) => {
    if (event.target.closest("[data-memory-compose-close]")) {
      setComposeSheetOpen(false);
      return;
    }
    const styleButton = event.target.closest("[data-memory-compose-style]");
    if (styleButton?.dataset.memoryComposeStyle) {
      composeStyleId = styleButton.dataset.memoryComposeStyle;
      renderComposeStyles();
      return;
    }
    if (event.target.closest("[data-memory-compose-confirm]")) {
      event.preventDefault();
      void confirmCompose().catch((error) => {
        console.error(error);
      });
    }
  });

  feed?.addEventListener("click", (event) => {
    const writeButton = event.target.closest("[data-memory-write-today], [data-memory-organize]");
    if (writeButton) {
      event.preventDefault();
      event.stopPropagation();
      setComposeSheetOpen(true, { sourceButton: writeButton });
      return;
    }
    const slide = event.target.closest("[data-diary-id]");
    if (!slide || slide.matches("[data-memory-empty-day], [data-memory-week-empty]")) return;
    onOpenDiary?.(slide.dataset.diaryId);
  });

  recap?.addEventListener("click", (event) => {
    if (event.target.closest("[data-memory-review-week]")) {
      event.preventDefault();
      event.stopPropagation();
      reviewWeek();
    }
  });

  searchToggle?.addEventListener("click", () => {
    if (!searchPanel) {
      onSearch?.();
      return;
    }
    const open = searchPanel.hasAttribute("hidden");
    searchPanel.toggleAttribute("hidden", !open);
    if (open) searchInput?.focus();
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    onSearch?.(searchInput.value.trim());
  });

  avatarButton?.addEventListener("click", () => onOpenCharacter?.());

  document.addEventListener("yueqi:locale-changed", () => {
    setTogetherDays(togetherDaysValue);
    renderWeek();
    renderFeed();
    renderRecap();
    if (composeSheet && !composeSheet.hidden) {
      renderComposeStyles();
      syncComposeImageOption();
    }
  });

  function render(records = [], { togetherDays, focusDay } = {}) {
    diaries = (records || [])
      .filter((record) => record.source === "diary.memory")
      .map((record) => ({
        ...record,
        diaryDay: dayOf(record),
      }));
    diaryByDay = new Map();
    diaries.forEach((record) => {
      const day = dayOf(record);
      if (day && bodyOf(record) && !diaryByDay.has(day)) diaryByDay.set(day, record);
    });
    if (togetherDays != null) setTogetherDays(togetherDays);
    if (focusDay) {
      selectedDay = normalizeDiaryDay(focusDay) || selectedDay;
    } else if (!selectedDay) {
      selectedDay = toIsoDay(new Date());
    }
    renderWeek();
    renderFeed();
    renderRecap();
  }

  return {
    render,
    setTogetherDays,
    selectDay,
    reviewWeek,
    getSelectedDay: () => selectedDay,
    openCompose: (opts = {}) => setComposeSheetOpen(true, opts),
    closeCompose: () => setComposeSheetOpen(false),
  };
}
