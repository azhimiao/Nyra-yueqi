import { migrateEvents, eventsForDate } from "../calendar/engine.js";
import { escapeHtml } from "../lib/utils.js";
import { t, getLocale } from "../i18n/index.js";
import { localizeEventTitle } from "../calendar/seed-labels.js";

/**
 * Calendar panel: month grid, day detail, prev/next, add-day-event.
 * Owns calendarCursor / selectedDate via calendarState.
 */
export function wireCalendarPanel(deps) {
  const {
    calendarState,
    calendarPrev,
    calendarNext,
    calendarHeading,
    calendarMonthLabel,
    calendarGrid,
    calendarDayPanel,
    calendarDayTitle,
    calendarDayEvents,
    addCalendarDayEventButton,
    eventList,
    collectLibraryState,
    persistLibraryState,
    renderEventRow,
    openEventEditor = () => {},
    findEventRow = () => null,
    rescheduleProactiveScheduler,
    refreshIcons,
  } = deps;

  if (!calendarState.cursor) calendarState.cursor = new Date();
  if (calendarState.selectedDate == null) calendarState.selectedDate = "";

  function monthTitle(date) {
    const locale = getLocale() === "en" ? "en-US" : "zh-CN";
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(date);
  }

  function renderCalendarDayPanel() {
    if (!calendarDayPanel || !calendarDayTitle || !calendarDayEvents) return;
    if (!calendarState.selectedDate) {
      calendarDayPanel.hidden = true;
      return;
    }
    calendarDayPanel.hidden = false;
    calendarDayTitle.textContent = calendarState.selectedDate;
    const events = collectLibraryState().events.filter((event) => event.date === calendarState.selectedDate);
    calendarDayEvents.innerHTML = "";
    if (!events.length) {
      calendarDayEvents.innerHTML = `<p class="calendar-day-empty">${escapeHtml(t("calendar.dayEmpty"))}</p>`;
      return;
    }
    events
      .slice()
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")))
      .forEach((event) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "calendar-day-event";
        if (event.id) item.dataset.eventId = event.id;
        item.dataset.time = event.time || "";
        item.dataset.title = event.title || "";
        item.dataset.date = event.date || calendarState.selectedDate;
        const displayTitle = localizeEventTitle(event.title);
        item.innerHTML = `
          <strong>${escapeHtml(event.time)}</strong>
          <span>
            <em>${escapeHtml(displayTitle)}</em>
            <small>${escapeHtml(String(event.prompt || t("calendar.aiReminderHint")).replace(/\s+/g, " ").slice(0, 36))}${String(event.prompt || "").length > 36 ? "…" : ""}</small>
          </span>
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        `;
        calendarDayEvents.append(item);
      });
    refreshIcons();
  }

  function renderCalendarGrid() {
    if (!calendarGrid) return;
    const year = calendarState.cursor.getFullYear();
    const month = calendarState.cursor.getMonth();
    const title = monthTitle(calendarState.cursor);
    if (calendarHeading) calendarHeading.textContent = title;
    if (calendarMonthLabel) calendarMonthLabel.textContent = title;

    const events = migrateEvents(collectLibraryState().events);
    const today = new Date();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const locale = getLocale() === "en" ? "en-US" : "zh-CN";
    const weekdays = Array.from({ length: 7 }, (_, index) => (
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, index + 1))
    ));

    calendarGrid.innerHTML = "";
    weekdays.forEach((day) => {
      const node = document.createElement("span");
      node.className = "weekday";
      node.textContent = day;
      calendarGrid.append(node);
    });
    for (let index = 0; index < offset; index += 1) {
      const blank = document.createElement("span");
      blank.className = "calendar-empty";
      calendarGrid.append(blank);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(day);
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      button.dataset.calendarDay = dateKey;
      const hasEvent = eventsForDate(events, dateKey).length > 0;
      button.classList.toggle("has-event", hasEvent);
      button.classList.toggle("today", today.getFullYear() === year && today.getMonth() === month && today.getDate() === day);
      button.classList.toggle("is-selected", calendarState.selectedDate === dateKey);
      button.addEventListener("click", () => openCalendarDay(dateKey));
      calendarGrid.append(button);
    }
    renderCalendarDayPanel();
  }

  function openCalendarDay(dateKey) {
    calendarState.selectedDate = dateKey;
    renderCalendarGrid();
  }

  calendarPrev?.addEventListener("click", () => {
    calendarState.cursor = new Date(calendarState.cursor.getFullYear(), calendarState.cursor.getMonth() - 1, 1);
    renderCalendarGrid();
  });

  calendarNext?.addEventListener("click", () => {
    calendarState.cursor = new Date(calendarState.cursor.getFullYear(), calendarState.cursor.getMonth() + 1, 1);
    renderCalendarGrid();
  });

  addCalendarDayEventButton?.addEventListener("click", () => {
    if (!calendarState.selectedDate || !eventList) return;
    const row = renderEventRow({
      date: calendarState.selectedDate,
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

  calendarDayEvents?.addEventListener("click", (event) => {
    const item = event.target.closest(".calendar-day-event");
    if (!item) return;
    const row = findEventRow({
      id: item.dataset.eventId || "",
      date: item.dataset.date || calendarState.selectedDate,
      time: item.dataset.time || "",
      title: item.dataset.title || "",
    });
    if (row) openEventEditor(row);
  });

  document.addEventListener("yueqi:locale-changed", () => {
    renderCalendarGrid();
  });

  return { renderCalendarGrid, openCalendarDay, renderCalendarDayPanel };
}
