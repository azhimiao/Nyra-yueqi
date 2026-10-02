/**
 * D3 暗号 — nyra.cipher
 * 5×5 word grid, 6+6 targets, 2 hazards, maxTurns 10.
 */

import { CIPHER_WORDS } from "../content/words.js";
import { t } from "../../../i18n/index.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";

export const definition = {
  id: "nyra.cipher",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.cipher.title"),
  description: t("games.duo.cipher.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const GRID = 25;
const MAX_TURNS = 10;

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const words = rng.shuffle(CIPHER_WORDS).slice(0, GRID);
  const indices = rng.shuffle([...Array(GRID).keys()]);
  const userTargets = new Set(indices.slice(0, 6));
  const characterTargets = new Set(indices.slice(6, 12));
  const hazards = new Set(indices.slice(12, 14));
  const owners = words.map((_, i) => {
    if (userTargets.has(i)) return "user";
    if (characterTargets.has(i)) return "character";
    if (hazards.has(i)) return "hazard";
    return "neutral";
  });
  return {
    words,
    owners,
    revealed: Array(GRID).fill(false),
    turn: 0,
    maxTurns: MAX_TURNS,
    clueGiver: "user",
    phase: "clue",
    currentClue: null,
    guessesLeft: 0,
    userFound: 0,
    characterFound: 0,
    userNeed: 6,
    characterNeed: 6,
    finished: false,
    outcome: null,
    log: [],
  };
}

function publicBoard(g, actor) {
  return g.words.map((word, i) => {
    const cell = { index: i, word, revealed: g.revealed[i] };
    if (g.revealed[i] || g.finished) {
      cell.owner = g.owners[i];
    } else if (actor === "user" && g.owners[i] === "user") {
      cell.mine = true;
    } else if (actor === "character" && g.owners[i] === "character") {
      cell.mine = true;
    }
    // Clue giver sees own team map when giving clues
    if (!g.revealed[i] && actor === g.clueGiver && g.phase === "clue") {
      if (g.owners[i] === actor) cell.mine = true;
      if (g.owners[i] === "hazard") cell.hazardHint = true;
    }
    return cell;
  });
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  return {
    gameId: definition.id,
    title: definition.title,
    turn: g.turn,
    maxTurns: g.maxTurns,
    phase: g.phase,
    clueGiver: g.clueGiver,
    currentClue: g.currentClue,
    guessesLeft: g.guessesLeft,
    board: publicBoard(g, actor),
    userFound: g.userFound,
    characterFound: g.characterFound,
    finished: g.finished,
    outcome: g.outcome,
    yourRole: actor === g.clueGiver ? (g.phase === "clue" ? "clue_giver" : "waiting") : g.phase === "guess" ? "guesser" : "waiting",
  };
}

function allTargetsFound(g) {
  return g.userFound >= g.userNeed && g.characterFound >= g.characterNeed;
}

function endGame(session, g, outcome, reason) {
  return withGamePatch(
    session,
    { ...g, finished: true, outcome, phase: "done" },
    {
      events: [{ type: "finished", outcome, reason }],
      output: { finished: true, outcome },
    }
  );
}

function applyClue(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (g.finished) return actionError(session, "already_finished");
  if (g.phase !== "clue") return actionError(session, "not_clue_phase");
  if (actor !== g.clueGiver) return actionError(session, "not_your_turn");
  const clue = String(action?.clue ?? "").trim();
  const count = Number(action?.count);
  if (!clue) return actionError(session, "clue_required");
  if (!Number.isInteger(count) || count < 0 || count > 6) {
    return actionError(session, "count_must_be_0_to_6");
  }
  // Clue must not equal any board word
  if (g.words.some((w) => w === clue)) {
    return actionError(session, "clue_cannot_be_board_word");
  }
  const guessesLeft = count === 0 ? 1 : count + 1;
  return withGamePatch(
    session,
    {
      ...g,
      phase: "guess",
      currentClue: { clue, count, by: actor },
      guessesLeft,
      turn: g.turn + 1,
    },
    {
      events: [{ type: "clue", clue, count, by: actor }],
      output: { phase: "guess", guessesLeft },
    }
  );
}

function applyGuess(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (g.finished) return actionError(session, "already_finished");
  if (g.phase !== "guess") return actionError(session, "not_guess_phase");
  if (actor === g.clueGiver) return actionError(session, "clue_giver_cannot_guess");

  if (action?.stop === true) {
    return passTurn(session, g);
  }

  const index = Number(action?.index);
  if (!Number.isInteger(index) || index < 0 || index >= GRID) {
    return actionError(session, "invalid_index");
  }
  if (g.revealed[index]) return actionError(session, "already_revealed");

  const revealed = g.revealed.slice();
  revealed[index] = true;
  const owner = g.owners[index];
  const log = g.log.concat([{ turn: g.turn, index, owner, by: actor }]);
  let userFound = g.userFound;
  let characterFound = g.characterFound;
  let next = {
    ...g,
    revealed,
    log,
    guessesLeft: g.guessesLeft - 1,
  };

  if (owner === "hazard") {
    return endGame(session, { ...next, userFound, characterFound }, "lose", "hazard");
  }
  if (owner === "user") userFound += 1;
  if (owner === "character") characterFound += 1;
  next.userFound = userFound;
  next.characterFound = characterFound;

  if (allTargetsFound(next)) {
    return endGame(session, next, "win", "all_targets");
  }

  const teamOfClue = g.clueGiver;
  const hitOwn = owner === teamOfClue;
  if (!hitOwn || next.guessesLeft <= 0) {
    return passTurn(session, next);
  }

  return withGamePatch(session, next, {
    events: [{ type: "guess", index, owner, by: actor }],
    output: { owner, guessesLeft: next.guessesLeft },
  });
}

function passTurn(session, g) {
  if (g.turn >= g.maxTurns) {
    return endGame(session, g, "lose", "max_turns");
  }
  const nextGiver = g.clueGiver === "user" ? "character" : "user";
  return withGamePatch(
    session,
    {
      ...g,
      clueGiver: nextGiver,
      phase: "clue",
      currentClue: null,
      guessesLeft: 0,
    },
    {
      events: [{ type: "turn_passed", nextClueGiver: nextGiver }],
      output: { phase: "clue", clueGiver: nextGiver },
    }
  );
}

function applyAction(session, action, actor) {
  if (action?.stop === true || action?.type === "stop") {
    return applyGuess(session, { stop: true }, actor);
  }
  if (action?.clue != null || action?.type === "clue") {
    return applyClue(session, action, actor);
  }
  if (action?.index != null || action?.type === "guess") {
    return applyGuess(session, action, actor);
  }
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
  if (g.phase === "clue" && actor === g.clueGiver) {
    return [{ type: "clue", fields: ["clue", "count"] }];
  }
  if (g.phase === "guess" && actor !== g.clueGiver) {
    const indices = [];
    for (let i = 0; i < GRID; i += 1) if (!g.revealed[i]) indices.push(i);
    return [
      { type: "guess", fields: ["index"], indices },
      { type: "stop" },
    ];
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
    outcome: g.outcome,
    userFound: g.userFound,
    characterFound: g.characterFound,
    turn: g.turn,
    log: g.log,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "clue" && g.clueGiver === "character") {
    return { clue: "夜晚意象", count: 1 };
  }
  if (g.phase === "guess" && g.clueGiver === "user") {
    for (let i = 0; i < GRID; i += 1) {
      if (!g.revealed[i] && g.owners[i] === "user") return { index: i };
    }
    for (let i = 0; i < GRID; i += 1) {
      if (!g.revealed[i] && g.owners[i] !== "hazard") return { index: i };
    }
    return { stop: true };
  }
  return null;
}
