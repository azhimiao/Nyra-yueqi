/**
 * Multi-resolution preview targets: desk pet, Pop, App, scenario, notification.
 */

import { PREVIEW_TARGETS } from "./schema.js";

/** Expected aspect ratios per surface (width:height string) */
export const PREVIEW_ASPECTS = Object.freeze({
  desk_pet: "1:1",
  pop: "3:4",
  app: "9:16",
  scenario: "16:9",
  notification: "1:1",
});

/**
 * @param {Record<string, string>} [declared]
 * @returns {{ ok: true, targets: object[] } | { ok: false, errors: string[] }}
 */
export function buildPreviewTargets(declared = {}) {
  const errors = [];
  const targets = PREVIEW_TARGETS.map((id) => {
    const expected = PREVIEW_ASPECTS[id];
    const aspect = String(declared[id] || expected).trim() || expected;
    if (aspect !== expected) {
      errors.push(`wrong_aspect:${id}:got_${aspect}:expected_${expected}`);
    }
    return {
      id,
      aspect: expected,
      declaredAspect: aspect,
      label: labelFor(id),
      maxEdgePx: maxEdge(id),
    };
  });
  if (errors.length) return { ok: false, errors, targets };
  return { ok: true, targets };
}

/**
 * Produce a preview descriptor bound to one character identity — never another.
 * @param {{
 *   characterId: string,
 *   identityKey: string,
 *   identityHash: string,
 *   portraitRef: string,
 *   actionId?: string,
 *   expressionId?: string,
 * }} pack
 * @param {string} target
 */
export function resolvePreviewFrame(pack, target) {
  const surface = PREVIEW_TARGETS.includes(target) ? target : "app";
  return {
    target: surface,
    aspect: PREVIEW_ASPECTS[surface],
    characterId: String(pack.characterId || ""),
    identityKey: String(pack.identityKey || ""),
    identityHash: String(pack.identityHash || ""),
    portraitRef: String(pack.portraitRef || ""),
    actionId: String(pack.actionId || "idle"),
    expressionId: String(pack.expressionId || "neutral"),
  };
}

/**
 * Contract: all surfaces must report the same identityHash for the same package.
 * @param {ReturnType<typeof resolvePreviewFrame>[]} frames
 */
export function assertNoIdentityDrift(frames) {
  if (!Array.isArray(frames) || frames.length < 2) {
    return { ok: false, reason: "need_at_least_two_surfaces" };
  }
  const key = frames[0].identityKey;
  const hash = frames[0].identityHash;
  const characterId = frames[0].characterId;
  for (const f of frames) {
    if (f.identityKey !== key || f.identityHash !== hash || f.characterId !== characterId) {
      return {
        ok: false,
        reason: "identity_drift",
        detail: { expected: { key, hash, characterId }, got: f },
      };
    }
  }
  return { ok: true, identityKey: key, identityHash: hash, surfaces: frames.map((f) => f.target) };
}

function labelFor(id) {
  return (
    {
      desk_pet: "桌宠",
      pop: "Pop",
      app: "App",
      scenario: "情景剧",
      notification: "通知",
    }[id] || id
  );
}

function maxEdge(id) {
  return (
    {
      desk_pet: 256,
      pop: 512,
      app: 1080,
      scenario: 1920,
      notification: 128,
    }[id] || 512
  );
}
