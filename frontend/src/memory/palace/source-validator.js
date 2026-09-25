/**
 * MemPalace source validation (unified-memory M7).
 * When `palaceProjectionOnlyV1` is on, index hits without sourceRef are filtered out.
 */

import { isFeatureEnabled } from "../../features/flags.js";
import { hasValidSourceRefs } from "../projection/palace-index-contract.js";

/**
 * @returns {boolean}
 */
export function isPalaceProjectionOnlyEnabled() {
  try {
    return isFeatureEnabled("palaceProjectionOnlyV1") === true;
  } catch {
    return false;
  }
}

/**
 * True when a hit/row carries a usable sourceRef (object) or flat sourceType+sourceId.
 * @param {object} row
 */
export function rowHasUsableSourceRef(row = {}) {
  const rec = row?.record || row;
  const ref = rec?.sourceRef || row?.sourceRef;
  if (ref && typeof ref === "object") {
    const sourceId = String(ref.sourceId || "").trim();
    if (sourceId) return true;
  }
  if (typeof ref === "string" && ref.trim()) return true;
  return hasValidSourceRefs(rec) || hasValidSourceRefs(row);
}

/**
 * Validate a palace search hit for projection-only recall.
 * @param {object} row
 * @param {{ companionId?: string, realityNamespace?: string }} [opts]
 * @returns {{ ok: boolean, reason?: string, redacted?: boolean }}
 */
export function validatePalaceSearchHit(row = {}, opts = {}) {
  const rec = row?.record || row;
  if (rec?.tombstone || row?.tombstone) {
    return { ok: false, reason: "tombstone", redacted: true };
  }
  if (rec?.stale === true || row?.stale === true) {
    return { ok: false, reason: "stale", redacted: true };
  }
  if (rec?.invalidatedAt || row?.invalidatedAt) {
    return { ok: false, reason: "invalidated", redacted: true };
  }
  if (!rowHasUsableSourceRef(row)) {
    return { ok: false, reason: "missing_source_ref", redacted: true };
  }

  const companionId = String(opts.companionId || "").trim();
  if (companionId) {
    const rowCompanion = String(
      rec?.companionId || rec?.characterId || row?.companionId || row?.characterId || "",
    ).trim();
    if (rowCompanion && rowCompanion !== companionId) {
      return { ok: false, reason: "companion_mismatch", redacted: true };
    }
  }

  const ns = String(opts.realityNamespace || "").trim();
  if (ns) {
    const rowNs = String(
      rec?.realityNamespace ||
        rec?.sourceRef?.realityNamespace ||
        row?.realityNamespace ||
        "",
    ).trim();
    if (rowNs && rowNs !== ns) {
      return { ok: false, reason: "namespace_mismatch", redacted: true };
    }
  }

  return { ok: true };
}

/**
 * Filter search/index rows: when flag on (or opts.strict), drop orphans without sourceRef.
 * Flag off returns input unchanged (unless opts.strict === true).
 *
 * @param {object[]} results
 * @param {{
 *   strict?: boolean,
 *   flagOn?: boolean,
 *   companionId?: string,
 *   realityNamespace?: string,
 * }} [opts]
 */
export function filterPalaceHitsBySourceRef(results = [], opts = {}) {
  const rows = Array.isArray(results) ? results : [];
  const flagOn =
    typeof opts.flagOn === "boolean" ? opts.flagOn : isPalaceProjectionOnlyEnabled();
  const enforce = opts.strict === true || flagOn;
  if (!enforce) return rows;

  return rows.filter((row) => validatePalaceSearchHit(row, opts).ok);
}

/**
 * Flag orphan rows (does not remove) — useful for quarantine / census.
 * @param {object[]} results
 */
export function flagOrphanPalaceHits(results = []) {
  return (Array.isArray(results) ? results : []).map((row) => {
    const check = validatePalaceSearchHit(row);
    if (check.ok) return { ...row, orphan: false };
    return {
      ...row,
      orphan: true,
      orphanReason: check.reason || "missing_source_ref",
      redacted: true,
    };
  });
}
