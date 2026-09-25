/**
 * First Light V2 state machine (Task 3.1).
 * Quick / Careful / Import with field explicitness. Parallel to v1 `state.js`.
 * Pure functions only; persistence lives in controller-v2.js.
 *
 * Every answer slot is `{ value, source: explicit|default|skipped|import_review, updatedAt }`.
 */

import {
  EXPLICIT_VALUE_SOURCES,
  createExplicitValue,
  isExplicit,
  isIsoTimestamp,
  isPlainObject,
  nowIso,
} from "../contracts/companion-v2-shared.js";

export { EXPLICIT_VALUE_SOURCES, isExplicit };

export const FIRST_LIGHT_V2_SCHEMA_VERSION = 2;
export const FL_V2_SCHEMA_VERSION = FIRST_LIGHT_V2_SCHEMA_VERSION;

export const FL_V2_PATHS = Object.freeze(["quick", "careful", "import"]);

export const FL_V2_STAGES = Object.freeze([
  "BOOT",
  "WELCOME",
  "PATH_SELECT",
  "IDENTITY",
  "USER_ADDRESS",
  "RELATIONSHIP",
  "PURPOSES",
  "SUPPORT_INITIATIVE",
  "CAREFUL_STYLES",
  "BOUNDARIES",
  "IMPORT_REVIEW",
  "PREVIEW",
  "COMMIT",
  "FIRST_MESSAGE",
  "COMPLETED",
  "PAUSED",
  "ERROR",
]);

export const FL_V2_EVENTS = Object.freeze([
  "SELECT_PATH",
  "SET_FIELD",
  "SKIP_FIELD",
  "NEXT",
  "BACK",
  "PAUSE",
  "RESUME",
  "RESTART",
  "FAIL",
  "COMMIT_OK",
]);

export const FL_V2_FIELD_PATHS = Object.freeze([
  "character.name",
  "character.genderIdentity",
  "character.pronouns",
  "preference.callUserAs",
  "preference.userPronouns",
  "preference.relationshipType",
  "preference.relationshipStart",
  "preference.sharedHistory",
  "preference.purposes",
  "preference.supportStyle",
  "preference.initiativeStyle",
  "preference.conflictStyle",
  "preference.intimacyStyle",
  "preference.flirtLevel",
  "preference.autonomyPreference",
  "preference.nudgePolicy",
  "preference.allowProactive",
  "preference.allowJealousy",
  "preference.quietHours",
  "preference.hardBoundaries",
  "preference.autoDiary",
  "preference.autoMoments",
  "preference.values",
]);

const FIELD_ALIASES = Object.freeze({
  characterName: "character.name",
  characterGender: "character.genderIdentity",
  genderIdentity: "character.genderIdentity",
  characterPronouns: "character.pronouns",
  pronouns: "character.pronouns",
  values: "preference.values",
  jealousy: "preference.allowJealousy",
  callUserAs: "preference.callUserAs",
  userPronouns: "preference.userPronouns",
  relationshipType: "preference.relationshipType",
  relationshipStart: "preference.relationshipStart",
  sharedHistory: "preference.sharedHistory",
  purposes: "preference.purposes",
  supportStyle: "preference.supportStyle",
  initiativeStyle: "preference.initiativeStyle",
  conflictStyle: "preference.conflictStyle",
  intimacyStyle: "preference.intimacyStyle",
  flirtLevel: "preference.flirtLevel",
  autonomyPreference: "preference.autonomyPreference",
  nudgePolicy: "preference.nudgePolicy",
  allowProactive: "preference.allowProactive",
  allowJealousy: "preference.allowJealousy",
  quietHours: "preference.quietHours",
  hardBoundaries: "preference.hardBoundaries",
  autoDiary: "preference.autoDiary",
  autoMoments: "preference.autoMoments",
  "user.callUserAs": "preference.callUserAs",
  "user.pronouns": "preference.userPronouns",
  "relationship.type": "preference.relationshipType",
  "relationship.purposes": "preference.purposes",
  "relationship.sharedHistory": "preference.sharedHistory",
  "interaction.supportStyle": "preference.supportStyle",
  "interaction.initiativeStyle": "preference.initiativeStyle",
  "interaction.conflictRepairStyle": "preference.conflictStyle",
  "interaction.intimacyStyle": "preference.intimacyStyle",
  "interaction.flirtLevel": "preference.flirtLevel",
  "interaction.autonomyPreference": "preference.autonomyPreference",
  "interaction.nudgePolicy": "preference.nudgePolicy",
  "boundaries.allowProactive": "preference.allowProactive",
  "boundaries.allowJealousExpression": "preference.allowJealousy",
  "boundaries.quietHours": "preference.quietHours",
  "boundaries.userHardBoundaries": "preference.hardBoundaries",
  "boundaries.autoDiary": "preference.autoDiary",
  "boundaries.autoMoments": "preference.autoMoments",
});

