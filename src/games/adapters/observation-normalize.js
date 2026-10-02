/**
 * Map engine observations + legal actions into the prompt slot the
 * character agent actually sees.
 */

import { getDuoGame } from "../duo/games/index.js";
import { getDuoRules } from "../duo/rules.js";

/**
 * @param {object|null} rawObs
 * @param {{ legalActions?: any[] }} [opts]
 */
export function enrichDuoObservationForPrompt(rawObs, { legalActions = [] } = {}) {
  if (!rawObs || typeof rawObs !== "object" || rawObs.error) return rawObs || null;
  const gameId = String(rawObs.gameId || "").trim();
  const def = getDuoGame(gameId)?.definition;
  const allowed = Array.isArray(legalActions) && legalActions.length
    ? legalActions
    : (Array.isArray(rawObs.allowedActions) ? rawObs.allowedActions : []);
  return {
    ...rawObs,
    title: rawObs.title || def?.title || gameId,
    description: rawObs.description || def?.description || "",
    rules: rawObs.rules || getDuoRules(gameId) || def?.description || "",
    role: rawObs.role || rawObs.yourRole || "character",
    round: rawObs.round ?? rawObs.roundIndex ?? 0,
    allowedActions: allowed,
    outputContract: rawObs.outputContract || {
      speakInCharacter: true,
      action: "choose exactly one of allowedActions",
      mentionActionInSpeech: true,
    },
  };
}
