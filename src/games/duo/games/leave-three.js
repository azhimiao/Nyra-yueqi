/**
 * D9 留下三个 — nyra.leave-three
 * Candidates; each secretly selects/ranks 3; overlap score.
 */

import { LEAVE_THREE_POOLS } from "../content/leave-three.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.leave-three",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.leaveThree.title"),
  description: t("games.duo.leaveThree.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const PICK = 3;
const TOTAL_ROUNDS = 4;

function overlapScore(userPick, charPick) {
  // userPick / charPick: ranked arrays length 3
  let score = 0;
  const charIndex = new Map(charPick.map((v, i) => [v, i]));
  userPick.forEach((item, ui) => {
    if (!charIndex.has(item)) return;
    const ci = charIndex.get(item);
    score += 2; // shared item
    if (ui === ci) score += 1; // same rank bonus
  });
  return score;
}

function normalizePick(action, candidates) {
  let pick = action?.picks ?? action?.select ?? action?.rank ?? action?.items;
  if (typeof pick === "string") {
    pick = pick.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(pick) || pick.length !== PICK) return null;
  const set = new Set(pick);
  if (set.size !== PICK) return null;
  if (!pick.every((p) => candidates.includes(p))) return null;
  return pick;
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const order = rng.shuffle(LEAVE_THREE_POOLS).slice(0, TOTAL_ROUNDS);
  const pool = order[0];
  return {
    order,
    roundIndex: 0,
    totalRounds: order.length,
    pool,
    phase: "select",
    userPick: null,
    characterPick: null,
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
    pool: {
      id: g.pool.id,
      title: g.pool.title,
      candidates: g.pool.candidates,
    },
    pickCount: PICK,
    totalScore: g.totalScore,
    scores: g.scores,
    finished: g.finished,
    youSelected: actor === "user" ? Boolean(g.userPick) : Boolean(g.characterPick),
    partnerSelected: actor === "user" ? Boolean(g.characterPick) : Boolean(g.userPick),
  };
  if (actor === "user" && g.userPick && g.phase === "select") obs.yourPick = g.userPick;
  if (actor === "character" && g.characterPick && g.phase === "select") obs.yourPick = g.characterPick;
  if (g.phase === "reveal" || g.finished) {
    obs.userPick = g.userPick;
    obs.characterPick = g.characterPick;
    obs.roundScore = g.roundScore;
  }
  return obs;
}

function resolve(session, g) {
  const score = overlapScore(g.userPick, g.characterPick);
  const scores = g.scores.concat([score]);
  const totalScore = g.totalScore + score;
  const history = g.history.concat([
    {
      round: g.roundIndex,
      poolId: g.pool.id,
      userPick: g.userPick,
      characterPick: g.characterPick,
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

function applySelect(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  let g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase === "reveal") {
    if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
    return actionError(session, "awaiting_next_round");
  }
  if (g.phase !== "select") return actionError(session, "not_select_phase");

  const pick = normalizePick(action, g.pool.candidates);
  if (!pick) return actionError(session, "must_pick_exactly_3_unique_candidates");

  if (actor === "user") {
    if (g.userPick) return actionError(session, "already_selected");
    g = { ...g, userPick: pick };
  } else {
    if (g.characterPick) return actionError(session, "already_selected");
    g = { ...g, characterPick: pick };
  }

  if (g.userPick && g.characterPick) return resolve(session, g);
  return withGamePatch(session, g, {
    events: [{ type: "selected", by: actor }],
    output: { waiting: true },
  });
}

function applyNext(session) {
  const g = gameState(session);
  if (!g || g.finished || g.phase !== "reveal") return actionError(session, "cannot_advance");
  const roundIndex = g.roundIndex + 1;
  return withGamePatch(
    session,
    {
      ...g,
      roundIndex,
      pool: g.order[roundIndex],
      phase: "select",
      userPick: null,
      characterPick: null,
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
  return applySelect(session, action, "user");
}

export function applyCharacterAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound) return applyNext(session);
  return applySelect(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "reveal") return [{ type: "next_round" }];
  if (g.phase === "select") {
    const done = actor === "user" ? g.userPick : g.characterPick;
    if (!done) {
      return [
        {
          type: "select",
          fields: ["picks"],
          pickCount: PICK,
          candidates: g.pool.candidates,
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
    maxScore: g.totalRounds * 9,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next_round" };
  if (g.phase === "select" && !g.characterPick) {
    const rng = session._rng;
    const c = g.pool.candidates;
    const picks = rng ? rng.shuffle(c).slice(0, PICK) : c.slice(0, PICK);
    return { picks };
  }
  return null;
}
