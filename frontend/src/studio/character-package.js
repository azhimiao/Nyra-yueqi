/**
 * Assemble / validate a full Character Package from template or import.
 */

import { validateCharacterManifest, detectCharacterSchemaDrift, checkStudioSdkCompatibility } from "./schema.js";
import { normalizeIdentity, identityContractHash } from "./identity.js";
import { normalizeAppearance } from "./appearance.js";
import { normalizeActionVoiceMap } from "./action-voice-map.js";
import { normalizeMemoryPolicy } from "./memory-policy.js";
import { runConsistencyChecks } from "./consistency.js";
import { assertCharacterHasNoHiddenPrivileges } from "./privilege-gate.js";
import { buildPreviewTargets } from "./preview.js";

/**
 * @param {unknown} rawManifest
 * @param {{ assets?: Record<string, string> }} [opts]
 */
export function buildCharacterPackage(rawManifest, opts = {}) {
  const schema = validateCharacterManifest(rawManifest);
  if (!schema.ok) return schema;

  const drift = detectCharacterSchemaDrift(schema.value);
  if (!drift.ok) return drift;

  const compat = checkStudioSdkCompatibility(schema.value);
  if (!compat.ok) return compat;

  const privilege = assertCharacterHasNoHiddenPrivileges(rawManifest);
  if (!privilege.ok) return privilege;

  const identity = normalizeIdentity(schema.value.identity);
  if (!identity.ok) return identity;

  const appearance = normalizeAppearance(schema.value.appearance, {
    characterId: schema.value.id,
  });
  if (!appearance.ok) return appearance;

  const actionIds = new Set(appearance.value.actions.map((a) => a.id));
  const expressionIds = new Set(appearance.value.expressions.map((e) => e.id));
  const voiceIds = new Set([
    appearance.value.voice.defaultVoiceId,
    appearance.value.voice.fallbackVoiceId,
    ...Object.keys(appearance.value.voice.mapping),
    ...Object.values(appearance.value.voice.mapping),
  ]);

  const actionVoiceMap = normalizeActionVoiceMap(schema.value.actionVoiceMap, {
    actionIds,
    expressionIds,
    voiceIds,
  });
  if (!actionVoiceMap.ok) return actionVoiceMap;

  const memoryPolicy = normalizeMemoryPolicy(schema.value.memoryPolicy);
  if (!memoryPolicy.ok) return memoryPolicy;

  const relationPolicy = normalizeRelationPolicy(schema.value.relationPolicy);
  if (!relationPolicy.ok) return relationPolicy;

  const identityHash = identityContractHash(identity.value);
  const consistency = runConsistencyChecks({
    characterId: schema.value.id,
    identityKey: identity.value.identityKey,
    appearance: appearance.value,
    actionVoiceMap: actionVoiceMap.value,
    previewAspects: schema.value.previewAspects,
  });
  if (!consistency.ok) {
    return { ok: false, reason: "consistency_failed", errors: consistency.errors };
  }

  const preview = buildPreviewTargets(schema.value.previewAspects);

  return {
    ok: true,
    value: {
      manifest: {
        ...schema.value,
        identity: identity.value,
        appearance: appearance.value,
        actionVoiceMap: actionVoiceMap.value,
        memoryPolicy: memoryPolicy.value,
        relationPolicy: relationPolicy.value,
      },
      identityHash,
      identityKey: identity.value.identityKey,
      assets: opts.assets && typeof opts.assets === "object" ? opts.assets : {},
      previewTargets: preview.targets,
      consistency,
    },
  };
}

/**
 * @param {unknown} raw
 */
function normalizeRelationPolicy(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "relation_policy_not_object", errors: ["relationPolicy required"] };
  }
  const errors = [];
  const o = /** @type {Record<string, unknown>} */ (raw);
  const mode = String(o.defaultMode || o.mode || "partner").trim();
  const allowSceneWrites = o.allowSceneWrites !== false;
  const intimacyPace = String(o.intimacyPace || "gentle").trim();
  const topics = Array.isArray(o.openTopics)
    ? o.openTopics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (!mode) errors.push("defaultMode required");
  if (errors.length) return { ok: false, reason: "invalid_relation_policy", errors };
  return {
    ok: true,
    value: {
      defaultMode: mode,
      allowSceneWrites,
      intimacyPace,
      openTopics: topics,
      notes: String(o.notes || "").trim(),
    },
  };
}
