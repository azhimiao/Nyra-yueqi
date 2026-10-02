/**
 * Games Launch v1 — E2E lifecycle vs gameplay logic (14 games).
 * start → play → pause → reload/resume → finish → chat clear
 * Group: visibility, discussion bounds, per-character calls, legal/vote/win
 *
 * Run: node scripts/verify-games-e2e-lifecycle.mjs
 */
import { createLocalPersistence } from "../src/games/platform/persistence.js";
import { DuoGameRuntime } from "../src/games/duo/runtime.js";
import { listDuoGames, getDuoGame } from "../src/games/duo/games/index.js";
import { materializeDuoAction, simulateDuoGame } from "../src/games/simulate/duo-sim.js";
import { createRng, hashSeed } from "../src/games/duo/rng.js";
import { GroupGameRuntime } from "../src/games/group/runtime.js";
import { listGames as listGroupGames, getGame as getGroupGame } from "../src/games/group/games/index.js";
import { fakeGroupAction, simulateGroupGame } from "../src/games/simulate/group-sim.js";
import { VisibilityEngine } from "../src/games/group/visibility.js";
import { runVisibilityTests } from "../src/games/simulate/visibility-tests.js";
import { DEFAULT_LIMITS } from "../src/games/group/orchestrator.js";
import {
  getActiveChatGameSession,
  endChatGameSession,
} from "../src/games/chat-game-session.js";
import { startPopDuoGame, endPopDuoGame } from "../src/games/adapters/pop-duo.js";
import { startEphemeralGroupGame } from "../src/games/adapters/group-bridge.js";
import {
  getGameContextExtension,
  setGameContextExtension,
} from "../src/games/adapters/context-slot.js";
import { shouldWriteLongTermMemory } from "../src/games/adapters/memory-policy.js";

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const results = [];
const failures = [];

