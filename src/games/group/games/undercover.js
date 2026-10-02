/**
 * G3 谁是卧底 — nyra.undercover
 * Private words → ordered description → limited discussion → secret vote → elimination → win.
 */

import { UNDERCOVER_PAIRS } from "../content/undercover-pairs.js";
import {
  actionError,
  gameState,
  getActor,
  privateEvent,
  publicEvent,
  withGamePatch,
} from "../helpers.js";
import { assignUndercoverSeats, eliminate, tallyVotes } from "../referee.js";
import { createRng } from "../rng.js";
import { beginDiscussion } from "../scheduler.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.undercover",
  kind: "nyra.group-game.v1",
  version: "1.0.0",
  title: t("games.group.undercover.title"),
  description: t("games.group.undercover.description"),
  runtime: "group",
  players: { min: 4, max: 10 },
  features: {
    privateInformation: true,
    roles: true,
    teams: true,
    discussion: true,
    voting: true,
  },
};

function undercoverCountFor(n) {
  if (n <= 4) return 1;
  if (n <= 6) return 1;
  return 2;
}

/**
 * @param {{ seed?: string|number, rng?: import("../rng.js").GroupRng, actors?: any[] }} args
 */
export function createInitialState({ seed, rng, actors = [] } = {}) {
  const r = rng || createRng(seed);
  const ids = actors.map((a) => a.id);
  const pair = r.pick(UNDERCOVER_PAIRS);
  const roles = assignUndercoverSeats(ids, undercoverCountFor(ids.length), r);
  /** @type {Record<string, string>} */
  const words = {};
  for (const id of ids) {
    words[id] = roles[id] === "undercover" ? pair.undercover : pair.civilian;
  }
  const describeOrder = r.shuffle(ids.slice());
  return {
    phase: "describe",
    normalWord: pair.civilian,
    undercoverWord: pair.undercover,
    roles,
    words,
    alive: ids.slice(),
    describeOrder,
    descriptions: {},
    discussionLog: [],
    votes: {},
    eliminated: [],
    winner: null,
    finished: false,
    round: 1,
  };
}

function teamOf(g, actorId) {
  return g.roles?.[actorId] === "undercover" ? "undercover" : "civilian";
}

export function observation(session, actorId) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const alive = g.alive || [];
  const publicState = {
    phase: g.phase,
    round: g.round,
    alive,
    describeOrder: g.describeOrder,
    descriptions: g.descriptions,
    discussionLog: g.discussionLog,
    eliminated: g.eliminated,
    voteSubmitted: Object.keys(g.votes || {}),
    winner: g.phase === "result" ? g.winner : undefined,
  };
  if (g.phase === "result") {
    publicState.roles = g.roles;
    publicState.normalWord = g.normalWord;
    publicState.undercoverWord = g.undercoverWord;
  }
  const privateState = {
    yourWord: alive.includes(actorId) ? g.words?.[actorId] : undefined,
    yourRole: g.phase === "result" ? g.roles?.[actorId] : undefined,
  };
  // Never expose undercoverWord/normalWord mapping to wrong team before result
  return {
    actorId,
    phase: g.phase,
    publicState,
    privateState,
    teamState: { team: teamOf(g, actorId) },
    currentObjective: objectiveFor(g, actorId),
    allowedActions: legalActions(session, actorId),
  };
}

function objectiveFor(g, actorId) {
  if (!g.alive?.includes(actorId)) return "你已被淘汰，旁观即可。";
  if (g.phase === "describe") return "用一句话描述你拿到的词，不要直接说出来。";
  if (g.phase === "discuss") return "讨论谁可能是卧底，但不要暴露自己的词。";
  if (g.phase === "vote") return "秘密投票淘汰一名玩家。";
  return "等待结果。";
}

