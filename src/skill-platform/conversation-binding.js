/**
 * SkillRun ↔ Conversation V2 binding — isolated_new, snapshot_copy, shared_live.
 * Injectable adapter for Node verify; default uses production conversation modules.
 */

import { createConversationId } from "../conversation/schema.js";
import * as conversationStore from "../conversation/store.js";
import * as conversationRuntime from "../conversation/runtime.js";
import * as conversationSelectors from "../conversation/selectors.js";
import { sha256Text } from "./integrity.js";
import { createSkillRunId } from "./run-schema.js";

/**
 * @typedef {{
 *   ensureSession: (opts: object) => { ok: boolean, value?: object, reason?: string, created?: boolean },
 *   getOrCreateActiveSession?: (opts: { characterId: string }) => object,
 *   getSession: (sessionId: string) => object|null,
 *   sendUser?: (sessionId: string, text: string, meta?: object) => { ok: boolean, value?: object, node?: object, reason?: string },
 *   appendAssistantCandidate?: (sessionId: string, text: string, meta?: object) => { ok: boolean, value?: object, node?: object, reason?: string },
 *   selectVisibleHistory: (session: object|null, opts?: object) => object[],
 * }} ConversationBindingApi
 */

export function createProductionConversationApi() {
  return {
    ensureSession: (opts) => conversationStore.ensureSession(opts),
    getOrCreateActiveSession: (opts) => conversationRuntime.getOrCreateActiveSession(opts),
    getSession: (sessionId) => conversationStore.getSession(sessionId),
    sendUser: (sessionId, text, meta) => conversationRuntime.sendUser(sessionId, text, meta),
    appendAssistantCandidate: (sessionId, text, meta) =>
      conversationRuntime.appendAssistantCandidate(sessionId, text, meta),
    selectVisibleHistory: (session, opts) => conversationSelectors.selectVisibleHistory(session, opts),
  };
}

/** @type {ConversationBindingApi} */
let defaultApi = createProductionConversationApi();

/**
 * @param {{ conversationApi?: Partial<ConversationBindingApi> }} [opts]
 */
export function createConversationBindingAdapter(opts = {}) {
  const base = opts.conversationApi
    ? { ...createProductionConversationApi(), ...opts.conversationApi }
    : defaultApi;
  return base;
}

/**
 * @param {ConversationBindingApi} api
 */
export function setDefaultConversationBindingApi(api) {
  defaultApi = api;
}

/**
 * @param {object} messageRow
 */
function hashMessageRow(messageRow) {
  const content = String(messageRow?.content ?? messageRow?.text ?? "");
  return sha256Text(content);
}

/**
 * Freeze source session messages into a snapshot object (plan §4.2 rule 3).
 * @param {ConversationBindingApi} api
 * @param {string} sourceSessionId
 */
export function captureConversationSnapshot(api, sourceSessionId) {
  const sourceSessionIdNorm = String(sourceSessionId || "").trim();
  if (!sourceSessionIdNorm) return { ok: false, reason: "missing_source_session" };

  const session = api.getSession(sourceSessionIdNorm);
  if (!session) return { ok: false, reason: "source_session_not_found" };

  const history = api.selectVisibleHistory(session);
  const messages = history.map((row) => ({
    messageId: String(row.messageId || row.id),
    contentHash: hashMessageRow(row),
    role: row.role,
    createdAt: row.createdAt,
  }));

  const snapshot = {
    id: createSkillRunId("snapshot"),
    sourceConversationSessionId: sourceSessionIdNorm,
    createdAt: new Date().toISOString(),
    messages,
  };

  return { ok: true, value: snapshot };
}

/**
 * Resolve frozen snapshot messages for skill prompt — ignores live source additions.
 * @param {ConversationBindingApi} api
 * @param {object} snapshot
 */
