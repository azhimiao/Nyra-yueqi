/**
 * Bridge to F0 cohabit timeline + local enriched sidewrite events.
 */

import { appendCohabitEvent, listCohabitEvents } from "../memory/cohabit-timeline.js";
import { LS_KEYS, SOURCE_APP } from "./constants.js";

const MAX_EVENTS = 80;

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { events: [] };
    return JSON.parse(window.localStorage.getItem(LS_KEYS.events) || "{}") || { events: [] };
  } catch {
    return { events: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(LS_KEYS.events, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} event
 */
export function appendLivingTimelineEvent(event = {}) {
  const summary = String(event.summary || "").trim();
  if (!summary) return null;
  const full = {
    id: String(event.id || `sw-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`),
    ts: String(event.ts || new Date().toISOString()),
    characterId: String(event.characterId || "").trim(),
    sourceApp: SOURCE_APP,
    appId: SOURCE_APP,
    sceneTag: String(event.sceneTag || "sidewrite.view"),
    action: String(event.action || "open_app"),
    summary: summary.slice(0, 120),
    payload: event.payload && typeof event.payload === "object" ? event.payload : {},
    ttlHours: Number(event.ttlHours) || 48,
  };

  const bag = readBag();
  if (!Array.isArray(bag.events)) bag.events = [];
  bag.events.unshift(full);
  bag.events = bag.events.slice(0, MAX_EVENTS);
  writeBag(bag);

  appendCohabitEvent({
    appId: SOURCE_APP,
    kind: full.action,
    summary: full.summary,
    characterId: full.characterId,
    meta: {
      sceneTag: full.sceneTag,
      action: full.action,
      payload: full.payload,
      sourceApp: SOURCE_APP,
      id: full.id,
      ts: full.ts,
    },
  });

  return full;
}

/**
 * @param {{ characterId?: string, limit?: number }} opts
 */
export function listRecentEvents({ characterId = "", limit = 24 } = {}) {
  const cid = String(characterId || "").trim();
  const now = Date.now();
  const events = (readBag().events || []).filter((ev) => {
    if (cid && ev.characterId && ev.characterId !== cid) return false;
    const ttl = (Number(ev.ttlHours) || 48) * 3600 * 1000;
    const ts = Date.parse(ev.ts || 0);
    if (!Number.isFinite(ts)) return true;
    return now - ts <= ttl;
  });
  return events.slice(0, Math.max(1, Number(limit) || 24));
}

/** Dev / verify helper: also surface cohabit-backed events if local bag empty. */
export function listEventsFallbackFromCohabit({ characterId = "", limit = 24 } = {}) {
  const local = listRecentEvents({ characterId, limit });
  if (local.length) return local;
  return listCohabitEvents({ characterId, limit })
    .filter((ev) => ev.appId === SOURCE_APP)
    .map((ev) => ({
      id: ev.id,
      ts: ev.at,
      characterId: ev.characterId,
      sourceApp: SOURCE_APP,
      appId: SOURCE_APP,
      sceneTag: ev.meta?.sceneTag || "sidewrite.view",
      action: ev.kind || "open_app",
      summary: ev.summary,
      payload: ev.meta?.payload || {},
      ttlHours: 48,
    }));
}
