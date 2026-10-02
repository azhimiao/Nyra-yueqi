/**
 * Shared V2 contract helpers: ExplicitValue, limits, errors, timestamps, revision.
 * Pure functions — no DOM, no I/O.
 */

export const V2_VALIDATION_CODES = Object.freeze([
  "not_object",
  "missing_field",
  "invalid_type",
  "invalid_enum",
  "invalid_schema_version",
  "invalid_revision",
  "invalid_id",
  "oversized_field",
  "too_many_items",
  "unknown_field",
  "forbidden_field",
  "invalid_explicitness",
  "invalid_status",
  "invalid_transition",
  "untrusted_elevation",
]);

export const EXPLICIT_VALUE_SOURCES = Object.freeze([
  "explicit",
  "import_review",
  "default",
  "skipped",
]);

export const COMPANION_V2_LIMITS = Object.freeze({
  name: 200,
  selfIdentityString: 200,
  pronounsMax: 8,
  pronounItem: 40,
  personaText: 8000,
  valuesMax: 32,
  valuesItem: 500,
  ownBoundariesMax: 32,
  ownBoundariesItem: 500,
  autonomy: 2000,
  coreConflict: 2000,
  characterSystemSupplement: 16000,
  characterDeveloperSupplement: 8000,
  postHistoryInstructions: 8000,
  scenario: 8000,
  greetingItem: 2000,
  alternateGreetingsMax: 50,
  exampleDialogueChars: 64000,
  exampleDialogueMax: 200,
  tagsMax: 64,
  tagItem: 64,
  loreEntryIdsMax: 500,
  aggregateCharacterBytes: 512 * 1024,
  genericString: 8000,
  genericItems: 64,
  messagesMax: 1000,
  toolsMax: 256,
  budgetLedgerMax: 512,
  historyBoundaryIdsMax: 1000,
  attachmentRefsMax: 64,
  participantsMax: 32,
  reasonCodesMax: 64,
  importEntriesMax: 10000,
  platformsMax: 16,
  preferenceListMax: 64,
  preferenceListItem: 500,
  quietHours: 16,
  preferredName: 200,
  sharedHistory: 8000,
  exactEffect: 8000,
  errorMessage: 2000,
  provenance: 500,
  capabilityId: 200,
  operation: 200,
  executorId: 200,
  approval: 200,
  featureFlag: 200,
  idempotencyKey: 500,
  cutoverProfile: 200,
  providerMode: 200,
  locale: 64,
  conversationLanguage: 64,
  relationshipScope: 200,
  presetId: 200,
  format: 64,
  importPath: 500,
  importNote: 2000,
  sourceValueKind: 200,
  targetPath: 500,
  reasonCode: 200,
});

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function error(code, path = "$") {
  return { code, path };
}

export function result(errors) {
  return { ok: errors.length === 0, errors };
}

export function checkObject(raw) {
  return isPlainObject(raw) ? null : { ok: false, errors: [error("not_object", "$")] };
}

export function checkTopLevel(raw, allowed, forbidden = []) {
  const errors = [];
  for (const key of Object.keys(raw)) {
    if (forbidden.includes(key)) errors.push(error("forbidden_field", key));
    else if (!allowed.includes(key)) errors.push(error("unknown_field", key));
  }
  return errors;
}

export function requireFields(raw, fields) {
  return fields
    .filter((field) => !Object.prototype.hasOwnProperty.call(raw, field))
    .map((field) => error("missing_field", field));
}

export function checkSchemaAndRevision(raw, schemaVersion) {
  const errors = requireFields(raw, ["schemaVersion", "revision"]);
  if (Object.prototype.hasOwnProperty.call(raw, "schemaVersion") && raw.schemaVersion !== schemaVersion) {
    errors.push(error("invalid_schema_version", "schemaVersion"));
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, "revision")
    && (!Number.isInteger(raw.revision) || raw.revision < 1)
  ) {
    errors.push(error("invalid_revision", "revision"));
  }
  return errors;
}

/**
 * Validate accepts any non-empty string (legacy opaque IDs have no prefix).
 * Empty / non-string → invalid_id (or missing_field when required and undefined).
 */
export function checkId(value, path, required = true) {
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  return typeof value === "string" && value.trim() ? [] : [error("invalid_id", path)];
}

export function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export function checkTimestamp(value, path, required = true) {
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  return isIsoTimestamp(value) ? [] : [error("invalid_type", path)];
}

