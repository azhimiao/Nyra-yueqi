/**
 * DeskPetHostAdapter (Windows Electron desk pet).
 * Projection + open-phone only; never runs Agent executor.
 */

import { HOST_PLATFORMS, HOST_SCHEMA_VERSION } from "./constants.js";
import { WINDOWS_ISOLATION } from "./isolation.js";
import { isHostTaskState, projectTaskState } from "./task-state-projection.js";

/**
 * @typedef {{
 *   mode?: string,
 *   name?: string,
 *   bubbleText?: string,
 *   playState?: string,
 *   unread?: number,
 *   spritePack?: string,
 * }} PetState
 */

/**
 * @param {{
 *   getPetState?: () => PetState,
 *   updatePetState?: (patch: PetState) => void|Promise<unknown>,
 *   openPhone?: () => void|Promise<unknown>,
 *   platform?: string,
 * }} [deps]
 */
export function createDeskPetHostAdapter(deps = {}) {
  const platform = deps.platform || HOST_PLATFORMS.WINDOWS_ELECTRON;
  let lastProjection = null;

  const getPetState = typeof deps.getPetState === "function" ? deps.getPetState : () => ({});
  const updatePetState =
    typeof deps.updatePetState === "function" ? deps.updatePetState : async () => ({ ok: false });
  const openPhone = typeof deps.openPhone === "function" ? deps.openPhone : async () => ({ ok: false });

  return {
    kind: "desk-pet",
    platform,
    schemaVersion: HOST_SCHEMA_VERSION,
    isolation: WINDOWS_ISOLATION,
    mayExecuteAgent: false,

    getPetState() {
      return { ...getPetState() };
    },

    /**
     * Push Core / app pet visuals into the desk-pet surface.
     * @param {PetState} patch
     */
    async pushPetState(patch = {}) {
      if (!patch || typeof patch !== "object") {
        return { ok: false, reason: "invalid_patch" };
      }
      await updatePetState(patch);
      return { ok: true };
    },

    /** Open the phone / main app window (trusted IPC). */
    async openPhone() {
      await openPhone();
      return { ok: true, action: "open-phone" };
    },

    /**
     * Show a short task bubble on the pet (projection only).
     * @param {object} taskOrProjection
     */
    async showTaskBubble(taskOrProjection = {}) {
      const projection =
        isHostTaskState(taskOrProjection?.state) && taskOrProjection?.bubbleText
          ? {
              schemaVersion: HOST_SCHEMA_VERSION,
              taskId: String(taskOrProjection.taskId || ""),
              characterId: String(taskOrProjection.characterId || ""),
              agentState: String(taskOrProjection.agentState || ""),
              state: taskOrProjection.state,
              label: String(taskOrProjection.label || ""),
              title: String(taskOrProjection.title || ""),
              bubbleText: String(taskOrProjection.bubbleText || ""),
              updatedAt: String(taskOrProjection.updatedAt || new Date().toISOString()),
            }
          : projectTaskState(taskOrProjection);

      lastProjection = projection;
      await updatePetState({
        mode: "bubble",
        bubbleText: projection.bubbleText,
        playState: projection.state === "running" ? "thinking" : "idle",
        unread: projection.state === "waiting" ? 1 : 0,
      });
      return { ok: true, projection };
    },

    getLastProjection() {
      return lastProjection;
    },

    /** Contract surface for verify / docs. */
    describe() {
      return {
        kind: "desk-pet",
        platform,
        mayExecuteAgent: false,
        capabilities: ["pet-state", "open-phone", "task-bubble"],
        isolationRules: [...WINDOWS_ISOLATION.rules],
      };
    },
  };
}

export const DeskPetHostAdapter = {
  create: createDeskPetHostAdapter,
};
