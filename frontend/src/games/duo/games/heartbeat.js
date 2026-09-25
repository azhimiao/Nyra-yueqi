/**
 * D4 心跳同步 — nyra.heartbeat
 * The Mind-like: hidden numbers, play ascending, lives, escalating rounds.
 */

import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.heartbeat",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.heartbeat.title"),
  description: t("games.duo.heartbeat.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const MAX_ROUNDS = 5;
const START_LIVES = 3;

function cardsForRound(roundIndex) {
  return Math.min(2 + roundIndex, 6);
}

function deal(rng, count) {
  const pool = rng.shuffle([...Array(100).keys()].map((n) => n + 1));
  return {
    user: pool.slice(0, count).sort((a, b) => a - b),
    character: pool.slice(count, count * 2).sort((a, b) => a - b),
  };
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const roundIndex = 0;
  const hands = deal(rng, cardsForRound(roundIndex));
  return {
    roundIndex,
    maxRounds: MAX_ROUNDS,
    lives: START_LIVES,
    errors: 0,
    lastPlayed: 0,
    pile: [],
    userHand: hands.user,
    characterHand: hands.character,
    phase: "play",
    finished: false,
    outcome: null,
    syncScore: 0,
  };
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const obs = {
    gameId: definition.id,
    title: definition.title,
    roundIndex: g.roundIndex,
    maxRounds: g.maxRounds,
    lives: g.lives,
    errors: g.errors,
    lastPlayed: g.lastPlayed,
    pile: g.pile,
    phase: g.phase,
    finished: g.finished,
    outcome: g.outcome,
    syncScore: g.syncScore,
    yourHand: actor === "user" ? g.userHand : g.characterHand,
    yourCount: actor === "user" ? g.userHand.length : g.characterHand.length,
    partnerCount: actor === "user" ? g.characterHand.length : g.userHand.length,
  };
  return obs;
}

function bothEmpty(g) {
  return g.userHand.length === 0 && g.characterHand.length === 0;
}

function lowestRemaining(g) {
  const all = g.userHand.concat(g.characterHand);
  if (!all.length) return null;
  return Math.min(...all);
}

function beginNextRound(session, g) {
  const rng = session._rng;
  if (!rng) return actionError(session, "rng_missing");
  const roundIndex = g.roundIndex + 1;
  if (roundIndex >= g.maxRounds) {
    return withGamePatch(
      session,
      { ...g, finished: true, outcome: "win", phase: "done" },
      { events: [{ type: "finished", outcome: "win" }], output: { outcome: "win" } }
    );
  }
  const hands = deal(rng, cardsForRound(roundIndex));
  return withGamePatch(
    session,
    {
      ...g,
      roundIndex,
      lastPlayed: 0,
      pile: [],
      userHand: hands.user,
      characterHand: hands.character,
      phase: "play",
    },
    {
      events: [{ type: "round_started", round: roundIndex }],
      output: { roundIndex },
    }
  );
}

function applyPlay(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase !== "play") return actionError(session, "not_play_phase");

  const value = Number(action?.value ?? action?.card);
  const handKey = actor === "user" ? "userHand" : "characterHand";
  const hand = g[handKey];
  if (!Number.isInteger(value) || !hand.includes(value)) {
    return actionError(session, "card_not_in_hand");
  }

  const lowest = lowestRemaining(g);
  const nextHand = hand.filter((c) => c !== value);
  let lives = g.lives;
  let errors = g.errors;
  let syncScore = g.syncScore;
  const events = [{ type: "played", by: actor, value }];

  if (value !== lowest) {
    lives -= 1;
    errors += 1;
    events.push({ type: "desync", value, expectedLowest: lowest });
    if (lives <= 0) {
      return withGamePatch(
        session,
        {
          ...g,
          [handKey]: nextHand,
          lives: 0,
          errors,
          lastPlayed: value,
          pile: g.pile.concat([value]),
          finished: true,
          outcome: "lose",
          phase: "done",
        },
        { events: events.concat([{ type: "finished", outcome: "lose" }]), output: { outcome: "lose" } }
      );
    }
  } else {
    syncScore += 1;
  }

  let patch = {
    ...g,
    [handKey]: nextHand,
    lives,
    errors,
    syncScore,
    lastPlayed: value,
    pile: g.pile.concat([value]),
  };

  // Remove any cards that were "skipped" incorrectly? In The Mind, wrong play loses life but card stays played.
  // Partner cards lower than played value that weren't played — typically lose life already; keep simple.

  if (bothEmpty(patch)) {
    patch.phase = "round_clear";
    const cleared = withGamePatch(session, patch, {
      events: events.concat([{ type: "round_cleared", round: g.roundIndex }]),
      output: { roundCleared: true },
    });
    return beginNextRound(cleared.session, gameState(cleared.session));
  }

  return withGamePatch(session, patch, {
    events,
    output: { value, lives, syncScore },
  });
}

export function applyUserAction(session, action) {
  return applyPlay(session, action, "user");
}

export function applyCharacterAction(session, action) {
  return applyPlay(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session) || g.phase !== "play") return [];
  const hand = actor === "user" ? g.userHand : g.characterHand;
  return hand.map((value) => ({ type: "play", value }));
}

export function isFinished(session) {
  return Boolean(gameState(session)?.finished);
}

export function result(session) {
  const g = gameState(session);
  if (!g) return null;
  return {
    outcome: g.outcome,
    lives: g.lives,
    errors: g.errors,
    syncScore: g.syncScore,
    roundIndex: g.roundIndex,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished || g.phase !== "play") return null;
  if (!g.characterHand.length) return null;
  // Play lowest card — deterministic Mind heuristic
  const value = Math.min(...g.characterHand);
  return { value };
}
