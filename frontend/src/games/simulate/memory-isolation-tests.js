/**
 * Memory isolation — game_only policy + VisibilityEngine privateState scoping.
 */

import {
  resolveGameMemoryPolicy,
  shouldWriteLongTermMemory,
} from "../adapters/memory-policy.js";
import { VisibilityEngine } from "../group/visibility.js";
import { getGame } from "../group/games/index.js";
import { GroupGameRuntime } from "../group/runtime.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Assert game_only policy helper behavior.
 */
export function testGameOnlyPolicyHelper() {
  assert(resolveGameMemoryPolicy({ activeGame: true }) === "game_only", "activeGame → game_only");
  assert(
    resolveGameMemoryPolicy({ memoryPolicy: "game_only" }) === "game_only",
    "explicit game_only"
  );
  assert(resolveGameMemoryPolicy({ memoryPolicy: "exclude" }) === "exclude", "explicit exclude");
  assert(resolveGameMemoryPolicy({}) === "normal", "default normal");
  assert(resolveGameMemoryPolicy({ activeGame: false }) === "normal", "inactive → normal");
  assert(!shouldWriteLongTermMemory("game_only"), "game_only blocks LTM");
  assert(!shouldWriteLongTermMemory("exclude"), "exclude blocks LTM");
  assert(shouldWriteLongTermMemory("normal"), "normal allows LTM");
  return { ok: true, name: "game_only_policy_helper" };
}

/**
 * Observations via VisibilityEngine must not include other actors' privateState bags.
 */
export async function testObservationPrivateStateIsolation({ seed = "mem-iso" } = {}) {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.undercover",
    actors: [
      { id: "user", kind: "user", name: "你" },
      { id: "ai-1", kind: "agent", name: "A", characterId: "c1" },
      { id: "ai-2", kind: "agent", name: "B", characterId: "c2" },
      { id: "ai-3", kind: "agent", name: "C", characterId: "c3" },
    ],
    seed,
  });
  assert(session.memoryPolicy === "game_only", "session defaults memoryPolicy game_only");

  const vis = new VisibilityEngine({ getGame });
  const ids = session.actors.map((a) => a.id);
  const observations = ids.map((id) => ({ id, obs: vis.observe(session, id) }));

  for (const { id, obs } of observations) {
    assert(obs.actorId === id, `obs scoped to ${id}`);
    assert(!("state" in obs) || obs.state == null, `${id}: no raw state`);
    // Must not embed other actors' privateState maps
    assert(obs.privateStateByActor == null, `${id}: no privateStateByActor`);
    assert(obs.othersPrivate == null, `${id}: no othersPrivate`);
    const blob = JSON.stringify(obs);
    for (const other of ids) {
      if (other === id) continue;
      const otherWord = session.state.game.words?.[other];
      if (otherWord && otherWord !== session.state.game.words?.[id]) {
        // Other player's distinct private word must not appear in this observation JSON
        // (except when public result phase — still starting phase here)
        assert(
          !blob.includes(`"yourWord":"${otherWord}"`) ||
            session.state.game.words[id] === otherWord,
          `${id} must not contain ${other}'s yourWord`
        );
      }
    }
  }

  // Cross-check: each private yourWord matches only that actor
  for (const { id, obs } of observations) {
    if (obs.privateState?.yourWord) {
      assert(
        obs.privateState.yourWord === session.state.game.words[id],
        `${id} private word matches seat`
      );
    }
  }

  return { ok: true, name: "observation_private_state_isolation" };
}

/**
 * @returns {Promise<{ ok: boolean, results: Array<{ ok: boolean, name: string, error?: string }> }>}
 */
export async function runMemoryIsolationTests() {
  const results = [];
  try {
    results.push(testGameOnlyPolicyHelper());
  } catch (err) {
    results.push({
      ok: false,
      name: "game_only_policy_helper",
      error: err?.message || String(err),
    });
  }
  try {
    results.push(await testObservationPrivateStateIsolation());
  } catch (err) {
    results.push({
      ok: false,
      name: "observation_private_state_isolation",
      error: err?.message || String(err),
    });
  }
  return { ok: results.every((r) => r.ok), results };
}

export default runMemoryIsolationTests;
