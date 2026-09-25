/**
 * D5 猜我所想 — nyra.twenty-questions
 * Hidden target; yes / no / uncertain; max 20 questions + guess.
 */

import { QUESTION_WORDS } from "../content/words.js";
import { actionError, assertPlayable, gameState, withGamePatch } from "../helpers.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.twenty-questions",
  kind: "nyra.duo-game.v1",
  version: 1,
  title: t("games.duo.twentyQuestions.title"),
  description: t("games.duo.twentyQuestions.description"),
  runtime: "duo",
  players: { human: 1, character: 1 },
};

const MAX_QUESTIONS = 20;

/** Simple keyword heuristics for deterministic answers (thinker side). */
function answerQuestion(target, question) {
  const q = String(question || "").toLowerCase();
  const t = String(target);
  if (!q.trim()) return "uncertain";
  // Containment / equality style
  if (q.includes(t) || t.split("").some((ch) => ch.length && q.includes(ch) && t.length <= 2)) {
    // too loose; skip
  }
  const rules = [
    { keys: ["室内", "屋里", "房间"], test: (w) => /图书馆|录音棚|书店|相机/.test(w) },
    { keys: ["出行", "路", "交通", "车"], test: (w) => /巴士|公路|地铁|公路/.test(w) },
    { keys: ["吃", "食", "喝", "饮"], test: (w) => /可可|面包|汽水/.test(w) },
    { keys: ["自然", "户外", "外"], test: (w) => /海边|山谷|植物园|天台/.test(w) },
    { keys: ["声音", "听", "响"], test: (w) => /唱片|录音|巴士/.test(w) },
    { keys: ["电子", "数码"], test: (w) => /相机|望远镜|唱片/.test(w) },
    { keys: ["夜", "晚"], test: (w) => /夜|末班|灯火/.test(w) },
  ];
  for (const rule of rules) {
    if (rule.keys.some((k) => q.includes(k))) {
      return rule.test(t) ? "yes" : "no";
    }
  }
  if (/是不是|吗|？|\?/.test(q) && q.includes(t.slice(0, 2))) {
    return t.includes(q.replace(/[^一-龥]/g, "").slice(0, 2)) ? "yes" : "uncertain";
  }
  return "uncertain";
}

/**
 * @param {{ seed?: string|number, rng: import("../rng.js").DuoRng }} args
 */
export function createInitialState({ rng }) {
  const thinker = rng.bool() ? "character" : "user";
  const target = rng.pick(QUESTION_WORDS);
  return {
    thinker,
    guesser: thinker === "user" ? "character" : "user",
    target,
    phase: "ask",
    questionsAsked: 0,
    maxQuestions: MAX_QUESTIONS,
    log: [],
    finished: false,
    outcome: null,
    lastAnswer: null,
  };
}

export function observation(session, actor) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const obs = {
    gameId: definition.id,
    title: definition.title,
    thinker: g.thinker,
    guesser: g.guesser,
    phase: g.phase,
    questionsAsked: g.questionsAsked,
    maxQuestions: g.maxQuestions,
    log: g.log.map((e) => ({
      question: e.question,
      answer: e.answer,
      by: e.by,
    })),
    lastAnswer: g.lastAnswer,
    finished: g.finished,
    outcome: g.outcome,
    yourRole: actor === g.thinker ? "thinker" : "guesser",
  };
  if (actor === g.thinker || g.finished) {
    obs.target = g.target;
  }
  return obs;
}

function finish(session, g, outcome) {
  return withGamePatch(
    session,
    { ...g, finished: true, outcome, phase: "done" },
    {
      events: [{ type: "finished", outcome, target: g.target }],
      output: { finished: true, outcome, target: g.target },
    }
  );
}

function applyAsk(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (actor !== g.guesser) return actionError(session, "only_guesser_asks");
  if (g.questionsAsked >= g.maxQuestions) return actionError(session, "no_questions_left");

  const question = String(action?.question ?? action?.text ?? "").trim();
  if (!question) return actionError(session, "question_required");

  // Thinker may provide answer; else engine heuristic
  let answer = action?.answer;
  if (!answer || !["yes", "no", "uncertain"].includes(answer)) {
    answer = answerQuestion(g.target, question);
  }

  const questionsAsked = g.questionsAsked + 1;
  const log = g.log.concat([{ question, answer, by: actor }]);
  const patch = {
    ...g,
    questionsAsked,
    log,
    lastAnswer: answer,
    phase: questionsAsked >= g.maxQuestions ? "must_guess" : "ask",
  };
  return withGamePatch(session, patch, {
    events: [{ type: "answered", question, answer }],
    output: { answer, questionsAsked },
  });
}

function applyAnswer(session, action, actor) {
  // Thinker explicitly answering pending — for simplicity answers are auto; allow override on last
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (actor !== g.thinker) return actionError(session, "only_thinker_answers");
  const answer = action?.answer;
  if (!["yes", "no", "uncertain"].includes(answer)) {
    return actionError(session, "answer_must_be_yes_no_uncertain");
  }
  if (!g.log.length) return actionError(session, "no_pending_question");
  const log = g.log.slice();
  const last = { ...log[log.length - 1], answer };
  log[log.length - 1] = last;
  return withGamePatch(
    session,
    { ...g, log, lastAnswer: answer },
    { events: [{ type: "answer_override", answer }], output: { answer } }
  );
}

function applyGuess(session, action, actor) {
  if (!assertPlayable(session)) return actionError(session, "session_not_active");
  const g = gameState(session);
  if (!g || g.finished) return actionError(session, "already_finished");
  if (actor !== g.guesser) return actionError(session, "only_guesser_guesses");
  const guess = String(action?.guess ?? action?.value ?? "").trim();
  if (!guess) return actionError(session, "guess_required");
  const ok = guess === g.target;
  return finish(session, g, ok ? "win" : "lose");
}

function applyAction(session, action, actor) {
  if (action?.guess != null || action?.type === "guess") return applyGuess(session, action, actor);
  if (action?.answer != null && action?.question == null && action?.type === "answer") {
    return applyAnswer(session, action, actor);
  }
  if (action?.question != null || action?.type === "ask") return applyAsk(session, action, actor);
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
  const acts = [];
  if (actor === g.guesser) {
    if (g.questionsAsked < g.maxQuestions && g.phase !== "done") {
      acts.push({ type: "ask", fields: ["question"] });
    }
    acts.push({ type: "guess", fields: ["guess"] });
  }
  if (actor === g.thinker) {
    acts.push({ type: "answer", fields: ["answer"], values: ["yes", "no", "uncertain"] });
  }
  return acts;
}

export function isFinished(session) {
  return Boolean(gameState(session)?.finished);
}

export function result(session) {
  const g = gameState(session);
  if (!g) return null;
  return {
    outcome: g.outcome,
    target: g.target,
    questionsAsked: g.questionsAsked,
    log: g.log,
  };
}

export function fallbackCharacterAction(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.guesser === "character") {
    if (g.questionsAsked >= g.maxQuestions || g.phase === "must_guess") {
      // Best-effort: pick from bank deterministically by seed of log length
      return { guess: QUESTION_WORDS[g.questionsAsked % QUESTION_WORDS.length] };
    }
    const templates = [
      "它通常出现在室内吗？",
      "它和食物有关吗？",
      "它和出行有关吗？",
      "它会发出声音吗？",
      "它偏自然场景吗？",
    ];
    return { question: templates[g.questionsAsked % templates.length] };
  }
  if (g.thinker === "character" && g.log.length) {
    return { type: "answer", answer: g.lastAnswer || "uncertain" };
  }
  return null;
}
