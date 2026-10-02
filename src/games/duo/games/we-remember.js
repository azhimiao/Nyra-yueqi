/**
 * D10 我们记得吗 — nyra.we-remember
 * SAFE_FACT_ADAPTER.getSafeSharedFacts({ limit }) or curated fictional moments.
 */

import { CURATED_SHARED_FACTS } from "../content/facts.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.we-remember",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.weRemember.title"),
  description: t("games.duo.weRemember.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const DEFAULT_LIMIT = 5;

/**
 * @typedef {{ getSafeSharedFacts: (opts: { limit: number }) => any[] | Promise<any[]> }} SafeFactAdapter
 */

/**
 * Normalize adapter / curated facts into quiz items.
 * @param {any[]} raw
 * @param {import("../rng.js").DuoRng} rng
 */
function normalizeFacts(raw, rng) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((f, i) => {
      if (!f || typeof f !== "object") return null;
      const prompt = String(f.prompt || f.question || "").trim();
      let options = f.options;
      if (!Array.isArray(options) || options.length < 2) return null;
      options = options.map((o) => String(o));
      let answerIndex = Number(f.answerIndex);
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
        if (f.answer != null) {
          answerIndex = options.indexOf(String(f.answer));
        }
      }
      if (!prompt || answerIndex < 0) return null;
      const labeled = options.map((label, idx) => ({
        label,
        correct: idx === answerIndex,
      }));
      const shuffled = rng.shuffle(labeled);
      return {
        id: String(f.id || `fact-${i}`),
        prompt,
        options: shuffled.map((o) => o.label),
        answerIndex: shuffled.findIndex((o) => o.correct),
        safeNote: f.safeNote || "safe_shared_fact",
      };
    })
    .filter(Boolean)
    .filter((item) => item.answerIndex >= 0);
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng, adapters?: { safeFacts?: SafeFactAdapter } }} args
 */
export function createInitialState({ rng, adapters }) {
  const adapter = adapters?.safeFacts || null;
  let raw = null;
  if (adapter && typeof adapter.getSafeSharedFacts === "function") {
    try {
      raw = adapter.getSafeSharedFacts({ limit: DEFAULT_LIMIT });
      // Sync-only for determinism in createInitialState; async adapters should pre-resolve
      if (raw && typeof raw.then === "function") {
        raw = null;
      }
    } catch {
      raw = null;
    }
  }
  if (!raw || !raw.length) {
    raw = CURATED_SHARED_FACTS;
  }
  const questions = normalizeFacts(raw, rng).slice(0, DEFAULT_LIMIT);
  const fallback = normalizeFacts(CURATED_SHARED_FACTS, rng).slice(0, DEFAULT_LIMIT);
  const quiz = questions.length ? questions : fallback;

  return {
    source: questions.length && raw !== CURATED_SHARED_FACTS ? "adapter" : "curated",
    questions: quiz,
    index: 0,
    phase: "answer",
    userAnswer: null,
    characterAnswer: null,
    scores: [],
    totalScore: 0,
    history: [],
    finished: false,
  };
}

function currentQ(g) {
  return g.questions[g.index] || null;
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const q = currentQ(g);
  const obs = {
    gameId: definition.id,
    title: definition.title,
    source: g.source,
    index: g.index,
    total: g.questions.length,
    phase: g.phase,
    totalScore: g.totalScore,
    scores: g.scores,
    finished: g.finished,
    youAnswered: actor === "user" ? g.userAnswer != null : g.characterAnswer != null,
    partnerAnswered: actor === "user" ? g.characterAnswer != null : g.userAnswer != null,
  };
  if (q) {
    obs.question = {
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      safeNote: q.safeNote,
    };
    // Never leak answerIndex until reveal/finish
    if (g.phase === "reveal" || g.finished) {
      obs.question.answerIndex = q.answerIndex;
      obs.userAnswer = g.userAnswer;
      obs.characterAnswer = g.characterAnswer;
      obs.roundScore = g.roundScore;
    }
  }
  return obs;
}

