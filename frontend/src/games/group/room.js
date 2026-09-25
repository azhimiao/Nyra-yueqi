/**
 * EphemeralGameRoom — lobby-launched temporary room (NOT a permanent group).
 */

import { makeId } from "./helpers.js";
import { t } from "../../i18n/index.js";

/**
 * @typedef {{
 *   id: string,
 *   kind: "ephemeral_game_room",
 *   gameId: string,
 *   status: "ready"|"playing"|"finished"|"abandoned",
 *   user: { id: string, name?: string },
 *   characters: Array<{ id: string, characterId?: string, name?: string }>,
 *   sessionId?: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   permanentGroupId?: string | null,
 *   result?: unknown,
 * }} EphemeralGameRoom
 */

/**
 * @param {object} input
 * @param {string} input.gameId
 * @param {Array<{ id?: string, characterId?: string, name?: string }>} input.characters
 * @param {{ id?: string, name?: string }} [input.user]
 * @returns {EphemeralGameRoom}
 */
export function createEphemeralGameRoom(input = {}) {
  const now = Date.now();
  return {
    id: input.id || makeId("room"),
    kind: "ephemeral_game_room",
    gameId: String(input.gameId || ""),
    status: "ready",
    user: {
      id: input.user?.id || "user",
      name: input.user?.name || t("games.room.you"),
    },
    characters: (input.characters || []).map((c, i) => ({
      id: c.id || c.characterId || `char-${i}`,
      characterId: c.characterId || c.id,
      name: c.name || c.id || t("games.room.character", { number: i + 1 }),
    })),
    sessionId: null,
    createdAt: now,
    updatedAt: now,
    permanentGroupId: null,
    result: null,
  };
}

/**
 * Explicit user action to promote room members into a real group.
 * This module only records intent — it does NOT create the group itself.
 *
 * @param {EphemeralGameRoom} room
 * @param {{ createGroup: (payload: any) => Promise<{ id: string }> }} ports
 */
export async function promoteToPermanentGroup(room, ports) {
  if (!ports?.createGroup) {
    throw new Error("promoteToPermanentGroup requires ports.createGroup");
  }
  const created = await ports.createGroup({
    title: t("games.room.friendsTitle", { gameId: room.gameId }),
    memberIds: [
      room.user.id,
      ...room.characters.map((c) => c.characterId || c.id),
    ],
    source: "ephemeral_game_room",
    roomId: room.id,
  });
  room.permanentGroupId = created.id;
  room.updatedAt = Date.now();
  return { room, groupId: created.id };
}

/**
 * End-screen choices — promote is opt-in only.
 */
export function listRoomExitActions() {
  return [
    { id: "play_again", label: t("games.room.playAgain") },
    { id: "save_recap", label: t("games.room.saveRecap") },
    { id: "promote_group", label: t("games.room.promoteGroup") },
    { id: "leave", label: t("games.room.leave") },
  ];
}

export class EphemeralGameRoomStore {
  constructor() {
    this.rooms = new Map();
  }

  create(input) {
    const room = createEphemeralGameRoom(input);
    this.rooms.set(room.id, room);
    return room;
  }

  get(id) {
    return this.rooms.get(id) || null;
  }

  update(id, patch) {
    const room = this.rooms.get(id);
    if (!room) return null;
    Object.assign(room, patch, { updatedAt: Date.now() });
    return room;
  }

  abandon(id) {
    return this.update(id, { status: "abandoned" });
  }
}

export default createEphemeralGameRoom;
