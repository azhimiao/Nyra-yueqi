/**
 * Conversation V1 → V2 migration.
 * - Idempotent
 * - Backs up V1 bag before migrate
 * - Keeps old turns as a linear chain on the main branch
 */

import {
  CONVERSATION_BACKUP_KEY_V1,
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_STORE_KEY,
  CONVERSATION_STORE_KEY_V1,
  createConversationBranch,
  createConversationId,
  createConversationSession,
  createMessageNode,
  createTurnCandidate,
} from "./schema.js";
import { emitConversationEvent, CONVERSATION_EVENTS } from "./events.js";

/**
 * @param {object} v1Session
 * @returns {import("./schema.js").ConversationSession}
 */
export function migrateSessionV1ToV2(v1Session) {
  const characterId = String(v1Session?.characterId || "").trim();
  if (!characterId) {
    throw new Error("migrate_session_requires_characterId");
  }

  // Already V2-shaped
  if (
    v1Session?.branches &&
    typeof v1Session.branches === "object" &&
    v1Session?.messageNodes &&
    typeof v1Session.messageNodes === "object" &&
    v1Session.activeBranchId
  ) {
    return createConversationSession(v1Session);
  }

  const mainBranchId = createConversationId("branch");
  const messageNodes = {};
  const turns = Array.isArray(v1Session?.turns) ? v1Session.turns : [];
  let parentMessageId = undefined;
  let headMessageId = "";

  for (const turn of turns) {
    const candidate = createTurnCandidate({
      id: turn.id ? `${turn.id}-cand` : undefined,
      content: turn.text ?? turn.content ?? "",
      createdAt: turn.createdAt,
      meta: turn.meta && typeof turn.meta === "object" ? { ...turn.meta } : {},
    });
    const node = createMessageNode({
      id: turn.id || createConversationId("msg"),
      parentMessageId,
      branchId: mainBranchId,
      role: turn.role === "assistant" || turn.role === "system" ? turn.role : "user",
      candidates: [candidate],
      activeCandidateId: candidate.id,
      mode: turn.mode === "immersive" ? "immersive" : "chat",
      createdAt: turn.createdAt,
      meta: turn.meta && typeof turn.meta === "object" ? { ...turn.meta } : {},
    });
    messageNodes[node.id] = node;
    parentMessageId = node.id;
    headMessageId = node.id;
  }

  const branch = createConversationBranch({
    id: mainBranchId,
    label: "main",
    headMessageId,
  });

  return createConversationSession({
    id: v1Session.id,
    characterId,
    createdAt: v1Session.createdAt,
    updatedAt: v1Session.updatedAt,
    mode: v1Session.mode === "immersive" ? "immersive" : "chat",
    activeBranchId: mainBranchId,
    branches: { [mainBranchId]: branch },
    messageNodes,
    scenarioRunId: v1Session.scenarioRunId,
    loreEntryIds: v1Session.loreEntryIds,
    meta: {
      ...(v1Session.meta && typeof v1Session.meta === "object" ? v1Session.meta : {}),
      migratedFrom: "v1",
    },
    modeContext: {
      mode: v1Session.mode === "immersive" ? "immersive" : "chat",
      scenarioRunId: v1Session.scenarioRunId,
      loreEntryIds: Array.isArray(v1Session.loreEntryIds) ? v1Session.loreEntryIds : [],
    },
  });
}

/**
 * @param {object} v1Bag
 * @returns {{ schemaVersion: number, sessions: Record<string, object>, activeByCharacter: Record<string, string> }}
 */
export function migrateBagV1ToV2(v1Bag) {
  const sessionsIn = v1Bag?.sessions && typeof v1Bag.sessions === "object" ? v1Bag.sessions : {};
  /** @type {Record<string, object>} */
  const sessions = {};
  for (const [id, session] of Object.entries(sessionsIn)) {
    try {
      const migrated = migrateSessionV1ToV2(session);
      sessions[migrated.id || id] = migrated;
    } catch {
      /* skip corrupt session */
    }
  }
  return {
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    sessions,
    activeByCharacter:
      v1Bag?.activeByCharacter && typeof v1Bag.activeByCharacter === "object"
        ? { ...v1Bag.activeByCharacter }
        : {},
  };
}

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} storage
 * @returns {{ migrated: boolean, reason?: string, backupKey?: string, sessionCount?: number }}
 */
export function migrateStorageV1ToV2(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return { migrated: false, reason: "no_storage" };
  }

  const existingV2 = storage.getItem(CONVERSATION_STORE_KEY);
  if (existingV2) {
    try {
      const parsed = JSON.parse(existingV2);
      if (Number(parsed?.schemaVersion) >= 2) {
        return { migrated: false, reason: "already_v2", sessionCount: Object.keys(parsed.sessions || {}).length };
      }
    } catch {
      /* fall through and try migrate */
    }
  }

  const rawV1 = storage.getItem(CONVERSATION_STORE_KEY_V1);
  if (!rawV1) {
    return { migrated: false, reason: "no_v1_data" };
  }

  let v1Bag;
  try {
    v1Bag = JSON.parse(rawV1);
  } catch {
    return { migrated: false, reason: "v1_parse_error" };
  }

  // Backup before mutate
  try {
    storage.setItem(CONVERSATION_BACKUP_KEY_V1, rawV1);
  } catch {
    return { migrated: false, reason: "backup_failed" };
  }

  const v2Bag = migrateBagV1ToV2(v1Bag);
  try {
    const json = JSON.stringify(v2Bag);
    storage.setItem(`${CONVERSATION_STORE_KEY}.tmp`, json);
    storage.setItem(CONVERSATION_STORE_KEY, json);
    try {
      storage.removeItem?.(`${CONVERSATION_STORE_KEY}.tmp`);
    } catch {
      /* optional */
    }
  } catch {
    return { migrated: false, reason: "write_failed" };
  }

  emitConversationEvent(CONVERSATION_EVENTS.MIGRATED, {
    from: CONVERSATION_STORE_KEY_V1,
    to: CONVERSATION_STORE_KEY,
    backupKey: CONVERSATION_BACKUP_KEY_V1,
    sessionCount: Object.keys(v2Bag.sessions).length,
  });

  return {
    migrated: true,
    backupKey: CONVERSATION_BACKUP_KEY_V1,
    sessionCount: Object.keys(v2Bag.sessions).length,
  };
}

/**
 * Run migration against the active storage (idempotent).
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} [storage]
 */
export function ensureConversationMigrated(storage) {
  if (!storage) return { migrated: false, reason: "no_storage" };
  return migrateStorageV1ToV2(storage);
}
