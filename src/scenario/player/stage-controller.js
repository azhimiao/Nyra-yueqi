/**
 * Stage controller — consumes semantic performance fields only.
 * Character rendering is owned by scenario dialogue/stage presentation assets.
 */

import { mapStageAction } from "../runtime/action-mapper.js";

const LOOPING_SCENE_ACTIONS = new Set(["idle", "talk", "listen"]);

/**
 * @param {{
 *   characterId?: string,
 *   portraitUrl?: string,
 *   renderStage?: (payload: object) => void,
 *   onTtsHook?: (envelope: object) => void | Promise<void>,
 * }} [deps]
 */
export function createStageController(deps = {}) {
  /** @type {string} */
  let lastCharacterId = String(deps.characterId || "");
  /** @type {ReturnType<typeof mapStageAction>|null} */
  let lastAction = null;
  /** @type {(() => void)|null} */
  let cancelIdle = null;

  /**
   * Apply AssistantTurnEnvelope performance fields.
   * @param {{
   *   actionId?: string,
   *   expressionId?: string,
   *   emotion?: string,
   *   voiceStyle?: string,
   *   backgroundId?: string,
   *   camera?: object,
   *   dialogue?: string,
   *   narration?: string,
   *   characterId?: string,
   *   portraitUrl?: string,
   *   entering?: boolean,
   *   listening?: boolean,
   * }} envelope
   */
  function applyPerformance(envelope = {}) {
    const cid = String(envelope.characterId || lastCharacterId || "");
    if (cid && cid !== lastCharacterId) {
      lastCharacterId = cid;
    }

    const listening = Boolean(envelope.listening);
    const mapped = mapStageAction({
      actionId: listening ? "listen" : (envelope.actionId || "idle_loop"),
      expressionId: envelope.expressionId,
      emotion: envelope.emotion || (listening ? "warm" : "neutral"),
      characterId: cid,
    });

    lastAction = { ...mapped };

    deps.renderStage?.({
      actionId: mapped.actionId,
      expressionId: mapped.expressionId,
      emotion: mapped.emotion,
      backgroundId: envelope.backgroundId || "",
      cameraShot: envelope.camera?.shot || "medium",
      characterId: cid,
      portraitUrl: envelope.portraitUrl || "",
      entering: Boolean(envelope.entering),
      sceneId: envelope.sceneId || "",
      mood: envelope.mood || "",
    });

    cancelIdle?.();
    cancelIdle = null;
    if (!LOOPING_SCENE_ACTIONS.has(mapped.actionId)) {
      const timer = globalThis.setTimeout(() => {
        const idle = mapStageAction({ actionId: "idle_loop", emotion: mapped.emotion, characterId: cid });
        deps.renderStage?.({
          actionId: idle.actionId,
          expressionId: idle.expressionId,
          emotion: idle.emotion,
          characterId: cid,
          portraitUrl: envelope.portraitUrl || "",
          backgroundId: envelope.backgroundId || "",
          cameraShot: envelope.camera?.shot || "medium",
        });
      }, 1800);
      cancelIdle = () => globalThis.clearTimeout(timer);
    }

    // TTS / lip-sync hook — honest degrade if unavailable
    if (envelope.dialogue && typeof deps.onTtsHook === "function") {
      try {
        void Promise.resolve(deps.onTtsHook(envelope)).catch(() => {});
      } catch {
        /* degrade */
      }
    }

    return lastAction;
  }

  function setListening(on, base = {}) {
    return applyPerformance({ ...base, listening: Boolean(on), actionId: on ? "listen" : "idle_loop" });
  }

  return {
    applyPerformance,
    setListening,
    getLastAction: () => lastAction,
    destroy() {
      cancelIdle?.();
      cancelIdle = null;
    },
  };
}
