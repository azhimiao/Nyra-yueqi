/**
 * Listen FeatureMemoryAdapter — coalesce play sessions into meaningful Timeline.
 * Media position/state stays in Listen/Media stores; preferences → Candidate only.
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import { submitCandidate } from "../candidate-ledger.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const LISTEN_ADAPTER_FEATURE_ID = "listen";

/** @typedef {"progress"|"start"|"end"|"milestone"|"co_listen"} ListenProgressKind */

/**
 * @typedef {object} ListenSession
 * @property {string} sessionId
 * @property {string} trackId
 * @property {string} companionId
 * @property {string} userId
 * @property {string} relationshipId
 * @property {number} startedAtMs
 * @property {number} lastPosition
 * @property {number} lastAtMs
 * @property {boolean} startedEmitted
 * @property {boolean} ended
 * @property {string} [title]
 * @property {boolean} [coListen]
 */

/** @type {Map<string, ListenSession>} */
const sessions = new Map();

let registered = false;

function sessionKey(companionId, trackId) {
  return `${String(companionId || "").trim()}::${String(trackId || "").trim()}`;
}

function listenScope(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      input.relationshipId || relationshipIdFor(userId, companionId),
  });
}

/**
 * @param {object} input
 */
export function getListenSessionSourceRef(input = {}) {
  const scope = listenScope(input);
  const sessionId = String(input.sessionId || "").trim();
  const trackId = String(input.trackId || "").trim();
  const sourceId = sessionId || (trackId ? `track:${trackId}` : "");
  if (!sourceId || !scope.companionId) return null;
  const sourceVersion = Number(input.sourceVersion) || 1;
  return createSourceRefV1({
    sourceType: "listening_session",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: "reality",
    occurredAt: String(input.occurredAt || new Date().toISOString()),
    visibility: "shared",
    contentHash:
      String(input.contentHash || "").trim() ||
      `listen:${sourceId}:v${sourceVersion}`,
  });
}

function defaultAppendTimeline(event) {
  return appendTimelineEvent(event);
}

/**
 * Emit a lifecycle Timeline event (injectable for tests).
 * @param {object} input
 * @param {{ appendTimeline?: Function }} [deps]
 */
function emitListenTimeline(input, deps = {}) {
  const scope = listenScope(input);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId" };
  const eventType = String(input.eventType || "listen.started");
  const sourceRef = getListenSessionSourceRef(input);
  const append = typeof deps.appendTimeline === "function"
    ? deps.appendTimeline
    : defaultAppendTimeline;
  const idempotencyKey =
    String(input.idempotencyKey || "").trim() ||
    `listen:${sourceRef?.sourceId || "x"}:${eventType}`;
  const payload = {
    summary: String(input.summary || eventType),
    trackId: String(input.trackId || ""),
    title: String(input.title || ""),
    position: Number(input.position) || 0,
    coListen: input.coListen === true,
    sessionId: String(input.sessionId || ""),
    sourceRef,
    ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
  };
  return append({
    eventId: mintId("eventId", "listen"),
    eventType,
    source: "listen_adapter",
    sourceId: sourceRef?.sourceId || String(input.trackId || ""),
    idempotencyKey,
    actor: scope.companionId,
    principal: scope.userId,
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    realityNamespace: "reality",
    occurredAt: sourceRef?.occurredAt || new Date().toISOString(),
    visibility: "shared",
    payload,
    evidenceRefs: sourceRef
      ? [`listen:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`]
      : [],
  });
}

/**
 * Record playback progress. Does NOT append Timeline every tick.
 * Emits at most session start (first play of track in session) and milestones / end.
 *
 * @param {{
 *   trackId: string,
 *   position?: number,
 *   duration?: number,
 *   companionId?: string,
 *   characterId?: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   title?: string,
 *   coListen?: boolean,
 *   kind?: ListenProgressKind,
 *   forceMilestone?: boolean,
 * }} input
 * @param {{ appendTimeline?: Function, nowMs?: number }} [deps]
 */
