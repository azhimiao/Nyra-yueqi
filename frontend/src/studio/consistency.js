/**
 * Consistency checks:
 * missing actions, wrong aspect, non-transparent bg, cross-identity asset mix → auto errors.
 */

import { MIN_ACTIONS, MIN_EXPRESSIONS } from "./appearance.js";
import { PREVIEW_ASPECTS, buildPreviewTargets } from "./preview.js";
import { ACTION_CONTEXTS } from "./schema.js";

/**
 * @param {{
 *   characterId: string,
 *   identityKey: string,
 *   appearance: import("./appearance.js").CharacterAppearance,
 *   actionVoiceMap: object,
 *   previewAspects?: Record<string, string>,
 * }} pack
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function runConsistencyChecks(pack) {
  const errors = [];
  const warnings = [];
  const characterId = String(pack.characterId || "").trim();
  const identityKey = String(pack.identityKey || "").trim();
  const appearance = pack.appearance;
  const map = pack.actionVoiceMap || {};

  if (!appearance) {
    return { ok: false, errors: ["appearance_missing"], warnings };
  }

  if ((appearance.actions || []).length < MIN_ACTIONS) {
    errors.push(`missing_actions:need_${MIN_ACTIONS}:have_${appearance.actions?.length || 0}`);
  }
  if ((appearance.expressions || []).length < MIN_EXPRESSIONS) {
    errors.push(
      `missing_expressions:need_${MIN_EXPRESSIONS}:have_${appearance.expressions?.length || 0}`,
    );
  }

  const actionIds = new Set((appearance.actions || []).map((a) => a.id));
  for (const ctx of ACTION_CONTEXTS) {
    const actionId = map[ctx]?.actionId;
    if (!actionId) errors.push(`missing_mapped_action:${ctx}`);
    else if (!actionIds.has(actionId)) errors.push(`mapped_action_absent:${ctx}:${actionId}`);
  }

  // Aspect ratio checks for preview targets
  const preview = buildPreviewTargets(pack.previewAspects || {});
  if (!preview.ok) errors.push(...preview.errors);

  // Asset-level aspect / transparency / cross-identity
  for (const action of appearance.actions || []) {
    if (action.aspect && !isKnownAspect(action.aspect)) {
      errors.push(`wrong_aspect:action:${action.id}:${action.aspect}`);
    }
    if (action.transparentBg === false) {
      errors.push(`non_transparent_bg:action:${action.id}`);
    }
    if (action.characterId && characterId && action.characterId !== characterId) {
      errors.push(`cross_identity_asset:action:${action.id}:${action.characterId}`);
    }
    if (
      identityKey &&
      action.assetRef &&
      looksLikeForeignIdentity(action.assetRef, identityKey, characterId)
    ) {
      errors.push(`cross_identity_asset_mix:action:${action.id}`);
    }
  }

  for (const expr of appearance.expressions || []) {
    if (expr.aspect && !isKnownAspect(expr.aspect)) {
      errors.push(`wrong_aspect:expression:${expr.id}:${expr.aspect}`);
    }
    if (expr.transparentBg === false) {
      errors.push(`non_transparent_bg:expression:${expr.id}`);
    }
    if (expr.characterId && characterId && expr.characterId !== characterId) {
      errors.push(`cross_identity_asset:expression:${expr.id}:${expr.characterId}`);
    }
    if (
      identityKey &&
      expr.assetRef &&
      looksLikeForeignIdentity(expr.assetRef, identityKey, characterId)
    ) {
      errors.push(`cross_identity_asset_mix:expression:${expr.id}`);
    }
  }

  // Fallback must stay in-package
  const fb = appearance.fallbackAssets || {};
  for (const [key, ref] of Object.entries(fb)) {
    if (
      identityKey &&
      ref &&
      looksLikeForeignIdentity(String(ref), identityKey, characterId)
    ) {
      errors.push(`cross_identity_fallback:${key}`);
    }
  }

  if (!appearance.voice?.defaultVoiceId) {
    errors.push("missing_voice_mapping");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function isKnownAspect(aspect) {
  const allowed = new Set([...Object.values(PREVIEW_ASPECTS), "1:1", "3:4", "4:3", "9:16", "16:9"]);
  return allowed.has(String(aspect));
}

/**
 * Heuristic: asset path embeds another character id / identity key.
 * @param {string} assetRef
 * @param {string} identityKey
 * @param {string} characterId
 */
function looksLikeForeignIdentity(assetRef, identityKey, characterId) {
  const ref = String(assetRef).toLowerCase();
  const selfKeys = [identityKey, characterId]
    .map((s) => String(s || "").toLowerCase())
    .filter(Boolean);

  // Explicit foreign character segment: characters/<other>/
  const m = ref.match(/characters\/([a-z0-9-]+)\//);
  if (m) {
    const owner = m[1];
    if (selfKeys.length && !selfKeys.some((k) => owner === k || owner.includes(k) || k.includes(owner))) {
      return true;
    }
  }

  // asset tagged with identity- that isn't ours
  const tag = ref.match(/identity-([a-z0-9-]+)/);
  if (tag && selfKeys.length && !selfKeys.includes(tag[1])) {
    return true;
  }

  return false;
}
