/**
 * DuoGameBridge — thin façade over DuoGameRuntime.
 */

import { DuoGameRuntime } from "./runtime.js";
import { listDuoGames, getDuoGame } from "./games/index.js";

export class DuoGameBridge {
  /** @param {import("./runtime.js").DuoRuntimeOptions & { runtime?: DuoGameRuntime }} [options] */
  constructor(options = {}) {
    this.runtime = options.runtime || new DuoGameRuntime(options);
  }

  catalog() {
    return listDuoGames();
  }

  getDefinition(gameId) {
    return getDuoGame(gameId)?.definition || null;
  }

  /**
   * Create + start in one call.
   * @param {string} gameId
   * @param {{ seed?: string|number, meta?: object, adapters?: object }} [opts]
   */
  begin(gameId, opts = {}) {
    const session = this.runtime.createSession(gameId, opts);
    return this.runtime.start(session.id);
  }

  create(gameId, opts = {}) {
    return this.runtime.createSession(gameId, opts);
  }

  start(sessionId) {
    return this.runtime.start(sessionId);
  }

  pause(sessionId) {
    return this.runtime.pause(sessionId);
  }

  resume(sessionId) {
    return this.runtime.resume(sessionId);
  }

  finish(sessionId, reason) {
    return this.runtime.finish(sessionId, reason);
  }

  abort(sessionId, reason) {
    return this.runtime.abort(sessionId, reason);
  }

  restart(sessionId, opts) {
    return this.runtime.restart(sessionId, opts);
  }

  /**
   * @param {string} sessionId
   * @param {any} action
   */
  userAction(sessionId, action) {
    return this.runtime.handleUserAction(sessionId, action);
  }

  /**
   * @param {string} sessionId
   * @param {string} message
   */
  userMessage(sessionId, message) {
    return this.runtime.handleUserMessage(sessionId, message);
  }

  /**
   * @param {string} sessionId
   * @param {any} [action]
   */
  characterTurn(sessionId, action) {
    return this.runtime.runCharacterTurn(sessionId, action);
  }

  observe(sessionId, actor = "user") {
    return this.runtime.observe(sessionId, actor);
  }

  legal(sessionId, actor = "user") {
    return this.runtime.legalActions(sessionId, actor);
  }

  session(sessionId) {
    return this.runtime.getSession(sessionId);
  }

  result(sessionId) {
    return this.runtime.getResult(sessionId);
  }

  finished(sessionId) {
    return this.runtime.isFinished(sessionId);
  }
}

export default DuoGameBridge;
