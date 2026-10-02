/**
 * Group game registry — G1–G4.
 */

import * as justOne from "./just-one.js";
import * as sameThought from "./same-thought.js";
import * as undercover from "./undercover.js";
import * as oneNight from "./one-night.js";

const GAMES = [
  justOne,
  sameThought,
  undercover,
  oneNight,
];

/** @type {Map<string, any>} */
const BY_ID = new Map(GAMES.map((g) => [g.definition.id, g]));

/**
 * @param {string} id
 */
export function getGame(id) {
  return BY_ID.get(String(id || "")) || null;
}

/**
 * @returns {any[]}
 */
export function listGames() {
  return GAMES.map((g) => g.definition);
}

/**
 * @param {string} id
 */
export function requireGame(id) {
  const g = getGame(id);
  if (!g) throw new Error(`Unknown group game: ${id}`);
  return g;
}

export const GROUP_GAME_IDS = GAMES.map((g) => g.definition.id);

export { justOne, sameThought, undercover, oneNight };
