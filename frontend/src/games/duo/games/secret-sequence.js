/**
 * D7 秘密序列 — nyra.secret-sequence
 * Mastermind-like: length 4, exact + value-only matches, 10 attempts.
 */

import { SEQUENCE_SYMBOLS } from "../content/words.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.secret-sequence",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.secretSequence.title"),
  description: t("games.duo.secretSequence.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const LEN = 4;
const MAX_ATTEMPTS = 10;

/**
 * Exact (position) + value-only (wrong position) counts.
 * @param {string[]} secret
 * @param {string[]} guess
 */
export function scoreGuess(secret, guess) {
  const exact = [];
  const secretLeft = [];
  const guessLeft = [];
  for (let i = 0; i < LEN; i += 1) {
    if (guess[i] === secret[i]) {
      exact.push(i);
    } else {
      secretLeft.push(secret[i]);
      guessLeft.push(guess[i]);
    }
  }
  let valueOnly = 0;
  const pool = secretLeft.slice();
  for (const g of guessLeft) {
    const idx = pool.indexOf(g);
    if (idx >= 0) {
      valueOnly += 1;
      pool.splice(idx, 1);
    }
  }
  return { exact: exact.length, valueOnly };
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const symbols = SEQUENCE_SYMBOLS;
  const secret = [rng.pick(symbols), rng.pick(symbols), rng.pick(symbols), rng.pick(symbols)];
  // Character knows secret (setter); user guesses — or alternate: character is setter
  return {
    symbols,
    secret,
    setter: "character",
    guesser: "user",
    attempts: [],
    attemptsLeft: MAX_ATTEMPTS,
    maxAttempts: MAX_ATTEMPTS,
    phase: "guess",
    finished: false,
    outcome: null,
  };
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const obs = {
    gameId: definition.id,
    title: definition.title,
    symbols: g.symbols,
    length: LEN,
    attempts: g.attempts,
    attemptsLeft: g.attemptsLeft,
    maxAttempts: g.maxAttempts,
    phase: g.phase,
    finished: g.finished,
    outcome: g.outcome,
    setter: g.setter,
    guesser: g.guesser,
    yourRole: actor === g.setter ? "setter" : "guesser",
  };
  if (actor === g.setter || g.finished) {
    obs.secret = g.secret;
  }
  return obs;
}

function parseSequence(action) {
  let seq = action?.sequence ?? action?.guess ?? action?.values;
  if (typeof seq === "string") {
    // allow concatenated emoji or comma-separated
    if (seq.includes(",")) seq = seq.split(",").map((s) => s.trim());
    else {
      const found = [];
      for (const sym of SEQUENCE_SYMBOLS) {
        let i = 0;
        while (i < seq.length) {
          if (seq.slice(i).startsWith(sym)) {
            found.push(sym);
            i += sym.length;
          } else i += 1;
        }
      }
      // simpler: split by codepoints roughly — use Array.from for emoji
      seq = Array.from(seq).filter((ch) => SEQUENCE_SYMBOLS.includes(ch));
      if (seq.length !== LEN && found.length === LEN) seq = found;
    }
  }
  if (!Array.isArray(seq) || seq.length !== LEN) return null;
  if (!seq.every((s) => SEQUENCE_SYMBOLS.includes(s))) return null;
  return seq;
}

function applyGuess(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase !== "guess") return actionError(session, "not_guess_phase");
  if (actor !== g.guesser) return actionError(session, "only_guesser");

  const sequence = parseSequence(action);
  if (!sequence) return actionError(session, "sequence_must_be_length_4_symbols");

  const feedback = scoreGuess(g.secret, sequence);
  const attempts = g.attempts.concat([{ sequence, ...feedback }]);
  const attemptsLeft = g.attemptsLeft - 1;
  const won = feedback.exact === LEN;

  if (won) {
    return withGamePatch(
      session,
      {
        ...g,
        attempts,
        attemptsLeft,
        finished: true,
        outcome: "win",
        phase: "done",
      },
      {
        events: [{ type: "guess", sequence, ...feedback, win: true }],
        output: { ...feedback, finished: true, outcome: "win" },
      }
    );
  }
  if (attemptsLeft <= 0) {
    return withGamePatch(
      session,
      {
        ...g,
        attempts,
        attemptsLeft: 0,
        finished: true,
        outcome: "lose",
        phase: "done",
      },
      {
        events: [{ type: "guess", sequence, ...feedback, win: false }],
        output: { ...feedback, finished: true, outcome: "lose", secret: g.secret },
      }
    );
  }
  return withGamePatch(
    session,
    { ...g, attempts, attemptsLeft },
    {
      events: [{ type: "guess", sequence, ...feedback }],
      output: { ...feedback, attemptsLeft },
    }
  );
}

export function applyUserAction(session, action) {
  return applyGuess(session, action, "user");
}

export function applyCharacterAction(session, action) {
  // Character is setter by default; if somehow guessing, allow
  return applyGuess(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "guess" && actor === g.guesser) {
    return [{ type: "guess", fields: ["sequence"], symbols: g.symbols, length: LEN }];
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
    attempts: g.attempts,
    secret: g.finished ? g.secret : undefined,
    attemptsUsed: g.attempts.length,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.guesser !== "character") return null;
  const rng = session._rng;
  const symbols = g.symbols;
  const sequence = rng
    ? [rng.pick(symbols), rng.pick(symbols), rng.pick(symbols), rng.pick(symbols)]
    : symbols.slice(0, 4);
  return { sequence };
}
