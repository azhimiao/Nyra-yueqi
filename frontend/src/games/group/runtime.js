/**
 * GroupGameRuntime — session lifecycle + advance loop entry.
 */

import { advance, DEFAULT_LIMITS } from "./orchestrator.js";
import { getGame, listGames, requireGame } from "./games/index.js";
import { cloneSession, makeId } from "./helpers.js";
import { applyAction as refereeApply } from "./referee.js";
import { createRng } from "./rng.js";
import { createSchedulerState } from "./scheduler.js";
import { VisibilityEngine } from "./visibility.js";
import { appendEvents, publicEvent } from "./helpers.js";

/**
 * @typedef {{
 *   persist?: { save?: (s: any) => void|Promise<void>, load?: (id: string) => any|Promise<any> },
 *   limits?: Partial<typeof DEFAULT_LIMITS>,
 * }} RuntimeOptions
 */

export class GroupGameRuntime {
  /**
   * @param {RuntimeOptions} [options]
   */
  constructor(options = {}) {
    this.sessions = new Map();
    this.persist = options.persist || null;
    this.limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
    this.visibility = new VisibilityEngine({ getGame });
  }

  listDefinitions() {
    return listGames();
  }

  /**
   * @param {object} input
   * @param {string} input.gameId
   * @param {Array<{ id: string, kind: "user"|"agent", name?: string, characterId?: string }>} input.actors
   * @param {string|number} [input.seed]
   * @param {string} [input.conversationId]
   * @param {string} [input.roomId]
   * @param {Record<string, any>} [input.gameOptions]
   */
  async createSession(input = {}) {
    const game = requireGame(input.gameId);
    const seed = input.seed ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const rng = createRng(seed);
    const actors = (input.actors || []).map((a, i) => ({
      id: a.id || `actor-${i}`,
      kind: a.kind === "user" || a.kind === "human" ? "user" : "agent",
      name: a.name || a.id || `actor-${i}`,
      characterId: a.characterId,
    }));
    if (actors.length < (game.definition.players?.min || 2)) {
      throw new Error(
        `Need at least ${game.definition.players?.min || 2} actors for ${game.definition.id}`
      );
    }
    const gameState = game.createInitialState({
      seed,
      rng,
      actors,
      ...(input.gameOptions || {}),
    });
    const now = Date.now();
    const session = {
      id: input.id || makeId("gs"),
      gameId: game.definition.id,
      gameVersion: game.definition.version,
      runtime: "group",
      conversationId: input.conversationId || null,
      roomId: input.roomId || null,
      status: "starting",
      phase: gameState.phase || "setup",
      round: gameState.round || 0,
      actors,
      state: {
        game: gameState,
        scheduler: createSchedulerState(
          game.nextPolicy?.({ state: { game: gameState }, actors }) || "ordered_turn",
          { actors }
        ),
      },
      events: [],
      rngSeed: String(seed),
      createdAt: now,
      updatedAt: now,
      memoryPolicy: "game_only",
    };

    const boot = appendEvents(session, [
      publicEvent("card", {
        kind: "game_start",
        title: game.definition.title,
        gameId: game.definition.id,
      }),
      publicEvent("game_start", { gameId: game.definition.id, actors: actors.map((a) => a.id) }),
    ]);
    this.sessions.set(boot.id, boot);
    await this.#save(boot);
    return cloneSession(boot);
  }

  /**
   * @param {string} sessionId
   * @param {import("./orchestrator.js").AdvanceHooks} [hooks]
   */
  async start(sessionId, hooks = {}) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    session.status = "playing";
    const out = await advance(session, this.#hooks(hooks));
    await this.#commit(out.session);
    return out;
  }

  /**
   * @param {string} sessionId
   * @param {import("./orchestrator.js").AdvanceHooks} [hooks]
   */
  async advance(sessionId, hooks = {}) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    const out = await advance(session, this.#hooks(hooks));
    await this.#commit(out.session);
    return out;
  }

