/**
 * Group Orchestrator — bounded advance() loop.
 *
 * Directives: RUN_AGENT | RUN_AGENTS_PARALLEL | WAIT_USER | OPEN_VOTE | APPLY_RULE | SHOW_CARD | FINISH
 */

import { parseValidateRepairFallback } from "./action-parse.js";
import { getGame } from "./games/index.js";
import {
  appendEvents,
  cloneSession,
  gameState,
  isPlayable,
  publicEvent,
} from "./helpers.js";
import { applyAction as refereeApply } from "./referee.js";
import {
  ensureScheduler,
  markDiscussionTurn,
  markSubmitted,
  nextDirective,
  patchScheduler,
} from "./scheduler.js";
import { VisibilityEngine } from "./visibility.js";

export const DEFAULT_LIMITS = {
  maxAgentCallsPerAdvance: 12,
  maxRepairCalls: 4,
  maxAutoTurns: 24,
  maxEventsPerAdvance: 40,
  maxDiscussionTurns: 8,
};

/**
 * @typedef {{
 *   getAction?: (session: any, actorId: string, observation: any) => Promise<any>|any,
 *   onCard?: (card: any, session: any) => void,
 *   onEvent?: (events: any[], session: any) => void,
 *   limits?: Partial<typeof DEFAULT_LIMITS>,
 *   visibility?: VisibilityEngine,
 * }} AdvanceHooks
 */

/**
 * @param {any} session
 * @param {AdvanceHooks} [hooks]
 */
