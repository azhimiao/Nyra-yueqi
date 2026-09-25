/**
 * CharacterProfileV2 — shareable character entity (master plan §5.1).
 * Does not contain user identity, relationship history, chat, memory, billing, or private prefs.
 */

import { mintId } from "./ids.js";
import {
  COMPANION_V2_LIMITS as L,
  checkEnum,
  checkId,
  checkObject,
  checkPlainObject,
  checkSchemaAndRevision,
  checkString,
  checkStringArray,
  checkTimestamp,
  checkTopLevel,
  error,
  isPlainObject,
  nowIso,
  result,
  utf8ByteLength,
} from "./companion-v2-shared.js";

export const CHARACTER_PROFILE_V2_SCHEMA_VERSION = 2;

export const CHARACTER_PROFILE_SOURCES = Object.freeze(["builtin", "user", "import"]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "characterId",
  "revision",
  "name",
  "selfIdentity",
  "persona",
  "prompts",
  "scenario",
  "greetings",
  "exampleDialogue",
  "tags",
  "loreEntryIds",
  "presentation",
  "provenance",
  "createdAt",
  "updatedAt",
  "rawSourceRef",
  "extensions",
]);

const FORBIDDEN = Object.freeze([
  "userId",
  "relationshipHistory",
  "relationship",
  "conversation",
  "conversations",
  "memory",
  "memories",
  "payment",
  "permissions",
  "privatePreference",
  "privatePreferences",
  "preference",
  "apiKey",
  "password",
  "billing",
  "wallet",
  "chatHistory",
  "messages",
  "session",
  "toolRuns",
]);

const SELF_IDENTITY_KEYS = Object.freeze([
  "genderIdentity",
  "pronouns",
  "speciesOrForm",
  "agePresentation",
  "occupationOrRole",
  "worldOrSetting",
]);

const PERSONA_KEYS = Object.freeze([
  "description",
  "personality",
  "values",
  "coreConflict",
  "autonomy",
  "voiceAndManner",
  "ownBoundaries",
]);

const PROMPT_KEYS = Object.freeze([
  "characterSystemSupplement",
  "characterDeveloperSupplement",
  "postHistoryInstructions",
]);

function nestedUnknown(obj, path, allowed) {
  if (!isPlainObject(obj)) return [];
  return Object.keys(obj)
    .filter((key) => !allowed.includes(key))
    .map((key) => error("unknown_field", `${path}.${key}`));
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : String(item ?? ""))) : [];
}

function characterTextBytes(record) {
  const identity = record.selfIdentity || {};
  const persona = record.persona || {};
  const prompts = record.prompts || {};
  const greetings = record.greetings || {};
  const chunks = [
    record.name,
    identity.genderIdentity,
    ...(Array.isArray(identity.pronouns) ? identity.pronouns : []),
    identity.speciesOrForm,
    identity.agePresentation,
    identity.occupationOrRole,
    identity.worldOrSetting,
    persona.description,
    persona.personality,
    ...(Array.isArray(persona.values) ? persona.values : []),
    persona.coreConflict,
    persona.autonomy,
    persona.voiceAndManner,
    ...(Array.isArray(persona.ownBoundaries) ? persona.ownBoundaries : []),
    prompts.characterSystemSupplement,
    prompts.characterDeveloperSupplement,
    prompts.postHistoryInstructions,
    record.scenario,
    greetings.primary,
    ...(Array.isArray(greetings.alternate) ? greetings.alternate : []),
    ...(Array.isArray(record.exampleDialogue) ? record.exampleDialogue : []),
  ];
  return chunks.reduce((sum, chunk) => sum + utf8ByteLength(typeof chunk === "string" ? chunk : ""), 0);
}