const QUIET_HOURS_DEFAULT = Object.freeze({ start: "22:00", end: "08:00" });

const CONSERVATIVE = Object.freeze({
  "character.name": "",
  "character.genderIdentity": null,
  "character.pronouns": Object.freeze([]),
  "preference.callUserAs": "",
  "preference.userPronouns": Object.freeze([]),
  "preference.relationshipType": "",
  "preference.relationshipStart": "",
  "preference.sharedHistory": "",
  "preference.purposes": Object.freeze([]),
  "preference.supportStyle": "",
  "preference.initiativeStyle": "",
  "preference.conflictStyle": "gentle",
  "preference.intimacyStyle": "warm",
  "preference.flirtLevel": "off",
  "preference.autonomyPreference": "balanced",
  "preference.nudgePolicy": "off",
  "preference.allowProactive": false,
  "preference.allowJealousy": false,
  "preference.quietHours": QUIET_HOURS_DEFAULT,
  "preference.hardBoundaries": Object.freeze([]),
  "preference.autoDiary": false,
  "preference.autoMoments": false,
  "preference.values": Object.freeze([]),
});

const SKIP_VALUES = Object.freeze({
  ...CONSERVATIVE,
  "preference.relationshipType": "undefined",
  "preference.purposes": Object.freeze(["unsure"]),
  "preference.supportStyle": "judge",
  "preference.initiativeStyle": "wait",
});

const SENSITIVE_OFF = Object.freeze(["off", "unset", "unspecified", "skipped"]);
const ASSUMED_GENDERS = Object.freeze(["male", "female", "man", "woman", "男", "女"]);

const PATH_FLOW = Object.freeze({
  quick: Object.freeze([
    "BOOT",
    "WELCOME",
    "PATH_SELECT",
    "IDENTITY",
    "USER_ADDRESS",
    "RELATIONSHIP",
    "PURPOSES",
    "SUPPORT_INITIATIVE",
    "BOUNDARIES",
    "PREVIEW",
    "COMMIT",
    "FIRST_MESSAGE",
    "COMPLETED",
  ]),
  careful: Object.freeze([
    "BOOT",
    "WELCOME",
    "PATH_SELECT",
    "IDENTITY",
    "USER_ADDRESS",
    "RELATIONSHIP",
    "PURPOSES",
    "SUPPORT_INITIATIVE",
    "CAREFUL_STYLES",
    "BOUNDARIES",
    "PREVIEW",
    "COMMIT",
    "FIRST_MESSAGE",
    "COMPLETED",
  ]),
  import: Object.freeze([
    "BOOT",
    "WELCOME",
    "PATH_SELECT",
    "IMPORT_REVIEW",
    "USER_ADDRESS",
    "RELATIONSHIP",
    "PURPOSES",
    "BOUNDARIES",
    "PREVIEW",
    "COMMIT",
    "FIRST_MESSAGE",
    "COMPLETED",
  ]),
});

const PREFIX_FLOW = Object.freeze(["BOOT", "WELCOME", "PATH_SELECT"]);

const ASKED_BY_PATH = Object.freeze({
  quick: Object.freeze([
    "character.name",
    "character.genderIdentity",
    "character.pronouns",
    "preference.callUserAs",
    "preference.userPronouns",
    "preference.relationshipType",
    "preference.relationshipStart",
    "preference.purposes",
    "preference.supportStyle",
    "preference.initiativeStyle",
    "preference.allowProactive",
    "preference.quietHours",
    "preference.hardBoundaries",
  ]),
  careful: Object.freeze(FL_V2_FIELD_PATHS),
  import: Object.freeze([
    "preference.callUserAs",
    "preference.userPronouns",
    "preference.relationshipType",
    "preference.relationshipStart",
    "preference.purposes",
    "preference.allowProactive",
    "preference.quietHours",
    "preference.hardBoundaries",
  ]),
});

