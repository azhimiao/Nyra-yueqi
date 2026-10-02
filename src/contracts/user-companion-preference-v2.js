/**
 * UserCompanionPreferenceV2 — private (userId, characterId) relationship contract (§5.2).
 * default/skipped are never rewritten to explicit. Boundary conflicts are resolved later
 * by policy (stricterBoundary is a documented no-op here).
 */

import {
  COMPANION_V2_LIMITS as L,
  checkBoolean,
  checkEnum,
  checkId,
  checkObject,
  checkPlainObject,
  checkSchemaAndRevision,
  checkString,
  checkStringArray,
  checkTimestamp,
  checkTopLevel,
  createExplicitValue,
  error,
  isExplicit,
  isPlainObject,
  nowIso,
  result,
  stricterBoundary,
  validateExplicitValue,
} from "./companion-v2-shared.js";

export { isExplicit, stricterBoundary };

export const USER_COMPANION_PREFERENCE_V2_SCHEMA_VERSION = 2;

export const FLIRT_LEVELS = Object.freeze(["off", "light", "open"]);
export const NUDGE_POLICIES = Object.freeze(["off", "gentle", "direct"]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "revision",
  "userId",
  "characterId",
  "userIdentity",
  "relationship",
  "interaction",
  "boundaries",
  "onboardingVersion",
  "createdAt",
  "updatedAt",
  "extensions",
]);

const FORBIDDEN = Object.freeze([
  "apiKey",
  "password",
  "billing",
  "wallet",
  "promptSystem",
  "promptDeveloper",
  "characterSystemSupplement",
  "persona",
]);

function evString(max) {
  return (value, path) => checkString(value, path, { max });
}

function evStringArray(max, maxItem) {
  return (value, path) => checkStringArray(value, path, { max, maxItem });
}

function evEnum(allowed) {
  return (value, path) => checkEnum(value, path, allowed);
}

function evBoolean() {
  return (value, path) => checkBoolean(value, path);
}

function evQuietHours(value, path) {
  if (!isPlainObject(value)) return [error("invalid_type", path)];
  const errors = [];
  for (const key of Object.keys(value)) {
    if (!["start", "end"].includes(key)) errors.push(error("unknown_field", `${path}.${key}`));
  }
  errors.push(...checkString(value.start, `${path}.start`, { max: L.quietHours }));
  errors.push(...checkString(value.end, `${path}.end`, { max: L.quietHours }));
  return errors;
}

function checkGroup(raw, path, fields) {
  if (raw === undefined) return [error("missing_field", path)];
  if (!isPlainObject(raw)) return [error("invalid_type", path)];
  const errors = [];
  for (const key of Object.keys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      errors.push(error("unknown_field", `${path}.${key}`));
    }
  }
  for (const [key, validateValue] of Object.entries(fields)) {
    errors.push(...validateExplicitValue(raw[key], `${path}.${key}`, validateValue));
  }
  return errors;
}

export function validateUserCompanionPreferenceV2(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED, FORBIDDEN),
    ...checkSchemaAndRevision(raw, USER_COMPANION_PREFERENCE_V2_SCHEMA_VERSION),
    ...checkId(raw.userId, "userId"),
    ...checkId(raw.characterId, "characterId"),
    ...checkTimestamp(raw.createdAt, "createdAt"),
    ...checkTimestamp(raw.updatedAt, "updatedAt"),
    ...checkPlainObject(raw.extensions, "extensions", false),
  ];
  if (raw.onboardingVersion === undefined) errors.push(error("missing_field", "onboardingVersion"));
  else if (!Number.isInteger(raw.onboardingVersion) || raw.onboardingVersion < 0) {
    errors.push(error("invalid_type", "onboardingVersion"));
  }

  errors.push(
    ...checkGroup(raw.userIdentity, "userIdentity", {
      preferredName: evString(L.preferredName),
      pronouns: evStringArray(8, L.pronounItem),
      callUserAs: evString(L.preferredName),
    }),
  );
  errors.push(
    ...checkGroup(raw.relationship, "relationship", {
      type: evString(200),
      startMode: evString(200),
      sharedHistory: evString(L.sharedHistory),
      purposes: evStringArray(L.preferenceListMax, L.preferenceListItem),
    }),
  );
  errors.push(
    ...checkGroup(raw.interaction, "interaction", {
      supportStyle: evString(200),
      initiativeStyle: evString(200),
      conflictRepairStyle: evString(200),
      intimacyStyle: evString(200),
      flirtLevel: evEnum(FLIRT_LEVELS),
      autonomyPreference: evString(200),
      nudgePolicy: evEnum(NUDGE_POLICIES),
    }),
  );
  errors.push(
    ...checkGroup(raw.boundaries, "boundaries", {
      allowProactive: evBoolean(),
      allowJealousExpression: evBoolean(),
      quietHours: evQuietHours,
      userHardBoundaries: evStringArray(L.preferenceListMax, L.preferenceListItem),
    }),
  );
  return result(errors);
}

