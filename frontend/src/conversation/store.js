/**
 * Conversation V2 persistence — localStorage `yueqi.conversation.v2`.
 * Atomic writes; consumers receive clones (must not mutate the bag).
 */

import {
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_STORE_KEY,
  createConversationSession,
  validateConversationSession,
} from "./schema.js";
import { ensureConversationMigrated } from "./migration.js";
import { emitConversationEvent, CONVERSATION_EVENTS } from "./events.js";
import { selectLinearTurns } from "./selectors.js";

/**
 * @typedef {{
 *   schemaVersion: number,
 *   sessions: Record<string, import("./schema.js").ConversationSession>,
 *   activeByCharacter: Record<string, string>,
 * }} ConversationBag
 */

/** @type {ConversationBag|null} */
let memoryBag = null;

/** When primary JSON is corrupt and tmp recovery fails, refuse writes. */
let writeBlockedReason = /** @type {string|null} */ (null);

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

let migrationAttempted = false;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setConversationStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
  migrationAttempted = false;
  writeBlockedReason = null;
}

function emptyBag() {
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessions: {},
    activeByCharacter: {},
  };
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      wireCrossTabInvalidation();
      return window.localStorage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function wireCrossTabInvalidation() {
  if (typeof window === "undefined" || testStorage) return;
  if (globalThis.__yueqiConversationStorageWired) return;
  globalThis.__yueqiConversationStorageWired = true;
  window.addEventListener("storage", (event) => {
    if (
      event.key === CONVERSATION_STORE_KEY
      || event.key === `${CONVERSATION_STORE_KEY}.tmp`
    ) {
      memoryBag = null;
      writeBlockedReason = null;
    }
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function maybeMigrate() {
  if (migrationAttempted) return;
  migrationAttempted = true;
  const storage = ls();
  if (!storage) return;
  try {
    ensureConversationMigrated(storage);
  } catch {
    /* migration best-effort */
  }
}

function bagFromParsed(parsed) {
  return {
    schemaVersion: Number(parsed?.schemaVersion) || CONVERSATION_SCHEMA_VERSION,
    sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    activeByCharacter:
      parsed?.activeByCharacter && typeof parsed.activeByCharacter === "object"
        ? parsed.activeByCharacter
        : {},
  };
}

function tryParseBag(raw) {
  if (!raw) return null;
  try {
    return bagFromParsed(JSON.parse(raw));
  } catch {
    return null;
  }
}

function quarantineCorrupt(storage, raw) {
  if (!storage || raw == null) return;
  try {
    const key = `${CONVERSATION_STORE_KEY}.corrupt.${Date.now()}`;
    storage.setItem(key, String(raw).slice(0, 2_000_000));
  } catch {
    /* quota — best effort */
  }
}

function readBag() {
  if (memoryBag) return memoryBag;
  maybeMigrate();
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  const raw = storage.getItem(CONVERSATION_STORE_KEY);
  if (!raw) {
    writeBlockedReason = null;
    memoryBag = emptyBag();
    return memoryBag;
  }
  const primary = tryParseBag(raw);
  if (primary) {
    writeBlockedReason = null;
    memoryBag = primary;
    return memoryBag;
  }

  const tmpKey = `${CONVERSATION_STORE_KEY}.tmp`;
  const tmpRaw = storage.getItem(tmpKey);
  const recovered = tryParseBag(tmpRaw);
  if (recovered) {
    writeBlockedReason = null;
    memoryBag = recovered;
    // Restore primary from tmp without clearing recovery evidence yet.
    try {
      storage.setItem(CONVERSATION_STORE_KEY, JSON.stringify(recovered));
    } catch {
      /* keep memoryBag; next successful writeBag will persist */
    }
    return memoryBag;
  }

  quarantineCorrupt(storage, raw);
  writeBlockedReason = "corrupt_conversation_v2";
  memoryBag = emptyBag();
  return memoryBag;
}

/**
 * Atomic localStorage write: tmp → primary → drop tmp.
 * Refuses to overwrite storage while a corrupt unrecovered bag is active.
 * @param {ConversationBag} bag
 */
function writeBag(bag) {
  if (writeBlockedReason) return;
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    const json = JSON.stringify(bag);
    const tmpKey = `${CONVERSATION_STORE_KEY}.tmp`;
    storage.setItem(tmpKey, json);
    storage.setItem(CONVERSATION_STORE_KEY, json);
    try {
      storage.removeItem?.(tmpKey);
    } catch {
      /* optional */
    }
  } catch {
    /* quota */
  }
}

/**
 * Persist a session clone into the bag (internal).
 * @param {import("./schema.js").ConversationSession} session
 */
export function persistSession(session) {
  if (writeBlockedReason) {
    return { ok: false, reason: writeBlockedReason };
  }
  const validated = validateConversationSession(session);
  if (!validated.ok) return validated;
  const bag = readBag();
  const next = cloneJson(validated.value);
  next.updatedAt = new Date().toISOString();
  next.mode = next.modeContext?.mode || next.mode || "chat";
  next.scenarioRunId = next.modeContext?.scenarioRunId;
  next.loreEntryIds = Array.isArray(next.modeContext?.loreEntryIds)
    ? next.modeContext.loreEntryIds.slice()
    : Array.isArray(next.loreEntryIds)
      ? next.loreEntryIds.slice()
      : [];
  bag.sessions[next.id] = next;
  const kind = String(next.meta?.conversationKind || "").trim();
  const cid = String(next.characterId || "");
  const isolated = kind === "scenario"
    || cid.startsWith("__")
    || cid.startsWith("char-scenario:");
  if (cid && !isolated) {
    bag.activeByCharacter[cid] = next.id;
  }
  bag.schemaVersion = CONVERSATION_SCHEMA_VERSION;
  writeBag(bag);
  emitConversationEvent(CONVERSATION_EVENTS.SESSION_SAVED, {
    sessionId: next.id,
    characterId: next.characterId,
    activeBranchId: next.activeBranchId,
  });
  return { ok: true, value: cloneJson(next) };
}

export function clearAllConversations() {
  writeBlockedReason = null;
  memoryBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(CONVERSATION_STORE_KEY);
    storage?.removeItem?.(`${CONVERSATION_STORE_KEY}.tmp`);
    storage?.setItem?.(CONVERSATION_STORE_KEY, JSON.stringify(memoryBag));
  } catch {
    /* ignore */
  }
}

export function getConversationStoreKey() {
  return CONVERSATION_STORE_KEY;
}

/**
 * @param {{ characterId?: string, limit?: number }} [opts]
 * @returns {import("./schema.js").ConversationSession[]}
 */
export function listSessions(opts = {}) {
  const bag = readBag();
  let rows = Object.values(bag.sessions).map((s) => cloneJson(s));
  if (opts.characterId) {
    const cid = String(opts.characterId);
    rows = rows.filter((s) => String(s?.characterId || "") === cid);
  }
  rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const limit = Number(opts.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * Returns a deep clone. Never mutates the bag.
 * Includes compat `turns` projection for V1 readers.
 * @param {string} sessionId
 * @returns {import("./schema.js").ConversationSession & { turns?: object[] } | null}
 */
export function getSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const raw = readBag().sessions[id];
  if (!raw) return null;
  const session = cloneJson(raw);
  session.turns = selectLinearTurns(session);
  return session;
}

/**
 * Internal mutable working copy (still a clone of bag entry).
 * @param {string} sessionId
 */
export function getSessionMutable(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return null;
  const raw = readBag().sessions[id];
  if (!raw) return null;
  return cloneJson(raw);
}

/**
 * @param {object} session
 */
export function saveSession(session) {
  return persistSession(session);
}

/**
 * @param {{ characterId: string, id?: string, meta?: object }} opts
 */
export function ensureSession(opts) {
  const characterId = String(opts?.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "missing_characterId" };
  if (opts.id) {
    const existing = getSessionMutable(opts.id);
    if (existing && existing.characterId === characterId) {
      const bag = readBag();
      bag.activeByCharacter[characterId] = existing.id;
      writeBag(bag);
      return { ok: true, value: cloneJson(existing), created: false };
    }
  }
  const active = getActiveSessionForCharacter(characterId);
  if (active && !opts.id) {
    return { ok: true, value: active, created: false };
  }
  const session = createConversationSession({
    characterId,
    id: opts.id,
    meta: opts.meta,
  });
  const saved = persistSession(session);
  if (!saved.ok) return saved;
  return { ok: true, value: saved.value, created: true };
}

/**
 * @param {string} characterId
 */
export function getActiveSessionForCharacter(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return null;
  const bag = readBag();
  const activeId = bag.activeByCharacter[cid];
  if (activeId && bag.sessions[activeId]) {
    const session = cloneJson(bag.sessions[activeId]);
    session.turns = selectLinearTurns(session);
    return session;
  }
  const listed = listSessions({ characterId: cid, limit: 1 });
  return listed[0] || null;
}

/**
 * @param {string} sessionId
 * @param {import("./schema.js").ConversationMode} mode
 * @param {object} [extra]
 */
export function updateMode(sessionId, mode, extra = {}) {
  const session = getSessionMutable(sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  if (mode !== "chat" && mode !== "immersive") return { ok: false, reason: "invalid_mode" };
  session.mode = mode;
  session.modeContext = {
    ...(session.modeContext || { loreEntryIds: [], extra: {} }),
    mode,
  };
  if ("scenarioRunId" in extra) {
    const runId = extra.scenarioRunId ? String(extra.scenarioRunId) : undefined;
    session.scenarioRunId = runId;
    session.modeContext.scenarioRunId = runId;
  }
  if (Array.isArray(extra.loreEntryIds)) {
    const ids = extra.loreEntryIds.map((id) => String(id)).filter(Boolean);
    session.loreEntryIds = ids;
    session.modeContext.loreEntryIds = ids;
  }
  if (extra.meta && typeof extra.meta === "object") {
    session.meta = { ...(session.meta || {}), ...extra.meta };
  }
  if (extra.draft != null) session.modeContext.draft = String(extra.draft);
  if (extra.scrollAnchor != null) session.modeContext.scrollAnchor = String(extra.scrollAnchor);
  const saved = persistSession(session);
  if (saved.ok) {
    emitConversationEvent(CONVERSATION_EVENTS.MODE_CHANGED, {
      sessionId,
      mode,
      scenarioRunId: session.scenarioRunId || null,
    });
  }
  return saved;
}

/**
 * @deprecated V1 linear append — prefer runtime.sendUser / appendAssistantCandidate.
 * Kept for transitional callers; maps onto graph head.
 */
export function appendTurn(sessionId, turnPartial) {
  // Lazy import avoided — runtime owns graph writes. Thin shim via dynamic pattern:
  // store keeps a minimal path for tests that still call appendTurn.
  return { ok: false, reason: "use_runtime_sendUser_or_appendAssistantCandidate", turnPartial, sessionId };
}

/**
 * @deprecated Use runtime.rollbackHead
 */
export function rollbackLastTurn(sessionId) {
  return { ok: false, reason: "use_runtime_rollbackHead", sessionId };
}

export function exportConversationBag() {
  return cloneJson(readBag());
}

export function importConversationBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false, reason: "invalid_bag" };
  memoryBag = {
    schemaVersion: Number(bag.schemaVersion) || CONVERSATION_SCHEMA_VERSION,
    sessions: bag.sessions && typeof bag.sessions === "object" ? cloneJson(bag.sessions) : {},
    activeByCharacter:
      bag.activeByCharacter && typeof bag.activeByCharacter === "object"
        ? { ...bag.activeByCharacter }
        : {},
  };
  writeBag(memoryBag);
  return { ok: true };
}

/** Force re-read after external migration in tests */
export function __reloadConversationBagFromStorage() {
  memoryBag = null;
  migrationAttempted = false;
  return readBag();
}
