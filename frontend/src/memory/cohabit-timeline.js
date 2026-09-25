/**
 * 同栖时间线 — cross-app short-term events for prompt injection.
 * F0: I2 · storage key listed in data-modules.
 *
 * M9: Canonical Timeline (appendTimelineEvent) is event authority.
 * localStorage under COHABIT_TIMELINE_KEY is a rolling projection / prompt mirror —
 * not a second fact store. When unifiedMemoryAdaptersV1 is on, each local row is
 * tagged `projection: true` (non-authoritative).
 */

import { normalizeSceneAppId, sceneAppLabel } from "../prompt/scene-tags.js";
import { appendTimelineEvent } from "../timeline/repository.js";
import { registerProjection } from "../timeline/projection-registry.js";
import { mintId } from "../contracts/ids.js";
import { isFeatureEnabled } from "../features/flags.js";

export const COHABIT_TIMELINE_KEY = "yueqi.cohabit.timeline.v1";
export const COHABIT_MAX_EVENTS = 80;
export const COHABIT_PROMPT_LIMIT = 12;

let testStorage = null;

export function __setCohabitStorageForTests(storage) {
  testStorage = storage;
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function inferIdempotencyKey(input, characterId, participantIds) {
  const explicit = String(input.idempotencyKey || "").trim();
  if (explicit) return explicit;
  const meta = input.meta && typeof input.meta === "object" ? input.meta : {};
  const entity = meta.trackId || meta.bookId || meta.orderId || meta.ledgerId || meta.chapterId || meta.jobId || "";
  if (!entity) return "";
  return [normalizeSceneAppId(input.appId), String(input.kind || "note"), characterId || participantIds.join(","), String(entity)].join("::");
}

function nowIso() {
  return new Date().toISOString();
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readBag() {
  try {
    const storage = ls();
    if (!storage) return { events: [] };
    return JSON.parse(storage.getItem(COHABIT_TIMELINE_KEY) || "{}") || { events: [] };
  } catch {
    return { events: [] };
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(COHABIT_TIMELINE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {{
 *   appId?: string,
 *   kind?: string,
 *   summary: string,
 *   characterId?: string,
 *   meta?: Record<string, unknown>,
 * }} input
 */
export function appendCohabitEvent(input = {}) {
  const summary = String(input.summary || "").trim();
  if (!summary) return null;
  const bag = readBag();
  if (!Array.isArray(bag.events)) bag.events = [];
  const characterId = String(input.characterId || "").trim();
  const participantIds = uniqueStrings(input.participantIds || input.meta?.characterIds || (characterId ? [characterId] : []));
  const idempotencyKey = inferIdempotencyKey(input, characterId, participantIds);
  const scoped = Boolean(characterId || participantIds.length);

  // Canonical Timeline first (authority), then localStorage projection mirror.
  let sourceEventId = "";
  try {
    const timeline = appendTimelineEvent({
      eventId: mintId("eventId", "coh"),
      eventType: `cohabit.${String(input.kind || "note").trim() || "note"}`,
      source: "cohabit_adapter",
      sourceId: normalizeSceneAppId(input.appId),
      idempotencyKey: idempotencyKey || `cohabit:${Date.now()}`,
      actor: characterId || "system",
      principal: characterId || "anonymous",
      companionId: characterId,
      userId: String(input.userId || "local_user"),
      relationshipId: String(input.relationshipId || (characterId ? `rel:${input.userId || "local_user"}:${characterId}` : "")),
      realityNamespace: String(input.realityNamespace || "reality"),
      payload: {
        summary: summary.slice(0, 240),
        appId: normalizeSceneAppId(input.appId),
        kind: String(input.kind || "note").trim() || "note",
        participantIds,
        meta: input.meta && typeof input.meta === "object" ? input.meta : {},
      },
      evidenceRefs: [],
    });
    if (timeline.ok) sourceEventId = timeline.value.eventId;
  } catch {
    /* timeline optional during dual-run; projection still records locally */
  }

  let adaptersOn = false;
  try {
    adaptersOn = isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    adaptersOn = false;
  }

  const event = {
    id: `coh-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    at: nowIso(),
    appId: normalizeSceneAppId(input.appId),
    kind: String(input.kind || "note").trim() || "note",
    summary: summary.slice(0, 240),
    characterId,
    participantIds,
    visibility: scoped && input.visibility !== "private" ? "shared" : "private",
    consent: scoped ? String(input.consent || "in_app_action") : "missing_scope",
    quarantined: !scoped,
    idempotencyKey,
    retention: String(input.retention || "rolling_90d"),
    meta: input.meta && typeof input.meta === "object" ? input.meta : {},
    sourceEventId,
    projectionVersion: 1,
    // M9: when adapters flag on, local mirror is explicitly non-authoritative.
    ...(adaptersOn
      ? { projection: true, authority: "projection" }
      : {}),
  };
  if (idempotencyKey) {
    const duplicateIndex = bag.events.findIndex((item) => item.idempotencyKey === idempotencyKey);
    if (duplicateIndex >= 0) bag.events.splice(duplicateIndex, 1);
  }
  bag.events.unshift(event);
  bag.events = bag.events.slice(0, COHABIT_MAX_EVENTS);
  writeBag(bag);
  if (sourceEventId) {
    try {
      registerProjection({
        sourceEventId,
        projectionKind: "cohabit_timeline",
        projectionId: event.id,
        projectionVersion: 1,
      });
    } catch {
      /* ignore */
    }
  }

  // CEV2 C2: dual-write summary into life ledger (best-effort; never block callers).
  if (event.characterId) {
    try {
      // Lazy import avoids circular init with life/bridge.
      import("../life/cohabit-sync.js")
        .then((mod) => {
          try {
            mod.projectCohabitIntoLife(event.characterId, event);
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }

  return event;
}

export function listCohabitEvents({ limit = COHABIT_MAX_EVENTS, characterId = "", includeUnscoped = false } = {}) {
  const events = readBag().events || [];
  const cid = String(characterId || "").trim();
  const filtered = cid
    ? events.filter((item) => {
      const participants = uniqueStrings(item.participantIds || (item.characterId ? [item.characterId] : []));
      if (!participants.length || item.quarantined) return includeUnscoped === true;
      return participants.includes(cid) && item.visibility !== "private";
    })
    : events;
  return filtered.slice(0, Math.max(1, Number(limit) || COHABIT_MAX_EVENTS));
}

export function clearCohabitTimeline() {
  writeBag({ events: [] });
}

export function exportCohabitTimeline() {
  return { events: listCohabitEvents({ limit: COHABIT_MAX_EVENTS }) };
}

export function importCohabitTimeline(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  writeBag({
    events: events
      .filter((item) => item && item.summary)
      .slice(0, COHABIT_MAX_EVENTS)
      .map((item) => ({
        id: String(item.id || `coh-imp-${Math.random().toString(16).slice(2, 8)}`),
        at: String(item.at || nowIso()),
        appId: normalizeSceneAppId(item.appId),
        kind: String(item.kind || "note"),
        summary: String(item.summary).slice(0, 240),
        characterId: String(item.characterId || ""),
        participantIds: uniqueStrings(item.participantIds || (item.characterId ? [item.characterId] : [])),
        visibility: item.visibility === "shared" ? "shared" : "private",
        consent: String(item.consent || (item.characterId ? "legacy_character_scope" : "missing_scope")),
        quarantined: item.quarantined != null ? Boolean(item.quarantined) : !String(item.characterId || "").trim(),
        idempotencyKey: String(item.idempotencyKey || ""),
        retention: String(item.retention || "rolling_90d"),
        meta: item.meta && typeof item.meta === "object" ? item.meta : {},
        sourceEventId: String(item.sourceEventId || ""),
        projectionVersion: Number(item.projectionVersion) || 1,
        ...(item.projection === true ? { projection: true } : {}),
        ...(item.authority ? { authority: String(item.authority) } : {}),
      })),
  });
}

/** Block for system prompt (同栖时间线). */
export function formatCohabitTimelineBlock({ characterId = "", limit = COHABIT_PROMPT_LIMIT } = {}) {
  const events = listCohabitEvents({ characterId, limit });
  if (!events.length) return "";
  const lines = events.map((event, index) => {
    const when = String(event.at || "").slice(0, 16).replace("T", " ");
    return `${index + 1}. [${sceneAppLabel(event.appId)} · ${event.kind}] ${when} — ${event.summary}`;
  });
  return ["同栖时间线（跨场景近况，按时间倒序）：", ...lines].join("\n");
}
