/**
 * Index existing diary, life events, cohabit, character relations into the graph.
 * Does not rewrite source stores; idempotent via source+sourceRef dedupe.
 */

import { ingestCandidate } from "./pipeline.js";
import { getMigrationMeta, setMigrationMeta } from "./store.js";
import { LIFE_STORE_KEY } from "../life/schema.js";
import { COHABIT_TIMELINE_KEY } from "../memory/cohabit-timeline.js";

/**
 * @typedef {{
 *   diaries?: object[],
 *   lifePacks?: object[],
 *   lifeEvents?: object[],
 *   cohabitEvents?: object[],
 *   relations?: object[],
 *   nowIso?: string,
 *   readLiveStores?: boolean,
 * }} MigrationInput
 */

/**
 * @param {{ getItem(k:string):string|null }|null} storage
 * @param {string} key
 */
function readJson(storage, key) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function defaultStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Map a life event → candidate.
 * @param {object} ev
 */
export function lifeEventToCandidate(ev) {
  if (!ev || !ev.characterId || !ev.summary) return null;
  return {
    content: String(ev.summary),
    summary: String(ev.summary).slice(0, 240),
    kind: "episodic",
    source: `life.${ev.source || "event"}`,
    sourceRef: String(ev.id || ""),
    occurredAt: String(ev.occurredAt || ev.createdAt || new Date().toISOString()),
    confidence: 0.82,
    characterId: String(ev.characterId),
    workspaceId: String(ev.characterId),
    privacyLevel: ev.visibility === "private" ? "private" : "shared",
    retention: "rolling_90d",
    whyRemembered: `生命事件「${ev.type || "event"}」索引，用于角色日程与回忆`,
    tags: [String(ev.type || "life")],
    relationHints: Array.isArray(ev.participants)
      ? ev.participants.map((p) => String(p.relation || p.name || "")).filter(Boolean)
      : [],
    taskHints: [],
    meta: { lifeEventId: ev.id, visibility: ev.visibility },
  };
}

/**
 * @param {object} diary
 * @param {string} [fallbackCharacterId]
 */
export function diaryToCandidate(diary, fallbackCharacterId = "") {
  if (!diary) return null;
  const content = String(diary.rawText || diary.summary || diary.title || "").trim();
  if (!content) return null;
  const characterId = String(
    diary.characterId || diary.meta?.characterId || fallbackCharacterId || "",
  ).trim();
  if (!characterId) return null;
  return {
    content,
    summary: String(diary.title || content).slice(0, 240),
    kind: "episodic",
    source: "diary.memory",
    sourceRef: String(diary.id || diary.diaryDay || ""),
    occurredAt: String(diary.createdAt || (diary.diaryDay ? `${diary.diaryDay}T12:00:00.000Z` : new Date().toISOString())),
    confidence: 0.9,
    characterId,
    workspaceId: characterId,
    privacyLevel: "private",
    retention: "permanent",
    whyRemembered: "日记条目索引，记录共同日子与情绪",
    tags: ["diary", String(diary.styleId || "")].filter(Boolean),
    relationHints: ["partner"],
    taskHints: [],
    meta: { diaryDay: diary.diaryDay, role: diary.role },
  };
}

/**
 * @param {object} ev
 */
export function cohabitToCandidate(ev) {
  if (!ev?.summary) return null;
  const characterId = String(ev.characterId || "").trim();
  if (!characterId) return null;
  return {
    content: String(ev.summary),
    summary: String(ev.summary).slice(0, 240),
    kind: "episodic",
    source: `cohabit.${ev.appId || "app"}`,
    sourceRef: String(ev.id || ""),
    occurredAt: String(ev.at || new Date().toISOString()),
    confidence: 0.7,
    characterId,
    workspaceId: characterId,
    privacyLevel: "shared",
    retention: "rolling_30d",
    whyRemembered: `同栖时间线（${ev.appId || "app"}）短时事件`,
    tags: [String(ev.kind || "note"), String(ev.appId || "")].filter(Boolean),
    relationHints: [],
    taskHints: [],
    meta: ev.meta || {},
  };
}

/**
 * Character relation / KG-like fact.
 * @param {object} rel
 */
