/**
 * C6 — Life-event confluence for scenario / cocreate / TA-phone observations.
 * Idempotent writers into cohabit + life DayPack (shared visibility only).
 */

import { appendCohabitEvent, listCohabitEvents } from "./bridge.js";
import { listLifeEvents, saveDayPack, getDayPack, listObservations } from "./store.js";
import { LIFE_SCHEMA_VERSION, dayPackId, localDateFromIso } from "./schema.js";
import { projectCohabitIntoLife } from "./cohabit-sync.js";

/**
 * Find an existing cohabit row by meta.idempotentKey.
 * @param {string} characterId
 * @param {string} idempotentKey
 */
export function findCohabitByIdempotentKey(characterId, idempotentKey) {
  const key = String(idempotentKey || "").trim();
  if (!key) return null;
  return (
    listCohabitEvents({ characterId, limit: 80 }).find(
      (e) => String(e?.meta?.idempotentKey || "") === key,
    ) || null
  );
}

/**
 * Idempotent cohabit + life dual-write.
 * @param {{
 *   appId: string,
 *   kind: string,
 *   summary: string,
 *   characterId: string,
 *   idempotentKey: string,
 *   meta?: Record<string, unknown>,
 *   visibility?: "shared"|"discoverable"|"private",
 * }} input
 */
export function appendConfluenceEvent(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const summary = String(input.summary || "").trim().slice(0, 240);
  const idempotentKey = String(input.idempotentKey || "").trim();
  if (!characterId || !summary) {
    return { ok: false, error: "missing_fields", event: null, alreadyWritten: false };
  }

  if (idempotentKey) {
    const existing = findCohabitByIdempotentKey(characterId, idempotentKey);
    if (existing) {
      // Ensure life projection exists even if earlier dual-write raced
      try {
        projectCohabitIntoLife(characterId, existing);
      } catch {
        /* ignore */
      }
      return { ok: true, event: existing, alreadyWritten: true };
    }
  }

  const visibility = input.visibility === "private" || input.visibility === "discoverable"
    ? input.visibility
    : "shared";

  const event = appendCohabitEvent({
    appId: input.appId || "life",
    kind: input.kind || "note",
    summary,
    characterId,
    meta: {
      ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
      idempotentKey: idempotentKey || undefined,
      visibility,
      confluence: true,
    },
  });

  if (!event) {
    return { ok: false, error: "append_failed", event: null, alreadyWritten: false };
  }

  // First write must also land in DayPack so diary / Pop consumers can read it.
  try {
    projectCohabitIntoLife(characterId, event);
  } catch {
    /* ignore projection race */
  }

  return { ok: true, event, alreadyWritten: false };
}

/**
 * Scenario curtain → shared life event (idempotent by runId).
 */
export function recordScenarioFinale({
  characterId = "",
  runId = "",
  scriptId = "",
  scriptTitle = "",
  summary = "",
  diaryId = "",
} = {}) {
  const sid = String(runId || "").trim();
  const text = String(summary || "").trim();
  if (!sid || !text) return { ok: false, error: "missing_fields" };
  return appendConfluenceEvent({
    appId: "scenario",
    kind: "finale",
    summary: `谢幕《${scriptTitle || "这一幕"}》：${text.slice(0, 80)}`,
    characterId,
    idempotentKey: `scenario-finale:${sid}`,
    meta: { scriptId, runId: sid, finaleSummary: text, diaryId },
    visibility: "shared",
  });
}

/**
 * Cocreate publish → shared life event (idempotent by session+target).
 */
export function recordCocreatePublish({
  characterId = "",
  sessionId = "",
  artifactId = "",
  target = "",
  targetId = "",
  title = "",
} = {}) {
  const key = `cocreate-publish:${String(sessionId || "").trim()}:${String(target || "")}:${String(targetId || "").trim()}`;
  const label = String(title || target || "作品").slice(0, 40);
  const kindLabel =
    target === "script" ? "剧本" : target === "worldbook" ? "设定" : "人设";
  return appendConfluenceEvent({
    appId: "cocreate",
    kind: "publish",
    summary: `共创发布${kindLabel}「${label}」`,
    characterId,
    idempotentKey: key,
    meta: { sessionId, artifactId, target, targetId, title: label },
    visibility: "shared",
  });
}

/**
 * After TA-phone observation: ensure a discoverable→shared bridge note exists when eligible.
 * Does not dump privateFacts. Idempotent per evidenceId.
 */