function ev(value, fallback, source, clock) {
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, "value")) {
    return createExplicitValue(
      value.value,
      value.source,
      value.updatedAt,
    );
  }
  return createExplicitValue(value === undefined ? fallback : value, source, nowIso(clock));
}

export function createUserCompanionPreferenceV2(input = {}, opts = {}) {
  const src = isPlainObject(input) ? input : {};
  const identity = isPlainObject(src.userIdentity) ? src.userIdentity : {};
  const relationship = isPlainObject(src.relationship) ? src.relationship : {};
  const interaction = isPlainObject(src.interaction) ? src.interaction : {};
  const boundaries = isPlainObject(src.boundaries) ? src.boundaries : {};
  const createdAt = checkTimestamp(src.createdAt, "createdAt").length === 0 ? src.createdAt : nowIso(opts.clock);
  const updatedAt = checkTimestamp(src.updatedAt, "updatedAt").length === 0 ? src.updatedAt : createdAt;
  const quietFallback = { start: "22:00", end: "08:00" };

  return {
    schemaVersion: USER_COMPANION_PREFERENCE_V2_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    userId: String(src.userId || "").trim(),
    characterId: String(src.characterId || "").trim(),
    userIdentity: {
      preferredName: ev(identity.preferredName, "", "default", opts.clock),
      pronouns: ev(identity.pronouns, [], "default", opts.clock),
      callUserAs: ev(identity.callUserAs, "", "default", opts.clock),
    },
    relationship: {
      type: ev(relationship.type, "", "default", opts.clock),
      startMode: ev(relationship.startMode, "", "default", opts.clock),
      sharedHistory: ev(relationship.sharedHistory, "", "skipped", opts.clock),
      purposes: ev(relationship.purposes, [], "default", opts.clock),
    },
    interaction: {
      supportStyle: ev(interaction.supportStyle, "", "default", opts.clock),
      initiativeStyle: ev(interaction.initiativeStyle, "", "default", opts.clock),
      conflictRepairStyle: ev(interaction.conflictRepairStyle, "", "default", opts.clock),
      intimacyStyle: ev(interaction.intimacyStyle, "", "default", opts.clock),
      flirtLevel: ev(interaction.flirtLevel, "off", "default", opts.clock),
      autonomyPreference: ev(interaction.autonomyPreference, "", "default", opts.clock),
      nudgePolicy: ev(interaction.nudgePolicy, "off", "default", opts.clock),
    },
    boundaries: {
      allowProactive: ev(boundaries.allowProactive, false, "default", opts.clock),
      allowJealousExpression: ev(boundaries.allowJealousExpression, false, "default", opts.clock),
      quietHours: ev(boundaries.quietHours, quietFallback, "default", opts.clock),
      userHardBoundaries: ev(boundaries.userHardBoundaries, [], "default", opts.clock),
    },
    onboardingVersion: Number.isInteger(src.onboardingVersion) && src.onboardingVersion >= 0
      ? src.onboardingVersion
      : 1,
    createdAt,
    updatedAt,
    extensions: isPlainObject(src.extensions) ? { ...src.extensions } : {},
  };
}
