/**
 * Feature loaders.
 * World remains lazy. Avatar APIs are already part of the companion runtime
 * boundary, so their initialization is deferred without pretending the module
 * itself can be split from the main graph.
 */

import {
  ensureAvatarRuntime as initializeAvatarRuntime,
  initCharacterPage,
} from "../avatar/character-page.js";

let worldPagePromise = null;
let characterPagePromise = null;
let avatarRuntimePromise = null;

export function ensureWorldPage() {
  if (!worldPagePromise) {
    worldPagePromise = import("../world/world-page.js").then((mod) => mod.initWorldPage());
  }
  return worldPagePromise;
}

/** Load avatar state + ActionPlayer as early as possible. */
export function ensureAvatarRuntime() {
  if (!avatarRuntimePromise) {
    avatarRuntimePromise = Promise.resolve().then(() => initializeAvatarRuntime());
  }
  return avatarRuntimePromise;
}

export function ensureCharacterPage() {
  if (!characterPagePromise) {
    characterPagePromise = ensureAvatarRuntime().then(() => initCharacterPage());
  }
  return characterPagePromise;
}