function stamp(event, clock) {
  if (event && isIsoTimestamp(event.at)) return event.at;
  return nowIso(clock);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function copyValue(value) {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return value;
}

function asEv(raw, fallback, source, at) {
  if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, "value")) {
    const src = EXPLICIT_VALUE_SOURCES.includes(raw.source) ? raw.source : source;
    return createExplicitValue(raw.value, src, raw.updatedAt || at);
  }
  return createExplicitValue(raw === undefined ? fallback : raw, source, at);
}

export function stagesForPath(path) {
  return PATH_FLOW[path] ? [...PATH_FLOW[path]] : [];
}

export function isUnset(field) {
  return !field || field.source === "default";
}

export function isSkipped(field) {
  return field?.source === "skipped";
}

export function isAnswered(field) {
  return field?.source === "explicit"
    || field?.source === "skipped"
    || field?.source === "import_review";
}

function isEnabledValue(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return Boolean(trimmed) && !SENSITIVE_OFF.includes(trimmed);
  }
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/**
 * Sensitive behaviour is on only when the user explicitly opted in.
 * `default` / `skipped` / `import_review` never enable.
 * Accepts `(slot)` or `(draft, key)`.
 */
export function isSensitiveEnabled(draftOrField, key) {
  const field = arguments.length >= 2 ? getField(draftOrField, key) : draftOrField;
  return field?.source === "explicit" && isEnabledValue(field.value);
}

/**
 * required/unset/skipped are distinct. `default` is treated as unset (not a user answer).
 */
export function fieldPresence(draft, field) {
  const slot = getField(draft, field);
  if (!slot || typeof slot !== "object" || !Object.prototype.hasOwnProperty.call(slot, "value")) return "unset";
  if (slot.source === "skipped") return "skipped";
  if (slot.source === "default") return "unset";
  return "set";
}

export function createEmptyDraftV2(clock) {
  const at = nowIso(clock);
  return {
    character: {
      name: createExplicitValue(CONSERVATIVE["character.name"], "default", at),
      genderIdentity: createExplicitValue(CONSERVATIVE["character.genderIdentity"], "default", at),
      pronouns: createExplicitValue(copyValue(CONSERVATIVE["character.pronouns"]), "default", at),
    },
    preference: {
      callUserAs: createExplicitValue(CONSERVATIVE["preference.callUserAs"], "default", at),
      userPronouns: createExplicitValue(copyValue(CONSERVATIVE["preference.userPronouns"]), "default", at),
      relationshipType: createExplicitValue(CONSERVATIVE["preference.relationshipType"], "default", at),
      relationshipStart: createExplicitValue(CONSERVATIVE["preference.relationshipStart"], "default", at),
      sharedHistory: createExplicitValue(CONSERVATIVE["preference.sharedHistory"], "default", at),
      purposes: createExplicitValue(copyValue(CONSERVATIVE["preference.purposes"]), "default", at),
      supportStyle: createExplicitValue(CONSERVATIVE["preference.supportStyle"], "default", at),
      initiativeStyle: createExplicitValue(CONSERVATIVE["preference.initiativeStyle"], "default", at),
      conflictStyle: createExplicitValue(CONSERVATIVE["preference.conflictStyle"], "default", at),
      intimacyStyle: createExplicitValue(CONSERVATIVE["preference.intimacyStyle"], "default", at),
      flirtLevel: createExplicitValue(CONSERVATIVE["preference.flirtLevel"], "default", at),
      autonomyPreference: createExplicitValue(CONSERVATIVE["preference.autonomyPreference"], "default", at),
      nudgePolicy: createExplicitValue(CONSERVATIVE["preference.nudgePolicy"], "default", at),
      allowProactive: createExplicitValue(CONSERVATIVE["preference.allowProactive"], "default", at),
      allowJealousy: createExplicitValue(CONSERVATIVE["preference.allowJealousy"], "default", at),
      quietHours: createExplicitValue(copyValue(CONSERVATIVE["preference.quietHours"]), "default", at),
      hardBoundaries: createExplicitValue(copyValue(CONSERVATIVE["preference.hardBoundaries"]), "default", at),
      autoDiary: createExplicitValue(CONSERVATIVE["preference.autoDiary"], "default", at),
      autoMoments: createExplicitValue(CONSERVATIVE["preference.autoMoments"], "default", at),
      values: createExplicitValue(copyValue(CONSERVATIVE["preference.values"]), "default", at),
    },
    importedCharacterId: "",
    importDisposition: "create",
  };
}

