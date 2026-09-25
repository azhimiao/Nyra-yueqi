/**
 * TemporalSnapshot V1 — frozen turn timebase (plan §5.1).
 * One turn reuses a single snapshot; never call new Date() mid-turn for relative time.
 */

import { getClock } from "../temporal/clock.js";

export const TEMPORAL_SNAPSHOT_SCHEMA_VERSION = 1;

export const TEMPORAL_LOCALES = Object.freeze(["zh-CN", "en"]);

/**
 * @param {number} ms
 * @param {string} timeZone
 * @returns {number} offset minutes east of UTC (e.g. Asia/Shanghai → 480)
 */
export function utcOffsetMinutesAt(ms, timeZone) {
  const d = new Date(ms);
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(d.toLocaleString("en-US", { timeZone }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

/**
 * @param {number} ms
 * @param {string} timeZone
 */
export function localPartsAt(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  const minute = get("minute");
  // Some engines emit "24" for midnight under h23; normalize.
  if (hour === "24") hour = "00";
  const wd = get("weekday");
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    localDate: `${year}-${month}-${day}`,
    localTime: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
    weekday: weekdayMap[wd] ?? new Date(ms).getUTCDay(),
  };
}

function normalizeLocale(value) {
  const raw = String(value || "zh-CN").trim();
  if (raw === "en" || raw.toLowerCase().startsWith("en")) return "en";
  return "zh-CN";
}

function mintSnapshotId(capturedAt) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `snp_${String(capturedAt || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 16)}_${rand}`;
}

/**
 * @param {object} raw
 */
export function validateTemporalSnapshotV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== TEMPORAL_SNAPSHOT_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of [
    "snapshotId",
    "capturedAt",
    "timezone",
    "locale",
    "localDate",
    "localTime",
  ]) {
    if (!String(raw[key] ?? "").trim()) errors.push(key);
  }
  if (!TEMPORAL_LOCALES.includes(raw.locale)) errors.push("locale_enum");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.localDate || ""))) errors.push("localDate_format");
  if (!/^\d{2}:\d{2}$/.test(String(raw.localTime || ""))) errors.push("localTime_format");
  if (typeof raw.weekday !== "number" || raw.weekday < 0 || raw.weekday > 6 || !Number.isInteger(raw.weekday)) {
    errors.push("weekday");
  }
  if (typeof raw.utcOffsetMinutes !== "number" || !Number.isFinite(raw.utcOffsetMinutes)) {
    errors.push("utcOffsetMinutes");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} [input]
 * @param {{ clock?: import("../temporal/clock.js").Clock }} [opts]
 */
export function createTemporalSnapshotV1(input = {}, opts = {}) {
  const clock = opts.clock || input.clock || getClock();
  const timezone = String(input.timezone || clock.timezone() || "Asia/Shanghai").trim() || "Asia/Shanghai";
  const ms = typeof input.nowMs === "number" ? input.nowMs : clock.nowMs();
  const capturedAt = String(input.capturedAt || new Date(ms).toISOString());
  const parts = localPartsAt(ms, timezone);
  const snapshot = {
    schemaVersion: TEMPORAL_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: String(input.snapshotId || mintSnapshotId(capturedAt)).trim(),
    capturedAt,
    timezone,
    locale: normalizeLocale(input.locale),
    localDate: String(input.localDate || parts.localDate),
    localTime: String(input.localTime || parts.localTime),
    weekday: typeof input.weekday === "number" ? input.weekday : parts.weekday,
    utcOffsetMinutes:
      typeof input.utcOffsetMinutes === "number"
        ? input.utcOffsetMinutes
        : utcOffsetMinutesAt(ms, timezone),
  };
  return snapshot;
}