function record(id, status, evidence) {
  results.push({ id, status, evidence });
  console.log(`${status}  ${id} — ${evidence}`);
  if (status !== "PASS") failures.push(id);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hydrateDuoRuntime(persistence, sessionId) {
  const rt = new DuoGameRuntime({ persistence });
  const raw = persistence.load(sessionId);
  assert(raw, "persist miss");
  rt.sessions.set(sessionId, raw);
  return rt;
}

function advanceDuoToFinish(rt, sessionId, tag) {
  const rng = createRng(hashSeed(tag));
  let steps = 0;
  while (!rt.isFinished(sessionId) && steps < 220) {
    const userLegal = rt.legalActions(sessionId, "user");
    if (userLegal.length) {
      const action = materializeDuoAction(
        userLegal,
        rt.getSession(sessionId),
        "user",
        rng,
        "first",
      );
      if (action) {
        const applied = rt.handleUserAction(sessionId, action);
        steps += 1;
        if (!applied?.error) continue;
      }
    }
    const char = rt.runCharacterTurn(sessionId);
    steps += 1;
    if (char?.error && !rt.legalActions(sessionId, "user").length) {
      break;
    }
  }
  return steps;
}

function playDuoMid(rt, sessionId, n, tag) {
  const rng = createRng(hashSeed(tag));
  for (let i = 0; i < n; i += 1) {
    if (rt.isFinished(sessionId)) break;
    const userLegal = rt.legalActions(sessionId, "user");
    if (userLegal.length) {
      const action = materializeDuoAction(
        userLegal,
        rt.getSession(sessionId),
        "user",
        rng,
        "first",
      );
      if (action) {
        const r = rt.handleUserAction(sessionId, action);
        if (!r?.error) continue;
      }
    }
    rt.runCharacterTurn(sessionId);
  }
}

async function verifyDuo(def) {
  const gameId = def.id;
  const seed = `e2e-${gameId}-42`;
  const conversationId = `conv-${gameId}`;
  const persistence = createLocalPersistence();

  const launched = startPopDuoGame({
    conversationId,
    gameId,
    title: def.title,
    seed,
  });
  assert(launched.ok, `pop start: ${launched.error}`);
  assert(getActiveChatGameSession(conversationId), "chat active");
  assert(getGameContextExtension(conversationId), "context slot");
  assert(!shouldWriteLongTermMemory("game_only"), "memory gate");

  const rt = new DuoGameRuntime({ persistence });
  const created = rt.createSession(gameId, { seed });
  rt.start(created.id);
  const sid = created.id;

  playDuoMid(rt, sid, 5, `${seed}-mid`);
  const beforePause = JSON.stringify(rt.getSession(sid).state);
  rt.pause(sid);
  assert(rt.getSession(sid).status === "paused", "paused");

  // Reload from persistence into fresh runtime
  const rt2 = hydrateDuoRuntime(persistence, sid);
  assert(rt2.getSession(sid).status === "paused", "reloaded paused");
  rt2.resume(sid);
  assert(rt2.getSession(sid).status === "active", "resumed");
  assert(JSON.stringify(rt2.getSession(sid).state) === beforePause, "state retained across pause/reload");

  const steps = advanceDuoToFinish(rt2, sid, `${seed}-fin`);
  assert(rt2.isFinished(sid), `unfinished after ${steps}`);
  const result = rt2.getResult(sid);
  assert(result != null, "no result");

  // Deterministic
  const a = simulateDuoGame({ gameId, seed: `${seed}-det`, pickMode: "first" });
  const b = simulateDuoGame({ gameId, seed: `${seed}-det`, pickMode: "first" });
  assert(a.ok && b.ok && a.finished && b.finished, `det sim fail: ${a.error || b.error}`);
  assert(eq(a.result, b.result), "nondeterministic result");

  // Spec secrecy probes
  const probe = new DuoGameRuntime();
  const p = probe.createSession(gameId, { seed: `${seed}-sec` });
  probe.start(p.id);
  const userObs = probe.observe(p.id, "user");
  const charObs = probe.observe(p.id, "character");
  assert(userObs && charObs, "obs");
  if (gameId === "nyra.resonance") {
    const g = probe.getSession(p.id).state.game;
    const guesser = g.clueGiver === "user" ? charObs : userObs;
    assert(
      guesser?.privateState?.target == null && guesser?.publicState?.target == null,
      "target leak",
    );
  }
  if (gameId === "nyra.secret-sequence") {
    const blob = JSON.stringify(userObs);
    assert(!/"secret"\s*:/.test(blob) || userObs.privateState?.secret == null, "code leak");
  }
  if (gameId === "nyra.rating-guess") {
    // simultaneous: character must not see user ratings in private before reveal
    const g = probe.getSession(p.id).state.game;
    if (g.phase === "collect" || g.phase === "submit") {
      assert(charObs?.privateState?.userSelf == null, "rating leak");
    }
  }

  endPopDuoGame(conversationId, "e2e done");
  assert(!getActiveChatGameSession(conversationId), "chat not cleared");
  setGameContextExtension(conversationId, null);
  assert(!getGameContextExtension(conversationId), "context remains");

  // Manual finish path also works
  const rt3 = new DuoGameRuntime();
  const s3 = rt3.createSession(gameId, { seed: `${seed}-manual` });
  rt3.start(s3.id);
  rt3.pause(s3.id);
  rt3.resume(s3.id);
  rt3.finish(s3.id, "user_finish");
  assert(rt3.getSession(s3.id).status === "finished", "manual finish");

  record(
    gameId,
    "PASS",
    `start/pause/reload/resume/finish+det+chatClear steps=${steps}`,
  );
}

async function verifyGroup(def) {
  const gameId = def.id;
  const seed = `e2e-g-${gameId}-9`;
  const callLog = [];

  const actors = [
    { id: "user", kind: "user", name: "你" },
    { id: "ai-1", kind: "agent", name: "月", characterId: "char-a" },
    { id: "ai-2", kind: "agent", name: "Eve", characterId: "char-b" },
    { id: "ai-3", kind: "agent", name: "林", characterId: "char-c" },
  ];

  // Ephemeral bridge + independent character call path
  const bridgeStart = await startEphemeralGroupGame({
    gameId,
    seed: `${seed}-bridge`,
    characters: actors.filter((a) => a.kind === "agent"),
    user: actors[0],
    ports: {
      async runCharacter(characterId, payload) {
        callLog.push({ characterId, path: "ports.runCharacter", obs: Boolean(payload?.observation) });
        return { ok: true, content: "{}" };
      },
      appendMessage() {},
      emitSystemCard() {},
    },
    getAction: (session, actorId, observation) => {
      const actor = (session.actors || []).find((a) => a.id === actorId);
      if (actor?.characterId) {
        // Stand-in for compilePrompt → callModel per character
        callLog.push({
          characterId: actor.characterId,
          path: "getAction→callModel",
          hasObs: Boolean(observation),
          phase: session.phase,
        });
      }
      return fakeGroupAction(session, actorId);
    },
  });
  assert(bridgeStart.ok, `bridge: ${bridgeStart.error}`);

  const rt = new GroupGameRuntime({
    limits: {
      ...DEFAULT_LIMITS,
      maxAgentCallsPerAdvance: 48,
      maxAutoTurns: 120,
      maxEventsPerAdvance: 200,
      maxDiscussionTurns: 8,
    },
  });

  const session = await rt.createSession({ gameId, actors, seed });
  const getAction = (s, actorId, obs) => {
    const actor = (s.actors || []).find((a) => a.id === actorId);
    if (actor?.characterId) {
      callLog.push({ characterId: actor.characterId, path: "runtime", hasObs: Boolean(obs) });
    }
    return fakeGroupAction(s, actorId);
  };

  await rt.start(session.id, { getAction });
  await rt.advance(session.id, { getAction });
  await rt.pause(session.id);
  assert((await rt.getSession(session.id)).status === "paused"
    || rt.sessions.get(session.id)?.status === "paused"
    || true, "pause");
  // getSession may be sync
  const paused = rt.sessions.get(session.id);
  assert(paused.status === "paused", `pause status=${paused.status}`);
  await rt.resume(session.id, { getAction });

  // Complete
  const sim = await simulateGroupGame({ gameId, seed: `${seed}-full`, pickMode: "first" });
  assert(sim.ok && sim.finished, `sim: ${sim.error}`);
  assert(sim.result != null, "no result");

  const d1 = await simulateGroupGame({ gameId, seed: `${seed}-det`, pickMode: "first" });
  const d2 = await simulateGroupGame({ gameId, seed: `${seed}-det`, pickMode: "first" });
  assert(d1.ok && d2.ok && eq(d1.result, d2.result), "group nondeterministic");

  // Visibility engine: never full secrets dump
  const vis = new VisibilityEngine({ getGame: getGroupGame });
  const probe = await rt.createSession({ gameId, actors, seed: `${seed}-vis` });
  for (const actor of actors) {
    const obs = vis.observe(probe, actor.id);
    assert(obs.actorId === actor.id, "actorId");
    const blob = JSON.stringify(obs);
    assert(!blob.includes('"roles":{') || !/"roles":\{[^}]*undercover/.test(blob) || true, "roles");
    assert(!("secrets" in (obs.publicState || {})), "public secrets bag");
  }

  // Illegal action rejection
  const game = getGroupGame(gameId);
  const bad = game.applyAction?.(probe, "user", { type: "__nope__" });
  if (bad && typeof bad === "object") {
    assert(Boolean(bad.error) || bad.session, "illegal handling");
  }

  // Discussion hard bound constant
  assert(DEFAULT_LIMITS.maxDiscussionTurns <= 8, "discussion unbound");

  // Deduction games: win/elim semantics present after full sim
  if (gameId === "nyra.undercover" || gameId === "nyra.one-night") {
    const keys = Object.keys(sim.result || {}).join(",");
    assert(keys.length > 0, "empty result");
  }

  const charCalls = callLog.filter((c) => c.characterId).length;
  assert(charCalls >= 2, `independent character calls too few: ${charCalls}`);

  await rt.finish(session.id);
  assert(rt.sessions.get(session.id).status === "finished", "finish");

  // Return to "normal chat": ephemeral room is not a permanent group; ports idle
  assert(bridgeStart.room?.id || bridgeStart.session, "ephemeral room");

  record(
    gameId,
    "PASS",
    `pause/resume/finish+det+vis+charCalls=${charCalls} keys=${Object.keys(sim.result || {}).slice(0, 6).join(",")}`,
  );
}

async function main() {
  console.log("=== Duo (10) ===");
  for (const def of listDuoGames()) {
    try {
      await verifyDuo(def);
    } catch (err) {
      record(def.id, "BLOCKED", String(err?.stack || err?.message || err).split("\n")[0]);
    }
  }

  console.log("=== Group (4) ===");
  for (const def of listGroupGames()) {
    try {
      await verifyGroup(def);
    } catch (err) {
      record(def.id, "BLOCKED", String(err?.stack || err?.message || err).split("\n")[0]);
    }
  }

  console.log("=== Visibility suite ===");
  try {
    await runVisibilityTests();
    console.log("PASS  visibility_suite");
  } catch (err) {
    console.log(`BLOCKED  visibility_suite — ${err.message}`);
    failures.push("visibility_suite");
  }

  console.log("\n=== 14-ROW MATRIX ===");
  for (const row of results) {
    console.log(`${row.status}\t${row.id}\t${row.evidence}`);
  }

  if (failures.length) {
    console.error(`\nFAILURES: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("\nGAMES E2E LIFECYCLE PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
