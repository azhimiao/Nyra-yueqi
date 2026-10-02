/**
 * Headless smoke: G1–G4 with fake agent actions (no LLM).
 */
import { GroupGameRuntime } from "./runtime.js";
import { VisibilityEngine } from "./visibility.js";
import { getGame } from "./games/index.js";

function actors(nAgents = 3) {
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

function fakeGetAction(session, actorId, obs) {
  const game = getGame(session.gameId);
  return game.fallbackAction(session, actorId);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function playUntilDone(runtime, sessionId, { maxAdvances = 40, userAuto = true } = {}) {
  let last;
  for (let i = 0; i < maxAdvances; i += 1) {
    last = await runtime.advance(sessionId, { getAction: fakeGetAction });
    const s = last.session;
    if (s.status === "finished") return last;
    if (last.directive?.type === "WAIT_USER" && userAuto) {
      const game = getGame(s.gameId);
      const uid = last.directive.actorId || "user";
      const action = game.fallbackAction(s, uid);
      if (!action) {
        // try legal
        const legal = game.legalActions(s, uid);
        if (!legal.length) {
          // force discuss end via speak noop — bail
          throw new Error(`WAIT_USER but no fallback for ${sessionId} phase=${s.phase}`);
        }
        last = await runtime.handleUserAction(sessionId, action, { getAction: fakeGetAction });
        if (last.session.status === "finished") return last;
        continue;
      }
      last = await runtime.handleUserAction(sessionId, action, { getAction: fakeGetAction });
      if (last.session.status === "finished") return last;
      continue;
    }
    if (last.limited) {
      // continue if still playable
      if (last.session.status === "finished") return last;
    }
    if (last.directive?.type === "FINISH" && last.session.status === "finished") return last;
  }
  throw new Error(`Did not finish ${sessionId} status=${last?.session?.status} phase=${last?.session?.phase}`);
}

async function runG1() {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.just-one",
    actors: actors(3),
    seed: "g1-smoke",
  });
  await rt.start(session.id, { getAction: fakeGetAction });
  const out = await playUntilDone(rt, session.id);
  assert(out.session.status === "finished", "G1 finished");
  assert(out.result?.targetWord || out.session.state.game.targetWord, "G1 has target");
  // visibility: clue giver sees word, guesser does not during clue
  const mid = await rt.createSession({
    gameId: "nyra.just-one",
    actors: actors(2),
    seed: "g1-vis",
  });
  const vis = new VisibilityEngine({ getGame });
  const giverObs = vis.observe(mid, "ai-1");
  const guessObs = vis.observe(mid, "user");
  assert(giverObs.privateState?.targetWord, "giver sees word");
  assert(!guessObs.privateState?.targetWord, "guesser must not see word");
  assert(!("state" in giverObs) || giverObs.state == null, "no full state");
  console.log("G1 PASS", out.result || out.session.state.game.score);
}

async function runG2() {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.same-thought",
    actors: actors(3),
    seed: "g2-smoke",
  });
  await rt.start(session.id, { getAction: fakeGetAction });
  const out = await playUntilDone(rt, session.id);
  assert(out.session.status === "finished", "G2 finished");
  assert(out.session.state.game.scores, "G2 scores");
  console.log("G2 PASS", out.session.state.game.scores);
}

async function runG3() {
  const rt = new GroupGameRuntime({
    limits: {
      maxAgentCallsPerAdvance: 40,
      maxAutoTurns: 80,
      maxEventsPerAdvance: 120,
      maxDiscussionTurns: 8,
      maxRepairCalls: 20,
    },
  });
  const session = await rt.createSession({
    gameId: "nyra.undercover",
    actors: actors(3),
    seed: "g3-smoke",
  });
  // 4 players: user + 3 ai
  await rt.start(session.id, { getAction: fakeGetAction });
  const out = await playUntilDone(rt, session.id, { maxAdvances: 80 });
  assert(out.session.status === "finished", "G3 finished");
  assert(out.session.state.game.winner, "G3 winner");
  // visibility: civilian must not see undercoverWord as their word wrongly — check private word only
  const s0 = await rt.createSession({
    gameId: "nyra.undercover",
    actors: actors(3),
    seed: "g3-vis",
  });
  const vis = new VisibilityEngine({ getGame });
  const civ = Object.entries(s0.state.game.roles).find(([, r]) => r === "civilian")[0];
  const unc = Object.entries(s0.state.game.roles).find(([, r]) => r === "undercover")[0];
  const civObs = vis.observe(s0, civ);
  const uncObs = vis.observe(s0, unc);
  assert(civObs.privateState.yourWord === s0.state.game.normalWord, "civ word");
  assert(uncObs.privateState.yourWord === s0.state.game.undercoverWord, "unc word");
  assert(civObs.publicState.undercoverWord == null, "no leak undercoverWord in public");
  console.log("G3 PASS", out.session.state.game.winner);
}

async function runG4() {
  const rt = new GroupGameRuntime({
    limits: {
      maxAgentCallsPerAdvance: 40,
      maxAutoTurns: 80,
      maxEventsPerAdvance: 120,
      maxDiscussionTurns: 8,
      maxRepairCalls: 20,
    },
  });
  const session = await rt.createSession({
    gameId: "nyra.one-night",
    actors: actors(3),
    seed: "g4-smoke",
  });
  await rt.start(session.id, { getAction: fakeGetAction });
  const out = await playUntilDone(rt, session.id, { maxAdvances: 80 });
  assert(out.session.status === "finished", "G4 finished");
  const players = out.session.state.game.players;
  for (const p of Object.values(players)) {
    assert(p.initialRole, "initialRole");
    assert(p.finalRole, "finalRole");
  }
  // Seer view must not leak to villager
  const s0 = await rt.createSession({
    gameId: "nyra.one-night",
    actors: actors(3),
    seed: "g4-vis",
  });
  // manually set a night view
  const seer = Object.entries(s0.state.game.players).find(([, p]) => p.initialRole === "seer")?.[0];
  if (seer) {
    s0.state.game.nightViews = { [seer]: { kind: "player", target: "user", role: "werewolf" } };
    const vis = new VisibilityEngine({ getGame });
    const other = Object.keys(s0.state.game.players).find((id) => id !== seer);
    const otherObs = vis.observe(s0, other);
    assert(otherObs.privateState?.nightView == null, "seer view must not leak");
    const seerObs = vis.observe(s0, seer);
    assert(seerObs.privateState?.nightView, "seer sees own view");
  }
  console.log("G4 PASS", out.session.state.game.winner);
}

async function main() {
  await runG1();
  await runG2();
  await runG3();
  await runG4();
  console.log("ALL GROUP SMOKE PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
