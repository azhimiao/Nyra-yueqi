/**
 * Derive desktop pet / overlay presence from companion life-state.
 * Single mood truth: `life-state.currentMood`; no separate overlay pet mood store.
 */

import { getLifeState, MOOD_CYCLE } from "./life-state.js";
import { PET_IDLE_POSE_ID } from "../avatar/pet-action-protocol.js";
import { readSelectedPetId } from "../avatar/pet-catalog.js";
import { labelLifeMood } from "../status/labels.js";
import { isFeatureEnabled } from "../features/flags.js";
import { getCompanionSurfaceModel } from "../relationship/surface-service.js";

export const COMPANION_LIFE_EVENT = "yueqi:companion-life";

const ACTIVE_PLAY_STATES = new Set([
  "talking",
  "thinking",
  "listening",
  "capturing",
  "reacting",
]);

/** Life-state mood → boy-character / sprite emotion. */
export const LIFE_MOOD_TO_EMOTION = Object.freeze({
  calm: "calm",
  warm: "warm",
  playful: "happy",
  pensive: "neutral",
  tired: "neutral",
});

/** Life-state mood → idle pose when not in transient chat playback. */
export const LIFE_MOOD_TO_IDLE_ACTION = Object.freeze({
  calm: PET_IDLE_POSE_ID,
  warm: "sit_idle",
  playful: "greet",
  pensive: "thinking",
  tired: "sleep_pose",
});

/** Overlay / float status copy derived from life mood (localized at read time). */
export function lifeMoodStatusLabel(mood) {
  return labelLifeMood(mood);
}

/** @deprecated Prefer lifeMoodStatusLabel(); kept for older imports. */
export const LIFE_MOOD_STATUS_LABEL = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return labelLifeMood(prop);
    },
  },
);

/**
 * @param {string} characterId
 * @param {object} [runtimeSnapshot]
 */
export function derivePetPresenceFromLifeState(characterId, runtimeSnapshot = {}) {
  const cid = String(characterId || "").trim();
  const life = getLifeState(cid);
  const mood = MOOD_CYCLE.includes(life.currentMood) ? life.currentMood : "calm";
  const emotion = LIFE_MOOD_TO_EMOTION[mood] || "neutral";

  const runtimePlayState = String(runtimeSnapshot.playState || "idle").toLowerCase();
  const runtimeActive = ACTIVE_PLAY_STATES.has(runtimePlayState);
  const runtimeAsleep = Boolean(runtimeSnapshot.asleep);

  const lifeAsleep = mood === "tired" && !runtimeActive;
  const asleep = runtimeAsleep || lifeAsleep;

  let playState = runtimeActive ? runtimePlayState : "idle";
  let actionId = runtimeActive
    ? (runtimeSnapshot.actionId || PET_IDLE_POSE_ID)
    : (LIFE_MOOD_TO_IDLE_ACTION[mood] || PET_IDLE_POSE_ID);

  if (asleep && !runtimeActive) {
    playState = "idle";
    actionId = "sleep_pose";
  }

  // C3: short Continuity copy only — todayLine / openLoop from surface-service (no invented facts).
  let todayLine = "";
  let openLoop = null;
  let continuityFingerprint = null;
  if (cid && isFeatureEnabled("relationshipContinuityV1")) {
    try {
      const surface = getCompanionSurfaceModel({
        companionId: cid,
        userId: runtimeSnapshot.userId || "local",
        relationshipId: runtimeSnapshot.relationshipId,
        surface: "pet",
        locale: runtimeSnapshot.locale,
        now: runtimeSnapshot.now,
      });
      todayLine = String(surface.todayLine || surface.pet?.todayLine || "").trim();
      openLoop = surface.openLoop || surface.pet?.openLoop || null;
      continuityFingerprint = surface.fingerprint || null;
    } catch {
      todayLine = "";
      openLoop = null;
    }
  }

  const moodLabel = labelLifeMood(mood);
  const presenceLabel = todayLine || moodLabel;

  return {
    source: "companion_life",
    characterId: cid,
    currentMood: mood,
    emotion: runtimeActive && runtimeSnapshot.emotion
      ? runtimeSnapshot.emotion
      : emotion,
    playState,
    actionId,
    asleep,
    presenceLabel,
    todayLine,
    openLoop,
    continuityFingerprint,
    pendingCount: (life.pendingEvents?.length || 0) + (life.pendingActions?.length || 0),
    // W1: do not expose numeric intimacy/trust/tension for pet / overlay copy.
    relationshipState: null,
  };
}

/**
 * Merge life-derived presence into a pet payload without overriding active chat playback.
 * @param {object} baseState
 * @param {object|null|undefined} presence
 */
export function mergePetPresenceIntoState(baseState = {}, presence = null) {
  if (!presence) return { ...baseState };
  const runtimeActive = ACTIVE_PLAY_STATES.has(
    String(baseState.playState || "").toLowerCase(),
  );
  return {
    ...baseState,
    emotion: runtimeActive ? (baseState.emotion || presence.emotion) : presence.emotion,
    asleep: Boolean(baseState.asleep) || Boolean(presence.asleep),
    playState: runtimeActive ? baseState.playState : presence.playState,
    actionId: runtimeActive ? baseState.actionId : presence.actionId,
    presenceLabel: presence.presenceLabel,
    todayLine: presence.todayLine || "",
    openLoop: presence.openLoop || null,
    continuityFingerprint: presence.continuityFingerprint || null,
    companionMood: presence.currentMood,
    lifePresenceSource: presence.source,
  };
}

/**
 * Shippable pet packs, mirroring `avatar/pet-catalog.js` DEFAULT_PETS.
 */
