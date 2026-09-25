import { emitAppEvent } from "../world/app-events.js";
import { fileDrawer } from "../memory/palace/drawer.js";
import { deleteMemory, updateMemory } from "../memory/rag.js";
import { filterRowsByCompanionScope } from "../memory/companion-scope.js";
import { getAllRecords, normalizeMemory } from "../storage/db.js";
import { isFeatureEnabled } from "../features/flags.js";
import {
  saveDiaryEntry,
  getDiaryEntry,
  listDiaryEntries,
  deleteDiaryEntry,
  updateDiaryEntry,
  migrateLegacyDiaryMemories,
  diaryRecordToLegacyMemoryShape,
} from "./repository.js";
import {
  ensureDiaryAdapterRegistered,
  projectDiarySave,
  projectDiaryMemoryIndex,
  getDiarySourceRef,
  diaryFeatureMemoryAdapter,
} from "../memory/adapters/diary.js";
import { todayDiaryDay } from "./fields.js";
import { getDiaryStyle } from "./styles.js";

export { todayDiaryDay };
export { migrateLegacyDiaryMemories };

function diaryTagsForStyle(styleId) {
  return getDiaryStyle(styleId).tags;
}

function useDiaryRepository() {
  try {
    return isFeatureEnabled("diaryRepositoryV1") === true;
  } catch {
    return false;
  }
}

async function listLegacyDiaries(companionId = "") {
  const records = (await getAllRecords("memories")).map(normalizeMemory);
  const cid = String(companionId || "").trim();
  const diaries = records.filter((record) => record.source === "diary.memory");
  const scoped = cid
    ? filterRowsByCompanionScope(diaries, { companionId: cid, userId: "local", allowGlobal: false })
    : diaries;
  return scoped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getMemoryById(id) {
  if (!id) return null;
  const records = await getAllRecords("memories");
  const target = records.find((record) => record.id === id);
  return target ? normalizeMemory(target) : null;
}

async function getLegacyDiaryById(id) {
  const normalized = await getMemoryById(id);
  if (!normalized) return null;
  if (normalized.source && normalized.source !== "diary.memory") return null;
  return normalized;
}

/**
 * Dual-read when diaryRepositoryV1 is on: prefer Repository, fall back to legacy memories.
 */
export async function listDiaries(companionId = "") {
  if (!useDiaryRepository()) {
    return listLegacyDiaries(companionId);
  }

  const cid = String(companionId || "").trim();
  const repoRows = listDiaryEntries({ companionId: cid, userId: "local" }).map(
    diaryRecordToLegacyMemoryShape,
  );
  const seen = new Set(repoRows.map((r) => r.id));
  const legacy = await listLegacyDiaries(companionId);
  const merged = [...repoRows];
  for (const row of legacy) {
    if (seen.has(row.id)) continue;
    merged.push(row);
    seen.add(row.id);
  }
  return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getDiaryById(id) {
  if (!id) return null;
  if (useDiaryRepository()) {
    const fromRepo = getDiaryEntry(id);
    if (fromRepo) return diaryRecordToLegacyMemoryShape(fromRepo);
    // Dual-read fallback for unmigrated diary.memory rows only.
    return getLegacyDiaryById(id);
  }
  // Flag off: preserve prior behavior (lookup by id in memories).
  return getMemoryById(id);
}

export async function getDiaryForDay(diaryDay, companionId = "") {
  if (!diaryDay) return null;
  const diaries = await listDiaries(companionId);
  return diaries.find((record) => record.diaryDay === diaryDay) || null;
}

export async function getTodayDiary(companionId = "") {
  return getDiaryForDay(todayDiaryDay(), companionId);
}

/**
 * Backfill the shared searchable index for repository-authoritative diaries.
 * This is idempotent and keeps the diary repository as the only source of
 * truth; it merely repairs rows written before Palace projection was enabled.
 */
export async function ensureDiaryMemoryProjection(companionId = "") {
  if (!useDiaryRepository()) return { ok: true, projected: 0, skipped: true };
  const cid = String(companionId || "").trim();
  if (!cid) return { ok: true, projected: 0, skipped: true };
  const rows = listDiaryEntries({ companionId: cid, userId: "local" });
  const indexed = (await getAllRecords("memories"))
    .map(normalizeMemory)
    .filter((record) => record.companionId === cid && record.sourceType === "diary");
  const indexedBySource = new Map(
    indexed.map((record) => [
      String(record.sourceId || record.sourceRef?.sourceId || "").trim(),
      record,
    ]),
  );
  let projected = 0;
  for (const row of rows) {
    try {
      const sourceRef = getDiarySourceRef(row);
      const prior = indexedBySource.get(String(row.id || "").trim());
      if (prior && sourceRef && prior.contentHash === sourceRef.contentHash) continue;
      const result = await projectDiaryMemoryIndex(row, {
        companionId: cid,
        characterId: cid,
        userId: "local",
        relationshipId: row.relationshipId,
      });
      if (result?.ok !== false) projected += 1;
    } catch (error) {
      console.warn("[yueqi.diary] memory index backfill failed", error);
    }
  }
  return { ok: true, projected };
}

async function deliverDiaryArtifact(recordId, scopeCompanion, payload, text) {
  if (!scopeCompanion) return;
  try {
    const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../artifacts/index.js");
    const art = upsertArtifact({
      artifactId: `diary:${recordId}`,
      companionId: scopeCompanion,
      type: "diary",
      status: "ready",
      title: payload.title,
      previewText: text.slice(0, 120),
      resourceUrl: `diary://${recordId}`,
      deepLink: artifactDeepLink(`diary:${recordId}`) || `yueqi://artifact/diary:${recordId}`,
      readyAt: new Date().toISOString(),
      meta: { diaryId: recordId, diaryDay: payload.diaryDay, styleId: payload.styleId },
    });
    if (art.ok) {
      enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel: "phone_today",
        companionId: scopeCompanion,
      });
      enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel: "phone_badge",
        companionId: scopeCompanion,
      });
      enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel: "pop",
        companionId: scopeCompanion,
      });
      enqueueDelivery({
        artifactId: art.artifact.artifactId,
        channel: "system_notification",
        companionId: scopeCompanion,
      });
      if (typeof document !== "undefined") {
        document.dispatchEvent(
          new CustomEvent("yueqi:diary-saved", {
            detail: {
              diaryId: recordId,
              artifactId: art.artifact.artifactId,
              companionId: scopeCompanion,
              deepLink: art.artifact.deepLink,
            },
          }),
        );
      }
    }
  } catch (error) {
    console.warn("[yueqi.artifact] diary project failed", error);
  }

  try {
    if (isFeatureEnabled("relationshipContinuityV1")) {
      const { refreshRelationshipContinuity } = await import("../relationship/index.js");
      void refreshRelationshipContinuity({
        companionId: scopeCompanion,
        userId: "local",
      });
    }
  } catch (error) {
    console.warn("[yueqi.relationship] diary continuity refresh failed", error);
  }
}

