/**
 * P0 — census for legacy unscoped MemPalace rows (read-only analysis).
 * Does not migrate or delete; feeds migration inspector.
 */

import { classifyLegacyScope, filterRowsByCompanionScope } from "../companion-scope.js";

/**
 * @param {object[]} rows
 * @returns {{
 *   total: number,
 *   scoped: number,
 *   legacyUnscoped: number,
 *   legacyMissingRelationship: number,
 *   bySource: Record<string, number>,
 *   byClassification: Record<string, number>,
 *   sampleUnscoped: object[],
 * }}
 */
export function censusPalaceRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const bySource = Object.create(null);
  const byClassification = Object.create(null);
  const sampleUnscoped = [];
  let scoped = 0;
  let legacyUnscoped = 0;
  let legacyMissingRelationship = 0;

  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const source = String(row.source || row.wing || "unknown");
    bySource[source] = (bySource[source] || 0) + 1;
    const kind = classifyLegacyScope(row);
    byClassification[kind] = (byClassification[kind] || 0) + 1;
    if (kind === "legacy_unscoped" || !String(row.companionId || row.characterId || "").trim()) {
      legacyUnscoped += 1;
      if (sampleUnscoped.length < 20) {
        sampleUnscoped.push({
          id: row.id || "",
          source,
          wing: row.wing || "",
          room: row.room || "",
          preview: String(row.rawText || row.text || row.content || "").slice(0, 80),
          createdAt: row.createdAt || row.ts || "",
          classification: kind,
        });
      }
    } else if (kind === "legacy_missing_relationship") {
      legacyMissingRelationship += 1;
      scoped += 1;
    } else {
      scoped += 1;
    }
  }

  return {
    total: list.length,
    scoped,
    legacyUnscoped,
    legacyMissingRelationship,
    bySource,
    byClassification,
    sampleUnscoped,
  };
}

/**
 * Rows that may enter Pop assemble after companion-scope filter (mirrors assemble.js).
 * @param {object[]} rows
 * @param {string} companionId
 */
export function filterPalaceRowsForAssemble(rows = [], companionId = "") {
  return filterRowsByCompanionScope(rows, {
    companionId,
    userId: "local",
    allowGlobal: false,
  });
}

/**
 * Prove unscoped / cross-companion rows never survive assemble filter.
 * @param {object[]} rows fixture pool (scoped + unscoped)
 * @param {string} companionId target companion
 */
export function verifyAssemblePalaceIsolation(rows = [], companionId = "") {
  const filtered = filterPalaceRowsForAssemble(rows, companionId);
  const unscopedLeaks = filtered.filter(
    (row) => !String(row.companionId || row.characterId || "").trim(),
  );
  const crossCompanionLeaks = filtered.filter((row) => {
    const rowCompanion = String(row.companionId || row.characterId || "").trim();
    return rowCompanion && rowCompanion !== String(companionId || "").trim();
  });
  return {
    ok: unscopedLeaks.length === 0 && crossCompanionLeaks.length === 0,
    inputTotal: Array.isArray(rows) ? rows.length : 0,
    filteredCount: filtered.length,
    unscopedLeaks: unscopedLeaks.length,
    crossCompanionLeaks: crossCompanionLeaks.length,
  };
}

/**
 * @param {() => Promise<object[]>|object[]} listFn
 */
export async function runPalaceCensus(listFn) {
  const rows = typeof listFn === "function" ? await listFn() : listFn;
  return censusPalaceRows(rows || []);
}
