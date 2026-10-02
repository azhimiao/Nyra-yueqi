/**
 * Phone month calendar grid + day sheet.
 */

import { escapeHtml } from "../lib/utils.js";
import { formatDateKey, eventsForDate } from "../calendar/engine.js";
import { localizeCalendarEvent } from "../calendar/seed-labels.js";
import { eventTemplateForChip } from "../calendar/event-types.js";
import { listEvents, removeEvent } from "./phone-data.js";
import { refreshIcons } from "../lib/icons.js";
import { getLocale } from "../i18n/index.js";
import { pt } from "./i18n.js";

const WEEKDAY_KEYS = ["weekdayMon", "weekdayTue", "weekdayWed", "weekdayThu", "weekdayFri", "weekdaySat", "weekdaySun"];

function monthTitle(date) {
  const locale = getLocale() === "en" ? "en-US" : "zh-CN";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(date);
}

export function createPhoneCalendar(root) {
  if (!root) return { render() {}, getSelected() { return ""; }, destroy() {} };

  const grid = root.querySelector("[data-phone-cal-grid]");
  const heading = root.querySelector("[data-cal-heading]");
  const monthLabel = root.querySelector("[data-cal-month-label]");
  const dayTitle = root.querySelector("[data-cal-day-title]");
  const dayEvents = root.querySelector("[data-phone-cal-day-events]");
  const dateInput = root.querySelector("[data-event-date]");
  const dateLabel = root.querySelector("[data-event-date-label]");
  const form = root.querySelector("[data-phone-event-form]");
  const toolbar = root.querySelector(".mini-cal-toolbar");

  let cursor = new Date();
  let selected = formatDateKey(new Date());
  let swipeBound = false;

  function syncSelectedToForm() {
    if (dateInput) dateInput.value = selected;
    if (dateLabel) dateLabel.textContent = selected;
  }

  function applyTemplate(chip) {
    const tpl = eventTemplateForChip(chip);
    if (!form) return;
    if (form.title) form.title.value = tpl.title;
    if (form.prompt) form.prompt.value = tpl.prompt;
    root.querySelectorAll("[data-cal-template]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.calTemplate === chip);
    });
  }

  function renderDaySheet() {
    if (dayTitle) dayTitle.textContent = selected;
    syncSelectedToForm();
    if (!dayEvents) return;
    const events = eventsForDate(listEvents(), selected)
      .slice()
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    if (!events.length) {
      dayEvents.innerHTML = `<p class="mini-empty">${escapeHtml(pt("calendar.emptyDay"))}</p>`;
      return;
    }
    dayEvents.innerHTML = events.map((event) => {
      const row = localizeCalendarEvent(event);
      return `
      <article class="mini-cal-event" data-event-id="${escapeHtml(event.id || "")}">
        <strong>${escapeHtml(event.time || "—")}</strong>
        <div>
          <em>${escapeHtml(row.title || pt("calendar.defaultReminder"))}</em>
          <span>${escapeHtml((row.prompt || "").slice(0, 48))}</span>
        </div>
        ${event.id ? `<button type="button" class="mini-text-btn" data-event-delete="${escapeHtml(event.id)}">${escapeHtml(pt("screens.delete"))}</button>` : ""}
      </article>
    `;
    }).join("");
  }

  function render() {
    if (!grid) return;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const title = monthTitle(cursor);
    if (heading) heading.textContent = title;
    if (monthLabel) monthLabel.textContent = title;

    const events = listEvents();
    const eventDates = new Set(events.map((item) => item.date).filter(Boolean));
    const todayKey = formatDateKey(new Date());
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const weekdays = WEEKDAY_KEYS.map((key) => pt(`calendar.${key}`));

    const parts = weekdays.map((day) => `<span class="mini-cal-weekday">${escapeHtml(day)}</span>`);
    for (let i = 0; i < offset; i += 1) parts.push('<span class="mini-cal-pad"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = formatDateKey(new Date(year, month, day));
      const classes = ["mini-cal-day"];
      if (key === todayKey) classes.push("is-today");
      if (key === selected) classes.push("is-selected");
      if (eventDates.has(key)) classes.push("has-event");
      parts.push(`
        <button type="button" class="${classes.join(" ")}" data-cal-day="${key}">
          <em>${day}</em>
        </button>
      `);
    }
    grid.innerHTML = parts.join("");
    renderDaySheet();
    refreshIcons();
    bindMonthSwipe();
  }

  function shiftMonth(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    render();
  }

  function bindMonthSwipe() {
    if (swipeBound || !grid) return;
    swipeBound = true;

    const AXIS_LOCK_PX = 8;
    const COMMIT_PX = 52;
    const VELOCITY_COMMIT = 0.42;
    const RUBBER = 0.32;

    let active = false;
    let axis = "";
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let pointerId = null;
    let dayKey = "";
    let suppressClick = false;
    let suppressTimer = 0;

    grid.style.touchAction = "none";
    grid.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease";
    if (toolbar) toolbar.style.touchAction = "manipulation";

    function capture(id) {
      try {
        grid.setPointerCapture?.(id);
      } catch {
        /* ignore */
      }
    }

    function release(id) {
      try {
        if (id != null && grid.hasPointerCapture?.(id)) {
          grid.releasePointerCapture(id);
        }
      } catch {
        /* ignore */
      }
    }

    function clearMotion() {
      grid.classList.remove("is-dragging");
      grid.style.transform = "";
      grid.style.opacity = "";
    }

    function armSuppress() {
      suppressClick = true;
      window.clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 420);
    }

    grid.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pointerId != null) return;
      active = true;
      axis = "";
      startX = event.clientX;
      startY = event.clientY;
      lastX = startX;
      lastT = performance.now();
      velocity = 0;
      pointerId = event.pointerId;
      dayKey = event.target.closest("[data-cal-day]")?.dataset.calDay || "";
      capture(pointerId);
    });

    grid.addEventListener("pointermove", (event) => {
      if (!active || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!axis) {
        if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.12) {
          axis = "x";
          grid.classList.add("is-dragging");
        } else {
          axis = "y";
          return;
        }
      }
      if (axis !== "x") return;
      event.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = velocity * 0.65 + ((event.clientX - lastX) / dt) * 0.35;
      lastX = event.clientX;
      lastT = now;
      const offset = Math.max(-80, Math.min(80, dx * RUBBER));
      grid.style.transform = `translate3d(${offset}px, 0, 0)`;
      grid.style.opacity = String(Math.max(0.68, 1 - Math.abs(offset) / 170));
    }, { passive: false });

    const finish = (event) => {
      if (!active) return;
      if (pointerId != null && event.pointerId !== pointerId) return;
      const dx = (event.clientX ?? lastX) - startX;
      const wasAxis = axis;
      const day = dayKey;
      const id = pointerId;
      active = false;
      axis = "";
      dayKey = "";
      pointerId = null;
      clearMotion();
      release(id);

      if (wasAxis === "x") {
        if (Math.abs(dx) >= COMMIT_PX || Math.abs(velocity) >= VELOCITY_COMMIT) {
          armSuppress();
          shiftMonth(dx < 0 || velocity < -VELOCITY_COMMIT ? 1 : -1);
        }
        return;
      }

      if (day && Math.hypot(dx, (event.clientY ?? startY) - startY) < AXIS_LOCK_PX + 4) {
        armSuppress();
        selected = day;
        render();
      }
    };

    grid.addEventListener("pointerup", finish);
    grid.addEventListener("pointercancel", finish);
    grid.addEventListener("lostpointercapture", (event) => {
      if (event.pointerId !== pointerId) return;
      finish({ pointerId: event.pointerId, clientX: lastX, clientY: startY });
    });
    grid.addEventListener("click", (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function onClick(event) {
    if (event.target.closest("[data-cal-prev]")) {
      shiftMonth(-1);
      return;
    }
    if (event.target.closest("[data-cal-next]")) {
      shiftMonth(1);
      return;
    }
    const tpl = event.target.closest("[data-cal-template]")?.dataset.calTemplate;
    if (tpl) {
      applyTemplate(tpl);
      return;
    }
    const day = event.target.closest("[data-cal-day]")?.dataset.calDay;
    if (day) {
      selected = day;
      render();
      return;
    }
    const del = event.target.closest("[data-event-delete]")?.dataset.eventDelete;
    if (del) {
      removeEvent(del);
      render();
    }
  }

  root.addEventListener("click", onClick);
  syncSelectedToForm();

  return {
    render,
    getSelected: () => selected,
    setSelected(dateKey) {
      if (dateKey) {
        selected = dateKey;
        const parts = String(dateKey).split("-").map(Number);
        if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
          cursor = new Date(parts[0], parts[1] - 1, 1);
        }
      }
      render();
    },
    applyTemplate,
    destroy() {
      root.removeEventListener("click", onClick);
    },
  };
}
