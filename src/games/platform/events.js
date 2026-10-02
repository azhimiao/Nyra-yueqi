/**
 * GameEvent helpers — engine facts only.
 */

function clean(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

/**
 * @param {object} input
 */
export function createGameEvent(input = {}) {
  const visibility = input.visibility && typeof input.visibility === "object"
    ? input.visibility
    : { type: "public" };
  return {
    id: clean(input.id, 80) || `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId: clean(input.sessionId, 120),
    seq: Math.max(0, Math.floor(Number(input.seq) || 0)),
    type: clean(input.type, 80) || "event",
    actorId: input.actorId ? clean(input.actorId, 80) : undefined,
    targetId: input.targetId ? clean(input.targetId, 80) : undefined,
    payload: input.payload,
    visibility,
    createdAt: Number(input.createdAt) || Date.now(),
  };
}

export function isVisibleTo(event, actorId) {
  const v = event?.visibility || { type: "public" };
  if (v.type === "public" || v.type === "system") return true;
  if (v.type === "private") {
    return Array.isArray(v.recipients) && v.recipients.includes(actorId);
  }
  if (v.type === "team") {
    return Array.isArray(v.memberIds) && v.memberIds.includes(actorId);
  }
  return false;
}