export function createDefaultStateV2(clock) {
  const at = nowIso(clock);
  return {
    schemaVersion: FIRST_LIGHT_V2_SCHEMA_VERSION,
    stage: "BOOT",
    path: "",
    paused: false,
    done: false,
    draft: createEmptyDraftV2(clock),
    errorMessage: "",
    resumeStage: "",
    committedCharacterId: "",
    updatedAt: at,
  };
}

export function createDefaultFirstLightStateV2(opts = {}) {
  return createDefaultStateV2(opts.clock || opts);
}

function normalizeDraft(raw, clock) {
  const src = isPlainObject(raw) ? raw : {};
  const character = isPlainObject(src.character) ? src.character : {};
  const preference = isPlainObject(src.preference) ? src.preference : {};
  const at = nowIso(clock);
  return {
    character: {
      name: asEv(character.name, CONSERVATIVE["character.name"], "default", at),
      genderIdentity: asEv(character.genderIdentity, CONSERVATIVE["character.genderIdentity"], "default", at),
      pronouns: asEv(character.pronouns, copyValue(CONSERVATIVE["character.pronouns"]), "default", at),
    },
    preference: {
      callUserAs: asEv(preference.callUserAs, CONSERVATIVE["preference.callUserAs"], "default", at),
      userPronouns: asEv(preference.userPronouns, copyValue(CONSERVATIVE["preference.userPronouns"]), "default", at),
      relationshipType: asEv(preference.relationshipType, CONSERVATIVE["preference.relationshipType"], "default", at),
      relationshipStart: asEv(preference.relationshipStart, CONSERVATIVE["preference.relationshipStart"], "default", at),
      sharedHistory: asEv(preference.sharedHistory, CONSERVATIVE["preference.sharedHistory"], "default", at),
      purposes: asEv(preference.purposes, copyValue(CONSERVATIVE["preference.purposes"]), "default", at),
      supportStyle: asEv(preference.supportStyle, CONSERVATIVE["preference.supportStyle"], "default", at),
      initiativeStyle: asEv(preference.initiativeStyle, CONSERVATIVE["preference.initiativeStyle"], "default", at),
      conflictStyle: asEv(preference.conflictStyle, CONSERVATIVE["preference.conflictStyle"], "default", at),
      intimacyStyle: asEv(preference.intimacyStyle, CONSERVATIVE["preference.intimacyStyle"], "default", at),
      flirtLevel: asEv(preference.flirtLevel, CONSERVATIVE["preference.flirtLevel"], "default", at),
      autonomyPreference: asEv(preference.autonomyPreference, CONSERVATIVE["preference.autonomyPreference"], "default", at),
      nudgePolicy: asEv(preference.nudgePolicy, CONSERVATIVE["preference.nudgePolicy"], "default", at),
      allowProactive: asEv(preference.allowProactive, CONSERVATIVE["preference.allowProactive"], "default", at),
      allowJealousy: asEv(preference.allowJealousy, CONSERVATIVE["preference.allowJealousy"], "default", at),
      quietHours: asEv(preference.quietHours, copyValue(CONSERVATIVE["preference.quietHours"]), "default", at),
      hardBoundaries: asEv(preference.hardBoundaries, copyValue(CONSERVATIVE["preference.hardBoundaries"]), "default", at),
      autoDiary: asEv(preference.autoDiary, CONSERVATIVE["preference.autoDiary"], "default", at),
      autoMoments: asEv(preference.autoMoments, CONSERVATIVE["preference.autoMoments"], "default", at),
      values: asEv(preference.values, copyValue(CONSERVATIVE["preference.values"]), "default", at),
    },
    importedCharacterId: String(src.importedCharacterId || ""),
    importDisposition: src.importDisposition === "overwrite" ? "overwrite" : "create",
  };
}

