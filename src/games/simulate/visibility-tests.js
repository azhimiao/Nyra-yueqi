/**
 * Visibility isolation assertions — undercover, one-night, just-one parallel clues.
 */

import { GroupGameRuntime } from "../group/runtime.js";
import { VisibilityEngine } from "../group/visibility.js";
import { getGame } from "../group/games/index.js";

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Undercover: each actor sees only their word; public must not leak the other word.
 */
export async function testUndercoverVisibility({ seed = "vis-undercover" } = {}) {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.undercover",
    actors: actors(3),
    seed,
  });
  const vis = new VisibilityEngine({ getGame });
  const g = session.state.game;
  const civ = Object.entries(g.roles).find(([, r]) => r === "civilian")[0];
  const unc = Object.entries(g.roles).find(([, r]) => r === "undercover")[0];
  const civObs = vis.observe(session, civ);
  const uncObs = vis.observe(session, unc);

  assert(civObs.privateState?.yourWord === g.normalWord, "civilian sees civilian word");
  assert(uncObs.privateState?.yourWord === g.undercoverWord, "undercover sees undercover word");
  assert(civObs.publicState?.undercoverWord == null, "public must not expose undercoverWord");
  assert(civObs.publicState?.normalWord == null, "public must not expose normalWord mid-game");
  assert(uncObs.privateState?.yourWord !== civObs.privateState?.yourWord, "words differ");
  // Actor A must not receive B's private bag wholesale
  assert(!("state" in civObs) || civObs.state == null, "no full state on observation");
  return { ok: true, name: "undercover_visibility" };
}

/**
 * One-night: private nightView must not leak to other players.
 */
export async function testOneNightVisibility({ seed = "vis-onenight" } = {}) {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.one-night",
    actors: actors(3),
    seed,
  });
  const playerIds = Object.keys(session.state.game.players);
  assert(playerIds.length >= 2, "need ≥2 players");
  // Prefer a seer seat when dealt; otherwise any player holding a private night view.
  const seer =
    Object.entries(session.state.game.players).find(([, p]) => p.initialRole === "seer")?.[0] ||
    playerIds[0];
  const other = playerIds.find((id) => id !== seer);
  session.state.game.nightViews = {
    [seer]: { kind: "player", target: other, role: "werewolf" },
  };
  const vis = new VisibilityEngine({ getGame });
  const otherObs = vis.observe(session, other);
  const seerObs = vis.observe(session, seer);
  assert(otherObs.privateState?.nightView == null, "nightView must not leak to others");
  assert(seerObs.privateState?.nightView, "owner sees own nightView");
  assert(
    !JSON.stringify(otherObs).includes('"role":"werewolf"') ||
      otherObs.privateState?.knownRole === "werewolf",
    "other must not see owner's nightView role payload"
  );
  return { ok: true, name: "one_night_visibility" };
}

/**
 * Just One: during clue phase, guesser must not see targetWord; givers may.
 * Parallel clue submissions stay private until reveal.
 */
export async function testJustOneParallelClueVisibility({ seed = "vis-justone" } = {}) {
  const rt = new GroupGameRuntime();
  const session = await rt.createSession({
    gameId: "nyra.just-one",
    actors: actors(2),
    seed,
  });
  const g = session.state.game;
  const guesserId = g.guesserId;
  const giverId = (g.clueGivers || []).find((id) => id !== guesserId) || g.clueGivers?.[0];
  assert(giverId && guesserId, "giver and guesser exist");

  // Simulate one private clue without advancing full reveal
  g.clues = { ...(g.clues || {}), [giverId]: "私密线索甲" };

  const vis = new VisibilityEngine({ getGame });
  const giverObs = vis.observe(session, giverId);
  const guessObs = vis.observe(session, guesserId);

  assert(giverObs.privateState?.targetWord === g.targetWord, "giver sees target during clue");
  assert(guessObs.privateState?.targetWord == null, "guesser must not see target during clue");
  assert(guessObs.publicState?.targetWord == null, "guesser public must not leak target");
  // Other actors' clue text not in guesser private
  assert(
    guessObs.privateState?.yourClue == null,
    "guesser has no yourClue during clue phase"
  );
  // Giver sees own clue, not others' raw bags as full state
  assert(
    giverObs.privateState?.yourClue === "私密线索甲" || giverObs.privateState?.yourClue == null,
    "giver private scoped"
  );
  assert(!("state" in guessObs) || guessObs.state == null, "no full state");
  return { ok: true, name: "just_one_parallel_clue_visibility" };
}

/**
 * Run all visibility suites.
 * @returns {{ ok: boolean, results: Array<{ ok: boolean, name: string, error?: string }> }}
 */
export async function runVisibilityTests() {
  const suites = [
    testUndercoverVisibility,
    testOneNightVisibility,
    testJustOneParallelClueVisibility,
  ];
  const results = [];
  for (const fn of suites) {
    try {
      results.push(await fn());
    } catch (err) {
      results.push({ ok: false, name: fn.name, error: err?.message || String(err) });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

export default runVisibilityTests;
