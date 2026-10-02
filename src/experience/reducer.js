/**
 * Experience ScenePatch reducer — whitelist validation only (§6.4 / §13.2).
 * memorySignals are candidates; never written to permanent memory here.
 */

import {
  SCENE_PATCH_WHITELIST,
  createEmptySceneState,
  normalizeExperienceOutput,
  repairExperienceOutput,
} from "./schema.js";

/**
 * Validate a ScenePatch against the whitelist.
 * @param {unknown} patch
 * @returns {{ ok: boolean, errors: string[], value: object }}
 */
export function validateScenePatch(patch) {
  if (patch == null) {
    return { ok: true, errors: [], value: {} };
  }
  if (typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: ["scene_patch_not_object"], value: {} };
  }

  const errors = [];
  /** @type {Record<string, unknown>} */
  const value = {};
  for (const key of Object.keys(patch)) {
    if (!SCENE_PATCH_WHITELIST.includes(key)) {
      errors.push(`scene_patch_forbidden_field:${key}`);
      continue;
    }
    value[key] = /** @type {any} */ (patch)[key];
  }

  if (Object.prototype.hasOwnProperty.call(value, "resolvedThreadIds")) {
    if (!Array.isArray(value.resolvedThreadIds)) {
      errors.push("resolvedThreadIds_not_array");
      delete value.resolvedThreadIds;
    } else {
      value.resolvedThreadIds = value.resolvedThreadIds.map(String).filter(Boolean).slice(0, 24);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "newFacts")) {
    if (!Array.isArray(value.newFacts)) {
      errors.push("newFacts_not_array");
      delete value.newFacts;
    } else {
      value.newFacts = value.newFacts.map(String).filter(Boolean).slice(0, 24);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "flags")) {
    if (!Array.isArray(value.flags)) {
      errors.push("flags_not_array");
      delete value.flags;
    } else {
      value.flags = value.flags.map(String).filter(Boolean).slice(0, 24);
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "tension")) {
    const n = Number(value.tension);
    if (!Number.isFinite(n)) {
      errors.push("tension_not_number");
      delete value.tension;
    } else {
      value.tension = Math.max(0, Math.min(3, n));
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "emotionalTone")) {
    value.emotionalTone = String(value.emotionalTone || "").trim().slice(0, 64);
  }
  if (Object.prototype.hasOwnProperty.call(value, "locationHint")) {
    value.locationHint = String(value.locationHint || "").trim().slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(value, "weatherHint")) {
    value.weatherHint = String(value.weatherHint || "").trim().slice(0, 80);
  }

  return { ok: errors.length === 0, errors, value };
}

function tensionBandFromNumber(n) {
  if (n <= 0) return "calm";
  if (n >= 3) return "high";
  if (n >= 2) return "rising";
  return "low";
}

/**
 * Apply a validated ScenePatch onto SceneState (immutable).
 * @param {object} sceneState
 * @param {unknown} patch
 * @returns {{ ok: boolean, errors: string[], state: object }}
 */
export function reduceScenePatch(sceneState, patch) {
  const base = createEmptySceneState(sceneState || {});
  const validated = validateScenePatch(patch);
  if (!validated.ok && !Object.keys(validated.value).length) {
    return { ok: false, errors: validated.errors, state: base };
  }

  const next = { ...base };
  const p = validated.value;

  if (p.emotionalTone != null) next.emotionalTone = String(p.emotionalTone);
  if (p.locationHint != null) {
    next.locationHint = String(p.locationHint);
    next.location = String(p.locationHint);
  }
  if (p.weatherHint != null) {
    next.weatherHint = String(p.weatherHint);
    next.weather = String(p.weatherHint);
  }
  if (p.tension != null) {
    next.tension = Number(p.tension);
    next.tensionBand = tensionBandFromNumber(next.tension);
  }

  if (Array.isArray(p.resolvedThreadIds)) {
    const set = new Set([...(next.resolvedThreadIds || []), ...p.resolvedThreadIds]);
    next.resolvedThreadIds = [...set];
    const resolved = new Set(p.resolvedThreadIds.map(String));
    next.unresolvedThreads = (next.unresolvedThreads || []).filter((t) => !resolved.has(String(t)));
  }
  if (Array.isArray(p.newFacts)) {
    next.newFacts = [...(next.newFacts || []), ...p.newFacts].slice(-48);
    next.establishedFacts = [...(next.establishedFacts || []), ...p.newFacts].slice(-48);
  }
  if (Array.isArray(p.flags)) {
    const set = new Set([...(next.flags || []), ...p.flags]);
    next.flags = [...set];
  }

  return {
    ok: validated.errors.length === 0,
    errors: validated.errors,
    state: next,
  };
}

/**
 * Advance turnIndex after a successful immersive turn.
 * @param {object} sceneState
 * @param {unknown} [patch]
 */
export function reduceTurn(sceneState, patch = {}) {
  const patched = reduceScenePatch(sceneState, patch);
  const state = {
    ...patched.state,
    turnIndex: (Number(patched.state.turnIndex) || 0) + 1,
  };
  return { ...patched, state };
}

/**
 * Parse model output with at most one repair pass; validate scenePatch.
 * Does NOT invent dialogue on failure.
 * @param {string} rawText
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   output: import("./schema.js").ExperienceModelOutput|null,
 *   repaired: boolean,
 *   sceneState?: object,
 * }}
 */
export function parseAndReduceModelOutput(rawText, sceneState = {}) {
  const repaired = repairExperienceOutput(rawText);
  if (!repaired.ok || !repaired.value) {
    return {
      ok: false,
      errors: repaired.errors?.length ? repaired.errors : ["parse_failed"],
      output: null,
      repaired: Boolean(repaired.repaired),
    };
  }

  const patchResult = reduceScenePatch(sceneState, repaired.value.scenePatch);
  return {
    ok: true,
    errors: [...(repaired.errors || []), ...patchResult.errors],
    output: repaired.value,
    repaired: Boolean(repaired.repaired),
    sceneState: patchResult.state,
  };
}

export {
  normalizeExperienceOutput,
  repairExperienceOutput,
  SCENE_PATCH_WHITELIST,
  createEmptySceneState,
};
