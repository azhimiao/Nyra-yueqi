/**
 * C6 / W4 — Desk-pet action protocol + idle state machine (§9.2).
 * Pet actions stay inside the pet runtime; scenario owns a separate semantic mapper.
 */

import { DEFAULT_EXPRESSIONS, resolveActionFromExpression } from "./expressions.js";
import {
  getXingliAction,
  normalizeXingliActionId,
  XINGLI_ACTION_CATALOG,
  XINGLI_EMOTION_CLIPS,
} from "./xingli-action-map.js";

export const PET_IDLE_ACTION_ID = "idle_loop";
export const PET_IDLE_POSE_ID = "idle_default";

const IDLE_ALIASES = new Set(["idle_loop", "idle_default"]);

/** Standing-only ambient actions. Listening and posture changes need real causes. */
export const COMPATIBLE_IDLE_POOL = Object.freeze([
  "idle_loop",
  "thinking",
  "shy_look_away",
]);

const MIN_IDLE_DWELL_MS = 11_000;
const IDLE_JITTER_MS = 7_000;
/** Default one-shot duration when catalog has no durationMs. */
const DEFAULT_ONESHOT_MS = 1600;

/**
 * Resolve any chat / scenario / overlay action into the shared protocol shape.
 * @param {{ actionId?: string, expressionId?: string, emotion?: string, source?: string }} input
 */
export function resolvePetAction(input = {}) {
  const expressionId = String(input.expressionId || "").trim();
  const emotion = String(input.emotion || "neutral").trim() || "neutral";
  let requested = String(input.actionId || "").trim();
  if (!requested && expressionId) {
    requested = resolveActionFromExpression({ expressions: DEFAULT_EXPRESSIONS }, expressionId, emotion) || "";
  }
  if (!requested && emotion) requested = XINGLI_EMOTION_CLIPS[emotion] || "";
  const catalogId = normalizeXingliActionId(requested) || PET_IDLE_ACTION_ID;
  const descriptor = getXingliAction(catalogId);
  const isIdle =
    IDLE_ALIASES.has(catalogId);

  return {
    actionId: catalogId,
    expressionId,
    emotion,
    poseId: catalogId,
    poseUrl: "",
    label: descriptor?.label || catalogId,
    loop: Boolean(descriptor?.loop) || isIdle,
    playback: descriptor?.playback || (isIdle ? "loop" : "once"),
    durationMs: Number(descriptor?.durationMs) || (isIdle ? 0 : DEFAULT_ONESHOT_MS),
    source: String(input.source || "system"),
    isIdle,
    degraded: !descriptor,
  };
}

/** Natural idle for post-scene / post-chat return. */
export function resolveIdleAction({ source = "system", actionId } = {}) {
  return resolvePetAction({
    actionId: actionId || PET_IDLE_ACTION_ID,
    emotion: "neutral",
    source,
  });
}

/**
 * Estimate one-shot playback length from action descriptor.
 * @param {ReturnType<typeof resolvePetAction>|object} action
 */
export function oneshotDurationMs(action) {
  const d = Number(action?.durationMs);
  if (Number.isFinite(d) && d > 0) return d;
  return DEFAULT_ONESHOT_MS;
}

/**
 * Idle state machine: min dwell, jitter, recent-avoid (§9.2).
 * @param {{ characterId?: string, pool?: string[] }} [opts]
 */
