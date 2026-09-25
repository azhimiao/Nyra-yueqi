/**
 * Unified 栖机 app event bus (local-first ring buffer).
 * Companion consumes filtered events only — not raw UI clicks.
 */

export const APP_EVENTS_STORAGE_KEY = "yueqi.world.app-events.v1";
const STORAGE_KEY = APP_EVENTS_STORAGE_KEY;
const RING_LIMIT = 64;

/** @type {Storage|null} */
let storageOverride = null;

/** @type {Map<string, Set<(evt: AppEvent) => void>>} */
const subscribers = new Map();

export const APP_EVENT_TYPES = Object.freeze([
  "pop.message.sent",
  "pop.message.read",
  "feed.post.created",
  "feed.post.viewed",
  "feed.post.liked",
  "diary.created",
  "diary.viewed",
  "gallery.photo.created",
  "calendar.event.reached",
  "scenario.event.completed",
  "game.session.completed",
  "assist.task.completed",
  "explore.task.completed",
  "artifact.opened",
]);

/** Meaningful for Companion life tick — excludes raw UI noise. */
export const COMPANION_EVENT_TYPES = Object.freeze([
  "pop.message.sent",
  "pop.message.read",
  "diary.created",
  "diary.viewed",
  "feed.post.created",
  "feed.post.liked",
  "calendar.event.reached",
  "scenario.event.completed",
]);

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{8,}/gi,
  /password["']?\s*[:=]\s*["']?[^\s"']+/gi,
  /token["']?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}/gi,
];

function getStorage() {
  if (storageOverride) return storageOverride;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactAppEventDetail(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    let text = value;
    for (const pattern of SECRET_PATTERNS) {
      text = text.replace(pattern, "[redacted]");
    }
    text = text.replace(/[A-Za-z]:\\[^\s]+/g, "[path]");
    text = text.replace(/\/(?:Users|home|var|tmp)\/[^\s]+/g, "[path]");
    if (text.length > 512) text = `${text.slice(0, 509)}...`;
    return text;
  }
  if (Array.isArray(value)) {
    return value.map(redactAppEventDetail);
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/^(password|secret|apiKey|api_key|token|authorization)$/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactAppEventDetail(nested);
      }
    }
    return out;
  }
  return value;
}

function loadRing() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRing(events) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-RING_LIMIT)));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   at: number,
 *   appId?: string,
 *   detail?: object,
 * }} AppEvent
 */

/**
 * @param {string} type
 * @param {object} [detail]
 * @returns {AppEvent}
 */
export function emitAppEvent(type, detail = {}) {
  const eventType = String(type || "").trim();
  if (!eventType) {
    throw new TypeError("emitAppEvent requires type");
  }
  const evt = {
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: eventType,
    at: Date.now(),
    appId: detail.appId ? String(detail.appId) : undefined,
    detail: redactAppEventDetail(detail),
  };
  const ring = loadRing();
  ring.push(evt);
  saveRing(ring);

  const handlers = new Set([
    ...(subscribers.get(eventType) || []),
    ...(subscribers.get("*") || []),
  ]);
  for (const handler of handlers) {
    try {
      handler(evt);
    } catch (error) {
      console.warn("app-event handler failed", eventType, error);
    }
  }
  return evt;
}

/**
 * @param {string} type — event type or `*`
 * @param {(evt: AppEvent) => void} handler
 * @returns {() => void}
 */
export function subscribeAppEvent(type, handler) {
  const key = String(type || "").trim();
  if (!key || typeof handler !== "function") {
    throw new TypeError("subscribeAppEvent requires type and handler");
  }
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(handler);
  return () => {
    subscribers.get(key)?.delete(handler);
  };
}

/**
 * @param {number} [limit]
 * @returns {AppEvent[]}
 */
export function listRecentAppEvents(limit = 32) {
  const cap = Math.max(1, Math.min(RING_LIMIT, Number(limit) || 32));
  return loadRing().slice(-cap);
}

/**
 * @param {AppEvent[]|number} eventsOrLimit
 * @returns {AppEvent[]}
 */
export function selectEventsForCompanion(eventsOrLimit = 32) {
  const events = Array.isArray(eventsOrLimit)
    ? eventsOrLimit
    : listRecentAppEvents(eventsOrLimit);
  const allowed = new Set(COMPANION_EVENT_TYPES);
  return events.filter((evt) => allowed.has(evt.type));
}

/** @param {Storage|null} storage */
export function __setAppEventStorageForTests(storage) {
  storageOverride = storage;
}

export function __clearAppEventsForTests() {
  storageOverride = null;
  subscribers.clear();
  const storage = getStorage();
  storage?.removeItem?.(STORAGE_KEY);
}

/** Export recent ring buffer for backup (optional, short). */
export function exportAppEventsBag(limit = 32) {
  return {
    schema: "yueqi-app-events-backup.v1",
    ringLimit: RING_LIMIT,
    events: listRecentAppEvents(limit),
  };
}

/**
 * @param {object} [payload]
 */
export function importAppEventsBag(payload) {
  const events = Array.isArray(payload?.events) ? payload.events.slice(-RING_LIMIT) : [];
  saveRing(events);
  return loadRing();
}

/** Privacy affordance — wipe local event ring only. */
export function clearAppEventsRing() {
  saveRing([]);
}