export function validateCharacterProfileV2(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED, FORBIDDEN),
    ...checkSchemaAndRevision(raw, CHARACTER_PROFILE_V2_SCHEMA_VERSION),
    ...checkId(raw.characterId, "characterId"),
    ...checkString(raw.name, "name", { max: L.name }),
    ...checkTimestamp(raw.createdAt, "createdAt"),
    ...checkTimestamp(raw.updatedAt, "updatedAt"),
    ...checkString(raw.scenario, "scenario", { required: false, max: L.scenario }),
    ...checkStringArray(raw.exampleDialogue, "exampleDialogue", {
      max: L.exampleDialogueMax,
    }),
    ...checkStringArray(raw.tags, "tags", { max: L.tagsMax, maxItem: L.tagItem }),
    ...checkStringArray(raw.loreEntryIds, "loreEntryIds", { max: L.loreEntryIdsMax, maxItem: 200 }),
    ...checkString(raw.rawSourceRef, "rawSourceRef", { required: false, max: 2000 }),
    ...checkPlainObject(raw.extensions, "extensions", false),
  ];

  if (Array.isArray(raw.exampleDialogue)) {
    const total = raw.exampleDialogue.reduce(
      (sum, item) => sum + (typeof item === "string" ? item.length : 0),
      0,
    );
    if (total > L.exampleDialogueChars) errors.push(error("oversized_field", "exampleDialogue"));
  }

  if (raw.selfIdentity === undefined) errors.push(error("missing_field", "selfIdentity"));
  else if (!isPlainObject(raw.selfIdentity)) errors.push(error("invalid_type", "selfIdentity"));
  else {
    errors.push(...nestedUnknown(raw.selfIdentity, "selfIdentity", SELF_IDENTITY_KEYS));
    for (const key of SELF_IDENTITY_KEYS) {
      if (key === "pronouns") {
        errors.push(
          ...checkStringArray(raw.selfIdentity.pronouns, "selfIdentity.pronouns", {
            required: false,
            max: L.pronounsMax,
            maxItem: L.pronounItem,
          }),
        );
      } else {
        errors.push(
          ...checkString(raw.selfIdentity[key], `selfIdentity.${key}`, {
            required: false,
            max: L.selfIdentityString,
          }),
        );
      }
    }
  }

  if (raw.persona === undefined) errors.push(error("missing_field", "persona"));
  else if (!isPlainObject(raw.persona)) errors.push(error("invalid_type", "persona"));
  else {
    errors.push(...nestedUnknown(raw.persona, "persona", PERSONA_KEYS));
    errors.push(...checkString(raw.persona.description, "persona.description", { max: L.personaText }));
    errors.push(...checkString(raw.persona.personality, "persona.personality", { max: L.personaText }));
    errors.push(...checkString(raw.persona.voiceAndManner, "persona.voiceAndManner", { max: L.personaText }));
    errors.push(...checkString(raw.persona.autonomy, "persona.autonomy", { max: L.autonomy }));
    errors.push(...checkString(raw.persona.coreConflict, "persona.coreConflict", { required: false, max: L.coreConflict }));
    errors.push(
      ...checkStringArray(raw.persona.values, "persona.values", {
        max: L.valuesMax,
        maxItem: L.valuesItem,
      }),
    );
    errors.push(
      ...checkStringArray(raw.persona.ownBoundaries, "persona.ownBoundaries", {
        max: L.ownBoundariesMax,
        maxItem: L.ownBoundariesItem,
      }),
    );
  }

  if (raw.prompts === undefined) errors.push(error("missing_field", "prompts"));
  else if (!isPlainObject(raw.prompts)) errors.push(error("invalid_type", "prompts"));
  else {
    errors.push(...nestedUnknown(raw.prompts, "prompts", PROMPT_KEYS));
    errors.push(
      ...checkString(raw.prompts.characterSystemSupplement, "prompts.characterSystemSupplement", {
        max: L.characterSystemSupplement,
      }),
    );
    errors.push(
      ...checkString(raw.prompts.characterDeveloperSupplement, "prompts.characterDeveloperSupplement", {
        max: L.characterDeveloperSupplement,
      }),
    );
    errors.push(
      ...checkString(raw.prompts.postHistoryInstructions, "prompts.postHistoryInstructions", {
        max: L.postHistoryInstructions,
      }),
    );
  }

  if (raw.greetings === undefined) errors.push(error("missing_field", "greetings"));
  else if (!isPlainObject(raw.greetings)) errors.push(error("invalid_type", "greetings"));
  else {
    errors.push(...nestedUnknown(raw.greetings, "greetings", ["primary", "alternate"]));
    errors.push(...checkString(raw.greetings.primary, "greetings.primary", { required: false, max: L.greetingItem }));
    errors.push(
      ...checkStringArray(raw.greetings.alternate, "greetings.alternate", {
        max: L.alternateGreetingsMax,
        maxItem: L.greetingItem,
      }),
    );
  }

  if (raw.presentation === undefined) errors.push(error("missing_field", "presentation"));
  else if (!isPlainObject(raw.presentation)) errors.push(error("invalid_type", "presentation"));
  else {
    errors.push(...nestedUnknown(raw.presentation, "presentation", ["avatarMediaId", "petId"]));
    errors.push(...checkString(raw.presentation.avatarMediaId, "presentation.avatarMediaId", { required: false, max: 500 }));
    errors.push(...checkString(raw.presentation.petId, "presentation.petId", { required: false, max: 200 }));
  }

  if (raw.provenance === undefined) errors.push(error("missing_field", "provenance"));
  else if (!isPlainObject(raw.provenance)) errors.push(error("invalid_type", "provenance"));
  else {
    errors.push(
      ...nestedUnknown(raw.provenance, "provenance", ["source", "importedFormat", "importedAt", "rawSourceRef"]),
    );
    errors.push(...checkEnum(raw.provenance.source, "provenance.source", CHARACTER_PROFILE_SOURCES));
    errors.push(...checkString(raw.provenance.importedFormat, "provenance.importedFormat", { required: false, max: 64 }));
    errors.push(...checkTimestamp(raw.provenance.importedAt, "provenance.importedAt", false));
    errors.push(...checkString(raw.provenance.rawSourceRef, "provenance.rawSourceRef", { required: false, max: 2000 }));
  }

  if (characterTextBytes(raw) > L.aggregateCharacterBytes) {
    errors.push(error("oversized_field", "$"));
  }

  return result(errors);
}