  /**
   * User message / free text — games that accept speak/guess may map it.
   * Prefer handleUserAction for structured moves.
   */
  async handleUserMessage(sessionId, message, hooks = {}) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    const game = requireGame(session.gameId);
    const user = session.actors.find((a) => a.kind === "user") || session.actors[0];
    const text = typeof message === "string" ? message : message?.text || "";
    const legal = game.legalActions?.(session, user.id) || [];
    const types = legal.map((l) => (typeof l === "string" ? l : l.type));
    let action = null;
    if (types.includes("guess")) action = { type: "guess", guess: text };
    else if (types.includes("answer")) action = { type: "answer", answer: text };
    else if (types.includes("clue")) action = { type: "clue", clue: text };
    else if (types.includes("describe")) action = { type: "describe", text };
    else if (types.includes("speak")) action = { type: "speak", text };
    else action = { type: "speak", text };
    return this.handleUserAction(sessionId, action, { ...hooks, actorId: user.id });
  }

  /**
   * @param {string} sessionId
   * @param {any} action
   * @param {import("./orchestrator.js").AdvanceHooks & { actorId?: string }} [hooks]
   */
  async handleUserAction(sessionId, action, hooks = {}) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    const game = requireGame(session.gameId);
    const actorId =
      hooks.actorId ||
      session.actors.find((a) => a.kind === "user")?.id ||
      "user";
    const applied = refereeApply(game, session, actorId, action);
    if (applied.error) {
      return { session: cloneSession(session), error: applied.error, outputs: [] };
    }
    let next = applied.session;
    if (applied.events?.length) {
      const { appendEvents: append } = await import("./helpers.js");
      next = append(next, applied.events);
    }
    // mark scheduler submitted for this user
    if (next.state?.scheduler) {
      const submitted = new Set(next.state.scheduler.submitted || []);
      submitted.add(actorId);
      next.state.scheduler = {
        ...next.state.scheduler,
        submitted: [...submitted],
        pending: (next.state.scheduler.pending || []).filter((id) => id !== actorId),
        voteSubmitted: [...new Set([...(next.state.scheduler.voteSubmitted || []), actorId])],
        votePending: (next.state.scheduler.votePending || []).filter((id) => id !== actorId),
        discussion: {
          ...(next.state.scheduler.discussion || {}),
          sinceHuman: 0,
        },
      };
    }
    if (next.status === "waiting_user") next.status = "playing";
    const out = await advance(next, this.#hooks(hooks));
    await this.#commit(out.session);
    return out;
  }

  /**
   * Headless / fake agent: provide actions via getAction without LLM.
   * @param {string} sessionId
   * @param {(session: any, actorId: string, obs: any) => any} getAction
   * @param {object} [hooks]
   */
  async runWithFakeAgents(sessionId, getAction, hooks = {}) {
    return this.advance(sessionId, { ...hooks, getAction });
  }

  async pause(sessionId) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    session.status = "paused";
    session.updatedAt = Date.now();
    await this.#commit(session);
    return cloneSession(session);
  }

  async resume(sessionId, hooks = {}) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    if (session.status === "paused") session.status = "playing";
    const out = await advance(session, this.#hooks(hooks));
    await this.#commit(out.session);
    return out;
  }

  async finish(sessionId) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    const game = requireGame(session.gameId);
    session.status = "finished";
    session.endedAt = Date.now();
    session.updatedAt = Date.now();
    await this.#commit(session);
    return game.result?.(session) || null;
  }

  async abort(sessionId) {
    const session = await this.#get(sessionId);
    if (!session) throw new Error("session_not_found");
    session.status = "aborted";
    session.endedAt = Date.now();
    session.updatedAt = Date.now();
    await this.#commit(session);
    return cloneSession(session);
  }

  async restart(sessionId, hooks = {}) {
    const prev = await this.#get(sessionId);
    if (!prev) throw new Error("session_not_found");
    const fresh = await this.createSession({
      gameId: prev.gameId,
      actors: prev.actors,
      seed: `${prev.rngSeed}-r${Date.now()}`,
      conversationId: prev.conversationId,
      roomId: prev.roomId,
    });
    // replace id mapping optional — keep new id
    this.sessions.delete(prev.id);
    return this.start(fresh.id, hooks);
  }

  observe(sessionId, actorId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return this.visibility.observe(session, actorId);
  }

  getSession(sessionId) {
    const s = this.sessions.get(sessionId);
    return s ? cloneSession(s) : null;
  }

  #hooks(hooks = {}) {
    return {
      ...hooks,
      limits: { ...this.limits, ...(hooks.limits || {}) },
      visibility: hooks.visibility || this.visibility,
    };
  }

  async #get(sessionId) {
    let s = this.sessions.get(sessionId);
    if (!s && this.persist?.load) {
      s = await this.persist.load(sessionId);
      if (s) this.sessions.set(sessionId, s);
    }
    return s ? cloneSession(s) : null;
  }

  async #commit(session) {
    const clean = cloneSession(session);
    delete clean.__gameModule;
    this.sessions.set(clean.id, clean);
    await this.#save(clean);
  }

  async #save(session) {
    if (this.persist?.save) await this.persist.save(session);
  }
}

export default GroupGameRuntime;
