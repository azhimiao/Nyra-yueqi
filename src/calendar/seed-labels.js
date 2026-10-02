import { t, getLocale } from "../i18n/index.js";

const SEED_TITLE_MAP = Object.freeze({
  空闲窗口: "freeWindow",
  晚间提醒: "eveningReminder",
  睡前一句: "bedtimeLine",
  睡前时间: "bedtimeTime",
  一起听时间: "syncListen",
  共读时间: "coRead",
});

function pick(key, locale, fallback = "") {
  const value = t(key, locale);
  return value !== key ? value : fallback;
}

/** Localize known demo/seed calendar event titles at display time. */
export function localizeEventTitle(title = "", locale) {
  const raw = String(title || "").trim();
  const seedKey = SEED_TITLE_MAP[raw];
  if (seedKey) return pick(`calendar.seeds.${seedKey}`, locale || getLocale(), raw);
  return raw;
}

/** Localize system seed calendar events for display / proactive context. Storage ids unchanged. */
export function localizeCalendarEvent(event = {}, locale) {
  const loc = locale || getLocale();
  const seedKey = event.seedKey || SEED_TITLE_MAP[String(event.title || "").trim()];
  if (!seedKey) {
    return {
      ...event,
      title: event.title || "",
      prompt: event.prompt || "",
    };
  }
  return {
    ...event,
    title: pick(`calendar.seeds.${seedKey}`, loc, event.title || ""),
    prompt: pick(`calendar.seedPrompts.${seedKey}`, loc, event.prompt || ""),
  };
}
