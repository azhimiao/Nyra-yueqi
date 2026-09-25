import { toMinutes } from "../status/weather.js";

export function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextOccurrence(timeValue = "21:00", from = new Date()) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function msUntil(targetDate, from = Date.now()) {
  return Math.min(Math.max(0, targetDate.getTime() - from), 2147483647);
}

export function minutesUntil(targetDate, from = Date.now()) {
  return Math.max(0, Math.ceil((targetDate.getTime() - from) / 60000));
}

export function isWithinDnd(now = new Date(), settings = {}) {
  const start = settings.dndStart || "22:00";
  const end = settings.dndEnd || "08:00";
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes > endMinutes) {
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}
