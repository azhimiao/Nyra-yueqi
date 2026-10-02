/**
 * VisibilityEngine — actor-scoped observation. NEVER returns full game state.
 */

import { recentVisibleEvents } from "./events.js";
import { gameState, getActor, listActors } from "./helpers.js";

/**
 * Strip known secret bags from a public snapshot.
 * @param {any} state
 */
function redactSecrets(state) {
  if (!state || typeof state !== "object") return state;
  const {
    secrets,
    privateByActor,
    roles,
    undercoverWord,
    normalWord,
    targetWord,
    centerCards,
    nightActions,
    privateNotes,
    ...rest
  } = state;
  return { ...rest };
}

export class VisibilityEngine {
  /**
   * @param {{ getGame?: (id: string) => any }} [registry]
   */
  constructor(registry = null) {
    this.registry = registry;
  }

  /**
   * @param {any} session
   * @param {string} actorId
   * @returns {any}
   */
  observe(session, actorId) {
    const gameMod = this.#resolveGame(session);
    if (gameMod && typeof gameMod.observation === "function") {
      const obs = gameMod.observation(session, actorId) || {};
      return this.#finalize(session, actorId, obs);
    }
    // Fallback minimal public view — still never full state
    const g = gameState(session) || {};
    const publicState = redactSecrets(g);
    return this.#finalize(session, actorId, {
      actorId,
      gameId: session.gameId,
      phase: session.phase || g.phase,
      round: session.round || g.round || 0,
      publicState,
      privateState: undefined,
      allowedActions: gameMod?.legalActions?.(session, actorId) || [],
      recentVisibleEvents: recentVisibleEvents(session, actorId),
    });
  }

  /**
   * @param {any} session
   * @param {string} actorId
   * @param {any} obs
   */
  #finalize(session, actorId, obs) {
    const actor = getActor(session, actorId);
    const allowed =
      obs.allowedActions ||
      this.#resolveGame(session)?.legalActions?.(session, actorId) ||
      [];
    return {
      actorId,
      gameId: session.gameId,
      phase: obs.phase ?? session.phase,
      round: obs.round ?? session.round ?? 0,
      publicState: obs.publicState ?? {},
      privateState: obs.privateState,
      teamState: obs.teamState,
      currentObjective: obs.currentObjective,
      allowedActions: allowed,
      recentVisibleEvents: obs.recentVisibleEvents || recentVisibleEvents(session, actorId),
      you: actor
        ? { id: actor.id, kind: actor.kind, name: actor.name, characterId: actor.characterId }
        : { id: actorId },
      participants: listActors(session).map((a) => ({
        id: a.id,
        kind: a.kind,
        name: a.name,
      })),
      // Hard guard: never attach raw session.state
    };
  }

  #resolveGame(session) {
    if (session?.__gameModule) return session.__gameModule;
    if (this.registry && typeof this.registry.getGame === "function") {
      return this.registry.getGame(session.gameId);
    }
    if (this.registry && typeof this.registry.get === "function") {
      return this.registry.get(session.gameId);
    }
    return null;
  }
}

export default VisibilityEngine;
