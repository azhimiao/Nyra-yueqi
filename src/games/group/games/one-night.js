/**
 * G4 一夜身份局 — nyra.one-night
 * Roles: Werewolf / Villager / Seer / Robber / Troublemaker
 * SETUP → NIGHT private actions → mutations → DAY discussion → VOTE → RESULT
 * Tracks initialRole AND finalRole.
 */

import {
  actionError,
  gameState,
  privateEvent,
  publicEvent,
  withGamePatch,
} from "../helpers.js";
import { assignRoles, tallyVotes } from "../referee.js";
import { createRng } from "../rng.js";
import { beginDiscussion } from "../scheduler.js";
import { t } from "../../../i18n/index.js";

export const definition = {
  id: "nyra.one-night",
  kind: "nyra.group-game.v1",
  version: "1.0.0",
  title: t("games.group.oneNight.title"),
  description: t("games.group.oneNight.description"),
  runtime: "group",
  players: { min: 4, max: 8 },
  features: {
    privateInformation: true,
    roles: true,
    teams: true,
    discussion: true,
    voting: true,
  },
};

const ROLE_ORDER = ["werewolf", "seer", "robber", "troublemaker"];

/**
 * Build role pool for N players (+ 3 center).
 * @param {number} n
 */
export function buildRolePool(n) {
  // Always include core roles; pad with villagers; ensure >=1 werewolf
  const center = 3;
  const total = n + center;
  const pool = ["werewolf", "seer", "robber", "troublemaker"];
  while (pool.length < total) pool.push("villager");
  // Second werewolf when enough seats
  if (n >= 5 && !pool.includes("werewolf")) pool[0] = "werewolf";
  if (n >= 6) {
    const vi = pool.indexOf("villager");
    if (vi >= 0) pool[vi] = "werewolf";
  }
  return pool.slice(0, total);
}

/**
 * @param {{ seed?: string|number, rng?: import("../rng.js").GroupRng, actors?: any[] }} args
 */
export function createInitialState({ seed, rng, actors = [] } = {}) {
  const r = rng || createRng(seed);
  const ids = actors.map((a) => a.id);
  const pool = buildRolePool(ids.length);
  const { assignments, center, order } = assignRoles(actors, pool, r);
  /** @type {Record<string, { initialRole: string, finalRole: string }>} */
  const players = {};
  for (const id of ids) {
    players[id] = {
      initialRole: assignments[id],
      finalRole: assignments[id],
    };
  }
  return {
    phase: "night",
    nightStep: 0,
    nightOrder: ROLE_ORDER.slice(),
    players,
    centerCards: center.slice(),
    centerInitial: center.slice(),
    nightActions: {},
    nightViews: {},
    discussionLog: [],
    votes: {},
    winner: null,
    finished: false,
    dealOrder: order,
  };
}

function finalRolesMap(g) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [id, p] of Object.entries(g.players || {})) {
    map[id] = p.finalRole;
  }
  return map;
}

function actorsWithInitialRole(g, role) {
  return Object.entries(g.players || {})
    .filter(([, p]) => p.initialRole === role)
    .map(([id]) => id);
}

function currentNightRole(g) {
  return g.nightOrder?.[g.nightStep] || null;
}

export function observation(session, actorId) {
  const g = gameState(session);
  if (!g) return { error: "no_game" };
  const me = g.players?.[actorId];
  const publicState = {
    phase: g.phase,
    nightRoleAwake: g.phase === "night" ? currentNightRole(g) : undefined,
    discussionLog: g.discussionLog,
    voteSubmitted: Object.keys(g.votes || {}),
    winner: g.phase === "result" ? g.winner : undefined,
    participantIds: Object.keys(g.players || {}),
  };
  if (g.phase === "result") {
    publicState.players = g.players;
    publicState.centerCards = g.centerCards;
    publicState.centerInitial = g.centerInitial;
  }
  const privateState = {
    initialRole: me?.initialRole,
    // During night/day before result: show role as known to player.
    // Robber may learn a new card; finalRole after their night action updates.
    knownRole: me?.finalRole,
    nightView: g.nightViews?.[actorId],
  };
  if (g.phase === "result") {
    privateState.finalRole = me?.finalRole;
  }
  return {
    actorId,
    phase: g.phase,
    publicState,
    privateState,
    currentObjective: objectiveFor(g, actorId),
    allowedActions: legalActions(session, actorId),
  };
}

