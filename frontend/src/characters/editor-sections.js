/**
 * Structured editor sections for CharacterProfileV2 + private preference.
 * Private relationship fields never enter character export payloads.
 */

export const PRIVATE_PREFERENCE_KEYS = Object.freeze([
  "userIdentity",
  "relationship",
  "interaction",
  "boundaries",
  "preference",
  "privatePreference",
]);

export const EDITOR_SECTIONS = Object.freeze([
  {
    id: "identity",
    title: "身份",
    private: false,
    fields: ["name", "selfIdentity.genderIdentity", "selfIdentity.pronouns"],
  },
  {
    id: "persona",
    title: "人格与价值",
    private: false,
    fields: ["persona.personality", "persona.values", "persona.autonomy", "persona.ownBoundaries"],
  },
  {
    id: "relationship",
    title: "关系",
    private: true,
    fields: [
      "preference.userIdentity.callUserAs",
      "preference.relationship.type",
      "preference.interaction.supportStyle",
      "preference.interaction.flirtLevel",
      "preference.boundaries.userHardBoundaries",
    ],
  },
]);

export const UNSET_GENDER = "";
export const FLIRT_DEFAULT = "off";

export function parsePronouns(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isGenderUnset(value) {
  const raw = String(value || "").trim().toLowerCase();
  return !raw || raw === "unset" || raw === "暂不设定" || raw === "unspecified";
}

/**
 * Strip private user×character fields from a shareable character payload.
 * @param {object} record
 */
export function exportCharacterWithoutPrivate(record) {
  if (!record || typeof record !== "object") return {};
  const next = JSON.parse(JSON.stringify(record));
  for (const key of PRIVATE_PREFERENCE_KEYS) delete next[key];
  if (next.profileV2 && typeof next.profileV2 === "object") {
    for (const key of PRIVATE_PREFERENCE_KEYS) delete next.profileV2[key];
  }
  return next;
}

/**
 * Apply a structured identity/persona patch onto a working character record.
 * @param {object} working
 * @param {object} sectionPatch
 */
export function applyStructuredCharacterPatch(working, sectionPatch = {}) {
  const current = working && typeof working === "object" ? working : {};
  const patch = sectionPatch && typeof sectionPatch === "object" ? sectionPatch : {};
  const selfIdentity = {
    ...(current.selfIdentity || {}),
    ...(patch.selfIdentity || {}),
  };
  if (Object.hasOwn(patch, "genderIdentity")) {
    selfIdentity.genderIdentity = isGenderUnset(patch.genderIdentity) ? "" : String(patch.genderIdentity).trim();
  }
  if (Object.hasOwn(patch, "pronouns")) {
    selfIdentity.pronouns = parsePronouns(patch.pronouns);
  }
  const persona = {
    ...(current.persona || current.profileV2?.persona || {}),
    ...(patch.persona || {}),
  };
  return {
    ...current,
    ...(patch.name != null ? { name: String(patch.name) } : {}),
    selfIdentity,
    persona,
    profile: {
      ...(current.profile || {}),
      ...(patch.profile || {}),
      ...(Array.isArray(patch.ownBoundaries) ? { ownBoundaries: patch.ownBoundaries } : {}),
    },
  };
}
