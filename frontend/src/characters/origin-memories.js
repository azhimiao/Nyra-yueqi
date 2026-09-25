/**
 * Authored origin memories — character canon, not lived chat with the user.
 * Builtin Nyra seeds these; custom characters write them in the identity editor.
 */

import { deleteRecord, getAllRecords, normalizeMemory, storeRecord } from "../storage/db.js";
import { hashPalaceContent } from "../memory/projection/palace-index-contract.js";

export const ORIGIN_MEMORY_SOURCE = "character.history";
export const ORIGIN_MEMORY_SOURCE_TYPE = "authored_origin_memory";
export const ORIGIN_TRUTH_DOMAIN = "character_canon";
export const ORIGIN_SYSTEM_TAGS = Object.freeze(["character-history", "authored-origin"]);
export const ORIGIN_WEIGHT_LEVELS = Object.freeze({
  low: 0.8,
  medium: 1.32,
  high: 1.8,
});
export const BUILTIN_ORIGIN_ID_PREFIX = "nyra-origin-v1-";

export function isProtectedBuiltinOriginId(id) {
  return String(id || "").startsWith(BUILTIN_ORIGIN_ID_PREFIX);
}

export function isAuthoredOriginMemory(row, characterId) {
  const cid = String(characterId || "").trim();
  if (!cid || !row || typeof row !== "object") return false;
  const rowCid = String(row.companionId || row.characterId || "").trim();
  if (rowCid !== cid) return false;
  const sourceType = String(row.sourceType || row.sourceRef?.sourceType || "").trim();
  const source = String(row.source || "").trim();
  return sourceType === ORIGIN_MEMORY_SOURCE_TYPE || source === ORIGIN_MEMORY_SOURCE;
}

export function originWeightToLevel(weight) {
  const n = Number(weight);
  if (!Number.isFinite(n)) return "medium";
  if (n <= 1) return "low";
  if (n >= 1.6) return "high";
  return "medium";
}

export function originLevelToWeight(level) {
  return ORIGIN_WEIGHT_LEVELS[level] || ORIGIN_WEIGHT_LEVELS.medium;
}

export function parseOriginTags(value) {
  const extra = String(value || "")
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !ORIGIN_SYSTEM_TAGS.includes(tag));
  return [...ORIGIN_SYSTEM_TAGS, ...extra];
}

export function visibleOriginTags(tags, title = "") {
  const titleTag = String(title || "").trim();
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || "").trim())
    .filter((tag) => tag && !ORIGIN_SYSTEM_TAGS.includes(tag) && tag !== titleTag);
}

export function emptyOriginMemoryDraft() {
  return {
    id: "",
    title: "",
    rawText: "",
    tagsText: "",
    weightLevel: "medium",
    pinned: false,
    searchable: true,
    when: "",
  };
}

export function toOriginMemoryDraft(row) {
  if (!row) return emptyOriginMemoryDraft();
  return {
    id: String(row.id || ""),
    title: String(row.title || "").trim(),
    rawText: String(row.rawText || row.text || "").trim(),
    tagsText: visibleOriginTags(row.tags, row.title).join("，"),
    weightLevel: originWeightToLevel(row.weight),
    pinned: Boolean(row.pinned),
    searchable: row.searchable !== false,
    when: String(row.createdAt || "").slice(0, 10),
  };
}

export function normalizeOriginDraft(draft = {}) {
  const title = String(draft.title || "").trim();
  const rawText = String(draft.rawText || draft.body || "").trim();
  const weightLevel = ORIGIN_WEIGHT_LEVELS[draft.weightLevel]
    ? draft.weightLevel
    : originWeightToLevel(draft.weight);
  return {
    id: String(draft.id || "").trim(),
    title,
    rawText,
    tags: parseOriginTags(draft.tagsText || draft.tags || ""),
    weightLevel,
    pinned: Boolean(draft.pinned),
    searchable: draft.searchable !== false,
    when: String(draft.when || "").trim(),
  };
}

export function originDraftHasContent(draft) {
  const next = normalizeOriginDraft(draft);
  return Boolean(next.title || next.rawText);
}

