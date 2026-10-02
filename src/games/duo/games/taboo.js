/**
 * D6 不能说的词 — nyra.taboo
 * Target + forbidden terms; clue must not contain forbidden; then guess.
 */

import { TABOO_TARGETS } from "../content/words.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.taboo",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.taboo.title"),
  description: t("games.duo.taboo.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const MAX_ROUNDS = 5;
const MAX_CLUES_PER_ROUND = 3;

function containsForbidden(text, forbidden) {
  const s = String(text || "").toLowerCase();
  return forbidden.find((f) => s.includes(String(f).toLowerCase())) || null;
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const deck = rng.shuffle(TABOO_TARGETS);
  const card = deck[0];
  return {
    deck,
    deckIndex: 0,
    roundIndex: 0,
    maxRounds: Math.min(MAX_ROUNDS, deck.length),
    target: card.target,
    forbidden: card.forbidden.slice(),
    clueGiver: "user",
    phase: "clue",
    clues: [],
    cluesLeft: MAX_CLUES_PER_ROUND,
    scores: [],
    totalScore: 0,
    finished: false,
    history: [],
  };
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const isGiver = actor === g.clueGiver;
  const obs = {
    gameId: definition.id,
    title: definition.title,
    roundIndex: g.roundIndex,
    maxRounds: g.maxRounds,
    phase: g.phase,
    clueGiver: g.clueGiver,
    clues: g.clues,
    cluesLeft: g.cluesLeft,
    totalScore: g.totalScore,
    finished: g.finished,
    yourRole: isGiver ? "clue_giver" : "guesser",
  };
  if (isGiver || g.finished || g.phase === "reveal") {
    obs.target = g.target;
    obs.forbidden = g.forbidden;
  }
  if (g.phase === "reveal" || g.finished) {
    obs.lastGuess = g.lastGuess;
    obs.roundScore = g.roundScore;
  }
  return obs;
}

function nextCard(g) {
  const deckIndex = g.deckIndex + 1;
  const card = g.deck[deckIndex % g.deck.length];
  const clueGiver = g.clueGiver === "user" ? "character" : "user";
  return {
    ...g,
    deckIndex,
    roundIndex: g.roundIndex + 1,
    target: card.target,
    forbidden: card.forbidden.slice(),
    clueGiver,
    phase: "clue",
    clues: [],
    cluesLeft: MAX_CLUES_PER_ROUND,
    lastGuess: null,
    roundScore: null,
  };
}

function applyClue(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase !== "clue") return actionError(session, "not_clue_phase");
  if (actor !== g.clueGiver) return actionError(session, "not_your_turn");
  if (g.cluesLeft <= 0) return actionError(session, "no_clues_left");

  const clue = String(action?.clue ?? "").trim();
  if (!clue) return actionError(session, "clue_required");
  if (clue === g.target) return actionError(session, "cannot_say_target");
  const hit = containsForbidden(clue, g.forbidden);
  if (hit) return actionError(session, `forbidden_term:${hit}`);

  const clues = g.clues.concat([clue]);
  return withGamePatch(
    session,
    {
      ...g,
      clues,
      cluesLeft: g.cluesLeft - 1,
      phase: "guess",
    },
    {
      events: [{ type: "clue", clue, by: actor }],
      output: { phase: "guess", clues },
    }
  );
}

function applyGuess(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase !== "guess" && g.phase !== "clue") return actionError(session, "not_guess_phase");
  if (actor === g.clueGiver) return actionError(session, "clue_giver_cannot_guess");

  const guess = String(action?.guess ?? "").trim();
  if (!guess) return actionError(session, "guess_required");
  const ok = guess === g.target;
  const roundScore = ok ? Math.max(1, 4 - g.clues.length) : 0;
  const scores = g.scores.concat([roundScore]);
  const totalScore = g.totalScore + roundScore;
  const history = g.history.concat([
    {
      round: g.roundIndex,
      target: g.target,
      clues: g.clues,
      guess,
      score: roundScore,
    },
  ]);
  const finished = g.roundIndex + 1 >= g.maxRounds;
  let patch = {
    ...g,
    phase: "reveal",
    lastGuess: guess,
    roundScore,
    scores,
    totalScore,
    history,
    finished,
  };
  const events = [{ type: "guess", guess, correct: ok, score: roundScore }];
  if (finished) {
    events.push({ type: "finished", totalScore });
    return withGamePatch(session, patch, { events, output: { correct: ok, finished: true, totalScore } });
  }
  return withGamePatch(session, patch, {
    events,
    output: { correct: ok, finished: false },
  });
}

function applyNext(session) {
  const g = gameState(session);
  if (!g || g.finished || g.phase !== "reveal") return actionError(session, "cannot_advance");
  return withGamePatch(session, nextCard(g), {
    events: [{ type: "round_started", round: g.roundIndex + 1 }],
    output: { roundIndex: g.roundIndex + 1 },
  });
}

function applyAction(session, action, actor) {
  if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
  if (action?.guess != null || action?.type === "guess") return applyGuess(session, action, actor);
  if (action?.clue != null || action?.type === "clue") return applyClue(session, action, actor);
  return actionError(session, "unknown_action");
}

export function applyUserAction(session, action) {
  return applyAction(session, action, "user");
}

export function applyCharacterAction(session, action) {
  return applyAction(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "reveal") return [{ type: "next_round" }];
  if (g.phase === "clue" && actor === g.clueGiver && g.cluesLeft > 0) {
    return [{ type: "clue", fields: ["clue"] }];
  }
  if ((g.phase === "guess" || g.phase === "clue") && actor !== g.clueGiver && g.clues.length) {
    return [{ type: "guess", fields: ["guess"] }];
  }
  return [];
}

export function isFinished(session) {
  return Boolean(gameState(session)?.finished);
}

export function result(session) {
  const g = gameState(session);
  if (!g) return null;
  return { totalScore: g.totalScore, scores: g.scores, history: g.history };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next_round" };
  if (g.phase === "clue" && g.clueGiver === "character") {
    return { clue: "和日常出行或消遣有关的地方" };
  }
  if (g.phase === "guess" && g.clueGiver === "user") {
    return { guess: g.target };
  }
  return null;
}
