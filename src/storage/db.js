import {
  EMBEDDING_SIZE,
  LOCAL_KEYS,
  MEMORY_DB,
  MEMORY_DB_VERSION,
} from "../constants.js";
import { t } from "../i18n/index.js";
import { hashToken, tokenize } from "../lib/utils.js";
import { withDiaryFields } from "../diary/fields.js";
import { isNativePlatform } from "../platform/runtime.js";
import { isMediaBlob, putMediaBlob, serializeMediaRecord } from "./media-blobs.js";
import { createLocalStorageJournalBackend } from "./journal.js";
import {
  createIndexedDbBackend,
  runRepositoryTransaction as executeRepositoryTransaction,
} from "./transaction.js";

let memoryDb = null;
let sqliteStore = null;
let storageMode = "indexeddb";

const REQUIRED_STORES = [
  "memories",
  "worldbook",
  "settings",
  "media",
  "messages",
  "conversations",
  "palace_kg",
  "characters",
  "sidewrite_payloads",
  "preferences",
  "openings",
  "onboarding",
  "tool_runs",
];

export function getStorageMode() {
  return storageMode;
}

export function embedText(text) {
  const vector = new Array(EMBEDDING_SIZE).fill(0);
  tokenize(text).forEach((token) => {
    vector[hashToken(token) % EMBEDDING_SIZE] += 1;
  });
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export function normalizeMemory(record) {
  const rawText = record.rawText || record.text || "";
  const source = record.source || "chat.memory";
  const tags = Array.isArray(record.tags)
    ? record.tags
    : String(record.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
  const diaryFields = withDiaryFields({ ...record, source, tags });
  return {
    id: record.id || `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: record.title || "",
    rawText,
    source,
    weight: Number(record.weight ?? 1),
    createdAt: record.createdAt || new Date().toISOString(),
    role: record.role || t("character.fallbackName"),
    wing: record.wing || "Relationship",
    room: record.room || "General",
    hall: record.hall || "",
    drawerId: record.drawerId || record.id || "",
    parentDrawerId: record.parentDrawerId || "",
    chunkIndex: record.chunkIndex ?? null,
    chunkTotal: record.chunkTotal ?? null,
    tags,
    styleId: diaryFields.styleId,
    diaryDay: diaryFields.diaryDay,
    pinned: Boolean(record.pinned),
    searchable: record.searchable !== false,
    embedding: record.embedding || embedText(rawText),
    companionId: String(record.companionId || record.characterId || "").trim(),
    characterId: String(record.characterId || record.companionId || "").trim(),
    sceneImage: String(record.sceneImage || record.coverUrl || record.imageUrl || "").trim(),
    sceneMediaId: String(record.sceneMediaId || "").trim(),
    // W5 palace projection provenance (optional; preserved when present)
    sourceType: record.sourceType ? String(record.sourceType).trim() : undefined,
    sourceId: record.sourceId ? String(record.sourceId).trim() : undefined,
    contentHash: record.contentHash ? String(record.contentHash).trim() : undefined,
    projectionVersion: record.projectionVersion != null ? Number(record.projectionVersion) : undefined,
    indexedAt: record.indexedAt ? String(record.indexedAt).trim() : undefined,
    authority: record.authority ? String(record.authority).trim() : undefined,
    invalidatedAt: record.invalidatedAt ? String(record.invalidatedAt).trim() : null,
    // Unified-memory M1 projection fields (passthrough; optional)
    sourceRef:
      record.sourceRef && typeof record.sourceRef === "object" ? record.sourceRef : undefined,
    projectionKind: record.projectionKind ? String(record.projectionKind).trim() : undefined,
    stale: typeof record.stale === "boolean" ? record.stale : undefined,
    tombstone:
      record.tombstone === null
        ? null
        : record.tombstone && typeof record.tombstone === "object"
          ? record.tombstone
          : undefined,
    // Unified-memory M3 reading chunk fields (passthrough; optional)
    bookId: record.bookId ? String(record.bookId).trim() : undefined,
    chapterId: record.chapterId ? String(record.chapterId).trim() : undefined,
    sourceVersion:
      record.sourceVersion != null && Number.isFinite(Number(record.sourceVersion))
        ? Number(record.sourceVersion)
        : undefined,
  };
}

function fallbackKey(storeName) {
  if (storeName === "worldbook") return LOCAL_KEYS.worldKey;
  if (storeName === "media") return LOCAL_KEYS.mediaKey;
  if (storeName === "messages") return LOCAL_KEYS.chatMessagesKey;
  if (storeName === "palace_kg") return LOCAL_KEYS.palaceKgKey;
  if (storeName === "conversations") return `${LOCAL_KEYS.chatMessagesKey}.conversations`;
  if (storeName === "settings") return LOCAL_KEYS.settingsKey;
  if (storeName === "characters") return LOCAL_KEYS.charactersKey;
  if (storeName === "sidewrite_payloads") return "yueqi.sidewrite.payloads.v1";
  if (storeName === "preferences") return "yueqi.companion.preferences.v2";
  if (storeName === "tool_runs") return "yueqi.toolRuns.v1";
  if (storeName === "onboarding") return "yueqi.onboarding.markers.v2";
  return LOCAL_KEYS.memoryKey;
}

function transactionFallbackKey(storeName) {
  if (storeName === "openings") return LOCAL_KEYS.chatMessagesKey;
  return fallbackKey(storeName);
}

function fallbackRead(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function fallbackWrite(key, records) {
  window.localStorage.setItem(key, JSON.stringify(records));
}

function ensureStores(db) {
  if (!db.objectStoreNames.contains("memories")) {
    const memories = db.createObjectStore("memories", { keyPath: "id" });
    memories.createIndex("source", "source", { unique: false });
    memories.createIndex("wing", "wing", { unique: false });
    memories.createIndex("room", "room", { unique: false });
    memories.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains("worldbook")) {
    db.createObjectStore("worldbook", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("media")) {
    db.createObjectStore("media", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("messages")) {
    const messages = db.createObjectStore("messages", { keyPath: "id" });
    messages.createIndex("sessionId", "sessionId", { unique: false });
    messages.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains("conversations")) {
    db.createObjectStore("conversations", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("palace_kg")) {
    const kg = db.createObjectStore("palace_kg", { keyPath: "id" });
    kg.createIndex("subject", "subject", { unique: false });
    kg.createIndex("predicate", "predicate", { unique: false });
  }
  if (!db.objectStoreNames.contains("characters")) {
    db.createObjectStore("characters", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("sidewrite_payloads")) {
    db.createObjectStore("sidewrite_payloads", { keyPath: "id" });
  }
  // Repository-backed stores. These used to exist only in the localStorage
  // journal fallback, which made First Light fail on a healthy IndexedDB.
  for (const storeName of ["preferences", "openings", "onboarding", "tool_runs"]) {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, { keyPath: "id" });
    }
  }
}

function hasAllRequiredStores(db) {
  return REQUIRED_STORES.every((name) => db.objectStoreNames.contains(name));
}

function storeMissingError(error) {
  const message = String(error?.message || error || "");
  return /object stores was not found|NotFoundError/i.test(message);
}

function deleteIndexedDb(name) {
  return new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve();
      return;
    }
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function openIndexedDbOnce() {
  if (!("indexedDB" in window)) {
    storageMode = "localStorage";
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(MEMORY_DB, MEMORY_DB_VERSION);

    request.onupgradeneeded = () => {
      ensureStores(request.result);
    };

    request.onsuccess = () => {
      const db = request.result;
      resolve(db);
    };
    request.onerror = () => {
      storageMode = "localStorage";
      reject(request.error);
    };
  });
}

async function openIndexedDb() {
  let db = await openIndexedDbOnce();
  if (!db) return null;

  if (!hasAllRequiredStores(db)) {
    console.warn("IndexedDB missing object stores; rebuilding local database");
    try {
      db.close();
    } catch {
      /* ignore */
    }
    memoryDb = null;
    await deleteIndexedDb(MEMORY_DB);
    db = await openIndexedDbOnce();
  }

  if (!db || !hasAllRequiredStores(db)) {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    memoryDb = null;
    storageMode = "localStorage";
    return null;
  }

  memoryDb = db;
  storageMode = "indexedDB";
  memoryDb.onversionchange = () => {
    try {
      memoryDb?.close();
    } catch {
      /* ignore */
    }
    memoryDb = null;
  };
  return memoryDb;
}

export async function searchMemoriesFts(query, options = {}) {
  if (sqliteStore?.searchMemoriesFts) {
    return sqliteStore.searchMemoriesFts(query, options);
  }
  return [];
}

export async function openMemoryDb() {
  if (sqliteStore) return sqliteStore;
  if (memoryDb && hasAllRequiredStores(memoryDb)) return memoryDb;

  if (isNativePlatform()) {
    try {
      const { openSqliteStore } = await import("./sqlite-adapter.js");
      sqliteStore = await openSqliteStore();
      storageMode = "sqlite";
      memoryDb = null;
      return sqliteStore;
    } catch (error) {
      console.warn("SQLite 初始化失败，回退 IndexedDB", error);
    }
  }

  sqliteStore = null;
  try {
    return await openIndexedDb();
  } catch (error) {
    console.warn("IndexedDB 初始化失败，回退 localStorage", error);
    memoryDb = null;
    storageMode = "localStorage";
    return null;
  }
}

export async function runRepositoryTransaction(input, { backend } = {}) {
  if (backend) return executeRepositoryTransaction(input, { backend });

  if (!sqliteStore && !memoryDb && storageMode !== "localStorage") {
    await openMemoryDb();
  }
  if (sqliteStore?.runTransaction) {
    return executeRepositoryTransaction(input, { backend: sqliteStore });
  }
  if (memoryDb) {
    return executeRepositoryTransaction(input, {
      backend: createIndexedDbBackend(memoryDb),
    });
  }

  const storage = typeof window !== "undefined" ? window.localStorage : null;
  if (!storage) {
    return executeRepositoryTransaction(input, { backend: null });
  }
  return executeRepositoryTransaction(input, {
    backend: createLocalStorageJournalBackend({
      storage,
      keyForStore: transactionFallbackKey,
    }),
  });
}

function useFallbackWrite(storeName, record) {
  const key = fallbackKey(storeName);
  const records = fallbackRead(key);
  const stored = storeName === "media" ? serializeMediaRecord(record) : record;
  const next = records.filter((item) => item.id !== stored.id);
  next.push(stored);
  fallbackWrite(key, next);
  return record;
}

async function persistMediaSidecar(record) {
  if (!record || !isMediaBlob(record.blob)) return record;
  try {
    await putMediaBlob(record.id, record.blob);
  } catch (error) {
    console.warn("[yueqi.media] blob sidecar write failed", error);
  }
  return record;
}

export function storeRecord(storeName, record) {
  if (storeName === "media" && isMediaBlob(record?.blob)) {
    return persistMediaSidecar(record).then((saved) => storeRecordAfterSidecar(storeName, saved));
  }
  return storeRecordAfterSidecar(storeName, record);
}

function storeRecordAfterSidecar(storeName, record) {
  if (sqliteStore) {
    return sqliteStore.put(storeName, storeName === "media" ? serializeMediaRecord(record) : record);
  }

  if (!memoryDb || !memoryDb.objectStoreNames.contains(storeName)) {
    return Promise.resolve(useFallbackWrite(storeName, record));
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = memoryDb.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(record);
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => {
        if (storeMissingError(transaction.error)) {
          resolve(useFallbackWrite(storeName, record));
          return;
        }
        reject(transaction.error);
      };
    } catch (error) {
      if (storeMissingError(error)) {
        resolve(useFallbackWrite(storeName, record));
        return;
      }
      reject(error);
    }
  });
}

export function getAllRecords(storeName) {
  if (sqliteStore) {
    return sqliteStore.getAll(storeName);
  }

  if (!memoryDb || !memoryDb.objectStoreNames.contains(storeName)) {
    return Promise.resolve(fallbackRead(fallbackKey(storeName)));
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = memoryDb.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        if (storeMissingError(request.error) || storeMissingError(transaction.error)) {
          resolve(fallbackRead(fallbackKey(storeName)));
          return;
        }
        reject(request.error);
      };
    } catch (error) {
      if (storeMissingError(error)) {
        resolve(fallbackRead(fallbackKey(storeName)));
        return;
      }
      reject(error);
    }
  });
}

export function clearStore(storeName) {
  if (sqliteStore) {
    return sqliteStore.clear(storeName);
  }

  if (!memoryDb || !memoryDb.objectStoreNames.contains(storeName)) {
    fallbackWrite(fallbackKey(storeName), []);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = memoryDb.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        if (storeMissingError(transaction.error)) {
          fallbackWrite(fallbackKey(storeName), []);
          resolve();
          return;
        }
        reject(transaction.error);
      };
    } catch (error) {
      if (storeMissingError(error)) {
        fallbackWrite(fallbackKey(storeName), []);
        resolve();
        return;
      }
      reject(error);
    }
  });
}

export function deleteRecord(storeName, id) {
  if (sqliteStore) {
    return sqliteStore.delete(storeName, id);
  }

  if (!memoryDb || !memoryDb.objectStoreNames.contains(storeName)) {
    const key = fallbackKey(storeName);
    fallbackWrite(
      key,
      fallbackRead(key).filter((item) => item.id !== id)
    );
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = memoryDb.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        if (storeMissingError(transaction.error)) {
          const key = fallbackKey(storeName);
          fallbackWrite(
            key,
            fallbackRead(key).filter((item) => item.id !== id)
          );
          resolve();
          return;
        }
        reject(transaction.error);
      };
    } catch (error) {
      if (storeMissingError(error)) {
        const key = fallbackKey(storeName);
        fallbackWrite(
          key,
          fallbackRead(key).filter((item) => item.id !== id)
        );
        resolve();
        return;
      }
      reject(error);
    }
  });
}

export async function getMessagesBySession(sessionId, limit = 100) {
  const records = await getAllRecords("messages");
  return records
    .filter((record) => record.sessionId === sessionId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-limit);
}

export async function countMessagesBySession(sessionId) {
  const records = await getAllRecords("messages");
  return records.filter((record) => record.sessionId === sessionId).length;
}

export async function saveChatMessage(message) {
  const record = {
    id: message.id || `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt || new Date().toISOString(),
    metadata: message.metadata || {},
  };
  await storeRecord("messages", record);
  try {
    document.dispatchEvent(new CustomEvent("yueqi:chat-message", { detail: { message: record } }));
  } catch {
    // Storage is also used by non-DOM verification scripts.
  }
  return record;
}

export async function ensureDefaultConversation(sessionId) {
  const conversations = await getAllRecords("conversations");
  if (!conversations.some((item) => item.id === sessionId)) {
    await storeRecord("conversations", {
      id: sessionId,
      title: t("chat.defaultConversation"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

export function cosineSimilarity(a = [], b = []) {
  let score = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    score += a[index] * b[index];
  }
  return score;
}

export function ageBoost(createdAt) {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return 0;
  const days = Math.max(0, (Date.now() - then) / 86400000);
  return Math.max(0, 0.18 - days * 0.002);
}

export async function ingestMemory(record) {
  const normalized = normalizeMemory(record);
  await storeRecord("memories", normalized);
  return normalized;
}