export async function advance(session, hooks = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(hooks.limits || {}) };
  const counters = {
    agentCalls: 0,
    repairCalls: 0,
    autoTurns: 0,
    events: 0,
    discussionTurns: 0,
  };

  let current = cloneSession(session);
  const game = getGame(current.gameId) || current.__gameModule;
  if (!game) {
    return {
      session: current,
      directive: { type: "FINISH", reason: "unknown_game" },
      outputs: [],
      stopped: true,
      counters,
    };
  }
  current.__gameModule = game;

  const visibility = hooks.visibility || new VisibilityEngine({ getGame });
  const outputs = [];

  if (current.status === "paused") {
    return { session: current, directive: { type: "WAIT_USER", reason: "paused" }, outputs, stopped: true, counters };
  }
  if (current.status === "finished" || current.status === "aborted" || game.isFinished?.(current)) {
    return finishSession(current, game, outputs, counters, "already_finished");
  }

  if (current.status === "starting") {
    current.status = "playing";
  }

  for (let safety = 0; safety < limits.maxAutoTurns + 5; safety += 1) {
    if (!isPlayable(current) && current.status !== "waiting_agent") {
      break;
    }
    if (game.isFinished?.(current)) {
      return finishSession(current, game, outputs, counters, "finished");
    }
    if (counters.autoTurns >= limits.maxAutoTurns) {
      return stopLimited(current, outputs, counters, "maxAutoTurns");
    }
    if (counters.events >= limits.maxEventsPerAdvance) {
      return stopLimited(current, outputs, counters, "maxEventsPerAdvance");
    }
    if (counters.discussionTurns >= limits.maxDiscussionTurns) {
      // Force discussion end if still discussing
      const g = gameState(current);
      if (g?.phase === "discuss" || g?.phase === "day") {
        const applied = applySystemRule(current, game, "discussion_end");
        current = mergeApply(current, applied, counters, hooks);
        counters.autoTurns += 1;
        continue;
      }
      return stopLimited(current, outputs, counters, "maxDiscussionTurns");
    }

    const policy = game.nextPolicy?.(current) || null;
    const pending = game.pendingActorIds?.(current);
    const directive = nextDirective(current, policy, {
      pendingActorIds: pending,
    });

    if (directive.type === "FINISH") {
      return finishSession(current, game, outputs, counters, directive.reason || "finish");
    }

    if (directive.type === "WAIT_USER") {
      current.status = "waiting_user";
      current.updatedAt = Date.now();
      outputs.push({ type: "WAIT_USER", actorId: directive.actorId, actorIds: directive.actorIds });
      return { session: stripModule(current), directive, outputs, stopped: true, counters };
    }

    if (directive.type === "OPEN_VOTE") {
      const sched = ensureScheduler(current, "vote");
      sched._voteOpened = true;
      current.state.scheduler = sched;
      const card = { kind: "vote", title: "投票开始", actorIds: directive.actorIds };
      const ev = [publicEvent("card", card), publicEvent("vote_open", { actorIds: directive.actorIds })];
      current = appendEvents(current, ev);
      counters.events += ev.length;
      hooks.onCard?.(card, current);
      outputs.push({ type: "SHOW_CARD", card });
      counters.autoTurns += 1;
      continue;
    }

    if (directive.type === "SHOW_CARD") {
      hooks.onCard?.(directive.card, current);
      outputs.push({ type: "SHOW_CARD", card: directive.card });
      counters.autoTurns += 1;
      continue;
    }

    if (directive.type === "APPLY_RULE") {
      const applied = applySystemRule(current, game, directive.rule);
      current = mergeApply(current, applied, counters, hooks);
      // If rule was no-op and policy still same with no pending, finish to avoid loop
      if (!(applied.events || []).length && !(applied.session && applied.session !== current)) {
        const still = game.pendingActorIds?.(current) || [];
        if (!still.length && !game.isFinished?.(current)) {
          // bump scheduler submitted to avoid spin
          const sched = current.state?.scheduler;
          if (sched) {
            current.state.scheduler = { ...sched, submitted: (sched.order || []).slice() };
          }
        }
      }
      counters.autoTurns += 1;
      continue;
    }

    if (directive.type === "RUN_AGENT") {
      if (counters.agentCalls >= limits.maxAgentCallsPerAdvance) {
        return stopLimited(current, outputs, counters, "maxAgentCallsPerAdvance");
      }
      const result = await runOneAgent(current, game, directive.actorId, hooks, visibility, limits, counters);
      current = result.session;
      outputs.push(...result.outputs);
      if (result.wait) {
        return { session: stripModule(current), directive: result.wait, outputs, stopped: true, counters };
      }
      counters.autoTurns += 1;
      continue;
    }

    if (directive.type === "RUN_AGENTS_PARALLEL") {
      const ids = (directive.actorIds || []).slice().sort();
      if (counters.agentCalls + ids.length > limits.maxAgentCallsPerAdvance) {
        // run what we can then stop
        const room = Math.max(0, limits.maxAgentCallsPerAdvance - counters.agentCalls);
        if (!room) return stopLimited(current, outputs, counters, "maxAgentCallsPerAdvance");
        ids.splice(room);
      }
      // Collect actions first (parallel), then apply in sorted actorId order (deterministic).
      const prepared = [];
      for (const actorId of ids) {
        const obs = visibility.observe(current, actorId);
        const legal = game.legalActions?.(current, actorId) || [];
        let raw = null;
        if (hooks.getAction) {
          raw = await hooks.getAction(current, actorId, obs);
        }
        counters.agentCalls += 1;
        const resolved = parseValidateRepairFallback(raw, legal, () =>
          game.fallbackAction?.(current, actorId)
        );
        if (resolved.source === "repaired" || resolved.source === "fallback") {
          counters.repairCalls += 1;
          if (counters.repairCalls > limits.maxRepairCalls) {
            // still apply fallback but stop after this batch
          }
        }
        prepared.push({ actorId, action: resolved.action, source: resolved.source, log: resolved.log });
      }
      for (const item of prepared) {
        if (!item.action) continue;
        const applied = refereeApply(game, current, item.actorId, item.action);
        current = mergeApply(current, applied, counters, hooks);
        // mark scheduler
        const sched = current.state?.scheduler || ensureScheduler(current, game.nextPolicy?.(current));
        let nextSched = markSubmitted(sched, item.actorId);
        if (gameState(current)?.phase === "discuss" || gameState(current)?.phase === "day") {
          nextSched = markDiscussionTurn(nextSched, item.actorId);
          counters.discussionTurns += 1;
        }
        current.state = current.state || {};
        current.state.scheduler = nextSched;
        outputs.push({
          type: "AGENT_ACTION",
          actorId: item.actorId,
          action: item.action,
          source: item.source,
        });
      }
      if (counters.repairCalls > limits.maxRepairCalls) {
        return stopLimited(current, outputs, counters, "maxRepairCalls");
      }
      counters.autoTurns += 1;
      continue;
    }

    // Unknown directive
    outputs.push({ type: "UNKNOWN_DIRECTIVE", directive });
    break;
  }

  return {
    session: stripModule(current),
    directive: { type: "FINISH", reason: "loop_end" },
    outputs,
    stopped: true,
    counters,
  };
}