export function normalizeStateV2(raw = {}, clock) {
  const base = createDefaultStateV2(clock);
  const src = isPlainObject(raw) ? raw : {};
  const path = FL_V2_PATHS.includes(src.path) ? src.path : "";
  const stage = FL_V2_STAGES.includes(src.stage) ? src.stage : "BOOT";
  const resumeStage = FL_V2_STAGES.includes(src.resumeStage) ? src.resumeStage : "";
  return {
    ...base,
    schemaVersion: FIRST_LIGHT_V2_SCHEMA_VERSION,
    stage,
    path,
    paused: Boolean(src.paused),
    done: Boolean(src.done),
    draft: normalizeDraft(src.draft, clock),
    errorMessage: String(src.errorMessage || "").slice(0, 500),
    resumeStage,
    committedCharacterId: String(src.committedCharacterId || ""),
    importedCharacterId: String(src.importedCharacterId || src.draft?.importedCharacterId || ""),
    updatedAt: isIsoTimestamp(src.updatedAt) ? src.updatedAt : base.updatedAt,
  };
}

function resolvePath(name) {
  const key = String(name || "").trim();
  if (!key) return "";
  if (key === "importedCharacterId" || key === "importDisposition") return key;
  if (FIELD_ALIASES[key]) return FIELD_ALIASES[key];
  if (FL_V2_FIELD_PATHS.includes(key)) return key;
  return "";
}

export function getField(stateOrDraft, name) {
  const path = resolvePath(name);
  const draft = isPlainObject(stateOrDraft?.draft) ? stateOrDraft.draft : stateOrDraft;
  if (!isPlainObject(draft) || !path) return null;
  if (path === "importedCharacterId") return draft.importedCharacterId;
  if (path === "importDisposition") return draft.importDisposition;
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), draft) ?? null;
}