function objectiveFor(g, actorId) {
  const me = g.players?.[actorId];
  if (g.phase === "night") {
    const role = currentNightRole(g);
    if (me?.initialRole !== role) return "夜晚：闭眼等待。";
    if (role === "werewolf") return "查看其他狼人（若有）。";
    if (role === "seer") return "查验一名玩家，或查看两张中央牌。";
    if (role === "robber") return "与一名玩家交换身份，并查看新身份。";
    if (role === "troublemaker") return "交换另外两名玩家的身份（不查看）。";
    return "夜晚无行动。";
  }
  if (g.phase === "day") return "讨论谁可能是狼人。";
  if (g.phase === "vote") return "投票淘汰一名玩家。";
  return "查看结果。";
}

export function legalActions(session, actorId) {
  const g = gameState(session);
  if (!g || g.finished) return [];
  const me = g.players?.[actorId];
  if (!me) return [];

  if (g.phase === "night") {
    const role = currentNightRole(g);
    if (me.initialRole !== role) return [];
    if (g.nightActions?.[actorId]) return [];
    const others = Object.keys(g.players).filter((id) => id !== actorId);
    if (role === "werewolf") {
      return [{ type: "night_ack" }, { type: "werewolf_peek" }];
    }
    if (role === "seer") {
      return [
        { type: "seer_player", fields: ["target"], targets: others },
        {
          type: "seer_center",
          fields: ["a", "b"],
          targets: [0, 1, 2].filter((i) => i < (g.centerCards || []).length),
        },
      ];
    }
    if (role === "robber") {
      return [{ type: "robber_swap", fields: ["target"], targets: others }];
    }
    if (role === "troublemaker") {
      return [{ type: "troublemaker_swap", fields: ["a", "b"], targets: others }];
    }
    return [{ type: "night_ack" }];
  }

  if (g.phase === "day") {
    return [{ type: "speak", fields: ["text"] }];
  }

  if (g.phase === "vote" && g.votes?.[actorId] == null) {
    const targets = Object.keys(g.players).filter((id) => id !== actorId);
    return [{ type: "vote", fields: ["target"], targets }];
  }
  return [];
}

export function nextPolicy(session) {
  const g = gameState(session);
  if (!g || g.finished) return null;
  if (g.phase === "night") return "ordered_turn";
  if (g.phase === "day") return "discussion";
  if (g.phase === "vote") return "vote";
  return null;
}

export function pendingActorIds(session) {
  const g = gameState(session);
  if (!g) return [];
  if (g.phase === "night") {
    const role = currentNightRole(g);
    if (!role) return [];
    return actorsWithInitialRole(g, role).filter((id) => !g.nightActions?.[id]);
  }
  if (g.phase === "vote") {
    return Object.keys(g.players).filter((id) => g.votes?.[id] == null);
  }
  if (g.phase === "day") {
    return Object.keys(g.players);
  }
  return [];
}

function advanceNight(session, g, events) {
  let step = g.nightStep;
  let nightActions = g.nightActions;
  // skip empty roles
  while (true) {
    const role = g.nightOrder[step];
    if (!role) break;
    const actors = actorsWithInitialRole(g, role);
    const pending = actors.filter((id) => !nightActions?.[id]);
    if (pending.length) {
      return withGamePatch(
        session,
        { ...g, nightStep: step },
        { events, phase: "night" }
      );
    }
    step += 1;
    if (step >= g.nightOrder.length) {
      // Day
      const next = withGamePatch(
        session,
        { ...g, nightStep: step, phase: "day", votes: {} },
        {
          phase: "day",
          events: [
            ...events,
            publicEvent("card", { kind: "phase", title: t("games.group.phases.nightEnds") }),
          ],
        }
      );
      beginDiscussion(next.session, {});
      return next;
    }
  }
  return withGamePatch(session, { ...g, nightStep: step }, { events, phase: "night" });
}

