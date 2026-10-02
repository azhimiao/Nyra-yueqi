/**
 * Resolve pose/action stills from the active character package.
 * Same-character fallback only (L1/L9): never use another character's face.
 */

import { normalizeXingliActionId } from "./xingli-action-map.js";

export const XINGLI_PACKAGE_BASE = "/assets/characters/xingli";
export const XINGLI_SAFE_IDLE_STILL = `${XINGLI_PACKAGE_BASE}/clips/idle_loop.png`;
export const XINGLI_PORTRAIT = `${XINGLI_PACKAGE_BASE}/portrait.png`;

/** Map protocol action ids → clip still filenames in the xingli package. */
const XINGLI_CLIP_STILLS = Object.freeze({
  idle_loop: "idle_loop",
  idle_default: "idle_loop",
  sit_idle: "sit_idle",
  talk_loop: "talk_loop",
  talking_default: "talk_loop",
  listen: "listen",
  thinking: "thinking",
  react_tap: "react_tap",
  comfort: "comfort",
  greet: "greet",
  lean_close: "lean_close",
  shy_look_away: "shy_look_away",
  selfie: "selfie",
  welcome_home: "welcome_home",
  sleep_loop: "sleep_loop",
});

const BUNDLED_PET_PACKAGES = Object.freeze({
  "yueqi-female": "/assets/characters/yueqi-female",
  "yueqi-male": "/assets/characters/yueqi-male",
  xingli: XINGLI_PACKAGE_BASE,
});

/** @type {Map<string, HTMLImageElement>} */
const preloadCache = new Map();

/**
 * @param {{ characterId?: string, petId?: string, actionId?: string, portraitUrl?: string }} input
 * @returns {{ poseUrl: string, clipId: string, packageId: string, degraded: boolean, sameCharacter: boolean }}
 */
export function resolveCharacterPoseAsset(input = {}) {
  const characterId = String(input.characterId || "");
  const petId = String(input.petId || "");
  const portraitUrl = String(input.portraitUrl || "").trim();
  const bundledPetId = Object.hasOwn(BUNDLED_PET_PACKAGES, petId)
    ? petId
    : (!petId && !characterId && !portraitUrl ? "yueqi-female" : "");

  const actionId = normalizeXingliActionId(input.actionId) || "idle_loop";
  const clipId = XINGLI_CLIP_STILLS[actionId] || XINGLI_CLIP_STILLS.idle_loop;

  if (bundledPetId) {
    const packageBase = BUNDLED_PET_PACKAGES[bundledPetId];
    return {
      poseUrl: `${packageBase}/clips/${clipId}.png`,
      clipId,
      packageId: bundledPetId,
      degraded: !XINGLI_CLIP_STILLS[actionId],
      sameCharacter: true,
    };
  }

  // Non-xingli: same-character portrait / package path only — never Xingli clips (L1).
  if (portraitUrl) {
    return {
      poseUrl: portraitUrl,
      clipId: "portrait",
      packageId: characterId || "character",
      degraded: true,
      sameCharacter: true,
    };
  }

  // Honest degrade: empty pose rather than another character's face.
  return {
    poseUrl: "",
    clipId: "missing",
    packageId: "same_character_only",
    degraded: true,
    sameCharacter: true,
  };
}

/**
 * Preload a pose still so action switches do not flash transparent.
 * @param {{ characterId?: string, petId?: string, actionId?: string, portraitUrl?: string }} input
 * @returns {Promise<string>}
 */
export function preloadCharacterPose(input = {}) {
  const pack = resolveCharacterPoseAsset(input);
  const url = pack.poseUrl;
  if (!url) return Promise.resolve("");
  if (preloadCache.has(url)) return Promise.resolve(url);
  if (typeof Image === "undefined") {
    preloadCache.set(url, /** @type {any} */ ({}) );
    return Promise.resolve(url);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      preloadCache.set(url, img);
      resolve(url);
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

export function __clearPosePreloadCacheForTests() {
  preloadCache.clear();
}
