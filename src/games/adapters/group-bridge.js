/**
 * Thin lobby / chat adapter — start ephemeral group games via GroupGameBridge.
 */

import { GroupGameBridge } from "../group/bridge.js";
import { GroupGameRuntime } from "../group/runtime.js";
import { EphemeralGameRoomStore } from "../group/room.js";

/** @type {GroupGameBridge|null} */
let sharedBridge = null;
/** @type {EphemeralGameRoomStore|null} */
let sharedRooms = null;

export function getSharedGroupBridge(options = {}) {
  if (!sharedBridge) {
    sharedBridge = new GroupGameBridge({
      runtime: options.runtime || new GroupGameRuntime(options.runtimeOptions || {}),
      ports: options.ports || {},
    });
  }
  return sharedBridge;
}

export function getEphemeralRoomStore() {
  if (!sharedRooms) sharedRooms = new EphemeralGameRoomStore();
  return sharedRooms;
}

/**
 * Start an ephemeral group game (lobby or temporary room — not a permanent group).
 *
 * @param {{
 *   gameId: string,
 *   characters?: Array<{ id?: string, characterId?: string, name?: string }>,
 *   user?: { id?: string, name?: string },
 *   seed?: string|number,
 *   getAction?: Function,
 *   ports?: object,
 *   bridge?: GroupGameBridge,
 * }} input
 */
export async function startEphemeralGroupGame(input = {}) {
  const gameId = String(input.gameId || "").trim();
  if (!gameId) return { ok: false, error: "missing_game_id" };

  const characters = Array.isArray(input.characters) ? input.characters : [];
  if (characters.length < 1) {
    return { ok: false, error: "need_at_least_one_character" };
  }

  const bridge =
    input.bridge ||
    getSharedGroupBridge({
      ports: input.ports || {},
    });

  try {
    const out = await bridge.startFromLobby({
      gameId,
      characters,
      user: input.user || { id: "user", name: "你" },
      seed: input.seed,
      getAction: input.getAction,
    });
    if (out?.room) {
      const store = getEphemeralRoomStore();
      store.rooms.set(out.room.id, out.room);
    }
    return {
      ok: true,
      room: out.room,
      session: out.session,
      result: out.result,
      outputs: out.outputs,
      memoryPolicy: "game_only",
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export { GroupGameBridge, EphemeralGameRoomStore };
export default startEphemeralGroupGame;
