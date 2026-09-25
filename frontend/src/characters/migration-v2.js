import {
  migrateLegacyCharacterToProfileV2,
  validateCharacterProfileV2,
} from "../contracts/character-profile-v2.js";

const MAPPED_LEGACY_KEYS = new Set([
  "id",
  "characterId",
  "schemaVersion",
  "revision",
  "profileV2",
  "v2MigrationError",
  "name",
  "alias",
  "avatarUrl",
  "avatarMediaId",
  "profile",
  "petId",
  "loreEntryIds",
  "createdAt",
  "updatedAt",
  "source",
  "description",
  "persona",
  "selfIdentity",
  "personality",
  "values",
  "coreConflict",
  "autonomy",
  "voiceAndManner",
  "personaVoice",
  "ownBoundaries",
  "promptSystem",
  "promptDeveloper",
  "postHistoryInstructions",
  "scenario",
  "greeting",
  "firstMessage",
  "alternateGreetings",
  "exampleDialogue",
  "mesExample",
  "tags",
  "importedFormat",
  "importedAt",
  "rawSourceRef",
  "extensions",
  "skipOpeningIntro",
]);

const MAPPED_PROFILE_KEYS = new Set([
  "fields",
  "ranges",
  "tokens",
  "status",
  "promptSystem",
  "promptDeveloper",
  "postHistoryInstructions",
  "scenario",
  "firstMessage",
  "description",
  "personality",
  "anniversaryDate",
]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectUnknownFields(record) {
  const unknown = {};
  for (const [key, value] of Object.entries(record)) {
    if (!MAPPED_LEGACY_KEYS.has(key)) unknown[key] = value;
  }
  return unknown;
}

function collectUnknownProfileFields(profile) {
  if (!plainObject(profile)) return {};
  const unknown = {};
  for (const [key, value] of Object.entries(profile)) {
    if (!MAPPED_PROFILE_KEYS.has(key)) unknown[key] = value;
  }
  return unknown;
}

function validRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 1 ? revision : 1;
}

export function toCharacterProfileV2(record) {
  const legacy = plainObject(record) ? record : {};
  const migrated = migrateLegacyCharacterToProfileV2({
    ...legacy,
    revision: validRevision(legacy.revision),
  });
  const existingExtensions = plainObject(migrated.record.extensions)
    ? migrated.record.extensions
    : {};
  const legacyUnknownFields = collectUnknownFields(legacy);
  const legacyProfileUnknownFields = collectUnknownProfileFields(legacy.profile);
  const priorLegacyUnknownFields = plainObject(existingExtensions.legacyUnknownFields)
    ? existingExtensions.legacyUnknownFields
    : {};
  const priorLegacyProfileUnknownFields = plainObject(existingExtensions.legacyProfileUnknownFields)
    ? existingExtensions.legacyProfileUnknownFields
    : {};
  const profileV2 = {
    ...migrated.record,
    extensions: {
      ...existingExtensions,
      ...(Object.keys(legacyUnknownFields).length || Object.keys(priorLegacyUnknownFields).length
        ? { legacyUnknownFields: { ...priorLegacyUnknownFields, ...legacyUnknownFields } }
        : {}),
      ...(Object.keys(legacyProfileUnknownFields).length || Object.keys(priorLegacyProfileUnknownFields).length
        ? {
          legacyProfileUnknownFields: {
            ...priorLegacyProfileUnknownFields,
            ...legacyProfileUnknownFields,
          },
        }
        : {}),
    },
  };
  const validation = validateCharacterProfileV2(profileV2);
  if (!validation.ok) {
    const error = new Error("character_profile_v2_validation_failed");
    error.validationErrors = validation.errors;
    throw error;
  }
  return profileV2;
}

export function fromCharacterProfileV2(profileV2, legacyRecord = {}) {
  const legacy = plainObject(legacyRecord) ? legacyRecord : {};
  const legacyProfile = plainObject(legacy.profile) ? legacy.profile : {};
  const prompts = plainObject(profileV2?.prompts) ? profileV2.prompts : {};
  const presentation = plainObject(profileV2?.presentation) ? profileV2.presentation : {};
  const provenance = plainObject(profileV2?.provenance) ? profileV2.provenance : {};
  return {
    ...legacy,
    id: String(profileV2?.characterId || legacy.id || ""),
    name: typeof profileV2?.name === "string" ? profileV2.name : legacy.name,
    profile: {
      ...legacyProfile,
      promptSystem: typeof prompts.characterSystemSupplement === "string"
        ? prompts.characterSystemSupplement
        : legacyProfile.promptSystem,
      promptDeveloper: typeof prompts.characterDeveloperSupplement === "string"
        ? prompts.characterDeveloperSupplement
        : legacyProfile.promptDeveloper,
    },
    avatarUrl: legacy.avatarUrl ?? presentation.avatarMediaId ?? "",
    petId: legacy.petId ?? presentation.petId ?? "",
    loreEntryIds: Array.isArray(profileV2?.loreEntryIds)
      ? [...profileV2.loreEntryIds]
      : legacy.loreEntryIds,
    source: legacy.source ?? provenance.source ?? "user",
    createdAt: legacy.createdAt ?? profileV2?.createdAt,
    updatedAt: legacy.updatedAt ?? profileV2?.updatedAt,
  };
}

export function annotateCharacterV2(record) {
  const legacy = plainObject(record) ? record : {};
  const revision = validRevision(legacy.revision);
  try {
    const profileV2 = toCharacterProfileV2({ ...legacy, revision });
    const { v2MigrationError: _oldError, ...withoutOldError } = legacy;
    return {
      ...fromCharacterProfileV2(profileV2, withoutOldError),
      schemaVersion: 2,
      revision,
      profileV2,
    };
  } catch (error) {
    return {
      ...legacy,
      schemaVersion: 2,
      revision,
      v2MigrationError: {
        code: String(error?.message || "character_profile_v2_migration_failed"),
        errors: Array.isArray(error?.validationErrors) ? error.validationErrors : [],
      },
    };
  }
}
