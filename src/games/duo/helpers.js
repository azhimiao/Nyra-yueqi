/**
 * Shared Duo engine helpers (immutable session patches).
 */

/**
 * @param {any} session
 * @returns {any}
 */
export function cloneSession(session) {
  if (!session || typeof session !== "object") return session;
  const rng = session._rng;
  const { _rng, ...rest } = session;
  const copy = structuredClone
    ? structuredClone(rest)
    : JSON.parse(JSON.stringify(rest));
  if (rng) {
    Object.defineProperty(copy, "_rng", {
      value: rng,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  return copy;
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
 * @param {{ events?: any[], output?: any, error?: string|null }} [meta]
 */
export function withGamePatch(session, patch, meta = {}) {
  const next = cloneSession(session);
  next.state = next.state || {};
  next.state.game = { ...(next.state.game || {}), ...patch };
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
export function assertPlayable(session) {
  const status = session?.status;
  return status === "active" || status === "running";
}

/**
 * Normalize actor labels.
 * @param {string} actor
 * @returns {"user"|"character"}
 */
export function normalizeActor(actor) {
  if (actor === "character" || actor === "ai" || actor === "companion") return "character";
  return "user";
}

/**
 * @param {string[]} types
 * @param {Record<string, any>} [extra]
 */
export function actionTypes(types, extra = {}) {
  return types.map((type) => ({ type, ...extra }));
}