function writePath(draft, path, field) {
  const keys = path.split(".");
  let cur = draft;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = field;
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isConfirmed(field) {
  return field?.source === "explicit" || field?.source === "import_review";
}

function sameFieldValue(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

function purposesOk(field) {
  if (field?.source === "skipped") return true;
  if (field?.source === "explicit" || field?.source === "import_review") {
    return Array.isArray(field.value) && field.value.length > 0;
  }
  return false;
}

function nameOk(field) {
  if (field?.source === "skipped") return true;
  if (field?.source === "explicit" || field?.source === "import_review") {
    return field.value === "unset_named" || nonEmptyText(field.value);
  }
  return false;
}

function genderOk(field) {
  if (field?.source === "skipped") return true;
  if (field?.source === "explicit" || field?.source === "import_review") {
    if (field.value === "unset" || field.value === "unset_named") return true;
    if (Array.isArray(field.value) && field.value.length > 0) return true;
    return nonEmptyText(field.value);
  }
  return false;
}

function flowFor(state) {
  return PATH_FLOW[state.path] || PREFIX_FLOW;
}

function neighbor(state, delta) {
  const flow = flowFor(state);
  const index = flow.indexOf(state.stage);
  if (index < 0) return delta < 0 ? "BOOT" : state.stage;
  const nextIndex = index + delta;
  if (nextIndex < 0) return flow[0];
  if (nextIndex >= flow.length) return flow[flow.length - 1];
  return flow[nextIndex];
}

export function canAdvance(state) {
  const current = normalizeStateV2(state);
  const { stage, draft, path } = current;
  if (stage === "PAUSED" || stage === "ERROR" || stage === "COMPLETED") {
    return false;
  }
  if (stage === "BOOT" || stage === "WELCOME") return true;
  if (stage === "PATH_SELECT") return FL_V2_PATHS.includes(path);
  if (stage === "IMPORT_REVIEW") return Boolean(String(draft.importedCharacterId || "").trim());
  if (stage === "IDENTITY") {
    return nameOk(draft.character.name) && genderOk(draft.character.genderIdentity);
  }
  if (stage === "USER_ADDRESS") return nameOk(draft.preference.callUserAs);
  if (stage === "RELATIONSHIP") return isAnswered(draft.preference.relationshipType);
  if (stage === "PURPOSES") return purposesOk(draft.preference.purposes);
  if (stage === "SUPPORT_INITIATIVE") {
    return isAnswered(draft.preference.supportStyle) && isAnswered(draft.preference.initiativeStyle);
  }
  if (stage === "CAREFUL_STYLES") return true;
  if (stage === "BOUNDARIES") {
    return isConfirmed(draft.preference.quietHours)
      && isConfirmed(draft.preference.hardBoundaries);
  }
  if (stage === "PREVIEW" || stage === "FIRST_MESSAGE" || stage === "COMMIT") return true;
  return false;
}

function applyUnaskedDefaults(draft, path, at) {
  const asked = new Set(ASKED_BY_PATH[path] || []);
  for (const fieldPath of FL_V2_FIELD_PATHS) {
    if (asked.has(fieldPath)) continue;
    const current = fieldPath.split(".").reduce((acc, key) => acc?.[key], draft);
    if (isAnswered(current)) continue;
    writePath(draft, fieldPath, createExplicitValue(copyValue(CONSERVATIVE[fieldPath]), "default", at));
  }
  return draft;
}

export function draftToPreferenceInput(draft) {
  const preference = isPlainObject(draft?.preference) ? draft.preference : {};
  return {
    userIdentity: {
      preferredName: preference.callUserAs,
      pronouns: preference.userPronouns,
      callUserAs: preference.callUserAs,
    },
    relationship: {
      type: preference.relationshipType,
      startMode: preference.relationshipStart,
      sharedHistory: preference.sharedHistory,
      purposes: preference.purposes,
    },
    interaction: {
      supportStyle: preference.supportStyle,
      initiativeStyle: preference.initiativeStyle,
      conflictRepairStyle: preference.conflictStyle,
      intimacyStyle: preference.intimacyStyle,
      flirtLevel: preference.flirtLevel,
      autonomyPreference: preference.autonomyPreference,
      nudgePolicy: preference.nudgePolicy,
    },
    boundaries: {
      allowProactive: preference.allowProactive,
      allowJealousExpression: preference.allowJealousy,
      quietHours: preference.quietHours,
      userHardBoundaries: preference.hardBoundaries,
    },
  };
}

export function draftToCharacterInput(draft) {
  const character = isPlainObject(draft?.character) ? draft.character : {};
  const preference = isPlainObject(draft?.preference) ? draft.preference : {};
  return {
    name: character.name,
    selfIdentity: {
      genderIdentity: character.genderIdentity,
      pronouns: character.pronouns,
    },
    persona: {
      // Values are Character Formation Input. They must not be lost merely
      // because relationship and autonomy fields are stored elsewhere.
      values: preference.values,
    },
  };
}

export function genderAssumption(field) {
  if (!isExplicit(field)) return null;
  if (!nonEmptyText(field.value)) return null;
  const token = String(field.value).trim().toLowerCase();
  if (ASSUMED_GENDERS.includes(token)) return token;
  return String(field.value).trim();
}

function selectPath(state, event, at) {
  if (state.stage === "COMPLETED" || state.stage === "COMMIT") return state;
  const path = String(event.path || "").trim();
  if (!FL_V2_PATHS.includes(path)) return state;
  const next = cloneJson(state);
  next.path = path;
  next.draft = applyUnaskedDefaults(next.draft, path, at);
  if (path === "import") {
    const importedId = String(event.importedCharacterId || next.draft.importedCharacterId || "").trim();
    next.draft.importedCharacterId = importedId;
    next.importedCharacterId = importedId;
    hydrateImportIdentity(next.draft, event.identity, at);
  } else {
    next.draft.importedCharacterId = "";
    next.importedCharacterId = "";
  }
  if (PREFIX_FLOW.includes(next.stage) || next.stage === "PAUSED") {
    next.stage = "PATH_SELECT";
    next.paused = false;
  }
  next.updatedAt = at;
  return next;
}

function hydrateImportIdentity(draft, identity, at) {
  if (!isPlainObject(identity)) return;
  const mapping = [
    ["characterName", "character.name"],
    ["genderIdentity", "character.genderIdentity"],
    ["pronouns", "character.pronouns"],
    ["name", "character.name"],
  ];
  for (const [from, path] of mapping) {
    if (identity[from] === undefined || identity[from] === "") continue;
    writePath(draft, path, createExplicitValue(copyValue(identity[from]), "import_review", at));
  }
}

function setField(state, event, at) {
  if (state.stage === "PAUSED" || state.stage === "ERROR") return state;
  const path = resolvePath(event.field || event.path);
  if (!path) return state;
  const next = cloneJson(state);
  if (path === "importedCharacterId") {
    if (state.stage === "COMPLETED" || state.stage === "COMMIT") return state;
    next.draft.importedCharacterId = String(event.value || event.importedCharacterId || "").trim();
    next.importedCharacterId = next.draft.importedCharacterId;
    next.updatedAt = at;
    next.paused = false;
    return next;
  }
  if (path === "importDisposition") {
    next.draft.importDisposition = event.value === "overwrite" ? "overwrite" : "create";
    next.updatedAt = at;
    next.paused = false;
    return next;
  }
  if (state.stage === "COMPLETED" && path.startsWith("character.")) return state;
  if (state.stage === "COMMIT" && path.startsWith("character.")) return state;

  let source = EXPLICIT_VALUE_SOURCES.includes(event.source) ? event.source : "";
  if (!source) {
    source = state.path === "import" && path.startsWith("character.") ? "import_review" : "explicit";
  }

  if (state.path === "import" && path.startsWith("character.")) {
    const existing = path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), next.draft);
    if (existing && (existing.source === "import_review" || existing.source === "explicit")) {
      const same = sameFieldValue(existing.value, event.value);
      const confirming = existing.source === "import_review" && source === "explicit" && same;
      const restating = same && source === existing.source;
      if (!confirming && !restating) return state;
    }
  }

  writePath(next.draft, path, createExplicitValue(event.value, source, at));
  next.updatedAt = at;
  next.paused = false;
  return next;
}