export function checkString(value, path, options = {}) {
  const { required = true, nonEmpty = false, max = Infinity } = options;
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  if (typeof value !== "string") return [error("invalid_type", path)];
  if (nonEmpty && !value.trim()) return [error("invalid_type", path)];
  if (value.length > max) return [error("oversized_field", path)];
  return [];
}

export function checkNumber(value, path, options = {}) {
  const { required = true, integer = false, min = -Infinity, max = Infinity } = options;
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  if (typeof value !== "number" || !Number.isFinite(value)) return [error("invalid_type", path)];
  if (integer && !Number.isInteger(value)) return [error("invalid_type", path)];
  if (value < min || value > max) return [error("invalid_type", path)];
  return [];
}

export function checkBoolean(value, path, required = true) {
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  return typeof value === "boolean" ? [] : [error("invalid_type", path)];
}

export function checkEnum(value, path, allowed, options = {}) {
  const { required = true, code = "invalid_enum" } = options;
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  if (typeof value !== "string") return [error("invalid_type", path)];
  return allowed.includes(value) ? [] : [error(code, path)];
}

export function checkArray(value, path, options = {}) {
  const { required = true, max = Infinity, min = 0 } = options;
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  if (!Array.isArray(value)) return [error("invalid_type", path)];
  if (value.length > max || value.length < min) return [error("too_many_items", path)];
  return [];
}

export function checkStringArray(value, path, options = {}) {
  const errors = checkArray(value, path, options);
  if (errors.length || !Array.isArray(value)) return errors;
  const maxItem = options.maxItem ?? Infinity;
  const nonEmpty = Boolean(options.nonEmptyItems);
  value.forEach((item, index) => {
    if (typeof item !== "string") errors.push(error("invalid_type", `${path}[${index}]`));
    else if (nonEmpty && !item.trim()) errors.push(error("invalid_type", `${path}[${index}]`));
    else if (item.length > maxItem) errors.push(error("oversized_field", `${path}[${index}]`));
  });
  return errors;
}

export function checkPlainObject(value, path, required = true) {
  if (value === undefined) return required ? [error("missing_field", path)] : [];
  return isPlainObject(value) ? [] : [error("invalid_type", path)];
}

export function nowIso(clock) {
  if (clock && typeof clock.nowIso === "function") return clock.nowIso();
  if (clock && typeof clock.now === "function") return new Date(clock.now()).toISOString();
  return new Date().toISOString();
}

export function createExplicitValue(value, source = "default", updatedAt) {
  return {
    value,
    source: EXPLICIT_VALUE_SOURCES.includes(source) ? source : "default",
    updatedAt: isIsoTimestamp(updatedAt) ? updatedAt : nowIso(),
  };
}

/** True only for user-confirmed sources. default/skipped must never be rewritten to explicit. */
export function isExplicit(field) {
  return field?.source === "explicit" || field?.source === "import_review";
}

/**
 * Conflict policy is owned by a later strategy layer, not this validator.
 * When two boundaries conflict, take the stricter one (do not invent a merge here).
 */
export function stricterBoundary(_a, _b) {
  return undefined;
}

export function validateExplicitValue(field, path, validateValue) {
  if (field === undefined) return [error("missing_field", path)];
  if (!isPlainObject(field)) return [error("invalid_type", path)];
  const errors = [];
  for (const key of Object.keys(field)) {
    if (!["value", "source", "updatedAt"].includes(key)) {
      errors.push(error("unknown_field", `${path}.${key}`));
    }
  }
  for (const item of requireFields(field, ["value", "source", "updatedAt"])) {
    errors.push(error(item.code, `${path}.${item.path}`));
  }
  if (field.source !== undefined && !EXPLICIT_VALUE_SOURCES.includes(field.source)) {
    errors.push(error("invalid_explicitness", `${path}.source`));
  }
  if (field.updatedAt !== undefined && !isIsoTimestamp(field.updatedAt)) {
    errors.push(error("invalid_type", `${path}.updatedAt`));
  }
  if (Object.prototype.hasOwnProperty.call(field, "value")) {
    errors.push(...validateValue(field.value, `${path}.value`));
  }
  return errors;
}

export function pickKnown(input, keys) {
  const out = {};
  if (!isPlainObject(input)) return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  return out;
}

export function utf8ByteLength(text) {
  if (typeof text !== "string" || !text) return 0;
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a 32-bit. Browser-safe; do not import node:crypto from contract modules. */
export function stableHash(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function shallowFreeze(value, nestedKeys = []) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  for (const key of nestedKeys) {
    if (value[key] && typeof value[key] === "object") Object.freeze(value[key]);
  }
  return Object.freeze(value);
}
