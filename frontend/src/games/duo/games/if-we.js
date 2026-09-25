/**
 * D8 如果是我们 — nyra.if-we
 * Scenario + hidden choices from both; reveal; compatibility score.
 */

import { IF_WE_SCENARIOS } from "../content/scenarios.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.if-we",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.ifWe.title"),
  description: t("games.duo.ifWe.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const TOTAL_ROUNDS = 6;

function compatibility(a, b, options) {
  if (a === b) return 3;
  const ai = options.findIndex((o) => o.id === a);
  const bi = options.findIndex((o) => o.id === b);
  if (ai < 0 || bi < 0) return 0;
  return Math.abs(ai - bi) === 1 ? 2 : 1;
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const order = rng.shuffle(IF_WE_SCENARIOS).slice(0, TOTAL_ROUNDS);
  const scenario = order[0];
  return {
    order,
    roundIndex: 0,
    totalRounds: order.length,
    scenario,
    phase: "choose",
    userChoice: null,
    characterChoice: null,
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
    scenario: {
      id: g.scenario.id,
      prompt: g.scenario.prompt,
      options: g.scenario.options,
    },
    totalScore: g.totalScore,
    scores: g.scores,
    finished: g.finished,
    youChose: actor === "user" ? Boolean(g.userChoice) : Boolean(g.characterChoice),
    partnerChose: actor === "user" ? Boolean(g.characterChoice) : Boolean(g.userChoice),
  };
  if (actor === "user" && g.userChoice && g.phase === "choose") {
    obs.yourChoice = g.userChoice;
  }
  if (actor === "character" && g.characterChoice && g.phase === "choose") {
    obs.yourChoice = g.characterChoice;
  }
  if (g.phase === "reveal" || g.finished) {
    obs.userChoice = g.userChoice;
    obs.characterChoice = g.characterChoice;
    obs.roundScore = g.roundScore;
  }
  return obs;
}

function resolve(session, g) {
  const score = compatibility(g.userChoice, g.characterChoice, g.scenario.options);
  const scores = g.scores.concat([score]);
  const totalScore = g.totalScore + score;
  const history = g.history.concat([
    {
      round: g.roundIndex,
      scenarioId: g.scenario.id,
      userChoice: g.userChoice,
      characterChoice: g.characterChoice,
      score,
    },
  ]);
  const finished = g.roundIndex + 1 >= g.totalRounds;
  return withGamePatch(
    session,
    {
      ...g,
      phase: "reveal",
      roundScore: score,
      scores,
      totalScore,
      history,
      finished,
    },
    {
      events: [{ type: "revealed", score }],
      output: { score, totalScore, finished },
    }
  );
}

function applyChoose(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  let g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase === "reveal") {
    if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
    return actionError(session, "awaiting_next_round");
  }
  if (g.phase !== "choose") return actionError(session, "not_choose_phase");

  const choice = String(action?.choice ?? action?.optionId ?? "").trim();
  const valid = g.scenario.options.some((o) => o.id === choice);
  if (!valid) return actionError(session, "invalid_choice");

  if (actor === "user") {
    if (g.userChoice) return actionError(session, "already_chosen");
    g = { ...g, userChoice: choice };
  } else {
    if (g.characterChoice) return actionError(session, "already_chosen");
    g = { ...g, characterChoice: choice };
  }

  if (g.userChoice && g.characterChoice) return resolve(session, g);
  return withGamePatch(session, g, {
    events: [{ type: "chose", by: actor }],
    output: { waiting: true },
  });
}

function applyNext(session) {
  const g = gameState(session);
  if (!g || g.finished || g.phase !== "reveal") return actionError(session, "cannot_advance");
  const roundIndex = g.roundIndex + 1;
  const scenario = g.order[roundIndex];
  return withGamePatch(
    session,
    {
      ...g,
      roundIndex,
      scenario,
      phase: "choose",
      userChoice: null,
      characterChoice: null,
      roundScore: null,
    },
    {
      events: [{ type: "round_started", round: roundIndex }],
      output: { roundIndex },
    }
  );
}

export function applyUserAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
  return applyChoose(session, action, "user");
}

export function applyCharacterAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
  return applyChoose(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "reveal") return [{ type: "next_round" }];
  if (g.phase === "choose") {
    const chosen = actor === "user" ? g.userChoice : g.characterChoice;
    if (!chosen) {
      return [
        {
          type: "choose",
          fields: ["choice"],
          options: g.scenario.options.map((o) => o.id),
        },
      ];
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
    maxScore: g.totalRounds * 3,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next_round" };
  if (g.phase === "choose" && !g.characterChoice) {
    const rng = session._rng;
    const opts = g.scenario.options;
    const pick = rng ? rng.pick(opts) : opts[0];
    return { choice: pick.id };
  }
  return null;
}