export function applyAction(session, actorId, action) {
  const g = gameState(session);
  if (!g) return actionError(session, "no_game");
  const type = action?.type || action?.action;
  const me = g.players?.[actorId];
  if (!me) return actionError(session, "unknown_actor");

  if (g.phase === "night") {
    const role = currentNightRole(g);
    if (me.initialRole !== role) return actionError(session, "not_your_night");
    if (g.nightActions?.[actorId]) return actionError(session, "already_acted");

    const players = { ...g.players };
    const centerCards = (g.centerCards || []).slice();
    const nightViews = { ...(g.nightViews || {}) };
    const nightActions = { ...(g.nightActions || {}) };
    const events = [];

    if (role === "werewolf" && (type === "werewolf_peek" || type === "night_ack")) {
      const peers = actorsWithInitialRole(g, "werewolf").filter((id) => id !== actorId);
      nightViews[actorId] = { peers, alone: peers.length === 0 };
      nightActions[actorId] = { type: "werewolf_peek" };
      events.push(privateEvent([actorId], "werewolf_view", nightViews[actorId], { actorId }));
    } else if (role === "seer" && type === "seer_player") {
      const target = String(action.target || "");
      if (!players[target]) return actionError(session, "illegal_target");
      nightViews[actorId] = { kind: "player", target, role: players[target].finalRole };
      nightActions[actorId] = { type, target };
      events.push(privateEvent([actorId], "seer_view", nightViews[actorId], { actorId }));
    } else if (role === "seer" && type === "seer_center") {
      const a = Number(action.a);
      const b = Number(action.b);
      if (
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a === b ||
        a < 0 ||
        b < 0 ||
        a >= centerCards.length ||
        b >= centerCards.length
      ) {
        return actionError(session, "illegal_center");
      }
      nightViews[actorId] = {
        kind: "center",
        cards: [
          { index: a, role: centerCards[a] },
          { index: b, role: centerCards[b] },
        ],
      };
      nightActions[actorId] = { type, a, b };
      events.push(privateEvent([actorId], "seer_view", nightViews[actorId], { actorId }));
    } else if (role === "robber" && type === "robber_swap") {
      const target = String(action.target || "");
      if (!players[target] || target === actorId) return actionError(session, "illegal_target");
      const myRole = players[actorId].finalRole;
      const theirRole = players[target].finalRole;
      players[actorId] = { ...players[actorId], finalRole: theirRole };
      players[target] = { ...players[target], finalRole: myRole };
      nightViews[actorId] = { stolen: theirRole, from: target };
      nightActions[actorId] = { type, target };
      events.push(privateEvent([actorId], "robber_view", nightViews[actorId], { actorId }));
    } else if (role === "troublemaker" && type === "troublemaker_swap") {
      const a = String(action.a || "");
      const b = String(action.b || "");
      if (!players[a] || !players[b] || a === b || a === actorId || b === actorId) {
        return actionError(session, "illegal_targets");
      }
      const roleA = players[a].finalRole;
      const roleB = players[b].finalRole;
      players[a] = { ...players[a], finalRole: roleB };
      players[b] = { ...players[b], finalRole: roleA };
      nightActions[actorId] = { type, a, b };
      events.push(privateEvent([actorId], "troublemaker_done", { a, b }, { actorId }));
    } else if (type === "night_ack") {
      nightActions[actorId] = { type: "night_ack" };
    } else {
      return actionError(session, `illegal_night_action:${type}`);
    }

    const patched = { ...g, players, centerCards, nightViews, nightActions };
    return advanceNight(session, patched, events);
  }

  if (g.phase === "day" && (type === "speak" || type === "discuss")) {
    const text = String(action.text ?? action.message ?? "").trim();
    if (!text) return actionError(session, "empty_speak");
    const discussionLog = (g.discussionLog || []).concat([{ actorId, text, at: Date.now() }]);
    return withGamePatch(
      session,
      { discussionLog },
      { events: [publicEvent("speak", { text }, { actorId })], phase: "day" }
    );
  }

  if (g.phase === "vote" && type === "vote") {
    if (g.votes?.[actorId] != null) return actionError(session, "already_voted");
    const target = String(action.target || "");
    if (!g.players[target] || target === actorId) return actionError(session, "illegal_target");
    const votes = { ...g.votes, [actorId]: target };
    const events = [privateEvent([actorId], "vote_cast", { target }, { actorId })];
    const pending = Object.keys(g.players).filter((id) => votes[id] == null);
    if (pending.length) {
      return withGamePatch(session, { votes }, { events, phase: "vote" });
    }
    return resolveOneNightVote(session, { ...g, votes }, events);
  }

  return actionError(session, `illegal_action:${type}`);
}

