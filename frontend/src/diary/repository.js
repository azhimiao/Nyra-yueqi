/**
 * Diary Repository — sole authority for diary document text/version when diaryRepositoryV1 is on.
 */

import { filterRowsByCompanionScope, relationshipIdFor } from "../memory/companion-scope.js";
import { getAllRecords, normalizeMemory } from "../storage/db.js";
import {
  createDiaryRecordV1,
  validateDiaryRecordV1,
  hashDiaryContent,
  diaryRecordToLegacyMemoryShape,
} from "./schema.js";
import { todayDiaryDay } from "./fields.js";

export const DIARY_STORE_KEY = "yueqi.diary.repository.v1";
export const DIARY_REPO_MAX_ENTRIES = 5000;

/** @type {null | Storage | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setDiaryStorageForTests(storage) {
  testStorage = storage;
}

export function __clearDiaryRepositoryForTests() {
  const storage = ls();
  try {
    storage?.removeItem?.(DIARY_STORE_KEY);
    storage?.setItem?.(DIARY_STORE_KEY, JSON.stringify({ schemaVersion: 1, entries: [] }));
  } catch {
    /* ignore */
  }
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readBag() {
  try {
    const raw = ls()?.getItem(DIARY_STORE_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return { schemaVersion: 1, entries: [] };
    if (!Array.isArray(bag.entries)) bag.entries = [];
    return bag;
  } catch {
    return { schemaVersion: 1, entries: [] };
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(DIARY_STORE_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

function mintDiaryId() {
  return `diary-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * @param {string} id
 * @param {{ includeDeleted?: boolean }} [opts]
 */
export function getDiaryEntry(id, opts = {}) {
  const want = String(id || "").trim();
  if (!want) return null;
  const row = readBag().entries.find((e) => e && String(e.id || e.diaryId) === want);
  if (!row) return null;
  if (row.deletedAt && !opts.includeDeleted) return null;
  return row;
}

/**
 * @param {{ companionId?: string, userId?: string, includeDeleted?: boolean, limit?: number }} [query]
 */
export function listDiaryEntries(query = {}) {
  const companionId = String(query.companionId || "").trim();
  const userId = String(query.userId || "local").trim() || "local";
  let rows = readBag().entries.filter((e) => e && typeof e === "object");
  if (!query.includeDeleted) {
    rows = rows.filter((e) => !e.deletedAt);
  }
  if (companionId) {
    rows = filterRowsByCompanionScope(rows, {
      companionId,
      userId,
      allowGlobal: false,
    });
  }
  rows = rows.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  const limit = Number(query.limit);
  if (Number.isFinite(limit) && limit > 0) return rows.slice(0, limit);
  return rows;
}

/**
 * Create or update. Same id keeps identity; edits bump sourceVersion.
 * Same diaryDay + companionId without id updates the existing day row.
 * @param {Partial<object>} input
 */
export function saveDiaryEntry(input = {}) {
  const body = String(input.body ?? input.rawText ?? "").trim();
  if (!body) return { ok: false, reason: "diary_body_required" };

  const companionId = String(input.companionId || input.characterId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  const diaryDay = String(input.diaryDay || "").trim() || todayDiaryDay();
  const bag = readBag();

  let existing = null;
  const byId = String(input.id || input.diaryId || "").trim();
  if (byId) {
    existing = bag.entries.find((e) => e && String(e.id || e.diaryId) === byId && !e.deletedAt) || null;
  }
  if (!existing && companionId) {
    existing =
      bag.entries.find(
        (e) =>
          e &&
          !e.deletedAt &&
          String(e.diaryDay || "") === diaryDay &&
          String(e.companionId || e.characterId || "") === companionId,
      ) || null;
  }

  const now = new Date().toISOString();
  const id = byId || existing?.id || mintDiaryId();
  const prevVersion = Number(existing?.sourceVersion || existing?.revision || 0);
  const nextVersion = existing ? (Number.isFinite(prevVersion) && prevVersion >= 1 ? prevVersion + 1 : 2) : 1;
  const title = String(input.title || "").trim() || existing?.title || "未命名日记";
  const styleId = String(input.styleId || existing?.styleId || "literary").trim() || "literary";
  const resolvedCompanion = companionId || String(existing?.companionId || existing?.characterId || "").trim();
  const relationshipId =
    String(input.relationshipId || existing?.relationshipId || "").trim() ||
    relationshipIdFor(userId, resolvedCompanion);

  const record = createDiaryRecordV1({
    ...existing,
    ...input,
    id,
    diaryId: id,
    companionId: resolvedCompanion,
    characterId: resolvedCompanion,
    userId,
    relationshipId,
    diaryDay: existing?.diaryDay || diaryDay,
    title,
    body,
    styleId,
    sourceVersion: nextVersion,
    revision: nextVersion,
    contentHash: hashDiaryContent({ title, body, styleId, diaryDay: existing?.diaryDay || diaryDay }),
    pinned: input.pinned !== undefined ? Boolean(input.pinned) : Boolean(existing?.pinned),
    weight: input.weight ?? existing?.weight ?? 1.2,
    tags: input.tags ?? existing?.tags,
    sceneImage:
      input.sceneImage !== undefined
        ? String(input.sceneImage || "").trim()
        : String(existing?.sceneImage || "").trim(),
    sceneMediaId:
      input.sceneMediaId !== undefined
        ? String(input.sceneMediaId || "").trim()
        : String(existing?.sceneMediaId || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deletedAt: null,
  });

  const validated = validateDiaryRecordV1(record);
  if (!validated.ok) {
    return { ok: false, reason: "invalid_diary", errors: validated.errors };
  }

  const idx = bag.entries.findIndex((e) => e && String(e.id || e.diaryId) === id);
  if (idx >= 0) bag.entries[idx] = record;
  else bag.entries.unshift(record);
  if (bag.entries.length > DIARY_REPO_MAX_ENTRIES) bag.entries.length = DIARY_REPO_MAX_ENTRIES;

  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return {
    ok: true,
    value: record,
    created: !existing,
    sourceVersion: record.sourceVersion,
  };
}

/**
 * Soft-delete (sets deletedAt). Idempotent.
 * @param {string} id
 * @param {{ reason?: string, at?: string }} [meta]
 */
export function deleteDiaryEntry(id, meta = {}) {
  const want = String(id || "").trim();
  if (!want) return { ok: false, reason: "missing_id" };
  const bag = readBag();
  const idx = bag.entries.findIndex((e) => e && String(e.id || e.diaryId) === want);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const prev = bag.entries[idx];
  if (prev.deletedAt) return { ok: true, value: prev, alreadyDeleted: true };
  bag.entries[idx] = {
    ...prev,
    deletedAt: String(meta.at || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    meta: {
      ...(prev.meta && typeof prev.meta === "object" ? prev.meta : {}),
      deleteReason: String(meta.reason || "user_delete"),
    },
  };
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  return { ok: true, value: bag.entries[idx] };
}

/**
 * Patch helpers (pin toggle etc.) — bumps sourceVersion.
 * @param {string} id
 * @param {Partial<object>} patch
 */
export function updateDiaryEntry(id, patch = {}) {
  const existing = getDiaryEntry(id, { includeDeleted: false });
  if (!existing) return { ok: false, reason: "not_found" };
  return saveDiaryEntry({
    ...existing,
    ...patch,
    id: existing.id,
    body: patch.body ?? patch.rawText ?? existing.body,
  });
}

/**
 * Migrate legacy MemPalace diary.memory rows into the repository (idempotent).
 * Safe to run three times — same id is not duplicated; existing rows are left alone unless force.
 *
 * @param {{ force?: boolean, memories?: object[] }} [opts]
 *   force=true re-applies body/title from legacy when id already exists (still one row per id).
 */
export async function migrateLegacyDiaryMemories(opts = {}) {
  const force = opts.force === true;
  const rawList =
    Array.isArray(opts.memories) ? opts.memories : (await getAllRecords("memories")).map(normalizeMemory);
  const legacy = rawList.filter((r) => r && (r.source === "diary.memory" || (Array.isArray(r.tags) && r.tags.includes("diary"))));

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  const ids = [];

  for (const row of legacy) {
    const id = String(row.id || "").trim();
    if (!id) {
      skipped += 1;
      continue;
    }
    const existing = getDiaryEntry(id, { includeDeleted: true });
    if (existing && !force) {
      skipped += 1;
      ids.push(id);
      continue;
    }

    const body = String(row.rawText || row.body || row.text || "").trim();
    if (!body) {
      skipped += 1;
      continue;
    }

    const companionId = String(row.companionId || row.characterId || "").trim();
    const userId = String(row.userId || "local").trim() || "local";
    const title = String(row.title || "").trim() || "未命名日记";
    const styleId = String(row.styleId || "literary").trim() || "literary";
    const diaryDay = String(row.diaryDay || "").trim() || todayDiaryDay();
    const sourceVersion = existing
      ? Number(existing.sourceVersion || existing.revision || 1)
      : Number(row.sourceVersion || row.revision || 1) || 1;

    const record = createDiaryRecordV1({
      id,
      diaryId: id,
      companionId,
      characterId: companionId,
      userId,
      relationshipId: row.relationshipId || relationshipIdFor(userId, companionId),
      diaryDay,
      title,
      body,
      styleId,
      sourceVersion,
      revision: sourceVersion,
      pinned: Boolean(row.pinned),
      weight: row.weight ?? 1.2,
      tags: row.tags,
      role: row.role,
      wing: row.wing || "Relationship",
      room: row.room || "Diary",
      sceneImage: row.sceneImage,
      sceneMediaId: row.sceneMediaId,
      visibility: row.visibility || "private",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt || new Date().toISOString(),
      deletedAt: null,
      migratedFrom: {
        source: "diary.memory",
        legacyId: id,
        migratedAt: new Date().toISOString(),
      },
    });

    const bag = readBag();
    const idx = bag.entries.findIndex((e) => e && String(e.id || e.diaryId) === id);
    if (idx >= 0) {
      // Preserve higher sourceVersion if repository already advanced past legacy.
      const keepVersion = Math.max(
        Number(bag.entries[idx].sourceVersion || 1),
        Number(record.sourceVersion || 1),
      );
      bag.entries[idx] = {
        ...record,
        sourceVersion: keepVersion,
        revision: keepVersion,
        createdAt: bag.entries[idx].createdAt || record.createdAt,
      };
      updated += 1;
    } else {
      bag.entries.unshift(record);
      imported += 1;
    }
    writeBag(bag);
    ids.push(id);
  }

  const total = listDiaryEntries({ includeDeleted: true }).length;
  return {
    ok: true,
    scanned: legacy.length,
    imported,
    updated,
    skipped,
    total,
    ids: [...new Set(ids)],
  };
}

export { diaryRecordToLegacyMemoryShape, createDiaryRecordV1, validateDiaryRecordV1 };
