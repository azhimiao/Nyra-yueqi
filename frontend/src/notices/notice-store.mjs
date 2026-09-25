const ACK_KEY = "yueqi.notices.acked.v1";
const SNOOZE_KEY = "yueqi.notices.snoozed.v1";

function readMap(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readAckedNotices() {
  return readMap(ACK_KEY);
}

export function readSnoozedNotices() {
  return readMap(SNOOZE_KEY);
}

export function ackNotice(id) {
  const key = String(id || "").trim();
  if (!key) return;
  const next = { ...readAckedNotices(), [key]: new Date().toISOString() };
  writeMap(ACK_KEY, next);
}

export function snoozeNotice(id) {
  const key = String(id || "").trim();
  if (!key) return;
  const next = { ...readSnoozedNotices(), [key]: new Date().toISOString() };
  writeMap(SNOOZE_KEY, next);
}
