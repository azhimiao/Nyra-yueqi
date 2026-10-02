/**
 * Resolve relative temporal phrases against a frozen TemporalSnapshot (plan §6.2).
 * Returns absolute intervals; does not invent exact HH:mm for coarse periods like “下午”.
 */

import { validateTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";

/** @typedef {{ startHour: number, startMinute?: number, endHour: number, endMinute?: number, precision: "day" | "period" | "time" }} DayPeriod */

export const DAY_PERIODS = Object.freeze({
  morning: Object.freeze({ startHour: 6, endHour: 12, precision: "period" }),
  afternoon: Object.freeze({ startHour: 12, endHour: 18, precision: "period" }),
  evening: Object.freeze({ startHour: 18, endHour: 23, endMinute: 59, precision: "period" }),
  night: Object.freeze({ startHour: 21, endHour: 23, endMinute: 59, precision: "period" }),
  day: Object.freeze({ startHour: 0, endHour: 23, endMinute: 59, precision: "day" }),
});

const WEEKDAY_ZH = Object.freeze({
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
});

const WEEKDAY_EN = Object.freeze({
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
});

/**
 * Build a Date (UTC instant) for local Y-M-D H:M in a timezone via iterative offset.
 * @param {string} localDate YYYY-MM-DD
 * @param {number} hour
 * @param {number} minute
 * @param {string} timeZone
 * @returns {Date}
 */
export function zonedLocalToUtc(localDate, hour, minute, timeZone) {
  const [y, m, d] = localDate.split("-").map(Number);
  // Initial guess: treat as UTC then correct by observed offset
  let guess = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    let h = get("hour");
    if (h === 24) h = 0;
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
    const wanted = Date.UTC(y, m - 1, d, hour, minute, 0);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

/**
 * @param {string} localDate
 * @param {number} days
 */
export function addLocalDays(localDate, days) {
  const [y, m, d] = localDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Monday-based week: return localDate of next week's target weekday (0=Sun..6=Sat).
 * “下周一” = Monday of the calendar week after the current week.
 * @param {string} localDate
 * @param {number} weekday 0-6 of snapshot
 * @param {number} targetDow
 */
export function nextWeekWeekday(localDate, weekday, targetDow) {
  // Days until next Monday (start of next week). If today is Sunday (0), next Monday is +1.
  // If today is Monday (1), next Monday is +7.
  const daysUntilNextMonday = weekday === 0 ? 1 : (8 - weekday);
  const nextMonday = addLocalDays(localDate, daysUntilNextMonday);
  // target: Mon=1 → +0, Tue=2 → +1, ... Sun=0 → +6
  const offsetFromMonday = targetDow === 0 ? 6 : targetDow - 1;
  return addLocalDays(nextMonday, offsetFromMonday);
}

/**
 * @param {string} localDate
 * @param {import("../contracts/temporal-snapshot-v1.js").TemporalSnapshotV1 | object} snapshot
 * @param {DayPeriod} period
 */
export function intervalForLocalDate(localDate, snapshot, period = DAY_PERIODS.day) {
  const tz = snapshot.timezone;
  const start = zonedLocalToUtc(localDate, period.startHour, period.startMinute || 0, tz);
  const end = zonedLocalToUtc(
    localDate,
    period.endHour,
    period.endMinute != null ? period.endMinute : 0,
    tz,
  );
  return {
    localDate,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timezone: tz,
    precision: period.precision || "day",
  };
}

function detectPeriod(text) {
  const t = text.toLowerCase();
  if (/今晚|tonight/.test(t)) return { period: DAY_PERIODS.evening, dayOffset: 0, label: "今晚" };
  if (/下午|afternoon/.test(t)) return { period: DAY_PERIODS.afternoon, label: "下午" };
  if (/晚上|evening|tonight/.test(t)) return { period: DAY_PERIODS.evening, label: "晚上" };
  if (/上午|morning/.test(t)) return { period: DAY_PERIODS.morning, label: "上午" };
  return { period: DAY_PERIODS.day, label: "全天" };
}

function detectDayOffset(text, snapshot) {
  const t = text.toLowerCase();
  if (/今天|today/.test(t)) return { dayOffset: 0, label: "今天" };
  if (/明天|tomorrow/.test(t)) return { dayOffset: 1, label: "明天" };
  if (/后天|day after tomorrow/.test(t)) return { dayOffset: 2, label: "后天" };

  const nextWeekZh = /下周([日天一二三四五六])/.exec(text);
  if (nextWeekZh) {
    const dow = WEEKDAY_ZH[nextWeekZh[1]];
    return {
      localDate: nextWeekWeekday(snapshot.localDate, snapshot.weekday, dow),
      label: `下周${nextWeekZh[1]}`,
    };
  }

  const nextWeekEn = /next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/i.exec(t);
  if (nextWeekEn) {
    const dow = WEEKDAY_EN[nextWeekEn[1].toLowerCase()];
    return {
      localDate: nextWeekWeekday(snapshot.localDate, snapshot.weekday, dow),
      label: `next ${nextWeekEn[1].toLowerCase()}`,
    };
  }

  // Exact clock time e.g. 下午三点 / 15:00 — still keep period bounds but mark time when explicit
  return null;
}

/**
 * Parse explicit hour from phrases like “下午三点” / “3点” / “15:00”.
 * Returns null when only a coarse period is present (do not invent HH:mm).
 * @param {string} text
 */
export function parseExplicitHour(text) {
  const hm = /(\d{1,2})\s*:\s*(\d{2})/.exec(text);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m, precision: "time" };
  }
  const zh = /([零一二三四五六七八九十两\d]+)\s*点(?:\s*([半零一二三四五六七八九十\d]+)\s*分?)?/.exec(text);
  if (zh) {
    const hour = zhNumeralToInt(zh[1]);
    if (hour == null || hour < 0 || hour > 23) return null;
    let minute = 0;
    if (zh[2] === "半") minute = 30;
    else if (zh[2]) minute = zhNumeralToInt(zh[2]) || 0;
    // 下午三点 → 15 if afternoon context; caller adjusts
    return { hour, minute, precision: "time", zhHour: hour };
  }
  return null;
}

function zhNumeralToInt(raw) {
  const s = String(raw || "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (map[s[1]] || 0);
  if (s.endsWith("十") && s.length === 2) return (map[s[0]] || 0) * 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (map[a] || 1) * 10 + (map[b] || 0);
  }
  return map[s] ?? null;
}

/**
 * @param {string} phrase
 * @param {object} snapshot TemporalSnapshotV1
 * @returns {{
 *   ok: boolean,
 *   phrase: string,
 *   localDate?: string,
 *   startsAt?: string,
 *   endsAt?: string,
 *   timezone?: string,
 *   precision?: string,
 *   label?: string,
 *   errors?: string[],
 * }}
 */
export function resolveRelativeTemporal(phrase, snapshot) {
  const text = String(phrase || "").trim();
  const snapCheck = validateTemporalSnapshotV1(snapshot);
  if (!snapCheck.ok) {
    return { ok: false, phrase: text, errors: snapCheck.errors };
  }
  if (!text) return { ok: false, phrase: text, errors: ["empty_phrase"] };

  const dayInfo = detectDayOffset(text, snapshot);
  const periodInfo = detectPeriod(text);
  let localDate = snapshot.localDate;
  let dayLabel = "今天";

  if (dayInfo?.localDate) {
    localDate = dayInfo.localDate;
    dayLabel = dayInfo.label;
  } else if (dayInfo && typeof dayInfo.dayOffset === "number") {
    localDate = addLocalDays(snapshot.localDate, dayInfo.dayOffset);
    dayLabel = dayInfo.label;
  } else if (/今晚|tonight/i.test(text)) {
    localDate = snapshot.localDate;
    dayLabel = "今天";
  } else if (!/(今天|明天|后天|下周|today|tomorrow|next\s+)/i.test(text) && periodInfo.label !== "全天") {
    // Bare “下午/晚上” → today
    localDate = snapshot.localDate;
    dayLabel = "今天";
  } else if (!dayInfo && periodInfo.label === "全天" && !/(今天|明天|后天|下周|today|tomorrow)/i.test(text)) {
    return { ok: false, phrase: text, errors: ["unresolved_relative"] };
  }

  const explicit = parseExplicitHour(text);
  let period = periodInfo.period;

  if (explicit) {
    let hour = explicit.hour;
    // 下午三点 without 24h → 15; 晚上九点 → 21; 上午 → as-is if <12
    if (explicit.zhHour != null && explicit.zhHour <= 12) {
      if (/下午|afternoon/i.test(text) && hour < 12) hour += 12;
      else if (/晚上|evening|tonight/i.test(text) && hour < 12) hour = hour === 12 ? 12 : hour + 12;
    }
    const start = zonedLocalToUtc(localDate, hour, explicit.minute, snapshot.timezone);
    const end = zonedLocalToUtc(localDate, hour, explicit.minute, snapshot.timezone);
    return {
      ok: true,
      phrase: text,
      localDate,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: snapshot.timezone,
      precision: "time",
      label: `${dayLabel}${hour.toString().padStart(2, "0")}:${String(explicit.minute).padStart(2, "0")}`,
    };
  }

  // Coarse period: return interval, do NOT invent a midpoint HH:mm
  const interval = intervalForLocalDate(localDate, snapshot, period);
  return {
    ok: true,
    phrase: text,
    ...interval,
    label: `${dayLabel}${periodInfo.label === "全天" ? "" : periodInfo.label}`,
  };
}
