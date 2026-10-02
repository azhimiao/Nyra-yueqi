/**
 * Calendar event mode — stable English IDs (never store display Chinese).
 * Legacy Chinese values migrate idempotently via normalizeEventMode.
 */

import { t } from "../i18n/index.js";

/** @typedef {"proactive_message"|"notification_only"|"none"|"legacy_unknown"} CalendarEventMode */

export const CALENDAR_EVENT_MODE = Object.freeze({
  PROACTIVE_MESSAGE: "proactive_message",
  NOTIFICATION_ONLY: "notification_only",
  NONE: "none",
  LEGACY_UNKNOWN: "legacy_unknown",
});

export const DEFAULT_EVENT_MODE = CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE;

/** Legacy Chinese storage → stable id */
export const LEGACY_EVENT_MODE_MAP = Object.freeze({
  可主动消息: CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE,
  仅提醒: CALENDAR_EVENT_MODE.NOTIFICATION_ONLY,
  不联动: CALENDAR_EVENT_MODE.NONE,
});

const STABLE = new Set(Object.values(CALENDAR_EVENT_MODE));

/**
 * @param {unknown} mode
 * @returns {CalendarEventMode}
 */
export function normalizeEventMode(mode) {
  const raw = String(mode || "").trim();
  if (!raw) return DEFAULT_EVENT_MODE;
  if (STABLE.has(raw) && raw !== CALENDAR_EVENT_MODE.LEGACY_UNKNOWN) {
    return /** @type {CalendarEventMode} */ (raw);
  }
  if (LEGACY_EVENT_MODE_MAP[raw]) return LEGACY_EVENT_MODE_MAP[raw];
  // Unknown legacy — keep observable, do not delete
  return CALENDAR_EVENT_MODE.LEGACY_UNKNOWN;
}

/**
 * Migrate one event object in place (idempotent). Preserves date/time/title.
 * @param {object} event
 */
export function migrateEventModeFields(event = {}) {
  const next = { ...event };
  const before = next.mode;
  next.mode = normalizeEventMode(before);
  if (
    before
    && before !== next.mode
    && LEGACY_EVENT_MODE_MAP[String(before)]
  ) {
    next._migratedModeFrom = String(before);
  }
  if (next.mode === CALENDAR_EVENT_MODE.LEGACY_UNKNOWN && before) {
    next._legacyModeRaw = String(before);
  }
  return next;
}

/**
 * @param {object[]} events
 */
export function migrateLibraryEventModes(events = []) {
  return (events || []).map((event) => migrateEventModeFields(event));
}

export function eventModeOptions() {
  return [
    {
      value: CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE,
      label: t("calendar.mode.proactive"),
    },
    {
      value: CALENDAR_EVENT_MODE.NOTIFICATION_ONLY,
      label: t("calendar.mode.notification"),
    },
    {
      value: CALENDAR_EVENT_MODE.NONE,
      label: t("calendar.mode.none"),
    },
  ];
}

export function eventModeLabel(mode = DEFAULT_EVENT_MODE) {
  const id = normalizeEventMode(mode);
  if (id === CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE) return t("calendar.mode.proactive");
  if (id === CALENDAR_EVENT_MODE.NOTIFICATION_ONLY) return t("calendar.mode.notification");
  if (id === CALENDAR_EVENT_MODE.NONE) return t("calendar.mode.none");
  return t("calendar.mode.legacyUnknown");
}

export function isProactiveMessageMode(mode) {
  return normalizeEventMode(mode) === CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE;
}

export function isNotificationOnlyMode(mode) {
  return normalizeEventMode(mode) === CALENDAR_EVENT_MODE.NOTIFICATION_ONLY;
}

export function isNoLinkMode(mode) {
  return normalizeEventMode(mode) === CALENDAR_EVENT_MODE.NONE;
}

export function isSchedulableMode(mode) {
  const id = normalizeEventMode(mode);
  return id === CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE
    || id === CALENDAR_EVENT_MODE.NOTIFICATION_ONLY;
}
