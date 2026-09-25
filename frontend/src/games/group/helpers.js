/**
 * Shared Group engine helpers.
 */

/**
 * @param {any} session
 * @returns {any}
 */
export function cloneSession(session) {
  if (!session || typeof session !== "object") return session;
  const { __gameModule, ...rest } = session;
  const cloned = structuredClone
    ? structuredClone(rest)
    : JSON.parse(JSON.stringify(rest));
  if (__gameModule) cloned.__gameModule = __gameModule;
  return cloned;
}

/**
 * @param {any} session
 * @returns {any}
 */
export function gameState(session) {
  return session?.state?.game ?? null;
}

/**
 * @param {any} session
 * @param {Record<string, any>} patch
 * @param {{ events?: any[], output?: any, error?: string|null, status?: string, phase?: string }} [meta]
 */
export function withGamePatch(session, patch, meta = {}) {
  const next = cloneSession(session);
  next.state = next.state || {};
  next.state.game = { ...(next.state.game || {}), ...patch };
  if (meta.phase != null) next.phase = meta.phase;
  else if (patch.phase != null) next.phase = patch.phase;
  if (meta.status) next.status = meta.status;
  next.updatedAt = Date.now();
  return {
    session: next,
    events: meta.events || [],
    output: meta.output ?? null,
    ...(meta.error ? { error: meta.error } : {}),
  };
}

/**
 * @param {any} session
 * @param {string} message
 */
export function actionError(session, message) {
  return {
    session: cloneSession(session),
    events: [],
    output: null,
    error: message,
  };
}

/**
 * @param {any} session
 * @returns {boolean}
 */
export function isPlayable(session) {
  const status = session?.status;
  return (
    status === "playing" ||
    status === "waiting_user" ||
    status === "waiting_agent" ||
    status === "starting" ||
    status === "active" ||
    status === "running"
  );
}

/**
 * @param {any} session
 * @returns {Array<{ id: string, kind: "user"|"agent", name?: string, characterId?: string }>}
 */
export function listActors(session) {
  const actors = session?.actors;
  return Array.isArray(actors) ? actors : [];
}

/**
 * @param {any} session
 * @param {string} actorId
 */
export function getActor(session, actorId) {
  return listActors(session).find((a) => a.id === actorId) || null;
}

/**
 * @param {any} actor
 * @returns {boolean}
 */
export function isUserActor(actor) {
  if (!actor) return false;
  return actor.kind === "user" || actor.id === "user" || actor.kind === "human";
}

/**
 * Normalize a clue/answer token for duplicate detection.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]/gu, "");
}

/**
 * @param {string} prefix
 * @returns {string}
 */
export function makeId(prefix = "evt") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Append events onto session copy; returns mutated next session.
 * @param {any} session
 * @param {any[]} events
 */
export function appendEvents(session, events) {
  const next = cloneSession(session);
  const list = Array.isArray(next.events) ? next.events.slice() : [];
  let seq = list.length ? Number(list[list.length - 1].seq) || list.length : 0;
  for (const ev of events || []) {
    seq += 1;
    list.push({
      id: ev.id || makeId("evt"),
      sessionId: next.id,
      seq,
      createdAt: ev.createdAt || Date.now(),
      ...ev,
    });
  }
  next.events = list;
  next.updatedAt = Date.now();
  return next;
}

/**
 * @param {Partial<import('./events.js').GameEventInput>} input
 */
export function publicEvent(type, payload = {}, extra = {}) {
  return {
    type,
    payload,
    visibility: { type: "public" },
    ...extra,
  };
}

/**
 * @param {string[]} recipients
 * @param {string} type
 * @param {unknown} payload
 */
export function privateEvent(recipients, type, payload = {}, extra = {}) {
  return {
    type,
    payload,
    visibility: { type: "private", recipients: recipients.slice() },
    ...extra,
  };
}