function scoreAnswers(q, userAnswer, characterAnswer) {
  const correct = q.answerIndex;
  let score = 0;
  if (userAnswer === correct) score += 1;
  if (characterAnswer === correct) score += 1;
  if (userAnswer === characterAnswer) score += 1; // agreement bonus
  return score;
}

function resolve(session, g) {
  const q = currentQ(g);
  const score = scoreAnswers(q, g.userAnswer, g.characterAnswer);
  const scores = g.scores.concat([score]);
  const totalScore = g.totalScore + score;
  const history = g.history.concat([
    {
      id: q.id,
      userAnswer: g.userAnswer,
      characterAnswer: g.characterAnswer,
      correct: q.answerIndex,
      score,
    },
  ]);
  const finished = g.index + 1 >= g.questions.length;
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
      events: [{ type: "scored", score, correct: q.answerIndex }],
      output: { score, totalScore, finished },
    }
  );
}

function applyAnswer(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  let g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (g.phase === "reveal") {
    if (action?.type === "next_round" || action?.nextRound || action?.type === "next") {
      return applyNext(session);
    }
    return actionError(session, "awaiting_next");
  }
  if (g.phase !== "answer") return actionError(session, "not_answer_phase");
  const q = currentQ(g);
  if (!q) return actionError(session, "no_question");

  let idx = action?.optionIndex ?? action?.answerIndex ?? action?.answer;
  if (typeof idx === "string" && q.options.includes(idx)) {
    idx = q.options.indexOf(idx);
  }
  idx = Number(idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) {
    return actionError(session, "invalid_option");
  }

  if (actor === "user") {
    if (g.userAnswer != null) return actionError(session, "already_answered");
    g = { ...g, userAnswer: idx };
  } else {
    if (g.characterAnswer != null) return actionError(session, "already_answered");
    g = { ...g, characterAnswer: idx };
  }

  if (g.userAnswer != null && g.characterAnswer != null) return resolve(session, g);
  return withGamePatch(session, g, {
    events: [{ type: "answered", by: actor }],
    output: { waiting: true },
  });
}

function applyNext(session) {
  const g = gameState(session);
  if (!g || g.finished || g.phase !== "reveal") return actionError(session, "cannot_advance");
  const index = g.index + 1;
  return withGamePatch(
    session,
    {
      ...g,
      index,
      phase: "answer",
      userAnswer: null,
      characterAnswer: null,
      roundScore: null,
    },
    {
      events: [{ type: "question_started", index }],
      output: { index },
    }
  );
}

export function applyUserAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound || action?.type === "next") {
    return applyNext(session);
  }
  return applyAnswer(session, action, "user");
}

export function applyCharacterAction(session, action) {
  if (action?.type === "next_round" || action?.nextRound || action?.type === "next") {
    return applyNext(session);
  }
  return applyAnswer(session, action, "character");
}

export function legalActions(session, actor) {
  const g = gameState(session);
  if (!g || g.finished || !assertPlayable(session)) return [];
  if (g.phase === "reveal") return [{ type: "next" }];
  if (g.phase === "answer") {
    const done = actor === "user" ? g.userAnswer != null : g.characterAnswer != null;
    const q = currentQ(g);
    if (!done && q) {
      return [
        {
          type: "answer",
          fields: ["optionIndex"],
          options: q.options.map((label, optionIndex) => ({ optionIndex, label })),
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
    source: g.source,
    totalScore: g.totalScore,
    scores: g.scores,
    history: g.history,
    maxScore: g.questions.length * 3,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "reveal") return { type: "next" };
  if (g.phase === "answer" && g.characterAnswer == null) {
    const q = currentQ(g);
    if (!q) return null;
    // Prefer correct answer for companion warmth, deterministic
    return { optionIndex: q.answerIndex };
  }
  return null;
}
