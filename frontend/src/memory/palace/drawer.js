import { ingestMemory, normalizeMemory } from "../../storage/db.js";
import { getPalaceSettings } from "../../settings/preferences.js";
import { isPalaceProjectionOnlyEnabled } from "./source-validator.js";
import { splitDrawerText, shouldChunkText } from "./chunk.js";
import { embedPalaceText } from "./embeddings.js";
import { extractKgFromText } from "./kg.js";

/**
 * Under `palaceProjectionOnlyV1`, business modules must not treat fileDrawer as
 * authority. Writes require allowProjectionWrite and/or projectionKind/sourceRef.
 * @param {object} params
 * @param {{ allowProjectionWrite?: boolean, meta?: object, onBlocked?: "throw"|"noop" }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assertPalaceProjectionWriteAllowed(params = {}, opts = {}) {
  if (!isPalaceProjectionOnlyEnabled()) return { ok: true };
  const meta = opts.meta && typeof opts.meta === "object" ? opts.meta : {};
  const allow =
    opts.allowProjectionWrite === true ||
    params.allowProjectionWrite === true ||
    Boolean(params.projectionKind) ||
    Boolean(meta.projectionKind) ||
    Boolean(params.sourceRef) ||
    Boolean(meta.sourceRef);
  if (allow) return { ok: true };
  return { ok: false, reason: "palace_projection_only_direct_write_blocked" };
}

const HALL_BY_SOURCE = {
  "diary.memory": "diary",
  "chat.memory": "conversations",
  "book.chunk": "reading",
  "worldbook.memory": "world",
};

const ROOM_BY_SOURCE = {
  "diary.memory": "Diary",
  "book.chunk": "Reading",
  "worldbook.memory": "Worldbook",
};

export function inferHall(source) {
  return HALL_BY_SOURCE[source] || "conversations";
}

export function defaultRoom(source, room) {
  if (room) return room;
  return ROOM_BY_SOURCE[source] || "General";
}

async function fileSingleDrawer({
  rawText,
  wing = "Relationship",
  room,
  source = "palace.drawer",
  title = "",
  weight = 1,
  role = "",
  tags = [],
  pinned = false,
  searchable = true,
  styleId = "",
  diaryDay = "",
  id,
  createdAt,
  drawerId,
  parentDrawerId = "",
  chunkIndex = null,
  chunkTotal = null,
  companionId = "",
  characterId = "",
  sceneImage = "",
  sceneMediaId = "",
  // Unified-memory M3+ projection fields (optional passthrough)
  sourceRef,
  sourceType,
  sourceId,
  contentHash,
  projectionKind,
  projectionVersion,
  authority,
  stale,
  tombstone,
  indexedAt,
  bookId,
  chapterId,
  sourceVersion,
}) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const resolvedRoom = defaultRoom(source, room);
  const hall = inferHall(source);
  const logicalDrawerId = drawerId || id || `drawer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const normalized = normalizeMemory({
    id: id || logicalDrawerId,
    title,
    rawText: text,
    source,
    weight,
    role,
    wing,
    room: resolvedRoom,
    hall,
    drawerId: logicalDrawerId,
    parentDrawerId: parentDrawerId || "",
    chunkIndex,
    chunkTotal,
    tags: [...tags, "palace", hall],
    pinned,
    searchable,
    styleId,
    diaryDay,
    createdAt,
    embedding: embedPalaceText(text),
    companionId: String(companionId || characterId || "").trim(),
    characterId: String(companionId || characterId || "").trim(),
    sceneImage: String(sceneImage || "").trim(),
    sceneMediaId: String(sceneMediaId || "").trim(),
    sourceRef,
    sourceType,
    sourceId,
    contentHash,
    projectionKind,
    projectionVersion,
    authority,
    stale,
    tombstone,
    indexedAt,
    bookId,
    chapterId,
    sourceVersion,
  });

  const saved = await ingestMemory(normalized);
  if (chunkIndex == null || chunkIndex === 0) {
    await extractKgFromText(text, saved.drawerId || saved.id);
  }
  return saved;
}

/**
 * File verbatim text into the palace (stored as searchable drawer chunks in memories).
 * When `palaceProjectionOnlyV1` is on, requires projection write permission
 * (`allowProjectionWrite` / `projectionKind` / `sourceRef`). Direct business writes
 * throw by default; pass `onBlocked: "noop"` to warn and skip.
 *
 * @param {object} params
 * @param {{ allowProjectionWrite?: boolean, meta?: object, onBlocked?: "throw"|"noop" }} [opts]
 */
export async function fileDrawer(params = {}, opts = {}) {
  const text = String(params.rawText || "").trim();
  if (!text) return null;

  const gate = assertPalaceProjectionWriteAllowed(params, opts);
  if (!gate.ok) {
    const mode = opts.onBlocked || params.onBlocked || "throw";
    console.warn(
      "[yueqi.palace] fileDrawer blocked under palaceProjectionOnlyV1 — pass allowProjectionWrite or projectionKind/sourceRef",
      { source: params.source, reason: gate.reason },
    );
    if (mode === "noop") return null;
    throw new Error(gate.reason || "palace_projection_only_direct_write_blocked");
  }

  const settings = getPalaceSettings();
  const chunkSize = settings.chunkSize || 900;
  const parentId = params.drawerId || params.id || `drawer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  // Strip control flags so they are not persisted via normalizeMemory
  const {
    allowProjectionWrite: _allow,
    onBlocked: _blocked,
    ...drawerParams
  } = params;

  if (!shouldChunkText(text, chunkSize)) {
    return fileSingleDrawer({ ...drawerParams, rawText: text, drawerId: parentId });
  }

  const chunks = splitDrawerText(text, { chunkSize });
  let last = null;

  for (let index = 0; index < chunks.length; index += 1) {
    last = await fileSingleDrawer({
      ...drawerParams,
      rawText: chunks[index],
      id: `${parentId}-c${index}`,
      drawerId: parentId,
      parentDrawerId: parentId,
      chunkIndex: index,
      chunkTotal: chunks.length,
    });
  }

  return last;
}

export function memoryToDrawer(record) {
  return {
    id: record.drawerId || record.id,
    wing: record.wing || "Relationship",
    room: record.room || "General",
    hall: record.hall || inferHall(record.source),
    source: record.source,
    text: record.rawText,
    title: record.title || "",
    createdAt: record.createdAt,
    pinned: Boolean(record.pinned),
    chunkIndex: record.chunkIndex,
    chunkTotal: record.chunkTotal,
    metadata: {
      styleId: record.styleId,
      diaryDay: record.diaryDay,
      role: record.role,
      weight: record.weight,
      parentDrawerId: record.parentDrawerId,
    },
  };
}