/**
 * @param {any} session
 * @param {any} game
 * @param {string} actorId
 * @param {AdvanceHooks} hooks
 * @param {VisibilityEngine} visibility
 * @param {typeof DEFAULT_LIMITS} limits
 * @param {any} counters
 */
async function runOneAgent(session, game, actorId, hooks, visibility, limits, counters) {
  const outputs = [];
  if (counters.agentCalls >= limits.maxAgentCallsPerAdvance) {
    return { session, outputs, wait: { type: "FINISH", reason: "maxAgentCallsPerAdvance" } };
  }
  const obs = visibility.observe(session, actorId);
  const legal = game.legalActions?.(session, actorId) || [];
  let raw = null;
  if (hooks.getAction) {
    raw = await hooks.getAction(session, actorId, obs);
  }
  counters.agentCalls += 1;
  const resolved = parseValidateRepairFallback(raw, legal, () =>
    game.fallbackAction?.(session, actorId)
  );
  if (resolved.source === "repaired" || resolved.source === "fallback") {
    counters.repairCalls += 1;
  }
  if (!resolved.action) {
    return {
      session,
      outputs,
      wait: { type: "WAIT_USER", reason: "agent_no_action", actorId },
    };
  }
  const applied = refereeApply(game, session, actorId, resolved.action);
  let current = mergeApply(session, applied, counters, hooks);
  const policy = game.nextPolicy?.(current);
  const sched = current.state?.scheduler || ensureScheduler(current, policy);
  let nextSched = markSubmitted(sched, actorId);
  const phase = gameState(current)?.phase;
  if (phase === "discuss" || phase === "day") {
    nextSched = markDiscussionTurn(nextSched, actorId);
    counters.discussionTurns += 1;
  }
  current.state = current.state || {};
  current.state.scheduler = nextSched;
  outputs.push({
    type: "AGENT_ACTION",
    actorId,
    action: resolved.action,
    source: resolved.source,
  });
  if (counters.repairCalls > limits.maxRepairCalls) {
    return {
      session: current,
      outputs,
      wait: { type: "FINISH", reason: "maxRepairCalls" },
    };
  }
  return { session: current, outputs };
}

function applySystemRule(session, game, rule) {
  if (typeof game.applyRule === "function") {
    return game.applyRule(session, rule);
  }
  return { session, events: [] };
}

function mergeApply(session, applied, counters, hooks) {
  let next = applied?.session || session;
  const events = applied?.events || [];
  if (events.length) {
    next = appendEvents(next, events);
    counters.events += events.length;
    hooks.onEvent?.(events, next);
    for (const ev of events) {
      if (ev.type === "card" || ev.payload?.kind) {
        hooks.onCard?.(ev.payload || ev, next);
      }
    }
  }
  if (applied?.status) next.status = applied.status;
  if (gameState(next)?.finished) {
    next.status = "finished";
    next.endedAt = next.endedAt || Date.now();
  }
  next.updatedAt = Date.now();
  return next;
}

function finishSession(session, game, outputs, counters, reason) {
  const next = cloneSession(session);
  next.status = "finished";
  next.endedAt = next.endedAt || Date.now();
  next.updatedAt = Date.now();
  const result = game.result?.(next) || null;
  outputs.push({ type: "FINISH", reason, result });
  return {
    session: stripModule(next),
    directive: { type: "FINISH", reason },
    outputs,
    result,
    stopped: true,
    counters,
  };
}

function stopLimited(session, outputs, counters, reason) {
  const next = cloneSession(session);
  next.status = next.status === "waiting_user" ? next.status : "playing";
  next.updatedAt = Date.now();
  outputs.push({ type: "LIMIT", reason, counters: { ...counters } });
  return {
    session: stripModule(next),
    directive: { type: "FINISH", reason },
    outputs,
    stopped: true,
    limited: true,
    counters,
  };
}

function stripModule(session) {
  const next = cloneSession(session);
  delete next.__gameModule;
  return next;
}

export { nextDirective };