/**
 * Create or update a diary. Same diaryDay updates the existing row (keeps id).
 * When diaryRepositoryV1 is ON: Repository is authority; Palace/Timeline via adapter only.
 * When OFF: legacy fileDrawer / memories path (unchanged).
 */
export async function saveDiary({
  title,
  body,
  rawText,
  styleId = "literary",
  diaryDay = todayDiaryDay(),
  pinned,
  id,
  roleName = "角色",
  weight,
  tags,
  companionId = "",
  characterId = "",
  sceneImage,
  sceneMediaId,
  userId = "local",
  relationshipId = "",
}) {
  const text = (body ?? rawText ?? "").trim();
  if (!text) throw new Error("diary_body_required");

  let scopeCompanion = String(companionId || characterId || "").trim();
  if (!scopeCompanion) {
    try {
      const { getActiveCharacterId } = await import("../characters/store.js");
      scopeCompanion = String(getActiveCharacterId() || "").trim();
    } catch {
      /* optional */
    }
  }

  if (useDiaryRepository()) {
    const byId = id ? await getDiaryById(id) : null;
    const byDay = !byId ? await getDiaryForDay(diaryDay, scopeCompanion) : null;
    const existing = byId || byDay;
    if (!scopeCompanion) {
      scopeCompanion = String(existing?.companionId || existing?.characterId || "").trim();
    }

    const result = saveDiaryEntry({
      id: id || existing?.id,
      title,
      body: text,
      styleId,
      diaryDay: existing?.diaryDay || diaryDay,
      pinned,
      weight,
      tags: tags ?? diaryTagsForStyle(styleId),
      role: roleName,
      companionId: scopeCompanion,
      characterId: scopeCompanion,
      userId: String(userId || existing?.userId || "local").trim() || "local",
      relationshipId: relationshipId || existing?.relationshipId || "",
      sceneImage,
      sceneMediaId,
    });
    if (!result.ok) {
      throw new Error(result.reason || "diary_save_failed");
    }

    const record = result.value;
    const recordId = record.id;
    ensureDiaryAdapterRegistered();
    try {
      await projectDiarySave(record, { created: result.created === true });
    } catch (error) {
      console.warn("[yueqi.diary] projection failed", error);
    }

    if (result.created) {
      emitAppEvent("diary.created", {
        appId: "diary",
        diaryId: recordId,
        diaryDay: record.diaryDay,
        title: record.title,
      });
    }

    await deliverDiaryArtifact(
      recordId,
      scopeCompanion,
      { title: record.title, diaryDay: record.diaryDay, styleId: record.styleId },
      text,
    );

    return diaryRecordToLegacyMemoryShape(record);
  }

  // --- Legacy path (flag off): MemPalace memories remain source of truth ---
  const byId = id ? await getDiaryById(id) : null;
  const byDay = !byId ? await getDiaryForDay(diaryDay, scopeCompanion) : null;
  const existing = byId || byDay;
  const recordId = id || existing?.id || `diary-${Date.now()}`;
  if (!scopeCompanion) {
    scopeCompanion = String(existing?.companionId || existing?.characterId || "").trim();
  }

  const payload = {
    id: recordId,
    title: title?.trim() || existing?.title || "未命名日记",
    rawText: text,
    source: "diary.memory",
    styleId,
    diaryDay: existing?.diaryDay || diaryDay,
    weight: weight ?? existing?.weight ?? 1.2,
    role: roleName,
    wing: "Relationship",
    room: "Diary",
    tags: tags ?? diaryTagsForStyle(styleId),
    pinned: pinned !== undefined ? pinned : (existing?.pinned ?? false),
    searchable: true,
    companionId: scopeCompanion,
    characterId: scopeCompanion,
    sceneImage: sceneImage !== undefined ? String(sceneImage || "").trim() : (existing?.sceneImage || ""),
    sceneMediaId: sceneMediaId !== undefined ? String(sceneMediaId || "").trim() : (existing?.sceneMediaId || ""),
  };

  const saved = existing
    ? await updateMemory(recordId, payload)
    : await fileDrawer(payload);

  if (!existing) {
    emitAppEvent("diary.created", {
      appId: "diary",
      diaryId: recordId,
      diaryDay,
      title: payload.title,
    });
  }

  await deliverDiaryArtifact(recordId, scopeCompanion, payload, text);

  return saved;
}

