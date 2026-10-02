/**
 * Deterministic Group Referee helpers.
 * Rules authority lives in code — never delegated to the LLM.
 */

import { createRng } from "./rng.js";
import { getActor, listActors, normalizeToken } from "./helpers.js";

/**
 * Assign roles from a pool (one role per actor). Extra roles become center / unused.
 * @param {Array<{ id: string }>} actors
 * @param {string[]} rolePool
 * @param {import("./rng.js").GroupRng | string | number} rngOrSeed
 * @returns {{ assignments: Record<string, string>, center: string[], order: string[] }}
 */
export function assignRoles(actors, rolePool, rngOrSeed) {
  const rng =
    rngOrSeed && typeof rngOrSeed === "object" && typeof rngOrSeed.shuffle === "function"
      ? rngOrSeed
      : createRng(rngOrSeed);
  const ids = (actors || []).map((a) => a.id);
  const roles = rng.shuffle((rolePool || []).slice());
  const assignments = {};
  const take = Math.min(ids.length, roles.length);
  const order = rng.shuffle(ids.slice());
  for (let i = 0; i < take; i += 1) {
    assignments[order[i]] = roles[i];
  }
  const center = roles.slice(take);
  return { assignments, center, order };
}

/**
 * Pick N undercover seats among actors (deterministic).
 * @param {string[]} actorIds
 * @param {number} undercoverCount
 * @param {import("./rng.js").GroupRng} rng
 */
export function assignUndercoverSeats(actorIds, undercoverCount, rng) {
  const shuffled = rng.shuffle(actorIds.slice());
  const n = Math.max(1, Math.min(undercoverCount, Math.max(1, shuffled.length - 1)));
  const undercover = new Set(shuffled.slice(0, n));
  /** @type {Record<string, "civilian"|"undercover">} */
  const roles = {};
  for (const id of actorIds) {
    roles[id] = undercover.has(id) ? "undercover" : "civilian";
  }
  return roles;
}

/**
 * Tally votes → { counts, winnerId|null, tied: boolean }.
 * @param {Record<string, string>} votes actorId → targetId
 * @param {string[]} [eligible] only count votes for these targets
 */
export function tallyVotes(votes, eligible) {
  const counts = {};
  const allow = eligible ? new Set(eligible) : null;
  for (const target of Object.values(votes || {})) {
    if (!target) continue;
    if (allow && !allow.has(target)) continue;
    counts[target] = (counts[target] || 0) + 1;
  }
  let best = 0;
  const leaders = [];
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      leaders.length = 0;
      leaders.push(id);
    } else if (n === best) {
      leaders.push(id);
    }
  }
  if (!leaders.length || best <= 0) {
    return { counts, winnerId: null, tied: false, max: 0 };
  }
  if (leaders.length > 1) {
    return { counts, winnerId: null, tied: true, max: best, leaders };
  }
  return { counts, winnerId: leaders[0], tied: false, max: best, leaders };
}

/**
 * Eliminate actor from alive list.
 * @param {string[]} alive
 * @param {string|null} targetId
 */
export function eliminate(alive, targetId) {
  if (!targetId) return { alive: alive.slice(), eliminated: null };
  const next = alive.filter((id) => id !== targetId);
  return { alive: next, eliminated: alive.includes(targetId) ? targetId : null };
}

/**
 * Normalize + find duplicate clue groups.
 * @param {Record<string, string>} clues
 * @returns {{ normalized: Record<string, string>, kept: Record<string, string>, removed: Record<string, string>, groups: Record<string, string[]> }}
 */
export function normalizeAndDedupeClues(clues) {
  /** @type {Record<string, string>} */
  const normalized = {};
  /** @type {Record<string, string[]>} */
  const groups = {};
  for (const [actorId, raw] of Object.entries(clues || {})) {
    const norm = normalizeToken(raw);
    normalized[actorId] = norm;
    if (!norm) continue;
    if (!groups[norm]) groups[norm] = [];
    groups[norm].push(actorId);
  }
  /** @type {Record<string, string>} */
  const kept = {};
  /** @type {Record<string, string>} */
  const removed = {};
  for (const [actorId, norm] of Object.entries(normalized)) {
    if (!norm) {
      removed[actorId] = clues[actorId];
      continue;
    }
    if ((groups[norm] || []).length > 1) {
      removed[actorId] = clues[actorId];
    } else {
      kept[actorId] = clues[actorId];
    }
  }
  return { normalized, kept, removed, groups };
}

/**
 * Group identical normalized answers and score by match size - 1 (or 0 if unique).
 * @param {Record<string, string>} answers
 */
export function matchAnswerScores(answers) {
  const { normalized, groups } = normalizeAndDedupeClues(answers);
  /** @type {Record<string, number>} */
  const scores = {};
  /** @type {Array<{ token: string, actors: string[], size: number }>} */
  const matchGroups = [];
  for (const [token, actors] of Object.entries(groups)) {
    if (!token) continue;
    matchGroups.push({ token, actors: actors.slice(), size: actors.length });
    const points = Math.max(0, actors.length - 1);
    for (const id of actors) scores[id] = points;
  }
  for (const id of Object.keys(answers || {})) {
    if (scores[id] == null) scores[id] = 0;
  }
  matchGroups.sort((a, b) => b.size - a.size || a.token.localeCompare(b.token));
  return { normalized, scores, matchGroups };
}

/**
 * Delegate applyAction to a game module (referee façade).
 * @param {{ applyAction: Function }} game
 * @param {any} session
 * @param {string} actorId
 * @param {any} action
 */
export function applyAction(game, session, actorId, action) {
  if (!game || typeof game.applyAction !== "function") {
    return { session, events: [], error: "no_game_applyAction" };
  }
  const actor = getActor(session, actorId);
  if (!actor) {
    return { session, events: [], error: "unknown_actor" };
  }
  return game.applyAction(session, actorId, action);
}

/**
 * Win-check façade.
 * @param {{ isFinished?: Function, result?: Function, checkWin?: Function }} game
 * @param {any} session
 */
export function checkWin(game, session) {
  if (game && typeof game.checkWin === "function") return game.checkWin(session);
  if (game && typeof game.isFinished === "function" && game.isFinished(session)) {
    return game.result?.(session) ?? { finished: true };
  }
  return null;
}

/**
 * Legal action check.
 * @param {{ legalActions: Function }} game
 * @param {any} session
 * @param {string} actorId
 * @param {any} action
 */
export function isLegalAction(game, session, actorId, action) {
  const legal = game.legalActions?.(session, actorId) || [];
  if (!legal.length) return false;
  const type = action?.type || action?.action;
  return legal.some((item) => {
    if (typeof item === "string") return item === type;
    if (item?.type && item.type !== type) return false;
    if (item?.targets && action?.target != null) {
      return item.targets.includes(action.target);
    }
    return item?.type === type;
  });
}

/**
 * Alive actors helper.
 * @param {any} session
 * @param {string[]} [aliveIds]
 */
export function aliveActors(session, aliveIds) {
  const actors = listActors(session);
  if (!aliveIds) return actors;
  const set = new Set(aliveIds);
  return actors.filter((a) => set.has(a.id));
}

export { normalizeToken };
