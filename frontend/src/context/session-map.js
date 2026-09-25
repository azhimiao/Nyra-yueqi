/**
 * Maps legacy/product chatSessionId → Conversation V2 session ids.
 * DM / group / scenario / project must never share a branch.
 */

import { ensureSession, getSession, saveSession } from "../conversation/store.js";

export const SESSION_MAP_KEY = "yueqi.context.sessionMap.v1";
export const SESSION_MAP_VERSION = 1;

let testStorage = null;

export function __setSessionMapStorageForTests(storage) {
  testStorage = storage;
}

function storage() {
  if (testStorage) return testStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readBag() {
  try {
    const raw = JSON.parse(storage()?.getItem(SESSION_MAP_KEY) || "null");
    if (raw && typeof raw === "object" && raw.mappings && typeof raw.mappings === "object") {
      return { schemaVersion: SESSION_MAP_VERSION, mappings: raw.mappings };
    }
  } catch {
    /* ignore */
  }
  return { schemaVersion: SESSION_MAP_VERSION, mappings: {} };
}

function writeBag(bag) {
  try {
    storage()?.setItem(SESSION_MAP_KEY, JSON.stringify(bag));
  } catch {
    /* ignore quota */
  }
  return bag;
}

/**
 * @param {string} chatSessionId
 * @returns {"dm"|"group"|"scenario"|"project"}
 */
export function inferConversationKind(chatSessionId = "") {
  const id = String(chatSessionId || "").trim();
  if (id.startsWith("group:")) return "group";
  if (id.startsWith("scenario:") || id.startsWith("theater:") || id.startsWith("run:")) return "scenario";
  if (id.startsWith("project:") || id.startsWith("cocreate:")) return "project";
  return "dm";
}

/**
 * Synthetic characterId for non-DM sessions so they never become a real character's active DM.
 * @param {"dm"|"group"|"scenario"|"project"} kind
 * @param {string} chatSessionId
 * @param {string} [characterId]
 */
export function resolveOwnerKey(kind, chatSessionId, characterId = "") {
  if (kind === "dm") return String(characterId || "").trim();
  return `__${kind}__:${String(chatSessionId || "").trim()}`;
}

/**
 * Resolve or create the V2 session bound to a product chatSessionId.
 * @param {{
 *   chatSessionId: string,
 *   characterId?: string,
 *   conversationKind?: "dm"|"group"|"scenario"|"project",
 *   participantIds?: string[],
 *   setActive?: boolean,
 * }} input
 */
export function resolveConversationBinding(input = {}) {
  const chatSessionId = String(input.chatSessionId || "").trim();
  const kind = input.conversationKind || inferConversationKind(chatSessionId);
  const characterId = String(input.characterId || "").trim();
  const participantIds = [...new Set((Array.isArray(input.participantIds) ? input.participantIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  if (kind === "dm" && !characterId) {
    return { ok: false, error: "characterId_required_for_dm" };
  }
  if (!chatSessionId && kind === "dm") {
    // Fall back to character DM key
    const fallbackId = `char:${characterId}`;
    return resolveConversationBinding({ ...input, chatSessionId: fallbackId });
  }
  if (!chatSessionId) return { ok: false, error: "chatSessionId_required" };

  const bag = readBag();
  const explicitSessionId = String(input.conversationSessionId || "").trim();
  const existing = bag.mappings[chatSessionId];
  if (existing?.conversationSessionId && (!explicitSessionId || existing.conversationSessionId === explicitSessionId)) {
    const session = getSession(existing.conversationSessionId);
    if (session) {
      return {
        ok: true,
        created: false,
        chatSessionId,
        conversationSessionId: session.id,
        conversationKind: existing.conversationKind || kind,
        characterId: existing.characterId || characterId,
        participantIds: existing.participantIds || participantIds,
        ownerKey: existing.ownerKey || resolveOwnerKey(kind, chatSessionId, characterId),
        session,
      };
    }
  }

  // Product runtimes such as Scenario already own a Conversation V2 session.
  // Bind that exact session instead of creating a parallel hidden history.
  if (explicitSessionId) {
    const explicit = getSession(explicitSessionId);
    if (!explicit) return { ok: false, error: "explicit_conversation_session_not_found" };
    const now = new Date().toISOString();
    const ownerKey = explicit.characterId || resolveOwnerKey(kind, chatSessionId, characterId);
    bag.mappings[chatSessionId] = {
      chatSessionId,
      conversationSessionId: explicit.id,
      conversationKind: kind,
      characterId: kind === "dm" ? characterId : "",
      participantIds: kind === "dm" ? [characterId].filter(Boolean) : participantIds,
      ownerKey,
      createdAt: existing?.createdAt || now,
      migratedAt: now,
      lastReconciledAt: now,
      migrationVersion: SESSION_MAP_VERSION,
      boundExplicitly: true,
    };
    writeBag(bag);
    return {
      ok: true,
      created: false,
      chatSessionId,
      conversationSessionId: explicit.id,
      conversationKind: kind,
      characterId: kind === "dm" ? characterId : "",
      participantIds: bag.mappings[chatSessionId].participantIds,
      ownerKey,
      session: explicit,
      boundExplicitly: true,
    };
  }

  const ownerKey = resolveOwnerKey(kind, chatSessionId, characterId);
  const created = ensureSession({
    characterId: ownerKey,
    meta: {
      conversationKind: kind,
      chatSessionId,
      productCharacterId: characterId || "",
      participantIds,
      historyAuthority: "conversation_v2",
      mappingVersion: SESSION_MAP_VERSION,
    },
  });
  if (!created.ok) return { ok: false, error: created.reason || "ensure_session_failed" };

  const now = new Date().toISOString();
  bag.mappings[chatSessionId] = {
    chatSessionId,
    conversationSessionId: created.value.id,
    conversationKind: kind,
    characterId: kind === "dm" ? characterId : "",
    participantIds: kind === "dm" ? [characterId].filter(Boolean) : participantIds,
    ownerKey,
    createdAt: existing?.createdAt || now,
    migratedAt: now,
    lastReconciledAt: now,
    migrationVersion: SESSION_MAP_VERSION,
  };
  writeBag(bag);

  const session = getSession(created.value.id);
  if (session) {
    session.meta = {
      ...(session.meta || {}),
      conversationKind: kind,
      chatSessionId,
      productCharacterId: characterId || "",
      participantIds: bag.mappings[chatSessionId].participantIds,
    };
    saveSession(session);
  }

  return {
    ok: true,
    created: Boolean(created.created),
    chatSessionId,
    conversationSessionId: created.value.id,
    conversationKind: kind,
    characterId: kind === "dm" ? characterId : "",
    participantIds: bag.mappings[chatSessionId].participantIds,
    ownerKey,
    session: getSession(created.value.id),
  };
}

export function listSessionMappings() {
  return { ...readBag().mappings };
}

export function touchSessionMappingReconcile(chatSessionId, patch = {}) {
  const id = String(chatSessionId || "").trim();
  if (!id) return null;
  const bag = readBag();
  const row = bag.mappings[id];
  if (!row) return null;
  bag.mappings[id] = {
    ...row,
    ...patch,
    lastReconciledAt: new Date().toISOString(),
  };
  writeBag(bag);
  return bag.mappings[id];
}

export function exportSessionMapBag() {
  return JSON.parse(JSON.stringify(readBag()));
}

export function importSessionMapBag(input) {
  const mappings = input?.mappings && typeof input.mappings === "object" ? input.mappings : {};
  return writeBag({ schemaVersion: SESSION_MAP_VERSION, mappings: JSON.parse(JSON.stringify(mappings)) });
}
