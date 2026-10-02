/**
 * Headless Duo simulation — legal user actions + character fallback turns.
 */

import { DuoGameRuntime } from "../duo/runtime.js";
import { createRng, hashSeed } from "../duo/rng.js";
import { getDuoGame } from "../duo/games/index.js";
import { gameState } from "../duo/helpers.js";

/**
 * @param {any[]} legal
 * @param {any} session
 * @param {"user"|"character"} actor
 * @param {import("../duo/rng.js").DuoRng} rng
 * @param {"first"|"random"} pickMode
 */
export function materializeDuoAction(legal, session, actor, rng, pickMode = "first") {
  if (!legal?.length) return null;
  const template = pickMode === "random" ? rng.pick(legal) : legal[0];
  if (!template || typeof template !== "object") return null;

  // Concrete / ready actions
  if (template.type === "next_round" || template.type === "next") {
    return { type: template.type };
  }
  if (template.type === "stop") return { stop: true };
  if (template.type === "play" && template.value != null) {
    return { value: template.value };
  }
  if (template.value != null && !template.fields) return { ...template };
  if (template.sequence && Array.isArray(template.sequence)) return { sequence: template.sequence };

  const g = gameState(session);
  const type = template.type;

  if (type === "clue") {
    if (g?.spectrum) {
      const left = g.spectrum.left || "一端";
      const t = g.target ?? 50;
      let clue = "偏中间一点";
      if (t <= 25) clue = `更靠近${left}`;
      else if (t >= 75) clue = `更靠近${g.spectrum.right || "另一端"}`;
      return template.fields?.includes("count")
        ? { clue, count: 1 }
        : { clue };
    }
    if (g?.target && g?.banned) {
      return { clue: "和日常出行或消遣有关的地方" };
    }
    return template.fields?.includes("count")
      ? { clue: "夜晚意象", count: 1 }
      : { clue: "氛围感" };
  }

  if (type === "guess") {
    if (template.fields?.includes("value") || template.fields?.includes?.("value")) {
      return { value: rng.int(0, 100) };
    }
    if (template.fields?.includes("guess") || template.fields?.includes("sequence")) {
      if (g?.symbols && (template.length || template.fields?.includes("sequence"))) {
        const len = template.length || 4;
        const sequence = Array.from({ length: len }, () => rng.pick(g.symbols));
        return { sequence };
      }
      if (g?.target) return { guess: g.target };
      return { guess: "月亮" };
    }
    if (template.fields?.includes("index") || template.indices) {
      const indices = template.indices || [];
      if (!indices.length) return { stop: true };
      return { index: pickMode === "random" ? rng.pick(indices) : indices[0] };
    }
    return { guess: g?.target || "月亮" };
  }

  if (type === "ask") {
    const templates = [
      "它通常出现在室内吗？",
      "它和食物有关吗？",
      "它和出行有关吗？",
      "它会发出声音吗？",
      "它偏自然场景吗？",
    ];
    const n = g?.questionsAsked || 0;
    return { question: templates[n % templates.length] };
  }

  // D10 we-remember / quiz optionIndex (before yes/no "answer")
  if (type === "answer" && template.fields?.includes("optionIndex")) {
    const q = g?.questions?.[g.index ?? 0];
    const n = q?.options?.length || template.options?.length || 0;
    if (!n) return { optionIndex: 0 };
    return {
      optionIndex: pickMode === "random" ? rng.int(0, n - 1) : (q?.answerIndex ?? 0),
    };
  }

  if (type === "answer") {
    if (!g?.log?.length) return null;
    const values = template.values || ["yes", "no", "uncertain"];
    return {
      type: "answer",
      answer: pickMode === "random" ? rng.pick(values) : values[0],
    };
  }

  if (type === "submit") {
    if (actor === "user") {
      return {
        selfRating: rng.int(35, 75),
        predictionOfCharacter: rng.int(30, 80),
      };
    }
    return {
      selfRating: rng.int(35, 75),
      predictionOfUser: rng.int(30, 80),
    };
  }

  if (type === "choose" || template.fields?.includes("choice")) {
    const opts = g?.scenario?.options || [];
    if (opts.length) {
      const pick = pickMode === "random" ? rng.pick(opts) : opts[0];
      return { choice: pick.id };
    }
    if (Array.isArray(template.options) && template.options.length) {
      const id =
        pickMode === "random" ? rng.pick(template.options) : template.options[0];
      return { choice: typeof id === "string" ? id : id.id };
    }
    return null;
  }

  if (template.fields?.includes("picks")) {
    const c = g?.pool?.candidates || [];
    if (c.length < 3) return null;
    const picks = rng.shuffle(c).slice(0, 3);
    return { picks };
  }

  // Last resort: strip fields metadata
  const { fields, values, indices, symbols, length, ...rest } = template;
  if (Object.keys(rest).length > 1 || rest.type) return rest;
  return null;
}