export function legalActions(session, actorId) {
  const g = gameState(session);
  if (!g || g.finished) return [];
  if (!g.alive?.includes(actorId)) return [];
  if (g.phase === "describe" && g.descriptions?.[actorId] == null) {
    return [{ type: "describe", fields: ["text"] }];
  }
  if (g.phase === "discuss") {
    return [{ type: "speak", fields: ["text"] }];
  }
  if (g.phase === "vote" && g.votes?.[actorId] == null) {
    const targets = (g.alive || []).filter((id) => id !== actorId);
    return [{ type: "vote", fields: ["target"], targets }];
  }
  return [];
}

export function nextPolicy(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "describe") return "ordered_turn";
  if (g.phase === "discuss") return "discussion";
  if (g.phase === "vote") return "vote";
  return null;
}

export function pendingActorIds(session) {
  const g = gameState(session);
  if (!g) return [];
  if (g.phase === "describe") {
    return (g.describeOrder || g.alive || []).filter(
      (id) => g.alive.includes(id) && g.descriptions?.[id] == null
    );
  }
  if (g.phase === "vote") {
    return (g.alive || []).filter((id) => g.votes?.[id] == null);
  }
  if (g.phase === "discuss") {
    return (g.alive || []).slice();
  }
  return [];
}

function checkWinState(g) {
  const alive = g.alive || [];
  const underAlive = alive.filter((id) => g.roles?.[id] === "undercover");
  const civAlive = alive.filter((id) => g.roles?.[id] !== "undercover");
  if (underAlive.length === 0) {
    return { finished: true, winner: "civilian" };
  }
  if (underAlive.length >= civAlive.length) {
    return { finished: true, winner: "undercover" };
  }
  return { finished: false, winner: null };
}

export function applyAction(session, actorId, action) {
  const g = gameState(session);
  if (!g) return actionError(session, "no_game");
  const type = action?.type || action?.action;

  if (g.phase === "describe" && type === "describe") {
    if (!g.alive?.includes(actorId)) return actionError(session, "not_alive");
    if (g.descriptions?.[actorId] != null) return actionError(session, "already_described");
    const text = String(action.text ?? action.value ?? action.clue ?? "").trim();
    if (!text) return actionError(session, "empty_describe");
    const descriptions = { ...g.descriptions, [actorId]: text };
    const events = [publicEvent("description", { text }, { actorId })];
    const pending = (g.describeOrder || g.alive).filter(
      (id) => g.alive.includes(id) && descriptions[id] == null
    );
    if (pending.length) {
      return withGamePatch(session, { descriptions }, { events, phase: "describe" });
    }
    // enter discussion
    const nextSession = withGamePatch(
      session,
      { descriptions, phase: "discuss", votes: {} },
      {
        phase: "discuss",
        events: [
          ...events,
          publicEvent("card", { kind: "phase", title: t("games.group.phases.startDiscussion") }),
        ],
      }
    );
    beginDiscussion(nextSession.session, {});
    return nextSession;
  }

  if (g.phase === "discuss" && (type === "speak" || type === "discuss")) {
    if (!g.alive?.includes(actorId)) return actionError(session, "not_alive");
    const text = String(action.text ?? action.message ?? action.value ?? "").trim();
    if (!text) return actionError(session, "empty_speak");
    const discussionLog = (g.discussionLog || []).concat([
      { actorId, text, at: Date.now() },
    ]);
    return withGamePatch(
      session,
      { discussionLog },
      {
        events: [publicEvent("speak", { text }, { actorId })],
        phase: "discuss",
      }
    );
  }

  if (g.phase === "vote" && type === "vote") {
    if (!g.alive?.includes(actorId)) return actionError(session, "not_alive");
    if (g.votes?.[actorId] != null) return actionError(session, "already_voted");
    const target = String(action.target ?? "");
    if (!target || !g.alive.includes(target) || target === actorId) {
      return actionError(session, "illegal_target");
    }
    const votes = { ...g.votes, [actorId]: target };
    const events = [privateEvent([actorId], "vote_cast", { target }, { actorId })];
    const pending = g.alive.filter((id) => votes[id] == null);
    if (pending.length) {
      return withGamePatch(session, { votes }, { events, phase: "vote" });
    }
    return resolveVote(session, { ...g, votes }, events);
  }

  return actionError(session, `illegal_action:${type}`);
}

