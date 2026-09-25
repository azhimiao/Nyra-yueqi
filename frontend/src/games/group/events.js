/**
 * GameEvent helpers for Group runtime.
 *
 * @typedef {{
 *   type: "public"
 * } | {
 *   type: "private",
 *   recipients: string[]
 * } | {
 *   type: "team",
 *   teamId: string
 * } | {
 *   type: "system"
 * }} EventVisibility
 *
 * @typedef {{
 *   id?: string,
 *   sessionId?: string,
 *   seq?: number,
 *   type: string,
 *   actorId?: string,
 *   targetId?: string,
 *   payload?: unknown,
 *   visibility: EventVisibility,
 *   createdAt?: number
 * }} GameEventInput
 */

/**
 * @param {any} event
 * @param {string} actorId
 * @param {any} session
 * @returns {boolean}
 */
export function eventVisibleTo(event, actorId, session) {
  if (!event) return false;
  const vis = event.visibility || { type: "public" };
  if (vis.type === "public") return true;
  if (vis.type === "system") return false;
  if (vis.type === "private") {
    return Array.isArray(vis.recipients) && vis.recipients.includes(actorId);
  }
  if (vis.type === "team") {
    const teams = session?.state?.game?.teams || session?.state?.teams || {};
    const members = teams[vis.teamId] || [];
    return members.includes(actorId);
  }
  return false;
}

/**
 * @param {any} session
 * @param {string} actorId
 * @param {number} [limit]
 */
export function recentVisibleEvents(session, actorId, limit = 20) {
  const events = Array.isArray(session?.events) ? session.events : [];
  const visible = events.filter((ev) => eventVisibleTo(ev, actorId, session));
  return visible.slice(-Math.max(1, limit));
}
