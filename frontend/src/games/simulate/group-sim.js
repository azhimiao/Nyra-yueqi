/**
 * Headless Group simulation — fake getAction via fallbackAction / legalActions.
 */

import { GroupGameRuntime } from "../group/runtime.js";
import { getGame } from "../group/games/index.js";
import { createRng, hashSeed } from "../group/rng.js";

function defaultActors(nAgents = 3) {
  return [
    { id: "user", kind: "user", name: "你" },
    ...Array.from({ length: nAgents }, (_, i) => ({
      id: `ai-${i + 1}`,
      kind: "agent",
      name: `角色${i + 1}`,
      characterId: `char-${i + 1}`,
    })),
  ];
}

/**
 * @param {any} session
 * @param {string} actorId
 * @param {import("../group/rng.js").GroupRng} [rng]
 * @param {"first"|"random"} [pickMode]
 */
export function fakeGroupAction(session, actorId, rng = null, pickMode = "first") {
  const game = getGame(session.gameId);
  if (!game) return null;
  const fb = game.fallbackAction?.(session, actorId);
  if (fb) return fb;
  const legal = game.legalActions?.(session, actorId) || [];
  if (!legal.length) return null;
  const template = pickMode === "random" && rng ? rng.pick(legal) : legal[0];
  if (!template) return null;
  if (template.type === "clue") return { type: "clue", clue: "氛围" };
  if (template.type === "guess") return { type: "guess", guess: "月亮" };
  if (template.type === "describe" || template.type === "speak") {
    return { type: template.type, text: "感觉有点日常" };
  }
  if (template.type === "vote" && template.targets?.length) {
    const t = pickMode === "random" && rng ? rng.pick(template.targets) : template.targets[0];
    return { type: "vote", target: t };
  }
  if (template.type === "night" || template.fields) {
    return { type: template.type || "pass", ...(template.defaultAction || {}) };
  }
  const { fields, targets, ...rest } = template;
  return rest;
}

/**
 * @param {{
 *   gameId: string,
 *   seed?: string|number,
 *   maxSteps?: number,
 *   pickMode?: "first"|"random",
 *   actors?: Array<{ id: string, kind: string, name?: string, characterId?: string }>,
 *   runtime?: GroupGameRuntime,
 *   limits?: object,
 * }} opts
 * @returns {Promise<{ ok: boolean, finished: boolean, steps: number, error?: string|null, result?: any, sessionId?: string }>}
 */
export async function simulateGroupGame({
  gameId,
  seed = "group-sim",
  maxSteps = 200,
  pickMode = "first",
  actors = null,
  runtime = null,
  limits = null,
} = {}) {
  const game = getGame(gameId);
  if (!game) {
    return { ok: false, finished: false, steps: 0, error: `unknown_game:${gameId}`, result: null };
  }

  const minPlayers = game.definition?.players?.min || 4;
  const nAgents = Math.max(minPlayers - 1, 3);
  const actorList = actors || defaultActors(nAgents);
  const rng = createRng(hashSeed(`${gameId}:${seed}:pick`));

  const rt =
    runtime ||
    new GroupGameRuntime({
      limits: limits || {
        maxAgentCallsPerAdvance: 40,
        maxAutoTurns: 80,
        maxEventsPerAdvance: 120,
        maxDiscussionTurns: 8,
        maxRepairCalls: 20,
      },
    });

  const getAction = (session, actorId) => fakeGroupAction(session, actorId, rng, pickMode);

  try {
    const session = await rt.createSession({ gameId, actors: actorList, seed });
    await rt.start(session.id, { getAction });
    let steps = 0;
    let last = null;

    while (steps < maxSteps) {
      last = await rt.advance(session.id, { getAction });
      steps += 1;
      const s = last.session;

      if (s.status === "finished" || s.status === "aborted") {
        const finished = s.status === "finished";
        return {
          ok: finished,
          finished,
          steps,
          error: finished ? null : "aborted",
          result: last.result || game.result?.(s) || null,
          sessionId: session.id,
        };
      }

      if (last.directive?.type === "WAIT_USER") {
        const uid = last.directive.actorId || "user";
        let action = fakeGroupAction(s, uid, rng, pickMode);
        if (!action) {
          const legal = game.legalActions?.(s, uid) || [];
          if (!legal.length) {
            await rt.abort(session.id);
            return {
              ok: false,
              finished: false,
              steps,
              error: `WAIT_USER_no_action phase=${s.phase}`,
              result: null,
              sessionId: session.id,
            };
          }
          action = fakeGroupAction(s, uid, rng, pickMode) || { type: "speak", text: "…" };
        }
        last = await rt.handleUserAction(session.id, action, { getAction });
        steps += 1;
        if (last.session.status === "finished") {
          return {
            ok: true,
            finished: true,
            steps,
            error: null,
            result: last.result || game.result?.(last.session) || null,
            sessionId: session.id,
          };
        }
        continue;
      }

      if (last.directive?.type === "FINISH" && last.session.status === "finished") {
        return {
          ok: true,
          finished: true,
          steps,
          error: null,
          result: last.result || game.result?.(last.session) || null,
          sessionId: session.id,
        };
      }

      // Limited advance — keep going until maxSteps
      if (last.limited && last.session.status === "finished") {
        return {
          ok: true,
          finished: true,
          steps,
          error: null,
          result: last.result || null,
          sessionId: session.id,
        };
      }
    }

    await rt.abort(session.id);
    return {
      ok: false,
      finished: false,
      steps,
      error: `max_steps:${maxSteps} status=${last?.session?.status} phase=${last?.session?.phase}`,
      result: null,
      sessionId: session.id,
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

export default simulateGroupGame;
