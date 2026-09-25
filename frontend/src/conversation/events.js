/**
 * Conversation V2 event bus — stable events for UI / memory / TTS / Agent.
 * Audit trail for edit / branch / regenerate / switch actions.
 */

/** @typedef {(payload: object) => void} ConversationEventHandler */

/** @type {Map<string, Set<ConversationEventHandler>>} */
const listeners = new Map();

/** @type {{ at: string, type: string, payload: object }[]} */
const auditLog = [];

const AUDIT_CAP = 200;

export const CONVERSATION_EVENTS = Object.freeze({
  USER_SENT: "conversation:user_sent",
  ASSISTANT_CANDIDATE_APPENDED: "conversation:assistant_candidate_appended",
  REGENERATED: "conversation:regenerated",
  CANDIDATE_SWITCHED: "conversation:candidate_switched",
  MESSAGE_META_UPDATED: "conversation:message_meta_updated",
  MESSAGE_EDITED: "conversation:message_edited",
  MESSAGE_DELETED: "conversation:message_deleted",
  USER_EDITED: "conversation:user_edited",
  FORKED: "conversation:forked",
  CHECKPOINT: "conversation:checkpoint",
  BRANCH_SWITCHED: "conversation:branch_switched",
  BRANCH_ARCHIVED: "conversation:branch_archived",
  CANDIDATE_ARCHIVED: "conversation:candidate_archived",
  HEAD_ROLLED_BACK: "conversation:head_rolled_back",
  MODE_CHANGED: "conversation:mode_changed",
  SESSION_SAVED: "conversation:session_saved",
  MIGRATED: "conversation:migrated",
});

/**
 * @param {string} type
 * @param {ConversationEventHandler} handler
 */
export function onConversationEvent(type, handler) {
  if (typeof handler !== "function") return () => {};
  const key = String(type || "");
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(handler);
  return () => offConversationEvent(key, handler);
}

/**
 * @param {string} type
 * @param {ConversationEventHandler} handler
 */
export function offConversationEvent(type, handler) {
  listeners.get(String(type || ""))?.delete(handler);
}

/**
 * @param {string} type
 * @param {object} [payload]
 */
export function emitConversationEvent(type, payload = {}) {
  const eventType = String(type || "");
  const body = payload && typeof payload === "object" ? { ...payload } : {};
  const entry = {
    at: new Date().toISOString(),
    type: eventType,
    payload: body,
  };
  auditLog.push(entry);
  if (auditLog.length > AUDIT_CAP) auditLog.splice(0, auditLog.length - AUDIT_CAP);

  const set = listeners.get(eventType);
  if (set) {
    for (const handler of [...set]) {
      try {
        handler({ ...body, _eventType: eventType, _at: entry.at });
      } catch {
        /* subscriber faults must not break runtime */
      }
    }
  }
  const wildcard = listeners.get("*");
  if (wildcard) {
    for (const handler of [...wildcard]) {
      try {
        handler({ ...body, _eventType: eventType, _at: entry.at });
      } catch {
        /* ignore */
      }
    }
  }
  return entry;
}

/** @returns {{ at: string, type: string, payload: object }[]} */
export function getConversationAuditLog() {
  return auditLog.map((e) => ({ ...e, payload: { ...e.payload } }));
}

/** Test helper */
export function __resetConversationEventsForTests() {
  listeners.clear();
  auditLog.length = 0;
}