function skipField(state, event, at) {
  if (state.stage === "PAUSED" || state.stage === "ERROR" || state.stage === "COMPLETED" || state.stage === "COMMIT") {
    return state;
  }
  const path = resolvePath(event.field || event.path);
  if (!path || path === "importedCharacterId" || path === "importDisposition") return state;
  if (state.path === "import" && path.startsWith("character.")) {
    const existing = path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), state.draft);
    if (existing && (existing.source === "import_review" || existing.source === "explicit")) return state;
  }
  const next = cloneJson(state);
  writePath(next.draft, path, createExplicitValue(copyValue(SKIP_VALUES[path]), "skipped", at));
  next.updatedAt = at;
  next.paused = false;
  return next;
}

function goNext(state, at) {
  if (!canAdvance(state)) return state;
  const next = cloneJson(state);
  if (next.stage === "FIRST_MESSAGE") {
    next.stage = "COMPLETED";
    next.done = true;
    next.paused = false;
    next.resumeStage = "";
    next.errorMessage = "";
    next.updatedAt = at;
    return next;
  }
  const nextStage = neighbor(next, 1);
  if (nextStage === next.stage) return state;
  next.stage = nextStage;
  next.paused = false;
  next.errorMessage = "";
  next.updatedAt = at;
  return next;
}

function goBack(state, at) {
  if (state.stage === "COMPLETED" || state.stage === "BOOT") return state;
  const next = cloneJson(state);
  if (next.stage === "ERROR" || next.stage === "PAUSED") {
    const origin = next.resumeStage
      && next.resumeStage !== "ERROR"
      && next.resumeStage !== "PAUSED"
      && FL_V2_STAGES.includes(next.resumeStage)
      ? next.resumeStage
      : "PATH_SELECT";
    next.stage = origin;
    next.stage = neighbor(next, -1);
    next.paused = false;
    next.errorMessage = "";
    next.resumeStage = "";
    next.updatedAt = at;
    return next;
  }
  const prev = neighbor(next, -1);
  if (prev === next.stage) return state;
  next.stage = prev;
  next.errorMessage = "";
  next.paused = false;
  next.updatedAt = at;
  return next;
}

function pause(state, at) {
  if (state.stage === "COMPLETED") return state;
  const next = cloneJson(state);
  if (next.stage !== "PAUSED" && next.stage !== "ERROR") {
    next.resumeStage = next.stage;
  }
  next.stage = "PAUSED";
  next.paused = true;
  next.updatedAt = at;
  return next;
}

function resume(state, at) {
  if (state.stage !== "PAUSED" && state.stage !== "ERROR") return state;
  const next = cloneJson(state);
  const target = next.resumeStage
    && next.resumeStage !== "PAUSED"
    && next.resumeStage !== "ERROR"
    && FL_V2_STAGES.includes(next.resumeStage)
    ? next.resumeStage
    : "PATH_SELECT";
  next.stage = target;
  next.paused = false;
  next.errorMessage = "";
  next.resumeStage = "";
  next.updatedAt = at;
  return next;
}

function restart(state, event, at) {
  const keepPath = event.keepPath === true && FL_V2_PATHS.includes(state.path);
  const next = createDefaultStateV2({ nowIso: () => at });
  if (keepPath) {
    next.path = state.path;
    next.stage = "PATH_SELECT";
    next.draft = applyUnaskedDefaults(next.draft, next.path, at);
  } else {
    next.stage = "WELCOME";
  }
  next.updatedAt = at;
  return next;
}

