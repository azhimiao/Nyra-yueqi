/**
 * DuoGameRuntime — in-memory sessions + optional persistence hook.
 */

import { createRng, hashSeed } from "./rng.js";
import { cloneSession } from "./helpers.js";
import { getDuoGame, listDuoGames } from "./games/index.js";
import { parseDuoAction } from "./action-parse.js";

/**
 * @typedef {{
 *   load?: (id: string) => any|Promise<any>,
 *   save?: (session: any) => void|Promise<void>,
 *   remove?: (id: string) => void|Promise<void>,
 * }} DuoPersistence
 */

/**
 * @typedef {{
 *   persistence?: DuoPersistence,
 *   adapters?: { safeFacts?: { getSafeSharedFacts: Function } },
 *   now?: () => number,
 *   idFactory?: () => string,
 * }} DuoRuntimeOptions
 */

function defaultId() {
  return `duo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class DuoGameRuntime {
  /** @param {DuoRuntimeOptions} [options] */
  constructor(options = {}) {
    /** @type {Map<string, any>} */
    this.sessions = new Map();
    this.persistence = options.persistence || null;
    this.adapters = options.adapters || {};
    this.now = options.now || (() => Date.now());
    this.idFactory = options.idFactory || defaultId;
  }

  listGames() {
    return listDuoGames();
  }

  /**
   * @param {string} gameId
   * @param {{ seed?: string|number, meta?: Record<string, any>, adapters?: object }} [opts]
   */
  createSession(gameId, opts = {}) {
    const engine = getDuoGame(gameId);
    if (!engine) throw new Error(`unknown_duo_game:${gameId}`);

    const seed = opts.seed ?? hashSeed(`${gameId}:${this.now()}`);
    const rng = createRng(seed);
    const adapters = { ...this.adapters, ...(opts.adapters || {}) };

    const game =
      engine.definition.id === "nyra.we-remember"
        ? engine.createInitialState({ seed, rng, adapters })
        : engine.createInitialState({ seed, rng });

    const session = {
      id: this.idFactory(),
      gameId,
      kind: "nyra.duo-game.v1",
      version: engine.definition.version,
      seed,
      status: "created",
      state: { game },
      events: [],
      meta: opts.meta || {},
      createdAt: this.now(),
      updatedAt: this.now(),
    };

    this._attachRng(session, rng);
    this.sessions.set(session.id, session);
    this._persist(session);
    return this._publicSession(session);
  }

  /**
   * @param {string} sessionId
   */
  start(sessionId) {
    const session = this._require(sessionId);
    if (session.status === "active") return this._publicSession(session);
    if (session.status === "finished" || session.status === "aborted") {
      throw new Error("cannot_start_terminal_session");
    }
    session.status = "active";
    session.updatedAt = this.now();
    session.events = session.events.concat([{ type: "started", at: session.updatedAt }]);
    this._persist(session);
    return this._publicSession(session);
  }

  pause(sessionId) {
    const session = this._require(sessionId);
    if (session.status !== "active") throw new Error("not_active");
    session.status = "paused";
    session.updatedAt = this.now();
    session.events = session.events.concat([{ type: "paused", at: session.updatedAt }]);
    this._persist(session);
    return this._publicSession(session);
  }

  resume(sessionId) {
    const session = this._require(sessionId);
    if (session.status !== "paused") throw new Error("not_paused");
    session.status = "active";
    session.updatedAt = this.now();
    session.events = session.events.concat([{ type: "resumed", at: session.updatedAt }]);
    this._persist(session);
    return this._publicSession(session);
  }

  finish(sessionId, reason = "manual") {
    const session = this._require(sessionId);
    session.status = "finished";
    session.updatedAt = this.now();
    session.events = session.events.concat([{ type: "finished", reason, at: session.updatedAt }]);
    this._persist(session);
    return this._publicSession(session);
  }

  abort(sessionId, reason = "abort") {
    const session = this._require(sessionId);
    session.status = "aborted";
    session.updatedAt = this.now();
    session.events = session.events.concat([{ type: "aborted", reason, at: session.updatedAt }]);
    this._persist(session);
    return this._publicSession(session);
  }

  /**
   * Restart same gameId with new seed; keeps meta.
   * @param {string} sessionId
   * @param {{ seed?: string|number }} [opts]
   */
  restart(sessionId, opts = {}) {
    const prev = this._require(sessionId);
    const created = this.createSession(prev.gameId, {
      seed: opts.seed,
      meta: { ...prev.meta, restartedFrom: prev.id },
      adapters: this.adapters,
    });
    this.start(created.id);
    return this.getSession(created.id);
  }

  /**
   * @param {string} sessionId
   * @param {any} action
   */
  handleUserAction(sessionId, action) {
    const session = this._require(sessionId);
    this._ensureRng(session);
    if (session.status === "paused") {
      return { session: this._publicSession(session), events: [], output: null, error: "paused" };
    }
    if (session.status !== "active") {
      return { session: this._publicSession(session), events: [], output: null, error: "not_active" };
    }
    const engine = getDuoGame(session.gameId);
    const result = engine.applyUserAction(session, action);
    return this._commitEngineResult(session.id, result, engine);
  }

  /**
   * Parse freeform / LLM message into action then apply.
   * @param {string} sessionId
   * @param {string} message
   */
  handleUserMessage(sessionId, message) {
    const session = this._require(sessionId);
    this._ensureRng(session);
    const engine = getDuoGame(session.gameId);
    const legal = engine.legalActions(session, "user");
    const parsed = parseDuoAction({
      input: message,
      legalActions: legal,
      fallback: () => null,
    });
    if (!parsed.action) {
      return {
        session: this._publicSession(session),
        events: [],
        output: null,
        error: parsed.error || "unparseable",
        parse: parsed,
      };
    }
    const applied = this.handleUserAction(sessionId, parsed.action);
    return { ...applied, parse: parsed };
  }

  /**
   * @param {string} sessionId
   * @param {any} [action] — if omitted, uses fallbackCharacterAction
   */
  runCharacterTurn(sessionId, action) {
    const session = this._require(sessionId);
    this._ensureRng(session);
    if (session.status !== "active") {
      return { session: this._publicSession(session), events: [], output: null, error: "not_active" };
    }
    const engine = getDuoGame(session.gameId);
    let act = action;
    if (act == null) {
      act = engine.fallbackCharacterAction(session);
    } else if (typeof act === "string") {
      const legal = engine.legalActions(session, "character");
      const parsed = parseDuoAction({
        input: act,
        legalActions: legal,
        fallback: () => engine.fallbackCharacterAction(session),
      });
      act = parsed.action;
    }
    if (!act) {
      return {
        session: this._publicSession(session),
        events: [],
        output: null,
        error: "no_character_action",
      };
    }
    const result = engine.applyCharacterAction(session, act);
    return this._commitEngineResult(session.id, result, engine);
  }

  /**
   * @param {string} sessionId
   * @param {"user"|"character"} actor
   */
  observe(sessionId, actor = "user") {
    const session = this._require(sessionId);
    const engine = getDuoGame(session.gameId);
    return engine.observation(session, actor);
  }

  /**
   * @param {string} sessionId
   * @param {"user"|"character"} actor
   */
  legalActions(sessionId, actor = "user") {
    const session = this._require(sessionId);
    const engine = getDuoGame(session.gameId);
    return engine.legalActions(session, actor);
  }

  getSession(sessionId) {
    const session = this._require(sessionId);
    return this._publicSession(session);
  }

  getResult(sessionId) {
    const session = this._require(sessionId);
    const engine = getDuoGame(session.gameId);
    return engine.result(session);
  }

  isFinished(sessionId) {
    const session = this._require(sessionId);
    const engine = getDuoGame(session.gameId);
    return engine.isFinished(session) || session.status === "finished";
  }

  /** @param {string} sessionId */
  _require(sessionId) {
    let session = this.sessions.get(sessionId);
    if (!session && this.persistence?.load) {
      try {
        const loaded = this.persistence.load(sessionId);
        if (loaded && typeof loaded.then !== "function") {
          session = loaded;
          this.sessions.set(sessionId, session);
        }
      } catch {
        session = null;
      }
    }
    if (!session) throw new Error(`session_not_found:${sessionId}`);
    this._ensureRng(session);
    return session;
  }

  _attachRng(session, rng) {
    Object.defineProperty(session, "_rng", {
      value: rng,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  _ensureRng(session) {
    if (!session._rng) {
      this._attachRng(session, createRng(session.seed));
    }
  }

  _publicSession(session) {
    const copy = cloneSession(session);
    delete copy._rng;
    return copy;
  }

  _commitEngineResult(sessionId, result, engine) {
    const { session: next, events = [], output = null, error = null } = result;
    if (!next) {
      return { session: this.getSession(sessionId), events, output, error };
    }
    // Preserve non-enumerable rng + identity
    const prev = this.sessions.get(sessionId);
    next.id = sessionId;
    next.gameId = prev.gameId;
    next.seed = prev.seed;
    next.kind = prev.kind;
    next.version = prev.version;
    next.meta = prev.meta;
    next.createdAt = prev.createdAt;
    next.events = (prev.events || []).concat(events || []);
    next.updatedAt = this.now();
    if (next.status == null) next.status = prev.status;

    this._ensureRng(next);
    if (engine.isFinished(next) && next.status === "active") {
      next.status = "finished";
      next.events = next.events.concat([{ type: "engine_finished", at: next.updatedAt }]);
    }

    this.sessions.set(sessionId, next);
    this._persist(next);
    return {
      session: this._publicSession(next),
      events,
      output,
      error: error || null,
      result: engine.isFinished(next) ? engine.result(next) : null,
    };
  }

  _persist(session) {
    if (this.persistence?.save) {
      try {
        const pub = this._publicSession(session);
        const ret = this.persistence.save(pub);
        if (ret && typeof ret.then === "function") {
          ret.catch?.(() => {});
        }
      } catch {
        // persistence must not break runtime
      }
    }
  }
}

export default DuoGameRuntime;
