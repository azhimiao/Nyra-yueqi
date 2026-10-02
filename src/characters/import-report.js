/**
 * Field-level CharacterImportReportV1 from a parsed card + support matrix.
 */

import {
  createCharacterImportReportV1,
  validateCharacterImportReportV1,
} from "../contracts/character-import-report-v1.js";
import { dispositionFor, lookupCardPath } from "../portability/character-card-schema.js";

export function buildCharacterImportReport({ format, parsed, characterId } = {}) {
  const data = parsed && typeof parsed === "object" ? parsed : {};
  const entries = [];
  const keys = Object.keys(data.data && typeof data.data === "object" ? data.data : data);
  for (const key of keys) {
    const path = `data.${key}`;
    const row = lookupCardPath(format || "json_v2", path) || {
      path,
      disposition: dispositionFor(format || "json_v2", path),
      targetPath: "",
    };
    entries.push({
      path: row.path || path,
      disposition: row.disposition,
      targetPath: row.targetPath || "",
      sourceValueKind: typeof (data.data ? data.data[key] : data[key]),
    });
  }
  const report = createCharacterImportReportV1({
    format: format || "unknown",
    characterId,
    entries,
  });
  const validated = validateCharacterImportReportV1(report);
  return { ok: validated.ok, errors: validated.errors, report };
}

export const DEFAULT_IMPORT_MODE = "create";