export function recordListenProgress(input = {}, deps = {}) {
  const trackId = String(input.trackId || "").trim();
  const scope = listenScope(input);
  if (!trackId) return { ok: false, reason: "missing_trackId", emitted: [] };
  if (!scope.companionId) return { ok: false, reason: "missing_companionId", emitted: [] };

  const nowMs = Number.isFinite(deps.nowMs) ? Number(deps.nowMs) : Date.now();
  const position = Math.max(0, Number(input.position) || 0);
  const duration = Math.max(0, Number(input.duration) || 0);
  const kind = String(input.kind || "progress");
  const key = sessionKey(scope.companionId, trackId);
  const emitted = [];

  let session = sessions.get(key);
  const openNew =
    !session ||
    session.ended ||
    kind === "start" ||
    (kind === "co_listen" && !session?.startedEmitted);

  if (openNew && (!session || session.ended || kind === "start")) {
    // Ending previous session for same key is handled via end; track switch uses different key.
    session = {
      sessionId: mintId("eventId", "lsess"),
      trackId,
      companionId: scope.companionId,
      userId: scope.userId,
      relationshipId: scope.relationshipId,
      startedAtMs: nowMs,
      lastPosition: position,
      lastAtMs: nowMs,
      startedEmitted: false,
      ended: false,
      title: String(input.title || ""),
      coListen: input.coListen === true,
    };
    sessions.set(key, session);
  }

  if (!session || session.ended) {
    return { ok: true, emitted, session: null };
  }

  session.lastPosition = position;
  session.lastAtMs = nowMs;
  if (input.title) session.title = String(input.title);
  if (input.coListen === true) session.coListen = true;

  const shouldStart =
    !session.startedEmitted &&
    (kind === "start" ||
      kind === "progress" ||
      kind === "co_listen" ||
      kind === "milestone");

  if (shouldStart) {
    const startResult = emitListenTimeline(
      {
        eventType: session.coListen || kind === "co_listen" ? "listen.shared" : "listen.started",
        sessionId: session.sessionId,
        trackId,
        title: session.title,
        position,
        coListen: session.coListen,
        companionId: scope.companionId,
        userId: scope.userId,
        relationshipId: scope.relationshipId,
        summary: session.coListen
          ? `co-listen started: ${session.title || trackId}`
          : `listen started: ${session.title || trackId}`,
        idempotencyKey: `listen:${session.sessionId}:started`,
      },
      deps,
    );
    session.startedEmitted = true;
    emitted.push({ eventType: session.coListen ? "listen.shared" : "listen.started", result: startResult });
  }

  // Meaningful milestone: near-complete (≥95%) once per session — not every tick.
  const nearEnd =
    input.forceMilestone === true ||
    kind === "milestone" ||
    (duration > 0 && position / duration >= 0.95);
  if (nearEnd && !session._completedEmitted) {
    const done = emitListenTimeline(
      {
        eventType: "listen.completed",
        sessionId: session.sessionId,
        trackId,
        title: session.title,
        position,
        coListen: session.coListen,
        companionId: scope.companionId,
        userId: scope.userId,
        relationshipId: scope.relationshipId,
        summary: `listen completed: ${session.title || trackId}`,
        idempotencyKey: `listen:${session.sessionId}:completed`,
      },
      deps,
    );
    session._completedEmitted = true;
    session.ended = true;
    emitted.push({ eventType: "listen.completed", result: done });
  }

  if (kind === "end" && !session.ended) {
    return endListenSession(
      {
        trackId,
        companionId: scope.companionId,
        userId: scope.userId,
        relationshipId: scope.relationshipId,
        position,
        title: session.title,
        coListen: session.coListen,
      },
      deps,
    );
  }

  return { ok: true, emitted, session: { ...session }, skippedTick: emitted.length === 0 };
}

/**
 * Close an open listen session (session-end Timeline when start was emitted).
 * @param {object} input
 * @param {{ appendTimeline?: Function, nowMs?: number }} [deps]
 */
