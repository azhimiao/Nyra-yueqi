const DEFAULT_GAP_MS = 5 * 60 * 1000;

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function localeTag(locale = "zh-CN") {
  return String(locale || "zh-CN").toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
}

function clock(date, locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function shouldShowMessageTime(previousValue, currentValue, gapMs = DEFAULT_GAP_MS) {
  const current = validDate(currentValue);
  if (!current) return false;
  const previous = validDate(previousValue);
  if (!previous) return true;
  if (!sameLocalDay(previous, current)) return true;
  return current.getTime() - previous.getTime() >= gapMs;
}

export function formatMessageTimelineTime(value, { now = new Date(), locale = "zh-CN" } = {}) {
  const date = validDate(value);
  const reference = validDate(now) || new Date();
  if (!date) return "";
  const tag = localeTag(locale);
  const time = clock(date, tag);
  if (sameLocalDay(date, reference)) return time;

  const yesterday = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - 1);
  if (sameLocalDay(date, yesterday)) {
    return tag === "en-US" ? `Yesterday ${time}` : `昨天 ${time}`;
  }

  if (date.getFullYear() === reference.getFullYear()) {
    const day = new Intl.DateTimeFormat(tag, {
      month: tag === "en-US" ? "short" : "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
    return `${day} ${time}`;
  }

  const day = new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: tag === "en-US" ? "short" : "numeric",
    day: "numeric",
  }).format(date);
  return `${day} ${time}`;
}

export function messageTimelineLabel(previousValue, currentValue, options = {}) {
  if (!shouldShowMessageTime(previousValue, currentValue, options.gapMs)) return "";
  return formatMessageTimelineTime(currentValue, options);
}