export function createCharacterProfileV2(input = {}, opts = {}) {
  const src = isPlainObject(input) ? input : {};
  const identity = isPlainObject(src.selfIdentity) ? src.selfIdentity : {};
  const persona = isPlainObject(src.persona) ? src.persona : {};
  const prompts = isPlainObject(src.prompts) ? src.prompts : {};
  const greetings = isPlainObject(src.greetings) ? src.greetings : {};
  const presentation = isPlainObject(src.presentation) ? src.presentation : {};
  const provenance = isPlainObject(src.provenance) ? src.provenance : {};
  const createdAt = checkTimestamp(src.createdAt, "createdAt").length === 0 ? src.createdAt : nowIso(opts.clock);
  const updatedAt = checkTimestamp(src.updatedAt, "updatedAt").length === 0 ? src.updatedAt : createdAt;
  const revision = Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1;
  const source = CHARACTER_PROFILE_SOURCES.includes(provenance.source)
    ? provenance.source
    : CHARACTER_PROFILE_SOURCES.includes(src.source)
      ? src.source
      : "user";

  return {
    schemaVersion: CHARACTER_PROFILE_V2_SCHEMA_VERSION,
    characterId: String(src.characterId || "").trim() || mintId("characterId"),
    revision,
    name: asString(src.name),
    selfIdentity: {
      genderIdentity: asString(identity.genderIdentity),
      pronouns: asStringArray(identity.pronouns),
      speciesOrForm: asString(identity.speciesOrForm),
      agePresentation: asString(identity.agePresentation),
      occupationOrRole: asString(identity.occupationOrRole),
      worldOrSetting: asString(identity.worldOrSetting),
    },
    persona: {
      description: asString(persona.description ?? src.description),
      personality: asString(persona.personality),
      values: asStringArray(persona.values),
      coreConflict: asString(persona.coreConflict),
      autonomy: asString(persona.autonomy),
      voiceAndManner: asString(persona.voiceAndManner),
      ownBoundaries: asStringArray(persona.ownBoundaries),
    },
    prompts: {
      characterSystemSupplement: asString(prompts.characterSystemSupplement),
      characterDeveloperSupplement: asString(prompts.characterDeveloperSupplement),
      postHistoryInstructions: asString(prompts.postHistoryInstructions),
    },
    scenario: asString(src.scenario),
    greetings: {
      primary: asString(greetings.primary),
      alternate: asStringArray(greetings.alternate),
    },
    exampleDialogue: asStringArray(src.exampleDialogue),
    tags: asStringArray(src.tags),
    loreEntryIds: asStringArray(src.loreEntryIds),
    presentation: {
      avatarMediaId: asString(presentation.avatarMediaId),
      petId: asString(presentation.petId),
    },
    provenance: {
      source,
      importedFormat: asString(provenance.importedFormat),
      importedAt: asString(provenance.importedAt) || undefined,
      rawSourceRef: asString(provenance.rawSourceRef || src.rawSourceRef) || undefined,
    },
    createdAt,
    updatedAt,
    rawSourceRef: asString(src.rawSourceRef) || undefined,
    extensions: isPlainObject(src.extensions) ? { ...src.extensions } : {},
  };
}

