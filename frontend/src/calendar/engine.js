import { formatDateKey } from "../lib/time.js";
import { eventPromptOf, normalizeEventType } from "./event-types.js";
import {
  DEFAULT_EVENT_MODE,
  migrateEventModeFields,
  normalizeEventMode,
} from "./modes.js";

export { formatDateKey };
export {
  CALENDAR_EVENT_MODE,
  DEFAULT_EVENT_MODE,
  normalizeEventMode,
  migrateEventModeFields,
  migrateLibraryEventModes,
  eventModeLabel,
  eventModeOptions,
  isProactiveMessageMode,
  isNotificationOnlyMode,
  isNoLinkMode,
  isSchedulableMode,
} from "./modes.js";

export function normalizeEvent(event = {}, fallbackDate = formatDateKey()) {
  const title = event.title || "新提醒";
  const legacyType = normalizeEventType(event.type, title);
  const directPrompt = String(event.prompt || "").trim();
  const prompt = directPrompt
    || (legacyType === "sync_listen" || legacyType === "co_read"
      ? eventPromptOf({ ...event, title, type: legacyType })
      : "");
  const migrated = migrateEventModeFields({
    ...event,
    mode: event.mode || DEFAULT_EVENT_MODE,
  });
  const normalized = {
    time: event.time || "21:00",
    title,
    mode: normalizeEventMode(migrated.mode),
    type: "generic",
    prompt,
    date: event.date || fallbackDate,
  };
  if (migrated._migratedModeFrom) normalized._migratedModeFrom = migrated._migratedModeFrom;
  if (migrated._legacyModeRaw) normalized._legacyModeRaw = migrated._legacyModeRaw;
  if (event.id) normalized.id = String(event.id);
  return normalized;
}

export function migrateEvents(events = [], referenceDate = new Date()) {
  const monthPrefix = formatDateKey(referenceDate).slice(0, 7);
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return (events || []).map((event) => {
    if (event.date) return normalizeEvent(event);
    return normalizeEvent({ ...event, date: `${monthPrefix}-${day}` });
  });
}

export function eventsForDate(events = [], dateKey) {
  return (events || []).filter((event) => event.date === dateKey);
}

export function eventTriggerAt(event, now = new Date()) {
  if (!event?.date) return null;
  const [year, month, day] = event.date.split("-").map(Number);
  const [hours, minutes] = (event.time || "21:00").split(":").map(Number);
  const target = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  if (target.getTime() <= now.getTime()) return null;
  return target;
}

export function upcomingCalendarEvents(events = [], now = new Date()) {
  return migrateEvents(events, now)
    .map((event) => ({ event, triggerAt: eventTriggerAt(event, now) }))
    .filter((item) => item.triggerAt)
    .sort((a, b) => a.triggerAt - b.triggerAt);
}