export function resolveSnapshotForPrompt(api, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const sourceId = String(snapshot.sourceConversationSessionId || "").trim();
  if (!sourceId) return [];

  const session = api.getSession(sourceId);
  if (!session) return [];

  const byId = new Map(
    api.selectVisibleHistory(session).map((row) => [String(row.messageId || row.id), row]),
  );

  /** @type {object[]} */
  const frozen = [];
  for (const entry of snapshot.messages || []) {
    const messageId = String(entry.messageId || "");
    const row = byId.get(messageId);
    if (!row) continue;
    if (hashMessageRow(row) !== String(entry.contentHash || "")) continue;
    frozen.push(row);
  }
  return frozen;
}

/**
 * @param {object} run
 * @param {{
 *   conversationApi?: ConversationBindingApi,
 *   title?: string,
 *   sourceConversationSessionId?: string,
 * }} [opts]
 */
export function bindConversationForRun(run, opts = {}) {
  const api = opts.conversationApi || defaultApi;

  const characterId = String(run.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "missing_character_id" };

  const skillId = String(run.skillId || "").trim();
  const skillRunId = String(run.id || "").trim();
  const title = String(opts.title || skillId).trim();
  const sessionMeta = {
    purpose: "skill",
    appId: "explore",
    title,
    skillId,
    skillRunId,
    skillRunMode: run.mode,
  };

  if (run.mode === "isolated_new") {
    const sessionId = createConversationId("skill");
    const ensured = api.ensureSession({
      characterId,
      id: sessionId,
      meta: sessionMeta,
    });
    if (!ensured.ok) return ensured;
    return {
      ok: true,
      value: {
        conversation: {
          conversationSessionId: ensured.value.id,
        },
      },
    };
  }

  if (run.mode === "snapshot_copy") {
    const sourceId = String(
      opts.sourceConversationSessionId ||
        run.conversation?.sourceConversationSessionId ||
        "",
    ).trim();
    if (!sourceId) return { ok: false, reason: "missing_source_conversation" };

    const snapResult = captureConversationSnapshot(api, sourceId);
    if (!snapResult.ok) return snapResult;

    const sessionId = createConversationId("skill");
    const ensured = api.ensureSession({
      characterId,
      id: sessionId,
      meta: { ...sessionMeta, sourceConversationSessionId: sourceId },
    });
    if (!ensured.ok) return ensured;

    return {
      ok: true,
      value: {
        conversation: {
          conversationSessionId: ensured.value.id,
          sourceConversationSessionId: sourceId,
          sourceSnapshotId: snapResult.value,
        },
      },
    };
  }

  if (run.mode === "shared_live") {
    const sourceId = String(
      opts.sourceConversationSessionId ||
        run.conversation?.sourceConversationSessionId ||
        run.conversation?.conversationSessionId ||
        "",
    ).trim();

    let sharedSessionId = sourceId;
    if (!sharedSessionId && api.getOrCreateActiveSession) {
      const active = api.getOrCreateActiveSession({ characterId });
      sharedSessionId = active.id;
    }
    if (!sharedSessionId) return { ok: false, reason: "missing_shared_session" };

    return {
      ok: true,
      value: {
        conversation: {
          conversationSessionId: sharedSessionId,
          sourceConversationSessionId: sharedSessionId,
        },
      },
    };
  }

  return { ok: false, reason: "unknown_mode" };
}

/**
 * Append a skill-origin assistant message in shared_live (meta.origin=skill).
 * @param {object} run
 * @param {string} text
 * @param {ConversationBindingApi} [conversationApi]
 */
export function appendSkillAssistantMessage(run, text, conversationApi) {
  const api = conversationApi || defaultApi;
  if (!api.appendAssistantCandidate) {
    return { ok: false, reason: "append_not_available" };
  }
  const sessionId = String(run.conversation?.conversationSessionId || "").trim();
  if (!sessionId) return { ok: false, reason: "missing_session" };

  return api.appendAssistantCandidate(sessionId, text, {
    origin: "skill",
    skillId: run.skillId,
    skillRunId: run.id,
  });
}

/**
 * Count user message nodes in a session (for duplicate detection in shared_live).
 * @param {ConversationBindingApi} api
 * @param {string} sessionId
 */
export function countUserMessageNodes(api, sessionId) {
  const session = api.getSession(sessionId);
  if (!session?.messageNodes) return 0;
  return Object.values(session.messageNodes).filter((n) => n.role === "user").length;
}
