/**
 * D1 同频 — nyra.resonance
 * Spectrum 0–100, alternate clue giver, 6 rounds.
 */

import { SPECTRA } from "../content/spectra.js";
import { t } from "../../../i18n/index.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";

export const definition = {
  id: "nyra.resonance",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.resonance.title"),
  description: t("games.duo.resonance.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const TOTAL_ROUNDS = 6;

function scoreDiff(diff) {
  const d = Math.abs(diff);
  if (d <= 5) return 3;
  if (d <= 12) return 2;
  if (d <= 20) return 1;
  return 0;
}

function clueIsIllegal(clue) {
  const s = String(clue ?? "");
  if (!s.trim()) return "线索不能为空";
  if (/\d/.test(s)) return "线索不能包含数字";
  if (/%/.test(s) || /百分之|百分位|位置/.test(s)) return "线索不能暗示具体位置或百分数";
  return null;
}

function startRound(g, rng) {
  const spectrum = SPECTRA[(g.roundIndex + (g.seedSalt || 0)) % SPECTRA.length];
  const target = rng.int(0, 100);
  const clueGiver = g.roundIndex % 2 === 0 ? "user" : "character";
  return {
    ...g,
    phase: "clue",
    spectrum,
    target,
    clueGiver,
    clue: null,
    guess: null,
    roundScore: null,
  };
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ seed, rng }) {
  const base = {
    seedSalt: typeof seed === "number" ? seed : rng.int(0, 9999),
    roundIndex: 0,
    totalRounds: TOTAL_ROUNDS,
    scores: [],
    totalScore: 0,
    history: [],
    finished: false,
    winner: null,
  };
  return startRound(base, rng);
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const isGiver = actor === g.clueGiver;
  const obs = {
    gameId: definition.id,
    title: definition.title,
    roundIndex: g.roundIndex,
    totalRounds: g.totalRounds,
    phase: g.phase,
    spectrum: g.spectrum,
    clueGiver: g.clueGiver,
    yourRole: isGiver ? "clue_giver" : "guesser",
    clue: g.clue,
    totalScore: g.totalScore,
    scores: g.scores,
    finished: g.finished,
  };
  if (isGiver && (g.phase === "clue" || g.phase === "guess")) {
    obs.target = g.target;
  }
  if (g.phase === "reveal" || g.finished) {
    obs.target = g.target;
    obs.guess = g.guess;
    obs.roundScore = g.roundScore;
  }
  return obs;
}

function advanceAfterGuess(session, g, guess, actor) {
  const roundScore = scoreDiff(guess - g.target);
  const scores = g.scores.concat([roundScore]);
  const totalScore = g.totalScore + roundScore;
  const history = g.history.concat([
    {
      round: g.roundIndex,
      spectrum: g.spectrum,
      target: g.target,
      clue: g.clue,
      guess,
      clueGiver: g.clueGiver,
      score: roundScore,
    },
  ]);
  const nextRoundIndex = g.roundIndex + 1;
  const finished = nextRoundIndex >= g.totalRounds;
  let patch = {
    ...g,
    phase: "reveal",
    guess,
    roundScore,
    scores,
    totalScore,
    history,
    finished,
  };
  const events = [
    { type: "round_scored", round: g.roundIndex, score: roundScore, by: actor },
  ];
  if (finished) {
    patch.winner = "draw";
    events.push({ type: "finished", totalScore });
    return withGamePatch(session, patch, {
      events,
      output: { roundScore, totalScore, finished: true },
    });
  }
  return withGamePatch(session, patch, {
    events,
    output: { roundScore, totalScore, finished: false, awaitNext: true },
  });
}

function maybeBeginNextRound(session, g, rng) {
  if (g.finished || g.phase !== "reveal") return null;
  const next = startRound(
    {
      ...g,
      roundIndex: g.roundIndex + 1,
      clue: null,
      guess: null,
      roundScore: null,
      target: null,
    },
    rng
  );
  return withGamePatch(session, next, {
    events: [{ type: "round_started", round: next.roundIndex }],
    output: { roundIndex: next.roundIndex },
  });
}

function applyClue(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (g.finished) return actionError(session, "already_finished");
  if (g.phase === "reveal") {
    // Auto-advance on next action after reveal
    const rng = session._rng;
    if (rng) {
      const advanced = maybeBeginNextRound(session, g, rng);
      if (advanced) {
        return applyClue(advanced.session, action, actor);
      }
    }
  }
  if (g.phase !== "clue") return actionError(session, "not_clue_phase");
  if (actor !== g.clueGiver) return actionError(session, "not_your_turn");
  const illegal = clueIsIllegal(action?.clue);
  if (illegal) return actionError(session, illegal);
  return withGamePatch(
    session,
    { ...g, phase: "guess", clue: String(action.clue).trim() },
    {
      events: [{ type: "clue_given", by: actor }],
      output: { phase: "guess" },
    }
  );
}

function applyGuess(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (g.finished) return actionError(session, "already_finished");
  if (g.phase === "reveal") {
    const rng = session._rng;
    if (rng) {
      const advanced = maybeBeginNextRound(session, g, rng);
      if (advanced) return applyGuess(advanced.session, action, actor);
    }
  }
  if (g.phase !== "guess") return actionError(session, "not_guess_phase");
  if (actor === g.clueGiver) return actionError(session, "clue_giver_cannot_guess");
  const value = Number(action?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return actionError(session, "value_must_be_0_to_100");
  }
  return advanceAfterGuess(session, g, Math.round(value), actor);
}

function applyAction(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g) return actionError(session, "no_game");

  // Allow explicit next_round
  if (action?.type === "next_round" || action?.nextRound) {
    if (g.phase !== "reveal" || g.finished) return actionError(session, "cannot_advance");
    const rng = session._rng;
    if (!rng) return actionError(session, "rng_missing");
    return maybeBeginNextRound(session, g, rng);
  }

  if (action?.clue != null && action?.value == null) return applyClue(session, action, actor);
  if (action?.value != null) return applyGuess(session, action, actor);
  if (action?.type === "clue") return applyClue(session, action, actor);
  if (action?.type === "guess") return applyGuess(session, action, actor);
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
  if (g.phase === "clue" && actor === g.clueGiver) return [{ type: "clue", fields: ["clue"] }];
  if (g.phase === "guess" && actor !== g.clueGiver) return [{ type: "guess", fields: ["value"] }];
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
    maxScore: g.totalRounds * 3,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next_round" };
  if (g.phase === "clue" && g.clueGiver === "character") {
    const left = g.spectrum?.left || "一端";
    const right = g.spectrum?.right || "另一端";
    const t = g.target ?? 50;
    let clue = "偏中间一点";
    if (t <= 25) clue = `更靠近${left}`;
    else if (t >= 75) clue = `更靠近${right}`;
    else if (t < 45) clue = `略偏${left}`;
    else if (t > 55) clue = `略偏${right}`;
    return { clue };
  }
  if (g.phase === "guess" && g.clueGiver === "user") {
    return { value: 50 };
  }
  return null;
}
