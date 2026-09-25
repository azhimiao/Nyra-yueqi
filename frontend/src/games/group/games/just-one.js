/**
 * G1 只许一个词 — nyra.just-one
 * Parallel secret clues → normalize/dedupe → reveal → guess → score.
 */

import { JUST_ONE_WORDS } from "../content/just-one-words.js";
import {
  actionError,
  gameState,
  isUserActor,
  normalizeToken,
  privateEvent,
  publicEvent,
  withGamePatch,
} from "../helpers.js";
import { normalizeAndDedupeClues } from "../referee.js";
import { createRng } from "../rng.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.just-one",
  kind: "nyra.group-game.v1",
  version: "1.0.0",
  title: t("games.group.justOne.title"),
  description: t("games.group.justOne.description"),
  runtime: "group",
  players: { min: 3, max: 10 },
  features: {
    privateInformation: true,
    roles: false,
    teams: false,
    discussion: false,
    voting: false,
  },
};

/**
 * @param {{ seed?: string|number, rng?: import("../rng.js").GroupRng, actors?: any[], includeUserClue?: boolean }} args
 */
export function createInitialState({ seed, rng, actors = [], includeUserClue = false } = {}) {
  const r = rng || createRng(seed);
  const targetWord = r.pick(JUST_ONE_WORDS);
  const clueGivers = actors
    .filter((a) => !isUserActor(a) || includeUserClue)
    .map((a) => a.id);
  // Default: AI give clues, user is guesser (unless includeUserClue)
  const guesserId = actors.find((a) => isUserActor(a))?.id || actors[0]?.id || "user";
  const givers = clueGivers.filter((id) => id !== guesserId);
  const finalGivers = givers.length ? givers : actors.filter((a) => a.id !== guesserId).map((a) => a.id);

  return {
    phase: "clue",
    targetWord,
    clueGivers: finalGivers,
    guesserId,
    clues: {},
    kept: {},
    removed: {},
    guess: null,
    correct: null,
    score: null,
    finished: false,
  };
}

export function observation(session, actorId) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const isGuesser = actorId === g.guesserId;
  const isGiver = (g.clueGivers || []).includes(actorId);
  const publicState = {
    phase: g.phase,
    clueGivers: g.clueGivers,
    guesserId: g.guesserId,
    submittedCount: Object.keys(g.clues || {}).length,
    needCount: (g.clueGivers || []).length,
    keptClues:
      g.phase === "guess" || g.phase === "result" || g.phase === "reveal"
        ? Object.values(g.kept || {})
        : undefined,
    removedCount:
      g.phase === "guess" || g.phase === "result" || g.phase === "reveal"
        ? Object.keys(g.removed || {}).length
        : undefined,
    guess: g.phase === "result" ? g.guess : undefined,
    score: g.phase === "result" ? g.score : undefined,
    correct: g.phase === "result" ? g.correct : undefined,
    targetWord: g.phase === "result" ? g.targetWord : undefined,
  };
  const privateState = {};
  if (isGiver && g.phase === "clue") {
    privateState.targetWord = g.targetWord;
    privateState.yourClue = g.clues?.[actorId] ?? null;
  }
  if (isGuesser && (g.phase === "guess" || g.phase === "reveal")) {
    privateState.role = "guesser";
  }
  return {
    actorId,
    phase: g.phase,
    publicState,
    privateState: Object.keys(privateState).length ? privateState : undefined,
    currentObjective: objectiveFor(g, actorId),
    allowedActions: legalActions(session, actorId),
  };
}

function objectiveFor(g, actorId) {
  if (g.phase === "clue" && (g.clueGivers || []).includes(actorId)) {
    return "写一个单词语的提示，不要直接写出目标词，也不要和其他人重复。";
  }
  if (g.phase === "guess" && actorId === g.guesserId) {
    return "根据剩余线索猜出目标词。";
  }
  return "等待其他玩家。";
}

export function legalActions(session, actorId) {
  const g = gameState(session);
  if (!g || g.finished) return [];
  if (g.phase === "clue" && (g.clueGivers || []).includes(actorId) && g.clues?.[actorId] == null) {
    return [{ type: "clue", fields: ["clue"] }];
  }
  if ((g.phase === "guess" || g.phase === "reveal") && actorId === g.guesserId && g.guess == null) {
    return [{ type: "guess", fields: ["guess"] }];
  }
  return [];
}

export function nextPolicy(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "clue") return "parallel_secret";
  if (g.phase === "guess" || g.phase === "reveal") return "ordered_turn";
  return null;
}

export function pendingActorIds(session) {
  const g = gameState(session);
  if (!g) return [];
  if (g.phase === "clue") {
    return (g.clueGivers || []).filter((id) => g.clues?.[id] == null);
  }
  if ((g.phase === "guess" || g.phase === "reveal") && g.guess == null) {
    return [g.guesserId];
  }
  return [];
}

