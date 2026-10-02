/**
 * Duo game registry — D1–D10.
 */

import * as resonance from "./resonance.js";
import * as ratingGuess from "./rating-guess.js";
import * as cipher from "./cipher.js";
import * as heartbeat from "./heartbeat.js";
import * as twentyQuestions from "./twenty-questions.js";
import * as taboo from "./taboo.js";
import * as secretSequence from "./secret-sequence.js";
import * as ifWe from "./if-we.js";
import * as leaveThree from "./leave-three.js";
import * as weRemember from "./we-remember.js";

/** @type {Record<string, any>} */
export const DUO_GAMES = {
  [resonance.definition.id]: resonance,
  [ratingGuess.definition.id]: ratingGuess,
  [cipher.definition.id]: cipher,
  [heartbeat.definition.id]: heartbeat,
  [twentyQuestions.definition.id]: twentyQuestions,
  [taboo.definition.id]: taboo,
  [secretSequence.definition.id]: secretSequence,
  [ifWe.definition.id]: ifWe,
  [leaveThree.definition.id]: leaveThree,
  [weRemember.definition.id]: weRemember,
};

export const DUO_GAME_LIST = Object.values(DUO_GAMES).map((g) => g.definition);

/**
 * @param {string} id
 */
export function getDuoGame(id) {
  return DUO_GAMES[id] || null;
}

export function listDuoGames() {
  return DUO_GAME_LIST.slice();
}