export function endListenSession(input = {}, deps = {}) {
  const trackId = String(input.trackId || "").trim();
  const scope = listenScope(input);
  const key = sessionKey(scope.companionId, trackId);
  const session = sessions.get(key);
  const emitted = [];
  if (!session || session.ended) {
    return { ok: true, emitted, reason: "no_open_session" };
  }
  session.ended = true;
  session.lastPosition = Math.max(0, Number(input.position) || session.lastPosition || 0);
  if (session.startedEmitted && !session._completedEmitted) {
    const result = emitListenTimeline(
      {
        eventType: "listen.completed",
        sessionId: session.sessionId,
        trackId: session.trackId,
        title: session.title || input.title || "",
        position: session.lastPosition,
        coListen: session.coListen === true,
        companionId: scope.companionId || session.companionId,
        userId: scope.userId || session.userId,
        relationshipId: scope.relationshipId || session.relationshipId,
        summary: `listen ended: ${session.title || session.trackId}`,
        idempotencyKey: `listen:${session.sessionId}:completed`,
      },
      deps,
    );
    session._completedEmitted = true;
    emitted.push({ eventType: "listen.completed", result });
  }
  return { ok: true, emitted, session: { ...session } };
}

/**
 * Preference signal ("喜欢这首歌") → Candidate Ledger only — never Context Graph accepted.
 *
 * @param {{
 *   claim?: string,
 *   trackId?: string,
 *   title?: string,
 *   companionId?: string,
 *   characterId?: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   polarity?: "like"|"dislike"|"shared_symbol",
 * }} input
 * @param {{ submitCandidate?: Function, ingestCandidate?: Function }} [deps]
 */
export function submitListenPreference(input = {}, deps = {}) {
  const scope = listenScope(input);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId" };
  const trackId = String(input.trackId || "").trim();
  const title = String(input.title || "").trim();
  const polarity = String(input.polarity || "like");
  const claim =
    String(input.claim || "").trim() ||
    (polarity === "dislike"
      ? `不喜欢这首歌${title ? `：${title}` : ""}`
      : polarity === "shared_symbol"
        ? `把这首歌当作共同关系符号${title ? `：${title}` : ""}`
        : `喜欢这首歌${title ? `：${title}` : ""}`);

  const submit =
    typeof deps.submitCandidate === "function" ? deps.submitCandidate : submitCandidate;

  // Hard guard: never call ingestCandidate / graph write from this path.
  if (typeof deps.ingestCandidate === "function") {
    /* intentionally unused — preferences must not go to accepted graph */
  }

  const result = submit({
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    claim,
    category: "preference",
    source: "listen_adapter",
    userStated: true,
    confidence: 0.9,
    status: "pending",
    realityNamespace: "reality",
    evidenceRefs: trackId ? [`media_track:${trackId}`] : [],
    idempotencyKey: `listen-pref:${scope.companionId}:${trackId || claim.slice(0, 40)}:${polarity}`,
    meta: { trackId, title, polarity, graphIngest: false },
  });

  return {
    ok: result?.ok !== false,
    candidate: result?.value || result,
    graphIngested: false,
    result,
  };
}

export async function emitListenTimelineEvents(change, scope = {}) {
  const merged = { ...change, ...scope };
  if (change?.kind === "end" || change?.eventType === "listen.completed") {
    return endListenSession(merged);
  }
  return recordListenProgress({ ...merged, kind: change?.kind || "start" });
}

export async function submitListenUnderstandingCandidates(change, scope = {}) {
  return submitListenPreference({ ...change, ...scope });
}

export function ensureListenAdapterRegistered() {
  if (registered) return listenFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(LISTEN_ADAPTER_FEATURE_ID, listenFeatureMemoryAdapter);
  registered = true;
  return listenFeatureMemoryAdapter;
}

export function __resetListenAdapterRegistrationForTests() {
  registered = false;
}

export function __clearListenSessionsForTests() {
  sessions.clear();
}

export function isListenAdapterEnabled() {
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

export const listenFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: LISTEN_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getListenSessionSourceRef(change),
  emitTimelineEvents: (change, scope) => emitListenTimelineEvents(change, scope),
  submitUnderstandingCandidates: (change, scope) =>
    submitListenUnderstandingCandidates(change, scope),
  buildIndexDocuments: async () => ({ ok: true, documents: [], stub: true }),
  handleSourceTombstone: async () => ({ ok: true, skipped: true }),
  rebuildForSource: async () => ({ ok: true, skipped: true }),
});
