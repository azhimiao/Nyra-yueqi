/**
 * Project a cohabit timeline row into the life DayPack (no import of cohabit-timeline).
 */

import { LIFE_SCHEMA_VERSION, dayPackId, localDateFromIso } from "./schema.js";
import { getDayPack, saveDayPack } from "./store.js";

/**
 * @param {string} characterId
 * @param {{ id?: string, at?: string, kind?: string, summary?: string, meta?: Record<string, unknown> }} cohabitEvent
 */
export function projectCohabitIntoLife(characterId, cohabitEvent) {
  const cid = String(characterId || "").trim();
  const at = String(cohabitEvent?.at || new Date().toISOString());
  const localDate = localDateFromIso(at);
  if (!cid || !localDate) return null;

  const summary = String(cohabitEvent.summary || "").trim().slice(0, 240);
  if (!summary) return null;

  const meta = cohabitEvent.meta && typeof cohabitEvent.meta === "object"
    ? { ...cohabitEvent.meta }
    : {};
  const runId = String(meta.runId || "").trim();

  let pack = getDayPack(cid, localDate);
  const lifeEvent = {
    id: `ev-coh-${cohabitEvent.id || Date.now().toString(36)}`,
    schemaVersion: LIFE_SCHEMA_VERSION,
    characterId: cid,
    occurredAt: at,
    durationMinutes: 5,
    type: String(cohabitEvent.kind || "note").slice(0, 40),
    kind: String(cohabitEvent.kind || "note").slice(0, 40),
    summary,
    participants: [{ id: "p-self", name: "角色", relation: "self" }],
    location: "",
    emotionBefore: "",
    emotionAfter: "",
    privateFacts: [],
    memoryRefs: runId ? [`scenario-run:${runId}`] : [],
    relatedEventIds: [],
    evidenceIds: [],
    visibility: "shared",
    source: cohabitEvent.appId === "scenario" ? "scenario" : "chat",
    runId,
    meta,
  };

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
    const exists = (pack.events || []).some((e) => e.id === lifeEvent.id);
    if (exists) return pack;
    pack = {
      ...pack,
      events: [lifeEvent, ...(pack.events || [])].slice(0, 40),
      generatedAt: new Date().toISOString(),
    };
  }

  const saved = saveDayPack(pack);
  return saved.pack;
}