/** Yes/no answer overrides must not starve the guesser. */
function isOverrideOnlyLegal(legal) {
  return (
    Array.isArray(legal) &&
    legal.length > 0 &&
    legal.every((a) => a?.type === "answer" && Array.isArray(a.values))
  );
}

function actorOrder(userLegal, charLegal, pickMode, rng) {
  const userOverride = isOverrideOnlyLegal(userLegal);
  const charOverride = isOverrideOnlyLegal(charLegal);
  const userCan = userLegal.length > 0 && !userOverride;
  const charCan = charLegal.length > 0 && !charOverride;
  if (userCan && !charCan) return ["user", "character"];
  if (charCan && !userCan) return ["character", "user"];
  if (userOverride && charLegal.length) return ["character", "user"];
  if (charOverride && userLegal.length) return ["user", "character"];
  if (pickMode === "random" && rng.bool()) return ["character", "user"];
  return ["user", "character"];
}

/**
 * Simulate one duo game to completion or abort.
 * @param {{
 *   gameId: string,
 *   seed?: string|number,
 *   maxSteps?: number,
 *   pickMode?: "first"|"random",
 *   runtime?: DuoGameRuntime,
 * }} opts
 * @returns {{ ok: boolean, finished: boolean, steps: number, error?: string|null, result?: any, sessionId?: string }}
 */
export function simulateDuoGame({
  gameId,
  seed = "duo-sim",
  maxSteps = 200,
  pickMode = "first",
  runtime = null,
} = {}) {
  const rt = runtime || new DuoGameRuntime();
  const rng = createRng(hashSeed(`${gameId}:${seed}:pick`));

  try {
    const created = rt.createSession(gameId, { seed });
    rt.start(created.id);
    const sessionId = created.id;
    let steps = 0;
    let lastError = null;

    while (steps < maxSteps) {
      if (rt.isFinished(sessionId)) {
        return {
          ok: true,
          finished: true,
          steps,
          error: null,
          result: rt.getResult(sessionId),
          sessionId,
        };
      }

      const userLegal = rt.legalActions(sessionId, "user");
      const charLegal = rt.legalActions(sessionId, "character");
      const order = actorOrder(userLegal, charLegal, pickMode, rng);

      let progressed = false;
      for (const actor of order) {
        const legal = actor === "user" ? userLegal : charLegal;
        if (!legal.length) continue;
        // Skip pure answer-overrides when the other actor can still progress
        if (
          isOverrideOnlyLegal(legal) &&
          ((actor === "user" && charLegal.length && !isOverrideOnlyLegal(charLegal)) ||
            (actor === "character" && userLegal.length && !isOverrideOnlyLegal(userLegal)))
        ) {
          continue;
        }

        let applied;
        if (actor === "character") {
          applied = rt.runCharacterTurn(sessionId);
        } else {
          const action = materializeDuoAction(legal, rt.getSession(sessionId), "user", rng, pickMode);
          if (!action) continue;
          applied = rt.handleUserAction(sessionId, action);
        }

        steps += 1;
        if (applied?.error) {
          lastError = applied.error;
          // Try other actor / next step without counting as hard fail yet
          continue;
        }
        progressed = true;
        break;
      }

      if (!progressed) {
        // Character fallback even when legal empty (some engines only expose via fallback)
        const fb = rt.runCharacterTurn(sessionId);
        steps += 1;
        if (!fb?.error) {
          progressed = true;
        } else if (rt.isFinished(sessionId)) {
          return {
            ok: true,
            finished: true,
            steps,
            error: null,
            result: rt.getResult(sessionId),
            sessionId,
          };
        } else {
          rt.abort(sessionId, "stuck_no_legal_actions");
          return {
            ok: false,
            finished: false,
            steps,
            error: lastError || fb.error || "stuck_no_legal_actions",
            result: null,
            sessionId,
          };
        }
      }
    }

    rt.abort(sessionId, "max_steps");
    return {
      ok: false,
      finished: false,
      steps,
      error: `max_steps:${maxSteps}`,
      result: null,
      sessionId,
    };
  } catch (err) {
    return {
      ok: false,
      finished: false,
      steps: 0,
      error: err?.message || String(err),
      result: null,
    };
  }
}

/**
 * @param {string} gameId
 */
export function duoGameExists(gameId) {
  return Boolean(getDuoGame(gameId));
}

export default simulateDuoGame;