export function applyAction(session, actorId, action) {
  const g = gameState(session);
  if (!g) return actionError(session, "no_game");
  const type = action?.type || action?.action;

  if (g.phase === "clue" && type === "clue") {
    if (!(g.clueGivers || []).includes(actorId)) {
      return actionError(session, "not_a_clue_giver");
    }
    if (g.clues?.[actorId] != null) return actionError(session, "already_submitted");
    const clue = String(action.clue ?? action.value ?? action.text ?? "").trim();
    if (!clue) return actionError(session, "empty_clue");
    if (normalizeToken(clue) === normalizeToken(g.targetWord)) {
      return actionError(session, "clue_equals_target");
    }
    const clues = { ...g.clues, [actorId]: clue };
    const events = [
      privateEvent([actorId], "clue_submitted", { clue }, { actorId }),
      publicEvent("clue_count", { submitted: Object.keys(clues).length, need: g.clueGivers.length }),
    ];
    const allIn = (g.clueGivers || []).every((id) => clues[id] != null);
    if (!allIn) {
      return withGamePatch(session, { clues }, { events, phase: "clue" });
    }
    const { kept, removed } = normalizeAndDedupeClues(clues);
    return withGamePatch(
      session,
      {
        clues,
        kept,
        removed,
        phase: "guess",
      },
      {
        phase: "guess",
        events: [
          ...events,
          publicEvent("clues_resolved", {
            kept: Object.values(kept),
            removedCount: Object.keys(removed).length,
          }),
          publicEvent("card", { kind: "phase", title: t("games.group.phases.startGuessing"), kept: Object.values(kept) }),
        ],
      }
    );
  }

  if ((g.phase === "guess" || g.phase === "reveal") && type === "guess") {
    if (actorId !== g.guesserId) return actionError(session, "not_guesser");
    const guess = String(action.guess ?? action.value ?? action.text ?? "").trim();
    if (!guess) return actionError(session, "empty_guess");
    const correct = normalizeToken(guess) === normalizeToken(g.targetWord);
    const score = correct ? 1 : 0;
    return withGamePatch(
      session,
      {
        guess,
        correct,
        score,
        phase: "result",
        finished: true,
      },
      {
        phase: "result",
        status: "finished",
        events: [
          publicEvent("guess_result", { guess, correct, score, targetWord: g.targetWord }, { actorId }),
          publicEvent("card", {
            kind: "result",
            title: correct ? t("games.group.phases.correct") : t("games.group.phases.almost"),
            guess,
            targetWord: g.targetWord,
            score,
          }),
        ],
      }
    );
  }

  if (type === "speak" || type === "discuss") {
    return actionError(session, "discussion_not_in_this_game");
  }

  return actionError(session, `illegal_action:${type}`);
}

export function isFinished(session) {
  const g = gameState(session);
  return Boolean(g?.finished || g?.phase === "result");
}

export function result(session) {
  const g = gameState(session);
  if (!g) return null;
  return {
    gameId: definition.id,
    score: g.score,
    correct: g.correct,
    guess: g.guess,
    targetWord: g.targetWord,
    kept: g.kept,
    removed: g.removed,
  };
}

export function fallbackAction(session, actorId) {
  const g = gameState(session);
  if (!g) return null;
  if (g.phase === "clue" && (g.clueGivers || []).includes(actorId) && g.clues?.[actorId] == null) {
    const safe = ["氛围", "感觉", "联想", "画面", "气味", "触感", "声音", "温度"];
    const salt = String(actorId).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return { type: "clue", clue: safe[salt % safe.length] };
  }
  if ((g.phase === "guess" || g.phase === "reveal") && actorId === g.guesserId) {
    const keptVals = Object.values(g.kept || {});
    return { type: "guess", guess: keptVals[0] || "月亮" };
  }
  return null;
}

/** System rule hook for orchestrator APPLY_RULE */
export function applyRule(session, rule) {
  const g = gameState(session);
  if (!g) return { session, events: [] };
  if (rule === "parallel_complete" && g.phase === "clue") {
    // If somehow pending empty but not resolved
    const clues = g.clues || {};
    if ((g.clueGivers || []).every((id) => clues[id] != null) && g.phase === "clue") {
      const { kept, removed } = normalizeAndDedupeClues(clues);
      return withGamePatch(
        session,
        { kept, removed, phase: "guess" },
        {
          phase: "guess",
          events: [
            publicEvent("clues_resolved", {
              kept: Object.values(kept),
              removedCount: Object.keys(removed).length,
            }),
          ],
        }
      );
    }
  }
  return { session, events: [] };
}