function fail(state, event, at) {
  if (state.stage === "COMPLETED") return state;
  const next = cloneJson(state);
  if (next.stage !== "ERROR" && next.stage !== "PAUSED") {
    next.resumeStage = next.stage;
  }
  next.stage = "ERROR";
  next.paused = false;
  next.errorMessage = String(event.message || event.error || event.reason || "first_light_failed").slice(0, 500);
  next.updatedAt = at;
  return next;
}

function commitOk(state, event, at) {
  const fromCommit = state.stage === "COMMIT"
    || (state.stage === "ERROR" && state.resumeStage === "COMMIT");
  if (!fromCommit) return state;
  const next = cloneJson(state);
  next.stage = "FIRST_MESSAGE";
  next.done = false;
  next.paused = false;
  next.errorMessage = "";
  next.resumeStage = "";
  next.committedCharacterId = String(event.characterId || event.committedCharacterId || next.committedCharacterId || "");
  next.updatedAt = at;
  return next;
}

const USER_EVENT_TYPES = Object.freeze({
  select_path: "SELECT_PATH",
  set_field: "SET_FIELD",
  skip_field: "SKIP_FIELD",
  next: "NEXT",
  back: "BACK",
  pause: "PAUSE",
  resume: "RESUME",
  restart: "RESTART",
  error: "FAIL",
});

function withFlatDraft(state) {
  if (!state?.draft) return state;
  const draft = state.draft;
  draft.characterName = draft.character?.name;
  draft.genderIdentity = draft.character?.genderIdentity;
  draft.pronouns = draft.character?.pronouns;
  draft.callUserAs = draft.preference?.callUserAs;
  draft.relationshipType = draft.preference?.relationshipType;
  draft.purposes = draft.preference?.purposes;
  draft.allowProactive = draft.preference?.allowProactive;
  draft.hardBoundaries = draft.preference?.hardBoundaries;
  draft.quietHours = draft.preference?.quietHours;
  draft.sharedHistory = draft.preference?.sharedHistory;
  draft.values = draft.preference?.values;
  draft.flirtLevel = draft.preference?.flirtLevel;
  draft.jealousy = draft.preference?.allowJealousy;
  draft.autoDiary = draft.preference?.autoDiary;
  if (state.importedCharacterId == null) {
    state.importedCharacterId = draft.importedCharacterId || "";
  } else if (!state.importedCharacterId && draft.importedCharacterId) {
    state.importedCharacterId = draft.importedCharacterId;
  }
  return state;
}

/**
 * Pure reducer. Illegal NEXT and unknown events keep the current stage.
 */
export function transition(state, event, opts = {}) {
  const current = normalizeStateV2(state, opts.clock);
  const type = event && typeof event === "object" ? String(event.type || "") : "";
  const at = stamp(event, opts.clock);
  let next;
  switch (type) {
    case "SELECT_PATH":
      next = selectPath(current, event, at);
      break;
    case "SET_FIELD":
      next = setField(current, event, at);
      break;
    case "SKIP_FIELD":
      next = skipField(current, event, at);
      break;
    case "NEXT":
      next = goNext(current, at);
      break;
    case "BACK":
      next = goBack(current, at);
      break;
    case "PAUSE":
      next = pause(current, at);
      break;
    case "RESUME":
      next = resume(current, at);
      break;
    case "RESTART":
      next = restart(current, event, at);
      break;
    case "FAIL":
      next = fail(current, event, at);
      break;
    case "COMMIT_OK":
      next = commitOk(current, event, at);
      break;
    default:
      next = current;
  }
  return withFlatDraft(next);
}

/**
 * Task 3.1 public reducer: lowercase events, `field` names, keep-path restart.
 */
export function reduceFirstLightV2(state, event) {
  const raw = event && typeof event === "object" ? event : {};
  const mappedType = USER_EVENT_TYPES[raw.type] || raw.type;
  const mapped = { ...raw, type: mappedType };
  if (raw.type === "restart" && mapped.keepPath === undefined) mapped.keepPath = true;
  if (raw.type === "error" && mapped.message && !mapped.errorMessage) {
    mapped.errorMessage = mapped.message;
  }
  return transition(state, mapped);
}

export { PATH_FLOW, CONSERVATIVE };