export function recordObservationConfluence({
  characterId = "",
  evidenceId = "",
  dayPackId = "",
  title = "",
  snippet = "",
} = {}) {
  const cid = String(characterId || "").trim();
  const eid = String(evidenceId || "").trim();
  if (!cid || !eid) return { ok: false, error: "missing_fields" };

  const obs = listObservations(cid, { limit: 200 }).find((o) => o.evidenceId === eid);
  if (!obs) return { ok: false, error: "observation_missing" };

  const safeTitle = String(title || "一条痕迹").slice(0, 40);
  const safeSnippet = String(snippet || "").replace(/\s+/g, " ").slice(0, 48);
  const summary = safeSnippet
    ? `在 TA 的手机看过「${safeTitle}」：${safeSnippet}`
    : `在 TA 的手机看过「${safeTitle}」`;

  return appendConfluenceEvent({
    appId: "sidewrite",
    kind: "observation",
    summary,
    characterId: cid,
    idempotentKey: `sidewrite-obs:${cid}:${eid}`,
    meta: { evidenceId: eid, dayPackId, observationId: obs.id },
    visibility: "shared",
  });
}

/**
 * List shared life events for a character (diary / Pop consumers).
 */
export function listSharedLifeSummaries(characterId, { limit = 20 } = {}) {
  const cid = String(characterId || "").trim();
  if (!cid) return [];
  return listLifeEvents(cid)
    .filter((e) => e.visibility === "shared")
    .slice(0, Math.max(1, Number(limit) || 20))
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      type: e.type || e.kind || "",
      kind: e.kind || e.type || "",
      summary: e.summary,
      source: e.source,
      runId: String(e.runId || e.meta?.runId || "").trim(),
      diaryId: String(e.meta?.diaryId || "").trim(),
      meta: e.meta && typeof e.meta === "object" ? e.meta : {},
    }));
}

/**
 * Find a shared life / cohabit row for a scenario runId.
 * @param {string} characterId
 * @param {string} runId
 */
export function findSharedByRunId(characterId, runId) {
  const cid = String(characterId || "").trim();
  const rid = String(runId || "").trim();
  if (!cid || !rid) return null;

  const fromLife = listLifeEvents(cid).find((e) => {
    if (e.visibility && e.visibility !== "shared") return false;
    const eventRun = String(e.runId || e.meta?.runId || "").trim();
    return eventRun === rid;
  });
  if (fromLife) {
    return {
      id: fromLife.id,
      occurredAt: fromLife.occurredAt,
      type: fromLife.type || fromLife.kind || "finale",
      kind: fromLife.kind || fromLife.type || "finale",
      summary: fromLife.summary,
      source: fromLife.source || "life",
      runId: rid,
      diaryId: String(fromLife.meta?.diaryId || "").trim(),
      meta: fromLife.meta && typeof fromLife.meta === "object" ? fromLife.meta : {},
    };
  }

  const fromCohabit = listCohabitEvents({ characterId: cid, limit: 80 }).find(
    (e) => String(e?.meta?.runId || "").trim() === rid,
  );
  if (!fromCohabit) return null;
  return {
    id: fromCohabit.id,
    occurredAt: fromCohabit.at,
    type: fromCohabit.kind || "finale",
    kind: fromCohabit.kind || "finale",
    summary: fromCohabit.summary,
    source: "cohabit",
    runId: rid,
    diaryId: String(fromCohabit.meta?.diaryId || "").trim(),
    meta: fromCohabit.meta && typeof fromCohabit.meta === "object" ? fromCohabit.meta : {},
  };
}

/**
 * Ensure a thin shared event lands in today's pack when cohabit dual-write is async-only.
 * Prefer bridge dual-write; this is a sync fallback for tests / offline.
 */
export function ensureSharedLifeEvent(characterId, { summary, type = "note", occurredAt } = {}) {
  const cid = String(characterId || "").trim();
  const text = String(summary || "").trim().slice(0, 240);
  if (!cid || !text) return null;
  const at = String(occurredAt || new Date().toISOString());
  const localDate = localDateFromIso(at);
  if (!localDate) return null;

  const lifeEvent = {
    id: `ev-c6-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    schemaVersion: LIFE_SCHEMA_VERSION,
    characterId: cid,
    occurredAt: at,
    durationMinutes: 5,
    type: String(type || "note").slice(0, 40),
    summary: text,
    participants: [{ id: "p-self", name: "角色", relation: "self" }],
    location: "",
    emotionBefore: "",
    emotionAfter: "",
    privateFacts: [],
    memoryRefs: [],
    relatedEventIds: [],
    evidenceIds: [],
    visibility: "shared",
    source: "chat",
  };

  let pack = getDayPack(cid, localDate);
  if (!pack) {
    pack = {
      id: dayPackId(cid, localDate),
      schemaVersion: LIFE_SCHEMA_VERSION,
      characterId: cid,
      localDate,
      theme: "同栖摘要",
      generatedAt: new Date().toISOString(),
      source: "chat",
      events: [lifeEvent],
      evidence: [],
      appSummary: {},
      consistency: { checkedAt: new Date().toISOString(), errors: [], warnings: [] },
    };
  } else {
    pack = {
      ...pack,
      events: [lifeEvent, ...(pack.events || [])].slice(0, 40),
      generatedAt: new Date().toISOString(),
    };
  }
  const saved = saveDayPack(pack);
  return saved.ok ? lifeEvent : null;
}
