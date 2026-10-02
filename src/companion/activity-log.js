/**
 * User-facing activity center log — no prompts, keys, or stacks.
 */

export const ACTIVITY_LOG_KEY = "yueqi.activity.center.v1";
export const ACTIVITY_MAX = 80;

/** @type {null | object[]} */
let testLog = null;

export function __setActivityLogForTests(rows) {
  testLog = Array.isArray(rows) ? rows : null;
}

export function __clearActivityLogForTests() {
  testLog = null;
  try {
    localStorage?.removeItem(ACTIVITY_LOG_KEY);
  } catch {
    /* ignore */
  }
}

function readRaw() {
  if (testLog) return testLog;
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || "null");
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writeRaw(items) {
  const next = items.slice(0, ACTIVITY_MAX);
  if (testLog) {
    testLog.length = 0;
    testLog.push(...next);
    return next;
  }
  try {
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify({ schemaVersion: 1, items: next }));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * @param {{
 *   title: string,
 *   reason?: string,
 *   capability?: string,
 *   resourcesRead?: string[],
 *   changes?: string[],
 *   usedModel?: boolean,
 *   costHint?: string,
 *   undoable?: boolean,
 *   undoHint?: string,
 *   source?: string,
 *   characterId?: string,
 * }} entry
 */
export function appendActivity(entry = {}) {
  const title = String(entry.title || "").trim().slice(0, 120);
  if (!title) return null;
  const item = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    title,
    reason: String(entry.reason || "").slice(0, 200),
    capability: String(entry.capability || "").slice(0, 64),
    resourcesRead: (entry.resourcesRead || []).map((x) => String(x).slice(0, 48)).slice(0, 12),
    changes: (entry.changes || []).map((x) => String(x).slice(0, 80)).slice(0, 12),
    usedModel: Boolean(entry.usedModel),
    costHint: String(entry.costHint || "").slice(0, 80),
    undoable: Boolean(entry.undoable),
    undoHint: String(entry.undoHint || "").slice(0, 120),
    source: String(entry.source || "").slice(0, 40),
    characterId: String(entry.characterId || "").slice(0, 64),
  };
  const items = [item, ...readRaw()];
  writeRaw(items);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("yueqi:activity", { detail: { item } }));
  }
  return item;
}

export function listActivity(limit = 40) {
  return readRaw().slice(0, Math.max(1, Number(limit) || 40));
}

export function getActivity(id) {
  return readRaw().find((row) => row.id === id) || null;
}

export function clearActivityLog() {
  writeRaw([]);
}