const PET_PACK_IDS = Object.freeze(["bubble", "yueqi-female", "yueqi-male", "xingli"]);

/**
 * Desktop pet look is catalog-only (`yueqi.selectedPetId`).
 * Character wardrobe / look images / the old boy-skeleton never drive the pet.
 * @param {{ lookDataUrl?: string, actionDataUrl?: string, petId?: string }} media
 */
export function resolvePetSpritePack(media = {}) {
  const petId = String(media.petId || "").trim();
  return PET_PACK_IDS.includes(petId) ? petId : "yueqi-female";
}

function resolveRuntimePlayback(runtime = {}, actionSnap = {}) {
  const runtimeActive = runtime.playState && runtime.playState !== "idle";
  const actionActive = actionSnap.playState && actionSnap.playState !== "idle";
  const playState = runtimeActive
    ? runtime.playState
    : actionActive
      ? actionSnap.playState
      : (runtime.playState || actionSnap.playState || "idle");
  const actionId = runtimeActive
    ? (runtime.actionId || "talking_default")
    : actionActive
      ? (actionSnap.actionId || "idle_default")
      : (runtime.actionId || actionSnap.actionId || "idle_default");
  return { playState, actionId };
}

/**
 * Catalog-only overlay / desk-pet payload. Never loads character wardrobe blobs —
 * those were the legacy digital-human path and could freeze the main WebView.
 *
 * @param {{
 *   companionRuntime?: { getState?: () => object },
 *   getActiveCharacterId?: () => string,
 *   getAvatarState?: () => object,
 *   getCurrentLook?: (avatar: object) => object|null,
 *   getActionPlayer?: () => { getState?: () => object } | null,
 *   fallbackName?: string,
 * }} deps
 * @param {object} [extra]
 */
export async function buildCatalogPetOverlayState(deps = {}, extra = {}) {
  const {
    companionRuntime,
    getActiveCharacterId,
    getAvatarState = () => ({}),
    getCurrentLook = () => null,
    getActionPlayer = () => null,
    fallbackName = "角色",
  } = deps;

  const avatar = getAvatarState() || {};
  const look = getCurrentLook(avatar) || {};
  const runtime = companionRuntime?.getState?.() || {};
  const actionSnap = getActionPlayer()?.getState?.() || {};
  let { playState, actionId } = resolveRuntimePlayback(runtime, actionSnap);

  const characterId = String(getActiveCharacterId?.() || "").trim();
  const lifePresence = characterId
    ? derivePetPresenceFromLifeState(characterId, runtime)
    : null;
  const mergedRuntime = mergePetPresenceIntoState({
    playState,
    actionId,
    emotion: runtime.emotion || "neutral",
    asleep: Boolean(runtime.asleep),
  }, lifePresence);
  playState = mergedRuntime.playState;
  actionId = mergedRuntime.actionId;

  return mergePetPresenceIntoState({
    mode: extra.mode || "collapsed",
    name: runtime.characterName || look?.name || fallbackName,
    lookDataUrl: "",
    actionDataUrl: "",
    lookId: "",
    spritePack: resolvePetSpritePack({ petId: readSelectedPetId() }),
    bubbleText: extra.bubbleText ?? runtime.lastMessageText ?? runtime.lastProactiveText ?? "",
    unread: runtime.unreadCount || 0,
    playState,
    actionId,
    emotion: mergedRuntime.emotion || "neutral",
    asleep: Boolean(mergedRuntime.asleep),
    display: avatar.display || {},
    locked: Boolean(avatar.userLookLocked),
    ...extra,
  }, lifePresence);
}

/**
 * @param {string} characterId
 * @param {object} [detail]
 */
export function emitCompanionLifeChanged(characterId, detail = {}) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(COMPANION_LIFE_EVENT, {
    detail: { characterId: String(characterId || "").trim(), ...detail },
  }));
}

/**
 * Wire life-state changes → pet surface refresh (desktop / overlay hosts).
 * @param {{
 *   getActiveCharacterId?: () => string,
 *   companionRuntime?: { getState?: () => object, syncLifePresence?: () => object },
 *   onPresenceChange?: (presence: object, reason: string) => void,
 * }} deps
 */
export function bindPetPresenceBridge(deps = {}) {
  const { getActiveCharacterId, companionRuntime, onPresenceChange } = deps;

  const push = (reason = "life-change") => {
    const characterId = String(getActiveCharacterId?.() || "").trim();
    if (!characterId) return null;
    companionRuntime?.syncLifePresence?.(reason);
    const runtime = companionRuntime?.getState?.() || {};
    const presence = derivePetPresenceFromLifeState(characterId, runtime);
    onPresenceChange?.(presence, reason);
    return presence;
  };

  const onLife = () => push("companion-life");
  const onRuntime = (event) => {
    // syncLifePresence → emit(yueqi:runtime) → push → syncLifePresence would recurse forever
    const reason = String(event.detail?.reason || "");
    if (
      reason === "runtime-idle"
      || reason === "companion-life"
      || reason === "init"
      || reason === "init-life"
      || reason === "life-sync"
      || reason === "talking-done"
    ) {
      return;
    }
    const playState = String(event.detail?.state?.playState || "").toLowerCase();
    if (playState && playState !== "idle") return;
    push("runtime-idle");
  };

  if (typeof document !== "undefined") {
    document.addEventListener(COMPANION_LIFE_EVENT, onLife);
    document.addEventListener("yueqi:runtime", onRuntime);
  }

  push("init");

  return () => {
    if (typeof document === "undefined") return;
    document.removeEventListener(COMPANION_LIFE_EVENT, onLife);
    document.removeEventListener("yueqi:runtime", onRuntime);
  };
}