export function createIdleStateMachine(opts = {}) {
  let characterId = String(opts.characterId || "");
  const pool = (opts.pool || COMPATIBLE_IDLE_POOL).slice();
  /** @type {string[]} */
  let recent = [];
  let ambientCount = 0;
  let lastPlayedAt = 0;
  /** @type {ReturnType<typeof setTimeout>|0} */
  let timer = 0;

  function setCharacterId(id) {
    characterId = String(id || "");
  }

  function notePlayed(actionId) {
    const id = String(actionId || "");
    if (!id) return;
    recent = [id, ...recent.filter((x) => x !== id)].slice(0, 3);
    lastPlayedAt = Date.now();
  }

  /**
   * Pick next idle avoiding the most recent when possible.
   * @param {{ emotion?: string }} [ctx]
   */
  function pickNext(ctx = {}) {
    // Return to neutral between micro-actions. This avoids a nonsensical chain
    // such as thinking -> shy -> thinking with no user or life event.
    ambientCount += 1;
    const pick = ambientCount % 2 === 1
      ? PET_IDLE_ACTION_ID
      : (() => {
        const micro = pool.filter((id) => id !== PET_IDLE_ACTION_ID && id !== recent[0]);
        return micro[Math.floor(Math.random() * micro.length)] || PET_IDLE_ACTION_ID;
      })();
    notePlayed(pick);
    return resolvePetAction({
      actionId: pick,
      emotion: ctx.emotion || "neutral",
      source: "idle_machine",
    });
  }

  /**
   * After one-shot ends, return to a natural idle (not always the same frame).
   * @param {() => void} onIdle
   * @param {ReturnType<typeof resolvePetAction>|object} [action]
   */
  function scheduleAfterOneShot(onIdle, action) {
    if (typeof onIdle !== "function") return () => {};
    if (timer) clearTimeout(timer);
    const delay = oneshotDurationMs(action);
    timer = setTimeout(() => {
      timer = 0;
      onIdle();
    }, delay);
    return () => {
      if (timer) clearTimeout(timer);
      timer = 0;
    };
  }

  /**
   * Soft rotation while staying in idle — respects min dwell + jitter.
   * @param {(action: ReturnType<typeof resolvePetAction>) => void} apply
   * @param {{ emotion?: string }} [ctx]
   */
  function scheduleRotation(apply, ctx = {}) {
    if (typeof apply !== "function") return () => {};
    if (timer) clearTimeout(timer);
    const elapsed = Date.now() - lastPlayedAt;
    const wait = Math.max(
      400,
      MIN_IDLE_DWELL_MS - elapsed + Math.floor(Math.random() * IDLE_JITTER_MS),
    );
    timer = setTimeout(() => {
      timer = 0;
      apply(pickNext(ctx));
      scheduleRotation(apply, ctx);
    }, wait);
    return () => {
      if (timer) clearTimeout(timer);
      timer = 0;
    };
  }

  function destroy() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  return {
    setCharacterId,
    getCharacterId: () => characterId,
    notePlayed,
    pickNext,
    scheduleAfterOneShot,
    scheduleRotation,
    destroy,
    pool: () => pool.slice(),
  };
}

/**
 * Schedule return to idle after a one-shot action.
 * Prefer createIdleStateMachine for stage; kept for desk-pet callers.
 * @param {(action: ReturnType<typeof resolvePetAction>) => void} apply
 * @param {number} [delayMs]
 * @returns {() => void} cancel
 */
export function scheduleReturnToIdle(apply, delayMs = DEFAULT_ONESHOT_MS) {
  if (typeof apply !== "function") return () => {};
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    apply(resolveIdleAction({ source: "system" }));
  }, Math.max(0, Number(delayMs) || DEFAULT_ONESHOT_MS));
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/**
 * Apply action then return to idle (unless the action itself is idle/loop presence).
 */
export function playPetActionThenIdle(apply, input = {}, delayMs) {
  const action = resolvePetAction(input);
  apply?.(action);
  if (action.isIdle || (action.loop && action.actionId === PET_IDLE_ACTION_ID)) {
    return () => {};
  }
  const ms = delayMs != null ? delayMs : oneshotDurationMs(action);
  return scheduleReturnToIdle(apply, ms);
}

/** Catalog ids available to pet chat and overlay hosts. */
export function listProtocolActionIds() {
  return XINGLI_ACTION_CATALOG.map((a) => a.id);
}

export function isKnownPetAction(actionId) {
  const id = normalizeXingliActionId(actionId);
  return Boolean(id && getXingliAction(id));
}
