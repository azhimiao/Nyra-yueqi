/**
 * DiaryRecord V1 — authoritative diary document schema.
 */

import { hashPalaceContent } from "../memory/projection/palace-index-contract.js";
import { relationshipIdFor } from "../memory/companion-scope.js";
import { diaryDayFromIso, todayDiaryDay } from "./fields.js";

export const DIARY_RECORD_SCHEMA_VERSION = 1;

export const DIARY_VISIBILITY = Object.freeze(["shared", "private", "sensitive", "forbidden"]);

/**
 * @param {object} raw
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateDiaryRecordV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== DIARY_RECORD_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!String(raw.id || raw.diaryId || "").trim()) errors.push("id");
  if (!String(raw.companionId || "").trim()) errors.push("companionId");
  if (!String(raw.userId || "").trim()) errors.push("userId");
  if (!String(raw.body || "").trim()) errors.push("body");
  if (!String(raw.diaryDay || "").trim()) errors.push("diaryDay");
  const ver = Number(raw.sourceVersion ?? raw.revision);
  if (!Number.isFinite(ver) || ver < 1) errors.push("sourceVersion");
  if (raw.visibility && !DIARY_VISIBILITY.includes(raw.visibility)) errors.push("visibility");
  if (raw.deletedAt != null && typeof raw.deletedAt !== "string") errors.push("deletedAt");
  return { ok: errors.length === 0, errors };
}

/**
 * Deterministic content hash for SourceRef / projection invalidation.
 * @param {{ title?: string, body?: string, styleId?: string, diaryDay?: string }} parts
 */
export function hashDiaryContent(parts = {}) {
  const seed = [
    String(parts.title || "").trim(),
    String(parts.body || "").trim(),
    String(parts.styleId || "").trim(),
    String(parts.diaryDay || "").trim(),
  ].join("\n");
  return hashPalaceContent(seed);
}

/**
 * Normalize / create a DiaryRecord V1.
 * @param {Partial<object>} input
 */
export function createDiaryRecordV1(input = {}) {
  const now = new Date().toISOString();
  const companionId = String(input.companionId || input.characterId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  const body = String(input.body ?? input.rawText ?? "").trim();
  const title = String(input.title || "").trim() || "未命名日记";
  const diaryDay = String(input.diaryDay || "").trim() || diaryDayFromIso(input.createdAt) || todayDiaryDay();
  const styleId = String(input.styleId || "literary").trim() || "literary";
  const sourceVersion = Number(input.sourceVersion ?? input.revision);
  const id = String(input.id || input.diaryId || "").trim();
  const contentHash =
    String(input.contentHash || "").trim() || hashDiaryContent({ title, body, styleId, diaryDay });

  return {
    schemaVersion: DIARY_RECORD_SCHEMA_VERSION,
    id,
    diaryId: id,
    companionId,
    characterId: companionId,
    relationshipId:
      String(input.relationshipId || "").trim() || relationshipIdFor(userId, companionId),
    userId,
    realityNamespace: String(input.realityNamespace || "reality").trim() || "reality",
    diaryDay,
    title,
    body,
    styleId,
    sourceVersion: Number.isFinite(sourceVersion) && sourceVersion >= 1 ? sourceVersion : 1,
    revision: Number.isFinite(sourceVersion) && sourceVersion >= 1 ? sourceVersion : 1,
    contentHash,
    generatedFromRefs: Array.isArray(input.generatedFromRefs)
      ? input.generatedFromRefs.map((r) => String(r))
      : [],
    visibility: DIARY_VISIBILITY.includes(input.visibility) ? input.visibility : "private",
    pinned: Boolean(input.pinned),
    weight: Number(input.weight ?? 1.2),
    role: String(input.role || input.roleName || "角色").trim() || "角色",
    wing: String(input.wing || "Relationship").trim() || "Relationship",
    room: String(input.room || "Diary").trim() || "Diary",
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t)) : [],
    sceneImage: String(input.sceneImage || "").trim(),
    sceneMediaId: String(input.sceneMediaId || "").trim(),
    meta: input.meta && typeof input.meta === "object" ? { ...input.meta } : {},
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
    deletedAt: input.deletedAt ? String(input.deletedAt) : null,
    migratedFrom: input.migratedFrom && typeof input.migratedFrom === "object" ? input.migratedFrom : null,
  };
}

/**
 * UI / dual-read shape compatible with legacy diary.memory normalizeMemory rows.
 * @param {object} record — DiaryRecord V1
 */
export function diaryRecordToLegacyMemoryShape(record) {
  if (!record || typeof record !== "object") return null;
  const id = String(record.id || record.diaryId || "").trim();
  const body = String(record.body || "").trim();
  return {
    id,
    title: String(record.title || "").trim() || "未命名日记",
    rawText: body,
    body,
    source: "diary.memory",
    styleId: record.styleId || "literary",
    diaryDay: record.diaryDay || "",
    weight: Number(record.weight ?? 1.2),
    role: record.role || "角色",
    wing: record.wing || "Relationship",
    room: record.room || "Diary",
    tags: Array.isArray(record.tags) ? [...record.tags] : [],
    pinned: Boolean(record.pinned),
    searchable: true,
    companionId: String(record.companionId || "").trim(),
    characterId: String(record.characterId || record.companionId || "").trim(),
    relationshipId: String(record.relationshipId || "").trim(),
    userId: String(record.userId || "local").trim() || "local",
    sceneImage: String(record.sceneImage || "").trim(),
    sceneMediaId: String(record.sceneMediaId || "").trim(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceVersion: Number(record.sourceVersion || record.revision || 1),
    revision: Number(record.revision || record.sourceVersion || 1),
    contentHash: record.contentHash || "",
    authority: "diary_repository",
    deletedAt: record.deletedAt || null,
  };
}
