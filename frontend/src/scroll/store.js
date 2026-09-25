/** 漫卷本地存储：多作品会话、自动档、三格快存、事件与结局。 */

export const SCROLL_STORE_KEY = "yueqi.scroll.v2";
export const LEGACY_SCROLL_STORE_KEY = "yueqi.scroll.v1";
export const QUICK_SAVE_SLOTS = [
  { id: "slot-1", defaultName: "第一枚书签" },
  { id: "slot-2", defaultName: "第二枚书签" },
  { id: "slot-3", defaultName: "第三枚书签" },
];

const MAX_EVENTS = 500;
const MAX_HISTORY = 500;

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readJson(key) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeIds(value, max = MAX_HISTORY) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))].slice(-max);
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const chapterId = String(raw.chapterId || "").trim();
  const frameId = String(raw.frameId || "").trim();
  if (!chapterId || !frameId) return null;
  return {
    chapterId,
    frameId,
    history: normalizeIds(raw.history),
    flags: raw.flags && typeof raw.flags === "object" && !Array.isArray(raw.flags) ? { ...raw.flags } : {},
    branchPath: normalizeIds(raw.branchPath, 80),
    updatedAt: String(raw.updatedAt || nowIso()),
  };
}

function emptyQuickSaves() {
  return QUICK_SAVE_SLOTS.map((slot) => ({ id: slot.id, name: slot.defaultName, snapshot: null, updatedAt: "" }));
}

function normalizeSession(raw, workId) {
  const data = raw && typeof raw === "object" ? raw : {};
  const slotById = new Map((Array.isArray(data.quickSaves) ? data.quickSaves : []).map((slot) => [slot.id, slot]));
  return {
    workId,
    activeChapterId: String(data.activeChapterId || "").trim(),
    autoSave: normalizeSnapshot(data.autoSave),
    quickSaves: emptyQuickSaves().map((fallback) => {
      const saved = slotById.get(fallback.id);
      return {
        id: fallback.id,
        name: String(saved?.name || fallback.name).trim().slice(0, 24) || fallback.name,
        snapshot: normalizeSnapshot(saved?.snapshot),
        updatedAt: String(saved?.updatedAt || ""),
      };
    }),
    completedChapters: normalizeIds(data.completedChapters, 100),
    readFrames: normalizeIds(data.readFrames, 2000),
    endings: (Array.isArray(data.endings) ? data.endings : []).filter((item) => item?.id).slice(-100),
    eventLog: (Array.isArray(data.eventLog) ? data.eventLog : []).filter((item) => item?.id && item?.type).slice(-MAX_EVENTS),
    updatedAt: String(data.updatedAt || nowIso()),
  };
}

function normalizeState(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const sessions = {};
  for (const [workId, session] of Object.entries(data.sessions || {})) {
    const id = String(workId || "").trim();
    if (id) sessions[id] = normalizeSession(session, id);
  }
  return {
    version: 2,
    sessions,
    preferences: {
      textSpeed: [12, 24, 40].includes(Number(data.preferences?.textSpeed)) ? Number(data.preferences.textSpeed) : 24,
      muted: Boolean(data.preferences?.muted),
    },
    lastWorkId: String(data.lastWorkId || "").trim(),
  };
}

export function loadScrollState() {
  return normalizeState(readJson(SCROLL_STORE_KEY));
}

export function saveScrollState(next) {
  return writeJson(SCROLL_STORE_KEY, normalizeState(next));
}

export function getScrollSession(workId) {
  const id = String(workId || "").trim();
  const state = loadScrollState();
  return normalizeSession(state.sessions[id], id);
}

function updateSession(workId, updater) {
  const id = String(workId || "").trim();
  if (!id) return { ok: false, session: normalizeSession(null, "") };
  const state = loadScrollState();
  const current = normalizeSession(state.sessions[id], id);
  const next = normalizeSession(updater(clone(current)) || current, id);
  next.updatedAt = nowIso();
  state.sessions[id] = next;
  state.lastWorkId = id;
  return { ok: saveScrollState(state), session: next };
}

