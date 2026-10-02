/**
 * GroupGameBridge — thin adapter between Group Conversation / Room and GroupGameRuntime.
 *
 * Group Chat itself does not own the scheduler; the bridge routes into the runtime.
 */

import { GroupGameRuntime } from "./runtime.js";
import { createEphemeralGameRoom } from "./room.js";
import { t } from "../../i18n/index.js";

/**
 * @typedef {{
 *   getParticipants?: () => Array<{ id: string, kind?: string, name?: string, characterId?: string }>,
 *   appendMessage?: (msg: any) => void|Promise<void>,
 *   runCharacter?: (characterId: string, payload: any) => Promise<any>,
 *   emitSystemCard?: (card: any) => void|Promise<void>,
 * }} GroupChatPorts
 */

export class GroupGameBridge {
  /**
   * @param {object} [options]
   * @param {GroupGameRuntime} [options.runtime]
   * @param {GroupChatPorts} [options.ports]
   * @param {Map<string, string>} [options.conversationToSession] conversationId → sessionId
   */
  constructor(options = {}) {
    this.runtime = options.runtime || new GroupGameRuntime(options.runtimeOptions || {});
    this.ports = options.ports || {};
    this.conversationToSession = options.conversationToSession || new Map();
    this.rooms = new Map();
  }

  /**
   * Start a group game from an existing conversation's participants.
   */
  async startGame({
    gameId,
    conversationId,
    actors,
    seed,
    getAction,
  } = {}) {
    const participants =
      actors ||
      this.ports.getParticipants?.() ||
      [];
    const normalized = participants.map((p, i) => ({
      id: p.id || p.characterId || `p-${i}`,
      kind: p.kind === "user" || p.id === "user" ? "user" : "agent",
      name: p.name,
      characterId: p.characterId || (p.kind === "agent" ? p.id : undefined),
    }));
    const session = await this.runtime.createSession({
      gameId,
      actors: normalized,
      seed,
      conversationId,
    });
    if (conversationId) {
      this.conversationToSession.set(conversationId, session.id);
    }
    const out = await this.runtime.start(session.id, {
      getAction: getAction || this.#defaultGetAction(),
      onCard: (card) => this.ports.emitSystemCard?.(card),
      onEvent: (events) => this.#mirrorEvents(events),
    });
    return out;
  }

  /**
   * Lobby launch → ephemeral room (not a permanent group).
   */
  async startFromLobby({ gameId, characters, user, seed, getAction } = {}) {
    const room = createEphemeralGameRoom({
      gameId,
      characters,
      user,
    });
    this.rooms.set(room.id, room);
    const actors = [
      { id: user?.id || "user", kind: "user", name: user?.name || t("games.room.you") },
      ...characters.map((c, i) => ({
        id: c.id || c.characterId || `agent-${i}`,
        kind: "agent",
        name: c.name || c.id,
        characterId: c.characterId || c.id,
      })),
    ];
    const out = await this.startGame({
      gameId,
      conversationId: room.id,
      actors,
      seed,
      getAction,
    });
    room.sessionId = out.session.id;
    room.status = "playing";
    return { room, ...out };
  }

  activeSessionId(conversationId) {
    return this.conversationToSession.get(conversationId) || null;
  }

  async handleUserMessage(conversationId, message, opts = {}) {
    const sessionId = this.activeSessionId(conversationId);
    if (!sessionId) return { handled: false, reason: "no_active_game" };
    const out = await this.runtime.handleUserMessage(sessionId, message, {
      getAction: opts.getAction || this.#defaultGetAction(),
      onCard: (card) => this.ports.emitSystemCard?.(card),
      onEvent: (events) => this.#mirrorEvents(events),
    });
    return { handled: true, ...out };
  }

  async handleUserAction(conversationId, action, opts = {}) {
    const sessionId = this.activeSessionId(conversationId);
    if (!sessionId) return { handled: false, reason: "no_active_game" };
    const out = await this.runtime.handleUserAction(sessionId, action, {
      getAction: opts.getAction || this.#defaultGetAction(),
      onCard: (card) => this.ports.emitSystemCard?.(card),
      onEvent: (events) => this.#mirrorEvents(events),
    });
    return { handled: true, ...out };
  }

  async pauseGame(conversationId) {
    const sessionId = this.activeSessionId(conversationId);
    if (!sessionId) return null;
    return this.runtime.pause(sessionId);
  }

  async resumeGame(conversationId, opts = {}) {
    const sessionId = this.activeSessionId(conversationId);
    if (!sessionId) return null;
    return this.runtime.resume(sessionId, {
      getAction: opts.getAction || this.#defaultGetAction(),
      onCard: (card) => this.ports.emitSystemCard?.(card),
    });
  }

  async finishGame(conversationId) {
    const sessionId = this.activeSessionId(conversationId);
    if (!sessionId) return null;
    const result = await this.runtime.finish(sessionId);
    this.conversationToSession.delete(conversationId);
    const room = this.rooms.get(conversationId);
    if (room) {
      room.status = "finished";
      room.result = result;
    }
    return result;
  }

  /**
   * End-of-game prompts — never auto-create a permanent group.
   */
  roomEndOptions(roomId) {
    return {
      roomId,
      options: [
        { id: "play_again", label: t("games.room.playAgain") },
        { id: "save_recap", label: t("games.room.saveRecap") },
        { id: "promote_group", label: t("games.room.promoteGroup") },
        { id: "leave", label: t("games.room.leave") },
      ],
      note: t("games.room.promoteNote"),
    };
  }

  #defaultGetAction() {
    const ports = this.ports;
    if (!ports.runCharacter) return undefined;
    return async (session, actorId, observation) => {
      const actor = session.actors.find((a) => a.id === actorId);
      if (!actor?.characterId) return null;
      const raw = await ports.runCharacter(actor.characterId, {
        observation,
        sessionId: session.id,
        gameId: session.gameId,
        memoryPolicy: "game_only",
      });
      return raw;
    };
  }

  async #mirrorEvents(events) {
    if (!this.ports.appendMessage) return;
    for (const ev of events || []) {
      if (ev.visibility?.type === "private") continue;
      await this.ports.appendMessage({
        role: "system",
        text: ev.type,
        game: {
          sessionId: ev.sessionId,
          kind: ev.type === "card" ? "card" : "event",
        },
        memoryPolicy: "game_only",
        payload: ev.payload,
      });
    }
  }
}

export default GroupGameBridge;