function resolveOneNightVote(session, g, prevEvents = []) {
  const ids = Object.keys(g.players);
  const tally = tallyVotes(g.votes, ids);
  const killed = tally.tied ? null : tally.winnerId;
  const roles = finalRolesMap(g);
  const werewolvesAmongPlayers = ids.filter((id) => roles[id] === "werewolf");
  let winner;
  if (werewolvesAmongPlayers.length === 0) {
    // All wolves in center — village wins only if nobody dies
    winner = killed == null ? "village" : "werewolf";
  } else if (killed && roles[killed] === "werewolf") {
    winner = "village";
  } else {
    winner = "werewolf";
  }
  return withGamePatch(
    session,
    {
      ...g,
      lastTally: tally,
      killed,
      winner,
      phase: "result",
      finished: true,
    },
    {
      phase: "result",
      status: "finished",
      events: [
        ...prevEvents,
        publicEvent("vote_result", { counts: tally.counts, killed, tied: tally.tied }),
        publicEvent("card", {
          kind: "result",
          title: winner === "village" ? t("games.group.phases.villageWins") : t("games.group.phases.werewolvesWin"),
          winner,
          killed,
          players: g.players,
        }),
      ],
    }
  );
}

export function applyRule(session, rule) {
  const g = gameState(session);
  if (!g) return { session, events: [] };

  if (rule === "discussion_end" && g.phase === "day") {
    return withGamePatch(
      session,
      { phase: "vote", votes: {} },
      {
        phase: "vote",
        events: [publicEvent("card", { kind: "phase", title: t("games.group.phases.startVoting") })],
      }
    );
  }

  if (rule === "ordered_complete" && g.phase === "night") {
    // Skip empty night roles / advance
    return advanceNight(session, g, [publicEvent("night_advance", { step: g.nightStep })]);
  }

  if (rule === "tally_votes" && g.phase === "vote") {
    return resolveOneNightVote(session, g, []);
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
    killed: g.killed,
    players: g.players,
    centerCards: g.centerCards,
    centerInitial: g.centerInitial,
  };
}

export function fallbackAction(session, actorId) {
  const g = gameState(session);
  if (!g) return null;
  const legal = legalActions(session, actorId);
  if (!legal.length) return null;
  const first = legal[0];
  const type = first.type;
  if (type === "werewolf_peek" || type === "night_ack") return { type };
  if (type === "seer_player") return { type, target: first.targets[0] };
  if (type === "seer_center") {
    return { type, a: first.targets[0], b: first.targets[1] ?? first.targets[0] };
  }
  if (type === "robber_swap") return { type, target: first.targets[0] };
  if (type === "troublemaker_swap") {
    return { type, a: first.targets[0], b: first.targets[1] || first.targets[0] };
  }
  if (type === "speak") {
    return { type: "speak", text: "我还在想谁比较可疑。" };
  }
  if (type === "vote") return { type: "vote", target: first.targets[0] };
  return { type };
}
