/**
 * Group turn scheduler — four formal policies for Launch v1.
 *
 * @typedef {"ordered_turn"|"parallel_secret"|"discussion"|"vote"} GroupTurnPolicy
 */

import { getActor, isUserActor, listActors } from "./helpers.js";

export const DISCUSSION_DEFAULTS = {
  maxAgentTurns: 6,
  maxTurnsPerActor: 2,
  yieldToHumanEvery: 3,
};

/**
 * @param {GroupTurnPolicy} policy
 * @param {any} session
 * @param {Record<string, any>} [opts]
 */
export function createSchedulerState(policy, session, opts = {}) {
  const actors = listActors(session);
  const order = (opts.order || actors.map((a) => a.id)).slice();
  return {
    policy,
    order,
    cursor: 0,
    pending: order.slice(),
    submitted: [],
    discussion: {
      ...DISCUSSION_DEFAULTS,
      ...(opts.discussion || {}),
      agentTurns: 0,
      turnsByActor: {},
      sinceHuman: 0,
    },
    votePending: order.slice(),
    voteSubmitted: [],
  };
}

/**
 * @param {any} session
 * @param {Partial<any>} patch
 */
export function patchScheduler(session, patch) {
  const next = { ...(session.state?.scheduler || {}), ...patch };
  if (!session.state) session.state = {};
  session.state.scheduler = next;
  return next;
}

/**
 * Ensure scheduler state exists for the active policy.
 * @param {any} session
 * @param {GroupTurnPolicy} policy
 * @param {Record<string, any>} [opts]
 */
export function ensureScheduler(session, policy, opts = {}) {
  const cur = session.state?.scheduler;
  if (!cur || cur.policy !== policy) {
    const created = createSchedulerState(policy, session, opts);
    if (!session.state) session.state = {};
    session.state.scheduler = created;
    return created;
  }
  return cur;
}

/**
 * Mark actor done for current policy step.
 * @param {any} sched
 * @param {string} actorId
 */
export function markSubmitted(sched, actorId) {
  const submitted = new Set(sched.submitted || []);
  submitted.add(actorId);
  const pending = (sched.pending || []).filter((id) => id !== actorId);
  const voteSubmitted = new Set(sched.voteSubmitted || []);
  voteSubmitted.add(actorId);
  const votePending = (sched.votePending || []).filter((id) => id !== actorId);
  return {
    ...sched,
    submitted: [...submitted],
    pending,
    voteSubmitted: [...voteSubmitted],
    votePending,
    cursor: Math.min((sched.cursor || 0) + 1, (sched.order || []).length),
  };
}

/**
 * Advance discussion counters after an agent speak.
 * @param {any} sched
 * @param {string} actorId
 */
export function markDiscussionTurn(sched, actorId) {
  const d = { ...(sched.discussion || { ...DISCUSSION_DEFAULTS }) };
  d.agentTurns = (d.agentTurns || 0) + 1;
  d.sinceHuman = (d.sinceHuman || 0) + 1;
  d.turnsByActor = { ...(d.turnsByActor || {}) };
  d.turnsByActor[actorId] = (d.turnsByActor[actorId] || 0) + 1;
  return { ...sched, discussion: d };
}

/**
 * Reset discussion window (phase enter).
 * @param {any} session
 * @param {Record<string, any>} [opts]
 */
export function beginDiscussion(session, opts = {}) {
  const sched = ensureScheduler(session, "discussion", opts);
  sched.discussion = {
    ...DISCUSSION_DEFAULTS,
    ...(opts.discussion || {}),
    agentTurns: 0,
    turnsByActor: {},
    sinceHuman: 0,
  };
  session.state.scheduler = sched;
  return sched;
}

/**
 * @param {any} session
 * @param {string[]} pendingIds
 */
function splitPending(session, pendingIds) {
  const agents = [];
  const users = [];
  for (const id of pendingIds) {
    const actor = getActor(session, id);
    if (isUserActor(actor)) users.push(id);
    else agents.push(id);
  }
  return { agents, users };
}

/**
 * Pick next discussant among agents under per-actor caps.
 * @param {any} session
 * @param {any} sched
 * @param {Set<string>} [eligible]
 */
