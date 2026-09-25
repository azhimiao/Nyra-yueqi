/**
 * G2 想的一样 — nyra.same-thought
 * Category → all secret answers → normalize → match counts → score.
 */

import { SAME_THOUGHT_CATEGORIES } from "../content/same-thought.js";
import {
  actionError,
  gameState,
  listActors,
  privateEvent,
  publicEvent,
  withGamePatch,
} from "../helpers.js";
import { matchAnswerScores } from "../referee.js";
import { createRng } from "../rng.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.same-thought",
  kind: "nyra.group-game.v1",
  version: "1.0.0",
  title: t("games.group.sameThought.title"),
  description: t("games.group.sameThought.description"),
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
 * @param {{ seed?: string|number, rng?: import("../rng.js").GroupRng, actors?: any[] }} args
 */
export function createInitialState({ seed, rng, actors = [] } = {}) {
  const r = rng || createRng(seed);
  const category = r.pick(SAME_THOUGHT_CATEGORIES);
  return {
    phase: "answer",
    category,
    answers: {},
    normalized: {},
    scores: {},
    matchGroups: [],
    finished: false,
    participantIds: actors.map((a) => a.id),
  };
}

export function observation(session, actorId) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const publicState = {
    phase: g.phase,
    category: g.category,
    submittedCount: Object.keys(g.answers || {}).length,
    needCount: (g.participantIds || listActors(session).map((a) => a.id)).length,
  };
  if (g.phase === "result") {
    publicState.answers = g.answers;
    publicState.scores = g.scores;
    publicState.matchGroups = g.matchGroups;
  }
  const privateState = {
    yourAnswer: g.answers?.[actorId] ?? null,
  };
  return {
    actorId,
    phase: g.phase,
    publicState,
    privateState,
    currentObjective:
      g.phase === "answer"
        ? `用一个词回答：${g.category?.prompt || ""}`
        : "查看大家想的是否一样。",
    allowedActions: legalActions(session, actorId),
  };
}

export function legalActions(session, actorId) {
  const g = gameState(session);
  if (!g || g.finished) return [];
  const ids = g.participantIds || listActors(session).map((a) => a.id);
  if (g.phase === "answer" && ids.includes(actorId) && g.answers?.[actorId] == null) {
    return [{ type: "answer", fields: ["answer"] }];
  }
  return [];
}

export function nextPolicy(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "answer") return "parallel_secret";
  return null;
}

export function pendingActorIds(session) {
  const g = gameState(session);
  if (!g || g.phase !== "answer") return [];
  const ids = g.participantIds || listActors(session).map((a) => a.id);
  return ids.filter((id) => g.answers?.[id] == null);
}

export function applyAction(session, actorId, action) {
  const g = gameState(session);
  if (!g) return actionError(session, "no_game");
  const type = action?.type || action?.action;
  if (g.phase !== "answer" || type !== "answer") {
    return actionError(session, `illegal_action:${type}`);
  }
  const ids = g.participantIds || listActors(session).map((a) => a.id);
  if (!ids.includes(actorId)) return actionError(session, "not_participant");
  if (g.answers?.[actorId] != null) return actionError(session, "already_submitted");
  const answer = String(action.answer ?? action.value ?? action.text ?? action.clue ?? "").trim();
  if (!answer) return actionError(session, "empty_answer");

  const answers = { ...g.answers, [actorId]: answer };
  const events = [
    privateEvent([actorId], "answer_submitted", { answer }, { actorId }),
    publicEvent("answer_count", { submitted: Object.keys(answers).length, need: ids.length }),
  ];
  const allIn = ids.every((id) => answers[id] != null);
  if (!allIn) {
    return withGamePatch(session, { answers }, { events, phase: "answer" });
  }
  const { normalized, scores, matchGroups } = matchAnswerScores(answers);
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  return withGamePatch(
    session,
    {
      answers,
      normalized,
      scores,
      matchGroups,
      totalScore,
      phase: "result",
      finished: true,
    },
    {
      phase: "result",
      status: "finished",
      events: [
        ...events,
        publicEvent("match_result", { scores, matchGroups, answers }),
        publicEvent("card", {
          kind: "result",
          title: t("games.group.sameThought.title"),
          scores,
          matchGroups,
        }),
      ],
    }
  );
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
    category: g.category,
    answers: g.answers,
    scores: g.scores,
    matchGroups: g.matchGroups,
    totalScore: g.totalScore,
  };
}

export function fallbackAction(session, actorId) {
  const g = gameState(session);
  if (!g || g.phase !== "answer") return null;
  if (g.answers?.[actorId] != null) return null;
  const defaults = ["安静", "咖啡", "回家", "散步", "音乐", "阳光"];
  const idx = Math.abs(String(actorId).length + (g.category?.id?.length || 0)) % defaults.length;
  return { type: "answer", answer: defaults[idx] };
}

export function applyRule(session, rule) {
  const g = gameState(session);
  if (!g) return { session, events: [] };
  if (rule === "parallel_complete" && g.phase === "answer") {
    const ids = g.participantIds || listActors(session).map((a) => a.id);
    const answers = g.answers || {};
    if (ids.every((id) => answers[id] != null)) {
      const { normalized, scores, matchGroups } = matchAnswerScores(answers);
      return withGamePatch(
        session,
        {
          normalized,
          scores,
          matchGroups,
          totalScore: Object.values(scores).reduce((a, b) => a + b, 0),
          phase: "result",
          finished: true,
        },
        {
          phase: "result",
          status: "finished",
          events: [publicEvent("match_result", { scores, matchGroups, answers })],
        }
      );
    }
  }
  return { session, events: [] };
}
