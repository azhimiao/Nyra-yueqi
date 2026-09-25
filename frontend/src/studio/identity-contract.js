/**
 * Cross-surface identity contract (desk pet / Pop / chat / scenario / notification).
 */

import { PREVIEW_TARGETS } from "./schema.js";
import { resolvePreviewFrame, assertNoIdentityDrift } from "./preview.js";
import { resolveAssetWithFallback, assertSameCharacterAsset } from "./asset-fallback.js";
import { resolveContextPresentation } from "./action-voice-map.js";

/**
 * Build identity-bound frames for all preview surfaces from an installed/built package.
 * @param {{
 *   characterId: string,
 *   identityKey: string,
 *   identityHash: string,
 *   manifest: { appearance: object, actionVoiceMap: object },
 * }} pack
 */
export function buildCrossSurfaceIdentityFrames(pack) {
  const characterId = String(pack.characterId || pack.manifest?.id || "");
  const identityKey = String(pack.identityKey || "");
  const identityHash = String(pack.identityHash || "");
  const portraitRef = pack.manifest?.appearance?.portraitRef || "";
  const chat = resolveContextPresentation(pack.manifest?.actionVoiceMap || {}, "chat");

  return PREVIEW_TARGETS.map((target) =>
    resolvePreviewFrame(
      {
        characterId,
        identityKey,
        identityHash,
        portraitRef,
        actionId: chat.actionId,
        expressionId: chat.expressionId,
      },
      target,
    ),
  );
}

/**
 * Contract test helper: no identity drift + same-character asset resolution.
 * @param {object} pack built/installed character package value
 * @param {{ foreignCharacterIds?: string[] }} [opts]
 */
export function runIdentityContract(pack, opts = {}) {
  const frames = buildCrossSurfaceIdentityFrames({
    characterId: pack.manifest?.id || pack.characterId,
    identityKey: pack.identityKey,
    identityHash: pack.identityHash,
    manifest: pack.manifest,
  });
  const drift = assertNoIdentityDrift(frames);
  if (!drift.ok) return drift;

  // Missing action must fall back within same character
  const missing = resolveAssetWithFallback({
    characterId: pack.manifest.id,
    appearance: pack.manifest.appearance,
    requested: { kind: "action", id: "__missing_action__" },
  });
  if (!missing.ok || !missing.degraded) {
    return { ok: false, reason: "fallback_not_degraded_for_missing_action" };
  }

  const same = assertSameCharacterAsset({
    characterId: pack.manifest.id,
    assetRef: missing.assetRef,
    foreignCharacterIds: opts.foreignCharacterIds || ["char-other", "xingli-foreign"],
  });
  if (!same.ok) return same;

  return {
    ok: true,
    identityHash: drift.identityHash,
    surfaces: drift.surfaces,
    fallback: missing,
  };
}