function resolveWhen(when, fallback) {
  const raw = String(when || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  if (raw) return raw;
  return fallback || new Date().toISOString();
}

function sortOrigin(a, b) {
  const byTime = String(a?.createdAt || "").localeCompare(String(b?.createdAt || ""));
  if (byTime) return byTime;
  return String(a?.title || "").localeCompare(String(b?.title || ""));
}

export function buildOriginMemoryRecord(characterId, draft, existing = null, extras = {}) {
  const id = String(characterId || "").trim();
  const next = normalizeOriginDraft(draft);
  const prev = existing && typeof existing === "object" ? existing : null;
  const recordId = next.id || prev?.id || `origin-${id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const title = next.title || (next.rawText ? next.rawText.slice(0, 24) : "");
  const rawText = next.rawText || title;
  const createdAt = resolveWhen(next.when, prev?.createdAt);
  const role = String(extras.role || prev?.role || "").trim() || "角色";
  const tags = title && !next.tags.includes(title) ? [...next.tags, title] : next.tags;
  const authoredBy = prev?.sourceRef?.authoredBy || (isProtectedBuiltinOriginId(recordId) ? "character_author" : "user");
  return normalizeMemory({
    ...(prev || {}),
    id: recordId,
    title,
    rawText,
    source: ORIGIN_MEMORY_SOURCE,
    sourceType: ORIGIN_MEMORY_SOURCE_TYPE,
    sourceId: recordId,
    sourceRef: {
      sourceType: ORIGIN_MEMORY_SOURCE_TYPE,
      sourceId: recordId,
      characterId: id,
      truthDomain: ORIGIN_TRUTH_DOMAIN,
      authoredBy,
    },
    contentHash: hashPalaceContent(rawText),
    projectionKind: "stable_memory",
    projectionVersion: 1,
    authority: "character_author",
    indexedAt: new Date().toISOString(),
    createdAt,
    role,
    wing: "Character",
    room: "History",
    weight: originLevelToWeight(next.weightLevel),
    tags,
    pinned: next.pinned,
    searchable: next.searchable,
    companionId: id,
    characterId: id,
  });
}

export async function listOriginMemories(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return [];
  const rows = await getAllRecords("memories");
  return (rows || []).filter((row) => isAuthoredOriginMemory(row, id)).sort(sortOrigin);
}

export async function listOriginMemoriesForCharacters(ids = []) {
  const list = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const map = Object.fromEntries(list.map((id) => [id, []]));
  if (!list.length) return map;
  const rows = await getAllRecords("memories");
  const allowed = new Set(list);
  for (const row of rows || []) {
    const cid = String(row?.companionId || row?.characterId || "").trim();
    if (!allowed.has(cid) || !isAuthoredOriginMemory(row, cid)) continue;
    map[cid].push(row);
  }
  for (const id of list) map[id].sort(sortOrigin);
  return map;
}

/**
 * Replace authored origin rows for one character.
 * Lived chat memories are never touched. Builtin Nyra origin ids are not deleted.
 * Caller must pass ready:true only after the editor has loaded that character's rows.
 */
export async function replaceOriginMemories(characterId, drafts, options = {}) {
  const id = String(characterId || "").trim();
  if (!id) return { ok: false, reason: "missing_characterId" };
  if (options.ready !== true) {
    return { ok: true, skipped: true, reason: "editor_not_ready", saved: [], deleted: [] };
  }

  const existing = await listOriginMemories(id);
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keepIds = new Set();
  const saved = [];
  const role = String(options.role || "").trim();

  for (const draft of Array.isArray(drafts) ? drafts : []) {
    if (!originDraftHasContent(draft)) continue;
    const next = normalizeOriginDraft(draft);
    const prev = next.id ? existingById.get(next.id) || null : null;
    const record = buildOriginMemoryRecord(id, next, prev, { role });
    await storeRecord("memories", record);
    keepIds.add(record.id);
    saved.push(record);
  }

  const deleted = [];
  for (const row of existing) {
    if (keepIds.has(row.id)) continue;
    if (isProtectedBuiltinOriginId(row.id)) continue;
    await deleteRecord("memories", row.id);
    deleted.push(row.id);
  }

  return { ok: true, skipped: false, saved, deleted };
}
