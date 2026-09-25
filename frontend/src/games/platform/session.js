/**
 * Common GameSession shape helpers.
 */

const STATUSES = new Set([
  "starting",
  "playing",
  "waiting_user",
  "waiting_agent",
  "paused",
  "finished",
  "aborted",
  "created",
  "active",
]);

export function normalizeSessionStatus(status) {
  const s = String(status || "").trim();
  if (s === "active" || s === "created") return s === "created" ? "starting" : "playing";
  return STATUSES.has(s) ? s : "playing";
}

/**
 * @param {object} input
 */
export function createGameSessionSkeleton(input = {}) {
  const now = Number(input.createdAt) || Date.now();
  return {
    id: String(input.id || "").trim(),
    gameId: String(input.gameId || "").trim(),
    gameVersion: String(input.gameVersion || input.version || "1.0.0").trim(),
    runtime: input.runtime === "group" ? "group" : "duo",
    conversationId: input.conversationId || undefined,
    status: normalizeSessionStatus(input.status || "starting"),
    phase: String(input.phase || "setup"),
    round: Math.max(0, Math.floor(Number(input.round) || 0)),
    state: input.state && typeof input.state === "object" ? input.state : {},
    rngSeed: String(input.rngSeed ?? input.seed ?? ""),
    createdAt: now,
    updatedAt: Number(input.updatedAt) || now,
    endedAt: input.endedAt,
    memoryPolicy: input.memoryPolicy || "game_only",
  };
}

export function buildGameResult(session, extra = {}) {
  return {
    sessionId: session?.id,
    gameId: session?.gameId,
    runtime: session?.runtime,
    status: session?.status,
    endedAt: session?.endedAt || Date.now(),
    ...extra,
  };
}
