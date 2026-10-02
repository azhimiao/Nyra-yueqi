import { mountXingliCharacter } from "./xingli-character.js";
import { mountBubbleCharacter } from "./bubble-character.js";

export const SELECTED_PET_KEY = "yueqi.selectedPetId";
/** 2D catalog sprite — not the bubble orb, not the boy-skeleton. */
export const DEFAULT_PET_ID = "yueqi-female";
const LEGACY_DEFAULT_PET_ID = "bubble";
const DEFAULT_SPRITE_MIGRATION_KEY = "yueqi.pet.defaultSprite.v1";

/** Desktop pet + in-app float always render this catalog. Character looks are not pets. */

/** @type {ReadonlyArray<{ id: string, label: string, kind: "sprite"|"bubble", tagline: string, portrait?: string }>} */
export const DEFAULT_PETS = Object.freeze([
  {
    id: "yueqi-female",
    label: "月栖·昼",
    kind: "sprite",
    gender: "female",
    builtin: true,
    tagline: "冷白与冰蓝的内置女性形象",
    portrait: "/assets/characters/yueqi-female/portrait.png",
    manifestUrl: "/assets/characters/yueqi-female/manifest.json",
  },
  {
    id: "yueqi-male",
    label: "月栖·夜",
    kind: "sprite",
    gender: "male",
    builtin: true,
    tagline: "冷白与蓝黑的内置男性形象",
    portrait: "/assets/characters/yueqi-male/portrait.png",
    manifestUrl: "/assets/characters/yueqi-male/manifest.json",
  },
  {
    id: "xingli",
    label: "星梨",
    kind: "sprite",
    gender: "female",
    builtin: true,
    tagline: "动态角色，会打招呼会犯困",
    portrait: "/assets/characters/xingli/portrait.png",
    manifestUrl: "/assets/characters/xingli/manifest.json",
  },
  {
    id: "bubble",
    label: "气泡",
    kind: "bubble",
    builtin: true,
    tagline: "轻声陪着你",
  },
]);

const PET_MAP = Object.freeze(Object.fromEntries(DEFAULT_PETS.map((pet) => [pet.id, pet])));

export function listDefaultPets() {
  return [...DEFAULT_PETS];
}

export function getPet(id) {
  return PET_MAP[normalizePetId(id)] || PET_MAP[DEFAULT_PET_ID];
}

export function normalizePetId(id) {
  const value = String(id || "").trim();
  return PET_MAP[value] ? value : DEFAULT_PET_ID;
}

function migrateLegacyBubbleDefault() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (window.localStorage.getItem(DEFAULT_SPRITE_MIGRATION_KEY) === "1") return;
    const saved = String(window.localStorage.getItem(SELECTED_PET_KEY) || "").trim();
    if (!saved || saved === LEGACY_DEFAULT_PET_ID) {
      window.localStorage.setItem(SELECTED_PET_KEY, DEFAULT_PET_ID);
    }
    window.localStorage.setItem(DEFAULT_SPRITE_MIGRATION_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function readSelectedPetId() {
  migrateLegacyBubbleDefault();
  try {
    const fromCharacter = characterPetBridge?.readPetId?.();
    if (fromCharacter) return normalizePetId(fromCharacter);
  } catch {
    /* store not ready */
  }
  try {
    return normalizePetId(window.localStorage.getItem(SELECTED_PET_KEY));
  } catch {
    return DEFAULT_PET_ID;
  }
}

export function writeSelectedPetId(id) {
  const next = normalizePetId(id);
  try {
    window.localStorage.setItem(SELECTED_PET_KEY, next);
  } catch {
    /* ignore quota */
  }
  let characterId = "";
  try {
    characterId = characterPetBridge?.writePetId?.(next) || "";
  } catch {
    /* ignore */
  }
  try {
    document.dispatchEvent(
      new CustomEvent("yueqi:pet-changed", {
        detail: { petId: next, characterId },
      })
    );
  } catch {
    /* ignore */
  }
  return next;
}

/** @type {{ readPetId?: () => string, writePetId?: (petId: string) => string } | null} */
let characterPetBridge = null;

/**
 * Wired from characters/store to bind pets to the active companion card.
 * Avoids a static import cycle (store → pet-catalog).
 */
export function bindCharacterPetBridge(bridge) {
  characterPetBridge = bridge || null;
}

/**
 * Mount the selected (or given) default pet into a host.
 * Returns a small shared runtime API used by float / phone surfaces.
 *
 * @param {string} petId
 * @param {Element|ShadowRoot|string} host
 * @param {Record<string, unknown>} options
 */
export function mountPet(petId, host, options = {}) {
  const pet = getPet(petId);
  if (pet.kind === "bubble") {
    return {
      petId: pet.id,
      kind: pet.kind,
      meta: pet,
      controller: mountBubbleCharacter(host, {
        size: options.size || "100%",
        state: options.state || "idle",
        reducedMotion: options.reducedMotion,
        ariaLabel: options.ariaLabel || `${pet.label}桌宠`,
      }),
    };
  }

  return {
    petId: pet.id,
    kind: pet.kind,
    meta: pet,
      controller: mountXingliCharacter(host, {
      size: options.size || "100%",
      state: options.state || "idle",
      emotion: options.emotion || "warm",
      reducedMotion: options.reducedMotion,
      matteColor: options.matteColor,
      manifestUrl: pet.manifestUrl,
      ariaLabel: options.ariaLabel || `${pet.label}动态角色`,
      idleCarouselOffsetMs: options.idleCarouselOffsetMs,
      onReady: options.onReady,
      onClipChange: options.onClipChange,
      onFrame: options.onFrame,
      onComplete: options.onComplete,
      onError: options.onError,
    }),
  };
}
