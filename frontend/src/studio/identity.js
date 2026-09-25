/**
 * Character identity: relation modes, boundaries, speech, values.
 */

import { RELATION_MODES } from "./schema.js";

/**
 * @typedef {{
 *   displayName: string,
 *   alias?: string,
 *   summary: string,
 *   relationMode: string,
 *   customRelationLabel?: string,
 *   boundaries: string[],
 *   speechStyle: { tone: string, formality: string, quirks: string[] },
 *   values: string[],
 *   identityKey: string,
 * }} CharacterIdentity
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: CharacterIdentity } | { ok: false, reason: string, errors: string[] }}
 */
export function normalizeIdentity(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "identity_not_object", errors: ["identity required"] };
  }
  const errors = [];
  const o = /** @type {Record<string, unknown>} */ (raw);

  const displayName = String(o.displayName || o.name || "").trim();
  if (!displayName) errors.push("displayName required");

  const summary = String(o.summary || "").trim();
  if (!summary) errors.push("summary required");

  let relationMode = String(o.relationMode || "partner").trim();
  if (!RELATION_MODES.includes(relationMode)) {
    errors.push(`relationMode must be one of ${RELATION_MODES.join(",")}`);
    relationMode = "partner";
  }

  const boundaries = Array.isArray(o.boundaries)
    ? o.boundaries.map((b) => String(b).trim()).filter(Boolean)
    : [];
  if (!boundaries.length) errors.push("at least one boundary required");

  const speechRaw = o.speechStyle && typeof o.speechStyle === "object" ? o.speechStyle : {};
  const speechStyle = {
    tone: String(speechRaw.tone || "warm").trim() || "warm",
    formality: String(speechRaw.formality || "casual").trim() || "casual",
    quirks: Array.isArray(speechRaw.quirks)
      ? speechRaw.quirks.map((q) => String(q).trim()).filter(Boolean)
      : [],
  };

  const values = Array.isArray(o.values)
    ? o.values.map((v) => String(v).trim()).filter(Boolean)
    : [];
  if (!values.length) errors.push("at least one value required");

  const identityKey = String(o.identityKey || "").trim() || slugIdentityKey(displayName);

  if (errors.length) {
    return { ok: false, reason: "invalid_identity", errors };
  }

  return {
    ok: true,
    value: {
      displayName,
      alias: String(o.alias || "").trim() || undefined,
      summary,
      relationMode,
      customRelationLabel:
        relationMode === "custom"
          ? String(o.customRelationLabel || "").trim() || "custom"
          : undefined,
      boundaries,
      speechStyle,
      values,
      identityKey,
    },
  };
}

/**
 * Stable identity fingerprint used across desk pet / Pop / chat / scenario.
 * @param {CharacterIdentity} identity
 */
export function identityContractHash(identity) {
  const payload = [
    identity.identityKey,
    identity.displayName,
    identity.relationMode,
    identity.boundaries.join("|"),
    identity.values.join("|"),
    identity.speechStyle.tone,
    identity.speechStyle.formality,
  ].join("::");
  let h = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function slugIdentityKey(name) {
  const base = String(name || "character")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base.slice(0, 48) || "character";
}