function resolveVote(session, g, prevEvents = []) {
  const tally = tallyVotes(g.votes, g.alive);
  const { alive, eliminated } = eliminate(g.alive, tally.tied ? null : tally.winnerId);
  const eliminatedList = eliminated
    ? (g.eliminated || []).concat([eliminated])
    : g.eliminated || [];
  const patched = {
    ...g,
    alive,
    eliminated: eliminatedList,
    lastTally: tally,
    votes: {},
    descriptions: {},
  };
  const win = checkWinState(patched);
  const events = [
    ...prevEvents,
    publicEvent("vote_result", {
      counts: tally.counts,
      eliminated,
      tied: tally.tied,
    }),
  ];
  if (win.finished) {
    return withGamePatch(
      session,
      {
        ...patched,
        phase: "result",
        finished: true,
        winner: win.winner,
      },
      {
        phase: "result",
        status: "finished",
        events: [
          ...events,
          publicEvent("card", {
            kind: "result",
            title: win.winner === "undercover" ? t("games.group.phases.undercoverWins") : t("games.group.phases.civiliansWin"),
            winner: win.winner,
            roles: g.roles,
            normalWord: g.normalWord,
            undercoverWord: g.undercoverWord,
          }),
        ],
      }
    );
  }
  // next round: describe again
  return withGamePatch(
    session,
    {
      ...patched,
      phase: "describe",
      round: (g.round || 1) + 1,
      describeOrder: alive.slice(),
      discussionLog: [],
    },
    {
      phase: "describe",
      events: [
        ...events,
        publicEvent("card", { kind: "phase", title: t("games.group.phases.descriptionRound", { round: (g.round || 1) + 1 }) }),
      ],
    }
  );
}

export function applyRule(session, rule) {
  const g = gameState(session);
  if (!g) return { session, events: [] };

  if (rule === "discussion_end" && g.phase === "discuss") {
    return withGamePatch(
      session,
      { phase: "vote", votes: {} },
      {
        phase: "vote",
        events: [
          publicEvent("card", { kind: "phase", title: t("games.group.phases.startVoting") }),
          publicEvent("vote_open", { alive: g.alive }),
        ],
      }
    );
  }

  if (rule === "ordered_complete" && g.phase === "describe") {
    const pending = (g.describeOrder || g.alive).filter(
      (id) => g.alive.includes(id) && g.descriptions?.[id] == null
    );
    if (!pending.length) {
      const next = withGamePatch(
        session,
        { phase: "discuss", votes: {} },
        {
          phase: "discuss",
          events: [publicEvent("card", { kind: "phase", title: t("games.group.phases.startDiscussion") })],
        }
      );
      beginDiscussion(next.session, {});
      return next;
    }
  }

  if (rule === "tally_votes" && g.phase === "vote") {
    return resolveVote(session, g, []);
  }

  return { session, events: [] };
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
    winner: g.winner,
    roles: g.roles,
    normalWord: g.normalWord,
    undercoverWord: g.undercoverWord,
    eliminated: g.eliminated,
    alive: g.alive,
  };
}

export function fallbackAction(session, actorId) {
  const g = gameState(session);
  if (!g || !g.alive?.includes(actorId)) return null;
  if (g.phase === "describe" && g.descriptions?.[actorId] == null) {
    return { type: "describe", text: "这是一个日常会遇到的东西。" };
  }
  if (g.phase === "discuss") {
    const others = (g.alive || []).filter((id) => id !== actorId);
    const name = getActor(session, others[0])?.name || others[0] || "某人";
    return { type: "speak", text: `我暂时怀疑 ${name}，但还不确定。` };
  }
  if (g.phase === "vote" && g.votes?.[actorId] == null) {
    const targets = (g.alive || []).filter((id) => id !== actorId);
    const target = targets[0];
    return target ? { type: "vote", target } : null;
  }
  return null;
}