function makeEvent(type, payload = {}) {
  return {
    id: `scroll-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: String(type || "event"),
    at: nowIso(),
    ...clone(payload),
  };
}

export function appendScrollEvent(workId, type, payload = {}) {
  return updateSession(workId, (session) => {
    session.eventLog = [...session.eventLog, makeEvent(type, payload)].slice(-MAX_EVENTS);
    return session;
  });
}

export function saveAutoProgress(workId, patch) {
  const snapshot = normalizeSnapshot({ ...patch, updatedAt: nowIso() });
  if (!snapshot) return { ok: false, session: getScrollSession(workId) };
  return updateSession(workId, (session) => {
    session.activeChapterId = snapshot.chapterId;
    session.autoSave = snapshot;
    session.readFrames = normalizeIds([...session.readFrames, snapshot.frameId], 2000);
    return session;
  });
}

export function saveQuickSlot(workId, slotId, name, snapshot) {
  const normalized = normalizeSnapshot({ ...snapshot, updatedAt: nowIso() });
  if (!normalized) return { ok: false, session: getScrollSession(workId) };
  return updateSession(workId, (session) => {
    const slot = session.quickSaves.find((item) => item.id === slotId);
    if (!slot) return session;
    slot.name = String(name || slot.name).trim().slice(0, 24) || slot.name;
    slot.snapshot = normalized;
    slot.updatedAt = nowIso();
    session.eventLog = [...session.eventLog, makeEvent("save.created", {
      chapterId: normalized.chapterId,
      frameId: normalized.frameId,
      slotId,
    })].slice(-MAX_EVENTS);
    return session;
  });
}

export function loadQuickSlot(workId, slotId) {
  const session = getScrollSession(workId);
  const slot = session.quickSaves.find((item) => item.id === slotId);
  if (!slot?.snapshot) return { ok: false, snapshot: null, session };
  const result = updateSession(workId, (next) => {
    next.activeChapterId = slot.snapshot.chapterId;
    next.autoSave = clone(slot.snapshot);
    next.eventLog = [...next.eventLog, makeEvent("save.loaded", {
      chapterId: slot.snapshot.chapterId,
      frameId: slot.snapshot.frameId,
      slotId,
    })].slice(-MAX_EVENTS);
    return next;
  });
  return { ...result, snapshot: clone(slot.snapshot) };
}

export function completeScrollChapter(workId, record) {
  const chapterId = String(record?.chapterId || "").trim();
  const ending = record?.ending && typeof record.ending === "object" ? record.ending : null;
  if (!chapterId || !ending?.id) return { ok: false, session: getScrollSession(workId) };
  return updateSession(workId, (session) => {
    session.completedChapters = normalizeIds([...session.completedChapters, chapterId], 100);
    const endingRecord = {
      id: String(ending.id),
      title: String(ending.title || "结局"),
      summary: String(ending.summary || ""),
      chapterId,
      flags: clone(record.flags || {}),
      branchPath: normalizeIds(record.branchPath, 80),
      at: nowIso(),
    };
    const duplicate = session.endings.find((item) => item.id === endingRecord.id && item.chapterId === chapterId);
    if (!duplicate) session.endings = [...session.endings, endingRecord].slice(-100);
    session.eventLog = [...session.eventLog, makeEvent("ending.reached", endingRecord)].slice(-MAX_EVENTS);
    return session;
  });
}

export function saveScrollPreferences(patch) {
  const state = loadScrollState();
  state.preferences = {
    ...state.preferences,
    ...(patch || {}),
  };
  const normalized = normalizeState(state);
  return { ok: saveScrollState(normalized), preferences: normalized.preferences };
}

export function pushHistory(history, frameId) {
  const id = String(frameId || "").trim();
  if (!id) return normalizeIds(history);
  const list = Array.isArray(history) ? history.map(String).filter(Boolean) : [];
  if (list[list.length - 1] === id) return list.slice(-MAX_HISTORY);
  return [...list, id].slice(-MAX_HISTORY);
}

// Compatibility for the old one-slot public API.
export function loadScrollSave() {
  const state = loadScrollState();
  const workId = state.lastWorkId;
  const save = workId ? state.sessions[workId]?.autoSave : null;
  return save ? { packId: workId, ...clone(save) } : null;
}

export function saveScrollProgress(patch) {
  return saveAutoProgress(patch?.packId, {
    chapterId: patch?.chapterId || patch?.packId,
    frameId: patch?.frameId,
    history: patch?.history,
    flags: patch?.flags,
    branchPath: patch?.branchPath,
  });
}

export function clearScrollSave() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.removeItem(SCROLL_STORE_KEY);
    window.localStorage.removeItem(LEGACY_SCROLL_STORE_KEY);
    return true;
  } catch {
    return false;
  }
}
