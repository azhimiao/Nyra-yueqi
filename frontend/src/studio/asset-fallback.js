/**
 * Missing assets → same-character safe fallback only (never other character).
 */

/**
 * @param {{
 *   characterId: string,
 *   appearance: import("./appearance.js").CharacterAppearance,
 *   requested: { kind: "action"|"expression"|"voice"|"portrait", id: string },
 * }} input
 * @returns {{
 *   ok: true,
 *   assetRef: string,
 *   degraded: boolean,
 *   fallbackKind: string|null,
 *   characterId: string,
 * } | { ok: false, reason: string }}
 */
export function resolveAssetWithFallback(input) {
  const characterId = String(input.characterId || "").trim();
  const appearance = input.appearance;
  const kind = input.requested?.kind;
  const id = String(input.requested?.id || "").trim();

  if (!characterId || !appearance) {
    return { ok: false, reason: "missing_character_or_appearance" };
  }

  if (kind === "portrait") {
    return {
      ok: true,
      assetRef: appearance.fallbackAssets.portrait || appearance.portraitRef,
      degraded: false,
      fallbackKind: null,
      characterId,
    };
  }

  if (kind === "action") {
    const hit = (appearance.actions || []).find((a) => a.id === id);
    if (hit) {
      return {
        ok: true,
        assetRef: hit.assetRef,
        degraded: false,
        fallbackKind: null,
        characterId,
      };
    }
    const idle =
      (appearance.actions || []).find((a) => a.id === appearance.actionStateMachine.initial) ||
      appearance.actions?.[0];
    const ref = appearance.fallbackAssets.idle || idle?.assetRef || appearance.portraitRef;
    if (!ref) return { ok: false, reason: "no_same_character_fallback" };
    return {
      ok: true,
      assetRef: ref,
      degraded: true,
      fallbackKind: "same_character_idle",
      characterId,
    };
  }

  if (kind === "expression") {
    const hit = (appearance.expressions || []).find((e) => e.id === id);
    if (hit) {
      return {
        ok: true,
        assetRef: hit.assetRef,
        degraded: false,
        fallbackKind: null,
        characterId,
      };
    }
    const neutral =
      (appearance.expressions || []).find((e) => e.id === "neutral") || appearance.expressions?.[0];
    const ref = neutral?.assetRef || appearance.fallbackAssets.portrait || appearance.portraitRef;
    if (!ref) return { ok: false, reason: "no_same_character_fallback" };
    return {
      ok: true,
      assetRef: ref,
      degraded: true,
      fallbackKind: "same_character_expression",
      characterId,
    };
  }

  if (kind === "voice") {
    const mapped = appearance.voice?.mapping?.[id];
    if (mapped) {
      return {
        ok: true,
        assetRef: mapped,
        degraded: false,
        fallbackKind: null,
        characterId,
      };
    }
    const ref =
      appearance.voice?.fallbackVoiceId ||
      appearance.fallbackAssets.silentVoice ||
      appearance.voice?.defaultVoiceId;
    if (!ref) return { ok: false, reason: "no_same_character_fallback" };
    return {
      ok: true,
      assetRef: ref,
      degraded: true,
      fallbackKind: "same_character_voice",
      characterId,
    };
  }

  return { ok: false, reason: "unknown_asset_kind" };
}

/**
 * Hard rule: resolved asset must belong to the same characterId — never swap packages.
 * @param {{ characterId: string, assetRef: string, foreignCharacterIds?: string[] }} input
 */
export function assertSameCharacterAsset(input) {
  const characterId = String(input.characterId || "").trim();
  const assetRef = String(input.assetRef || "").toLowerCase();
  const foreign = (input.foreignCharacterIds || []).map((id) => String(id).toLowerCase());

  for (const other of foreign) {
    if (!other || other === characterId.toLowerCase()) continue;
    if (assetRef.includes(`/characters/${other}/`) || assetRef.includes(`identity-${other}`)) {
      return { ok: false, reason: "cross_character_fallback_forbidden", other };
    }
  }
  return { ok: true };
}