export async function toggleDiaryPin(id, pinned) {
  const record = await getDiaryById(id);
  if (!record) throw new Error("diary_not_found");
  const nextPinned = typeof pinned === "boolean" ? pinned : !record.pinned;

  if (useDiaryRepository()) {
    const fromRepo = getDiaryEntry(id);
    if (fromRepo) {
      const result = updateDiaryEntry(id, { pinned: nextPinned });
      if (!result.ok) throw new Error(result.reason || "diary_update_failed");
      try {
        await projectDiarySave(result.value, { created: false });
      } catch (error) {
        console.warn("[yueqi.diary] pin projection failed", error);
      }
      return diaryRecordToLegacyMemoryShape(result.value);
    }
  }

  return updateMemory(id, { pinned: nextPinned });
}

export async function deleteDiaryRecord(id) {
  if (useDiaryRepository()) {
    const fromRepo = getDiaryEntry(id, { includeDeleted: true });
    if (fromRepo) {
      deleteDiaryEntry(id);
      try {
        ensureDiaryAdapterRegistered();
        await diaryFeatureMemoryAdapter.handleSourceTombstone(
          { id, sourceId: id, companionId: fromRepo.companionId, userId: fromRepo.userId },
          { companionId: fromRepo.companionId, userId: fromRepo.userId },
        );
      } catch (error) {
        console.warn("[yueqi.diary] tombstone projection failed", error);
      }
    }
    // Best-effort: remove legacy twin if present (does not resurrect authority).
    try {
      await deleteMemory(id);
    } catch {
      /* ignore missing legacy */
    }
    return { ok: true, id };
  }
  return deleteMemory(id);
}