function nextDiscussant(session, sched, eligible = null) {
  const d = sched.discussion || DISCUSSION_DEFAULTS;
  const maxPer = d.maxTurnsPerActor ?? DISCUSSION_DEFAULTS.maxTurnsPerActor;
  const agents = listActors(session).filter((a) => {
    if (isUserActor(a)) return false;
    if (eligible && !eligible.has(a.id)) return false;
    return true;
  });
  const ranked = agents
    .map((a) => ({
      id: a.id,
      turns: d.turnsByActor?.[a.id] || 0,
    }))
    .filter((a) => a.turns < maxPer)
    .sort((a, b) => a.turns - b.turns || a.id.localeCompare(b.id));
  return ranked[0]?.id || null;
}

/**
 * Compute the next orchestrator directive for a policy.
 *
 * @param {any} session
 * @param {GroupTurnPolicy | null | undefined} policy
 * @param {{ pendingActorIds?: string[], discussionOpts?: object }} [ctx]
 * @returns {{ type: string, actorId?: string, actorIds?: string[], rule?: string, card?: any, reason?: string }}
 */
export function nextDirective(session, policy, ctx = {}) {
  if (!policy) {
    return { type: "FINISH", reason: "no_policy" };
  }

  const sched = ensureScheduler(session, policy, {
    discussion: ctx.discussionOpts,
    order: ctx.pendingActorIds,
  });

  if (policy === "ordered_turn") {
    const order = ctx.pendingActorIds || sched.order || listActors(session).map((a) => a.id);
    const submitted = new Set(sched.submitted || []);
    const nextId = order.find((id) => !submitted.has(id));
    if (!nextId) {
      return { type: "APPLY_RULE", rule: "ordered_complete" };
    }
    const actor = getActor(session, nextId);
    if (isUserActor(actor)) {
      return { type: "WAIT_USER", actorId: nextId };
    }
    return { type: "RUN_AGENT", actorId: nextId };
  }

  if (policy === "parallel_secret") {
    const pending =
      ctx.pendingActorIds ||
      sched.pending ||
      listActors(session)
        .map((a) => a.id)
        .filter((id) => !(sched.submitted || []).includes(id));
    const { agents, users } = splitPending(session, pending);
    if (agents.length) {
      return { type: "RUN_AGENTS_PARALLEL", actorIds: agents.slice().sort() };
    }
    if (users.length) {
      return { type: "WAIT_USER", actorId: users[0], actorIds: users };
    }
    return { type: "APPLY_RULE", rule: "parallel_complete" };
  }

  if (policy === "discussion") {
    const d = { ...DISCUSSION_DEFAULTS, ...(sched.discussion || {}) };
    const maxAgent = d.maxAgentTurns ?? DISCUSSION_DEFAULTS.maxAgentTurns;
    const yieldEvery = d.yieldToHumanEvery ?? DISCUSSION_DEFAULTS.yieldToHumanEvery;
    if ((d.agentTurns || 0) >= maxAgent) {
      return { type: "APPLY_RULE", rule: "discussion_end" };
    }
    const eligible = new Set(
      ctx.pendingActorIds || listActors(session).map((a) => a.id)
    );
    const user = listActors(session).find((a) => isUserActor(a) && eligible.has(a.id));
    if (user && (d.sinceHuman || 0) >= yieldEvery) {
      return { type: "WAIT_USER", actorId: user.id, reason: "yield_to_human" };
    }
    const nextId = nextDiscussant(session, sched, eligible);
    if (!nextId) {
      return { type: "APPLY_RULE", rule: "discussion_end" };
    }
    return { type: "RUN_AGENT", actorId: nextId };
  }

  if (policy === "vote") {
    const pending =
      ctx.pendingActorIds ||
      sched.votePending ||
      listActors(session)
        .map((a) => a.id)
        .filter((id) => !(sched.voteSubmitted || []).includes(id));
    if (!(sched._voteOpened)) {
      return { type: "OPEN_VOTE", actorIds: pending.slice() };
    }
    const { agents, users } = splitPending(session, pending);
    if (agents.length) {
      return { type: "RUN_AGENTS_PARALLEL", actorIds: agents.slice().sort(), mode: "vote" };
    }
    if (users.length) {
      return { type: "WAIT_USER", actorId: users[0], actorIds: users, mode: "vote" };
    }
    return { type: "APPLY_RULE", rule: "tally_votes" };
  }

  return { type: "FINISH", reason: `unknown_policy:${policy}` };
}

/**
 * Policy catalog for external callers.
 */
export const POLICIES = ["ordered_turn", "parallel_secret", "discussion", "vote"];