export function relationToCandidate(rel) {
  if (!rel) return null;
  const characterId = String(rel.characterId || "").trim();
  const content = String(rel.content || rel.fact || rel.summary || "").trim();
  if (!characterId || !content) return null;
  const kind = rel.kind === "procedural" || rel.kind === "goal_project" ? rel.kind : "relational";
  return {
    content,
    summary: content.slice(0, 240),
    kind,
    source: String(rel.source || "relation.character"),
    sourceRef: String(rel.id || rel.sourceRef || ""),
    occurredAt: String(rel.occurredAt || rel.validFrom || new Date().toISOString()),
    confidence: Number(rel.confidence) || 0.78,
    characterId,
    workspaceId: characterId,
    privacyLevel: rel.privacyLevel || "shared",
    retention: "permanent",
    expiresAt: rel.validUntil || rel.expiresAt || null,
    whyRemembered: "角色关系/边界事实，隔离于该角色工作区",
    tags: ["relation", String(rel.predicate || "")].filter(Boolean),
    relationHints: [String(rel.predicate || "relation"), String(rel.object || "")].filter(Boolean),
    taskHints: [],
    meta: {
      subject: rel.subject,
      predicate: rel.predicate,
      object: rel.object,
    },
  };
}

/**
 * Pull from live life / cohabit stores when available.
 * @param {MigrationInput} input
 */
function collectFromLiveStores(input) {
  if (input.readLiveStores === false) return input;
  const storage = defaultStorage();
  const next = { ...input };

  if (!next.lifeEvents?.length && !next.lifePacks?.length) {
    const life = readJson(storage, LIFE_STORE_KEY);
    if (life?.packs) {
      next.lifePacks = Object.values(life.packs);
    }
  }

  if (!next.cohabitEvents?.length) {
    const coh = readJson(storage, COHABIT_TIMELINE_KEY);
    if (Array.isArray(coh?.events)) next.cohabitEvents = coh.events;
  }

  return next;
}

/**
 * Run migration / indexing. Idempotent.
 * @param {MigrationInput} [input]
 */
export function migrateIntoContextGraph(input = {}) {
  const data = collectFromLiveStores(input);
  const nowIso = data.nowIso || new Date().toISOString();
  /** @type {Record<string, number>} */
  const counts = { diary: 0, life: 0, cohabit: 0, relation: 0, skipped: 0, stored: 0, reused: 0 };

  const diaries = data.diaries || [];
  for (const d of diaries) {
    const c = diaryToCandidate(d);
    if (!c) {
      counts.skipped += 1;
      continue;
    }
    const r = ingestCandidate(c, { nowIso });
    counts.diary += 1;
    if (r.reused) counts.reused += 1;
    else if (r.ok) counts.stored += 1;
    else counts.skipped += 1;
  }

  /** @type {object[]} */
  const lifeEvents = [...(data.lifeEvents || [])];
  for (const pack of data.lifePacks || []) {
    if (Array.isArray(pack?.events)) {
      for (const ev of pack.events) {
        lifeEvents.push({
          ...ev,
          characterId: ev.characterId || pack.characterId,
        });
      }
    }
  }
  for (const ev of lifeEvents) {
    const c = lifeEventToCandidate(ev);
    if (!c) {
      counts.skipped += 1;
      continue;
    }
    const r = ingestCandidate(c, { nowIso });
    counts.life += 1;
    if (r.reused) counts.reused += 1;
    else if (r.ok) counts.stored += 1;
    else counts.skipped += 1;
  }

  for (const ev of data.cohabitEvents || []) {
    const c = cohabitToCandidate(ev);
    if (!c) {
      counts.skipped += 1;
      continue;
    }
    const r = ingestCandidate(c, { nowIso });
    counts.cohabit += 1;
    if (r.reused) counts.reused += 1;
    else if (r.ok) counts.stored += 1;
    else counts.skipped += 1;
  }

  for (const rel of data.relations || []) {
    const c = relationToCandidate(rel);
    if (!c) {
      counts.skipped += 1;
      continue;
    }
    const r = ingestCandidate(c, { nowIso });
    counts.relation += 1;
    if (r.reused) counts.reused += 1;
    else if (r.ok) counts.stored += 1;
    else counts.skipped += 1;
  }

  setMigrationMeta(
    {
      diary: counts.diary,
      life: counts.life,
      cohabit: counts.cohabit,
      relation: counts.relation,
    },
    nowIso,
  );

  return {
    ok: true,
    counts,
    migration: getMigrationMeta(),
  };
}
