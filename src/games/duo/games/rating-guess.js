/**
 * D2 你觉得我是几分 — nyra.rating-guess
 * Simultaneous secret ratings; 6 rounds.
 */

import { RATING_PROMPTS } from "../content/questions.js";
import { t } from "../../../i18n/index.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";

export const definition = {
  id: "nyra.rating-guess",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.ratingGuess.title"),
  description: t("games.duo.ratingGuess.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const TOTAL_ROUNDS = 6;

function scorePair(actual, predicted) {
  const diff = Math.abs(Number(actual) - Number(predicted));
  return Math.max(0, 10 - Math.ceil(diff / 10));
}

function clampRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function promptFor(roundIndex, salt) {
  return RATING_PROMPTS[(roundIndex + (salt || 0)) % RATING_PROMPTS.length];
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ seed, rng }) {
  return {
    seedSalt: typeof seed === "number" ? seed : rng.int(0, 9999),
    roundIndex: 0,
    totalRounds: TOTAL_ROUNDS,
    prompt: promptFor(0, 0),
    phase: "submit",
    userSubmit: null,
    characterSubmit: null,
    scores: [],
    totalScore: 0,
    history: [],
    finished: false,
  };
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const obs = {
    gameId: definition.id,
    title: definition.title,
    roundIndex: g.roundIndex,
    totalRounds: g.totalRounds,
    phase: g.phase,
    prompt: g.prompt,
    totalScore: g.totalScore,
    scores: g.scores,
    finished: g.finished,
    youSubmitted: actor === "user" ? Boolean(g.userSubmit) : Boolean(g.characterSubmit),
    partnerSubmitted:
      actor === "user" ? Boolean(g.characterSubmit) : Boolean(g.userSubmit),
  };
  if (g.phase === "reveal" || g.finished) {
    obs.userSubmit = g.userSubmit;
    obs.characterSubmit = g.characterSubmit;
    obs.roundScore = g.roundScore;
  } else if (actor === "user" && g.userSubmit) {
    obs.yourSubmit = g.userSubmit;
  } else if (actor === "character" && g.characterSubmit) {
    obs.yourSubmit = g.characterSubmit;
  }
  return obs;
}

function resolveRound(session, g) {
  const u = g.userSubmit;
  const c = g.characterSubmit;
  const userPredictScore = scorePair(c.selfRating, u.predictionOfCharacter);
  const charPredictScore = scorePair(u.selfRating, c.predictionOfUser);
  const roundScore = userPredictScore + charPredictScore;
  const scores = g.scores.concat([roundScore]);
  const totalScore = g.totalScore + roundScore;
  const history = g.history.concat([
    {
      round: g.roundIndex,
      prompt: g.prompt,
      userSubmit: u,
      characterSubmit: c,
      userPredictScore,
      charPredictScore,
      roundScore,
    },
  ]);
  const nextRound = g.roundIndex + 1;
  const finished = nextRound >= g.totalRounds;
  const patch = {
    ...g,
    phase: "reveal",
    roundScore,
    userPredictScore,
    charPredictScore,
    scores,
    totalScore,
    history,
    finished,
  };
  const events = [{ type: "round_scored", round: g.roundIndex, score: roundScore }];
  if (finished) events.push({ type: "finished", totalScore });
  return withGamePatch(session, patch, {
    events,
    output: { roundScore, totalScore, finished },
  });
}

function applySubmit(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  let g = gameState(session);
  if (!g) return actionError(session, "no_game");
  if (g.finished) return actionError(session, "already_finished");

  if (g.phase === "reveal") {
    if (action?.type === "next_round" || action?.nextRound) {
      return beginNext(session, g);
    }
    // ignore stale; require next_round
    return actionError(session, "awaiting_next_round");
  }

  if (g.phase !== "submit") return actionError(session, "not_submit_phase");

  const selfRating = clampRating(action?.selfRating);
  const prediction =
    actor === "user"
      ? clampRating(action?.predictionOfCharacter)
      : clampRating(action?.predictionOfUser);
  if (selfRating == null || prediction == null) {
    return actionError(session, "ratings_must_be_0_to_100");
  }

  const submit =
    actor === "user"
      ? { selfRating, predictionOfCharacter: prediction }
      : { selfRating, predictionOfUser: prediction };

  if (actor === "user") {
    if (g.userSubmit) return actionError(session, "already_submitted");
    g = { ...g, userSubmit: submit };
  } else {
    if (g.characterSubmit) return actionError(session, "already_submitted");
    g = { ...g, characterSubmit: submit };
  }

  if (g.userSubmit && g.characterSubmit) {
    return resolveRound(session, g);
  }

  return withGamePatch(session, g, {
    events: [{ type: "submitted", by: actor }],
    output: { waiting: true },
  });
}

function beginNext(session, g) {
  if (g.finished || g.phase !== "reveal") return actionError(session, "cannot_advance");
  const roundIndex = g.roundIndex + 1;
  const patch = {
    ...g,
    roundIndex,
    prompt: promptFor(roundIndex, g.seedSalt),
    phase: "submit",
    userSubmit: null,
    characterSubmit: null,
    roundScore: null,
    userPredictScore: null,
    charPredictScore: null,
  };
  return withGamePatch(session, patch, {
    events: [{ type: "round_started", round: roundIndex }],
    output: { roundIndex },
  });
}

export function applyUserAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound) {
    const g = gameState(session);
    return beginNext(session, g);
  }
  return applySubmit(session, action, "user");
}

export function applyCharacterAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound) {
    const g = gameState(session);
    return beginNext(session, g);
  }
  return applySubmit(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "reveal") return [{ type: "next_round" }];
  if (g.phase === "submit") {
    if (actor === "user" && !g.userSubmit) {
      return [{ type: "submit", fields: ["selfRating", "predictionOfCharacter"] }];
    }
    if (actor === "character" && !g.characterSubmit) {
      return [{ type: "submit", fields: ["selfRating", "predictionOfUser"] }];
    }
  }
  return [];
}

export function isFinished(session) {
  return Boolean(gameState(session)?.finished);
}

export function result(session) {
  const g = gameState(session);
  if (!g) return null;
  return {
    totalScore: g.totalScore,
    scores: g.scores,
    history: g.history,
    maxScore: g.totalRounds * 20,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next_round" };
  if (g.phase === "submit" && !g.characterSubmit) {
    const rng = session._rng;
    const self = rng ? rng.int(35, 75) : 50;
    const pred = rng ? rng.int(30, 80) : 50;
    return { selfRating: self, predictionOfUser: pred };
  }
  return null;
}
