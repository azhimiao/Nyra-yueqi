/**
 * CharacterImportReportV1 — path-level import dispositions (master plan §10.2).
 * Imported content must not be marked preserved into platform kernel / tools / permissions.
 */

import { mintId } from "./ids.js";
import {
  COMPANION_V2_LIMITS as L,
  checkArray,
  checkBoolean,
  checkEnum,
  checkId,
  checkObject,
  checkSchemaAndRevision,
  checkString,
  checkTimestamp,
  checkTopLevel,
  error,
  isPlainObject,
  nowIso,
  result,
} from "./companion-v2-shared.js";

export const CHARACTER_IMPORT_REPORT_V1_SCHEMA_VERSION = 1;

export const IMPORT_FORMATS = Object.freeze([
  "nychar",
  "tavern_v2_json",
  "tavern_v3_json",
  "png_chara",
  "webp",
  "unknown",
]);

export const IMPORT_DISPOSITIONS = Object.freeze([
  "preserved",
  "transformed",
  "demoted_untrusted",
  "dropped",
  "unsupported",
  "unsafe_ignored",
]);

const SUMMARY_KEYS = Object.freeze([
  ["preserved", "preserved"],
  ["transformed", "transformed"],
  ["demoted_untrusted", "demotedUntrusted"],
  ["dropped", "dropped"],
  ["unsupported", "unsupported"],
  ["unsafe_ignored", "unsafeIgnored"],
]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "revision",
  "reportId",
  "format",
  "characterId",
  "entries",
  "summary",
  "hasSevereLoss",
  "createdAt",
]);

const ENTRY_KEYS = Object.freeze([
  "path",
  "disposition",
  "sourceValueKind",
  "targetPath",
  "reasonCode",
  "note",
]);

const SEVERE = new Set(["dropped", "unsupported", "unsafe_ignored"]);

function isSensitiveTarget(path, targetPath) {
  const text = `${path || ""} ${targetPath || ""}`.toLowerCase();
  return /\b(platform|kernel|tools?|permissions?)\b/.test(text);
}

function countSummary(entries) {
  const summary = {
    preserved: 0,
    transformed: 0,
    demotedUntrusted: 0,
    dropped: 0,
    unsupported: 0,
    unsafeIgnored: 0,
  };
  for (const entry of entries) {
    const pair = SUMMARY_KEYS.find(([disposition]) => disposition === entry?.disposition);
    if (pair) summary[pair[1]] += 1;
  }
  return summary;
}

export function validateCharacterImportReportV1(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED),
    ...checkSchemaAndRevision(raw, CHARACTER_IMPORT_REPORT_V1_SCHEMA_VERSION),
    ...checkId(raw.reportId, "reportId"),
    ...checkEnum(raw.format, "format", IMPORT_FORMATS),
    ...checkId(raw.characterId, "characterId", false),
    ...checkTimestamp(raw.createdAt, "createdAt"),
    ...checkBoolean(raw.hasSevereLoss, "hasSevereLoss"),
    ...checkArray(raw.entries, "entries", { max: L.importEntriesMax }),
  ];

  if (Array.isArray(raw.entries)) {
    raw.entries.forEach((entry, index) => {
      const path = `entries[${index}]`;
      if (!isPlainObject(entry)) {
        errors.push(error("invalid_type", path));
        return;
      }
      for (const key of Object.keys(entry)) {
        if (!ENTRY_KEYS.includes(key)) errors.push(error("unknown_field", `${path}.${key}`));
      }
      errors.push(...checkString(entry.path, `${path}.path`, { nonEmpty: true, max: L.importPath }));
      errors.push(...checkEnum(entry.disposition, `${path}.disposition`, IMPORT_DISPOSITIONS));
      errors.push(...checkString(entry.sourceValueKind, `${path}.sourceValueKind`, { required: false, max: L.sourceValueKind }));
      errors.push(...checkString(entry.targetPath, `${path}.targetPath`, { required: false, max: L.targetPath }));
      errors.push(...checkString(entry.reasonCode, `${path}.reasonCode`, { required: false, max: L.reasonCode }));
      errors.push(...checkString(entry.note, `${path}.note`, { required: false, max: L.importNote }));
      if (
        entry.disposition === "preserved"
        && isSensitiveTarget(entry.path, entry.targetPath)
      ) {
        errors.push(error("untrusted_elevation", path));
      }
    });
  }

  if (raw.summary === undefined) errors.push(error("missing_field", "summary"));
  else if (!isPlainObject(raw.summary)) errors.push(error("invalid_type", "summary"));
  else if (Array.isArray(raw.entries)) {
    const expected = countSummary(raw.entries);
    for (const key of Object.keys(expected)) {
      if (raw.summary[key] !== expected[key]) {
        errors.push(error("invalid_type", "summary"));
        break;
      }
    }
  }

  if (typeof raw.hasSevereLoss === "boolean" && Array.isArray(raw.entries)) {
    const expectedSevere = raw.entries.some((entry) => SEVERE.has(entry?.disposition));
    if (raw.hasSevereLoss !== expectedSevere) {
      errors.push(error("invalid_type", "hasSevereLoss"));
    }
  }

  return result(errors);
}

export function createCharacterImportReportV1(input = {}, opts = {}) {
  const src = isPlainObject(input) ? input : {};
  const entries = Array.isArray(src.entries)
    ? src.entries.map((entry) => ({
      path: String(entry?.path || ""),
      disposition: IMPORT_DISPOSITIONS.includes(entry?.disposition) ? entry.disposition : "unsupported",
      ...(entry?.sourceValueKind ? { sourceValueKind: String(entry.sourceValueKind) } : {}),
      ...(entry?.targetPath ? { targetPath: String(entry.targetPath) } : {}),
      ...(entry?.reasonCode ? { reasonCode: String(entry.reasonCode) } : {}),
      ...(entry?.note ? { note: String(entry.note) } : {}),
    }))
    : [];
  const summary = countSummary(entries);
  const hasSevereLoss = entries.some((entry) => SEVERE.has(entry.disposition));
  return {
    schemaVersion: CHARACTER_IMPORT_REPORT_V1_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    reportId: String(src.reportId || "").trim() || mintId("importReportId"),
    format: IMPORT_FORMATS.includes(src.format) ? src.format : "unknown",
    ...(src.characterId ? { characterId: String(src.characterId) } : {}),
    entries,
    summary,
    hasSevereLoss,
    createdAt: checkTimestamp(src.createdAt, "createdAt").length === 0 ? src.createdAt : nowIso(opts.clock),
  };
}
