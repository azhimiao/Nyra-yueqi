/**
 * Local calendar store for P4 CRUD — in-memory / injectable.
 * Can hook phone-calendar via setCalendarAdapters({ list, add, update, remove }).
 */

import { newId, nowIso } from "../schema.js";

/** @typedef {{ id: string, title: string, date: string, time: string, prompt?: string, mode?: string, proposalId?: string, correlationId?: string }} CalEvent */

/** @type {CalEvent[]} */
let _events = [];

/** @type {{ list?: () => CalEvent[], add?: (e: Partial<CalEvent>) => CalEvent, update?: (id: string, patch: Partial<CalEvent>) => CalEvent|null, remove?: (id: string) => boolean } | null} */
let _adapters = null;

/**
 * @param {typeof _adapters} adapters
 */
export function setCalendarAdapters(adapters) {
  _adapters = adapters || null;
}

export function clearLocalCalendarStore() {
  _events = [];
}

/**
 * @returns {CalEvent[]}
 */
export function listLocalEvents() {
  if (_adapters?.list) {
    try {
      return (_adapters.list() || []).map(normalize);
    } catch {
      /* fall through */
    }
  }
  return _events.map((e) => ({ ...e }));
}

/**
 * @param {Partial<CalEvent>} input
 */
export function addLocalEvent(input = {}) {
  if (_adapters?.add) {
    try {
      return normalize(_adapters.add(input));
    } catch {
      /* fall through */
    }
  }
  const ev = normalize({
    id: newId("calev"),
    title: input.title || "新提醒",
    date: input.date || todayYmd(),
    time: input.time || "09:00",
    prompt: input.prompt || "",
    mode: input.mode || "local",
    createdAt: nowIso(),
    proposalId: input.proposalId || "",
    correlationId: input.correlationId || input.proposalId || "",
  });
  _events.push(ev);
  return { ...ev };
}

/**
 * @param {string} id
 * @param {Partial<CalEvent>} patch
 */
export function updateLocalEvent(id, patch = {}) {
  if (_adapters?.update) {
    try {
      const updated = _adapters.update(id, patch);
      return updated ? normalize(updated) : null;
    } catch {
      /* fall through */
    }
  }
  const idx = _events.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  _events[idx] = normalize({ ..._events[idx], ...patch, id });
  return { ..._events[idx] };
}

/**
 * @param {string} id
 */
export function removeLocalEvent(id) {
  if (_adapters?.remove) {
    try {
      return Boolean(_adapters.remove(id));
    } catch {
      /* fall through */
    }
  }
  const before = _events.length;
  _events = _events.filter((e) => e.id !== id);
  return _events.length < before;
}

/**
 * Remove calendar event stamped with a proposalId / correlationId (C2 undo).
 * @param {string} proposalId
 * @returns {{ ok: boolean, removed?: boolean, eventId?: string, reason?: string }}
 */
export function removeLocalEventByProposalId(proposalId) {
  const id = String(proposalId || "").trim();
  if (!id) return { ok: false, reason: "missing_proposalId" };
  const hit = listLocalEvents().find(
    (e) => e.proposalId === id || e.correlationId === id,
  );
  if (!hit) return { ok: false, reason: "not_found", removed: false };
  const removed = removeLocalEvent(hit.id);
  return { ok: removed, removed, eventId: hit.id };
}

/**
 * Free slots for a date (simple 09–18 hourly gaps with no event).
 * @param {string} dateYmd
 * @param {{ startHour?: number, endHour?: number }} [opts]
 */
export function findFreeSlots(dateYmd, opts = {}) {
  const startHour = opts.startHour ?? 9;
  const endHour = opts.endHour ?? 18;
  const busy = new Set(
    listLocalEvents()
      .filter((e) => e.date === dateYmd)
      .map((e) => String(e.time || "").slice(0, 5)),
  );
  /** @type {{ date: string, time: string }[]} */
  const free = [];
  for (let h = startHour; h < endHour; h += 1) {
    const time = `${String(h).padStart(2, "0")}:00`;
    if (!busy.has(time)) free.push({ date: dateYmd, time });
  }
  return free;
}

function normalize(raw = {}) {
  const proposalId = String(raw.proposalId || "").trim();
  const correlationId = String(raw.correlationId || proposalId || "").trim();
  return {
    id: String(raw.id || newId("calev")),
    title: String(raw.title || "提醒").trim() || "提醒",
    date: String(raw.date || todayYmd()),
    time: String(raw.time || "09:00").slice(0, 5),
    prompt: String(raw.prompt || ""),
    mode: String(raw.mode || "local"),
    createdAt: String(raw.createdAt || nowIso()),
    ...(proposalId ? { proposalId } : {}),
    ...(correlationId ? { correlationId } : {}),
  };
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Try to bind phone calendar adapters (browser only; safe no-op in node).
 */
export async function tryBindPhoneCalendar() {
  try {
    const mod = await import("../../phone-shell/phone-data.js");
    setCalendarAdapters({
      list: () => mod.listEvents(),
      add: (e) => mod.addEvent(e),
      update: (id, patch) => {
        const events = mod.listEvents();
        const hit = events.find((x) => x.id === id);
        if (!hit) return null;
        const next = { ...hit, ...patch, id };
        mod.removeEvent(id);
        return mod.addEvent(next);
      },
      remove: (id) => {
        const before = mod.listEvents().length;
        mod.removeEvent(id);
        return mod.listEvents().length < before;
      },
    });
    return true;
  } catch {
    return false;
  }
}