/**
 * Map existing normalizeCharacter-shaped records onto CharacterProfileV2.
 * Does not mutate the character store. Custom prompt bytes are copied as-is.
 */
export function migrateLegacyCharacterToProfileV2(legacy) {
  const notes = [];
  if (!isPlainObject(legacy)) {
    return {
      record: createCharacterProfileV2(),
      migrated: false,
      notes: ["legacy_not_object"],
    };
  }
  const profile = isPlainObject(legacy.profile) ? legacy.profile : {};
  const legacyPersona = isPlainObject(legacy.persona) ? legacy.persona : {};
  const promptSystem = typeof profile.promptSystem === "string"
    ? profile.promptSystem
    : typeof legacy.promptSystem === "string"
      ? legacy.promptSystem
      : "";
  const promptDeveloper = typeof profile.promptDeveloper === "string"
    ? profile.promptDeveloper
    : typeof legacy.promptDeveloper === "string"
      ? legacy.promptDeveloper
      : "";
  const description = asString(
    legacy.description
      ?? legacyPersona.description
      ?? (!isPlainObject(legacy.persona) ? legacy.persona : undefined)
      ?? profile.description
      ?? (Array.isArray(profile.fields) ? profile.fields[2] : ""),
  );
  if (promptSystem) notes.push("mapped profile.promptSystem → prompts.characterSystemSupplement");
  if (promptDeveloper) notes.push("mapped profile.promptDeveloper → prompts.characterDeveloperSupplement");
  if (description) notes.push("mapped description/persona → persona.description");
  if (legacy.id && !String(legacy.id).startsWith("chr_")) {
    notes.push("preserved legacy opaque characterId without chr_ prefix");
  }

  const source = CHARACTER_PROFILE_SOURCES.includes(legacy.source) ? legacy.source : "user";
  const record = createCharacterProfileV2({
    characterId: asString(legacy.characterId || legacy.id),
    name: asString(legacy.name),
    selfIdentity: isPlainObject(legacy.selfIdentity) ? legacy.selfIdentity : {},
    persona: {
      description,
      personality: asString(legacy.personality ?? legacyPersona.personality ?? profile.personality),
      values: asStringArray(legacy.values ?? legacyPersona.values),
      coreConflict: asString(legacy.coreConflict ?? legacyPersona.coreConflict),
      autonomy: asString(legacy.autonomy ?? legacyPersona.autonomy),
      voiceAndManner: asString(
        legacy.voiceAndManner
          ?? legacy.personaVoice
          ?? legacyPersona.voiceAndManner,
      ),
      ownBoundaries: asStringArray(legacy.ownBoundaries ?? legacyPersona.ownBoundaries),
    },
    prompts: {
      characterSystemSupplement: promptSystem,
      characterDeveloperSupplement: promptDeveloper,
      postHistoryInstructions: asString(legacy.postHistoryInstructions ?? profile.postHistoryInstructions),
    },
    scenario: asString(legacy.scenario ?? profile.scenario),
    greetings: {
      primary: asString(
        (isPlainObject(legacy.greetings) ? legacy.greetings.primary : "")
          || legacy.greeting
          || legacy.firstMessage
          || profile.firstMessage,
      ),
      alternate: asStringArray(
        (isPlainObject(legacy.greetings) ? legacy.greetings.alternate : null)
          || legacy.alternateGreetings,
      ),
    },
    exampleDialogue: asStringArray(legacy.exampleDialogue ?? legacy.mesExample),
    tags: asStringArray(legacy.tags),
    loreEntryIds: asStringArray(legacy.loreEntryIds),
    presentation: {
      avatarMediaId: asString(legacy.avatarUrl ?? legacy.avatarMediaId),
      petId: asString(legacy.petId),
    },
    provenance: {
      source,
      importedFormat: asString(legacy.importedFormat),
      importedAt: source === "import" ? asString(legacy.importedAt || legacy.createdAt) : "",
      rawSourceRef: asString(legacy.rawSourceRef),
    },
    createdAt: asString(legacy.createdAt),
    updatedAt: asString(legacy.updatedAt),
    extensions: isPlainObject(legacy.extensions) ? legacy.extensions : {},
  });

  return { record, migrated: true, notes };
}
